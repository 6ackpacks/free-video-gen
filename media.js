import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const getUrl = job => {
  const output = job?.outputs?.find(item => /^https:\/\//i.test(typeof item === 'string' ? item : item.url || ''));
  if (!output) throw new Error('视频尚未生成或缺少 HTTPS 链接');
  return typeof output === 'string' ? output : output.url;
};
const directAgent = new https.Agent({ keepAlive: true });
const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let n = 0; n < 8; n++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crcUpdate = (crc, chunk) => { for (const byte of chunk) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return crc >>> 0; };
const write = async (res, chunk) => { if (!res.write(chunk)) await once(res, 'drain'); };

export class MediaStore {
  constructor(directory, options = {}) {
    this.directory = directory;
    fs.mkdirSync(directory, { recursive: true });
    this.runs = new Map();
    this.saves = new Map();
    this.saveQueue = Promise.resolve();
    const kbps = Number(options.maxKbps ?? process.env.VIDEO_MEDIA_MAX_KBPS ?? 128);
    if (!Number.isFinite(kbps) || kbps < 16 || kbps > 8192) throw new Error('VIDEO_MEDIA_MAX_KBPS 必须在 16–8192 之间');
    this.bytesPerSecond = kbps * 1024;
  }
  filename(job) { return path.join(this.directory, `${job.id}.mp4`); }
  async direct(url, headers = {}, redirects = 0) {
    if (redirects > 3) throw new Error('视频地址重定向次数过多');
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('视频地址必须使用 HTTPS');
    return new Promise((resolve, reject) => {
      const req = https.get(parsed, { headers, timeout: 30000, agent: directAgent }, response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
          response.resume();
          return resolve(this.direct(new URL(response.headers.location, parsed).href, headers, redirects + 1));
        }
        resolve(response);
      });
      req.on('timeout', () => req.destroy(new Error('直连视频源超时')));
      req.on('error', reject);
    });
  }
  async serve(job, req, res, download = false) {
    const file = this.filename(job);
    // A preview must use the same bounded download path as a ZIP download.
    // Streaming the origin directly to the browser bypasses the speed limit.
    if (!fs.existsSync(file)) await this.save(job);
    if (res.destroyed) return;
    return this.serveLocal(file, job, req, res, download);
  }
  serveLocal(file, job, req, res, download = false) {
    const size = fs.statSync(file).size;
    const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    const start = match ? Number(match[1]) : 0;
    const end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || end < start) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
    res.writeHead(match ? 206 : 200, {
      'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
      ...(match ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="video-${job.id}.mp4"`
    });
    fs.createReadStream(file, { start, end }).pipe(res);
  }
  async save(job) {
    if (fs.existsSync(this.filename(job))) return this.filename(job);
    if (this.saves.has(job.id)) return this.saves.get(job.id);
    const pending = this.saveQueue.then(() => this.saveOne(job));
    // A failed save must not block later jobs.
    this.saveQueue = pending.catch(() => {});
    this.saves.set(job.id, pending);
    try { return await pending; }
    finally { this.saves.delete(job.id); }
  }
  async saveOne(job) {
    const file = this.filename(job);
    if (fs.existsSync(file)) return file;
    const part = file + '.part';
    let offset = fs.existsSync(part) ? fs.statSync(part).size : 0;
    let remote = await this.direct(getUrl(job), offset ? { Range: `bytes=${offset}-` } : {});
    if (offset && remote.statusCode !== 206) { remote.destroy(); fs.rmSync(part, { force: true }); offset = 0; remote = await this.direct(getUrl(job)); }
    if (![200, 206].includes(remote.statusCode)) { remote.resume(); throw new Error(`下载失败：HTTP ${remote.statusCode}`); }
    const stream = fs.createWriteStream(part, { flags: offset ? 'a' : 'w' });
    try {
      const started = Date.now();
      let received = 0;
      for await (const chunk of remote) {
        if (!stream.write(chunk)) await once(stream, 'drain');
        received += chunk.length;
        const wait = started + received * 1000 / this.bytesPerSecond - Date.now();
        if (wait > 0) await delay(wait);
      }
      await new Promise((resolve, reject) => { stream.on('error', reject); stream.end(resolve); });
      const expected = Number(remote.headers['content-length']);
      if (Number.isFinite(expected) && expected > 0 && fs.statSync(part).size !== offset + expected) throw new Error('视频传输不完整，保留断点供下次继续');
      fs.renameSync(part, file);
      return file;
    } catch (error) { stream.destroy(); throw error; }
  }
  start(trial, jobs) {
    if (this.runs.get(trial.id)?.running) return this.status(trial.id, jobs);
    const state = { running: true, total: jobs.length, complete: jobs.filter(j => fs.existsSync(this.filename(j))).length, errors: [] };
    this.runs.set(trial.id, state);
    const remaining = jobs.filter(j => !fs.existsSync(this.filename(j)));
    const workers = Array.from({ length: Math.min(1, remaining.length) }, async () => {
      while (remaining.length) {
        const job = remaining.shift();
        try { await this.save(job); state.complete++; }
        catch (error) { state.errors.push({ id: job.id, message: error.message }); }
      }
    });
    Promise.all(workers).finally(() => { state.running = false; });
    return this.status(trial.id, jobs);
  }
  status(id, jobs) {
    const state = this.runs.get(id);
    const complete = jobs.filter(job => fs.existsSync(this.filename(job))).length;
    return { running: !!state?.running, total: jobs.length, complete, errors: state?.errors || [], ready: jobs.length > 0 && complete === jobs.length };
  }
  async archive(jobs, res) {
    const entries = [];
    let offset = 0;
    if (jobs.some(job => !fs.existsSync(this.filename(job)))) throw new Error('视频尚未全部保存到本机');
    const totalBytes = jobs.reduce((sum, job) => sum + fs.statSync(this.filename(job)).size + 100, 0);
    if (jobs.length > 65535 || totalBytes > 0xffffffff) throw new Error('ZIP 超过 4GB，请分批下载');
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="videos.zip"', 'Cache-Control': 'no-store' });
    for (let i = 0; i < jobs.length; i++) {
      const file = this.filename(jobs[i]);
      const name = Buffer.from(`video-${String(i + 1).padStart(3, '0')}.mp4`);
      const size = fs.statSync(file).size;
      if (size > 0xffffffff || offset + size > 0xffffffff) throw new Error('ZIP 超过 4GB，请分批下载');
      let crc = 0xffffffff;
      for await (const chunk of fs.createReadStream(file)) crc = crcUpdate(crc, chunk);
      crc = (crc ^ 0xffffffff) >>> 0;
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(size, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(name.length, 26);
      await write(res, local); await write(res, name);
      for await (const chunk of fs.createReadStream(file)) await write(res, chunk);
      entries.push({ name, size, crc, offset });
      offset += 30 + name.length + size;
    }
    const centralStart = offset;
    for (const entry of entries) {
      const header = Buffer.alloc(46);
      header.writeUInt32LE(0x02014b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(20, 6);
      header.writeUInt32LE(entry.crc, 16); header.writeUInt32LE(entry.size, 20); header.writeUInt32LE(entry.size, 24);
      header.writeUInt16LE(entry.name.length, 28); header.writeUInt32LE(entry.offset, 42);
      await write(res, header); await write(res, entry.name); offset += 46 + entry.name.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(offset - centralStart, 12); end.writeUInt32LE(centralStart, 16);
    res.end(end);
  }
}
