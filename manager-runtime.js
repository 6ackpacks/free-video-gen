import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const MANAGER_REPOSITORY = 'https://github.com/shukeCyp/DoubaoManager.git';
const DEFAULT_PORT = 4213;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { ...options, stdio: options.stdio || 'inherit', windowsHide: true });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} 退出码 ${code}`)));
});

const healthy = async origin => {
  try {
    const response = await fetch(origin + '/api/health', { signal: AbortSignal.timeout(800) });
    return response.ok && (await response.json()).status === 'ok';
  } catch { return false; }
};

function uvCommand(managerRoot) {
  const bundled = path.join(managerRoot, 'tools', process.platform === 'win32' ? 'uv.exe' : 'uv');
  if (fs.existsSync(bundled)) return bundled;
  const probe = spawnSync(process.platform === 'win32' ? 'where.exe' : 'sh', process.platform === 'win32' ? ['uv'] : ['-lc', 'command -v uv'], { encoding: 'utf8' });
  if (probe.status === 0) return process.platform === 'win32' ? String(probe.stdout).trim().split(/\r?\n/)[0] : String(probe.stdout).trim();
  throw new Error('缺少 uv，无法启动内置 DoubaoManager');
}

async function ensureSource(managerRoot, logger) {
  if (fs.existsSync(path.join(managerRoot, 'pyproject.toml'))) return;
  fs.mkdirSync(path.dirname(managerRoot), { recursive: true });
  logger('首次使用：正在下载内置 DoubaoManager…');
  try {
    await run('git', ['clone', '--depth', '1', '--branch', 'master', MANAGER_REPOSITORY, managerRoot]);
    return;
  } catch (gitError) {
    logger(`Git 下载不可用，切换直连安装：${gitError.message}`);
  }
  fs.rmSync(managerRoot, { recursive: true, force: true });
  const integrations = path.dirname(managerRoot);
  const archive = path.join(integrations, 'DoubaoManager-master.tar.gz');
  const extracted = path.join(integrations, 'DoubaoManager-master');
  const response = await fetch('https://codeload.github.com/shukeCyp/DoubaoManager/tar.gz/refs/heads/master', { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`DoubaoManager 下载失败：HTTP ${response.status}`);
  fs.writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
  try {
    await run('tar', ['-xzf', archive, '-C', integrations]);
    fs.renameSync(extracted, managerRoot);
  } finally {
    fs.rmSync(archive, { force: true });
    fs.rmSync(extracted, { recursive: true, force: true });
  }
}

async function ensureRuntime(managerRoot, uv, logger) {
  const marker = path.join(managerRoot, '.workbench-ready');
  if (fs.existsSync(marker)) return;
  logger('正在检查 DoubaoManager 运行环境…');
  await run(uv, ['sync', '--project', managerRoot], { cwd: managerRoot });
  const check = spawnSync(uv, ['run', '--project', managerRoot, 'python', '-c', 'from playwright.sync_api import sync_playwright; p=sync_playwright().start(); assert p.chromium.executable_path.exists(); p.stop()'], { cwd: managerRoot, stdio: 'ignore', windowsHide: true });
  if (check.status !== 0) {
    logger('首次使用：正在安装豆包自动化浏览器…');
    await run(uv, ['run', '--project', managerRoot, 'playwright', 'install', 'chromium'], { cwd: managerRoot });
  }
  fs.writeFileSync(marker, new Date().toISOString());
}

function createHandshakeFrontend(root) {
  const directory = path.join(root, 'data', 'doubao-manager-frontend');
  fs.mkdirSync(directory, { recursive: true });
  const index = path.join(directory, 'index.html');
  if (!fs.existsSync(index)) fs.writeFileSync(index, '<!doctype html><meta charset="utf-8"><title>DoubaoManager Service</title><p>DoubaoManager is managed by the video workbench.</p>');
  return directory;
}

function stopTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  else child.kill('SIGTERM');
}

export async function ensureDoubaoManager({ root, logger = console.log } = {}) {
  const configured = process.env.DOUBAO_MANAGER_URL;
  const origin = configured || `http://127.0.0.1:${Number(process.env.DOUBAO_MANAGER_PORT) || DEFAULT_PORT}`;
  process.env.DOUBAO_MANAGER_URL = origin;
  if (await healthy(origin)) return { origin, managed: false, child: null };
  if (configured) throw new Error(`配置的 DoubaoManager 未响应：${origin}`);

  const managerRoot = path.join(root, 'integrations', 'DoubaoManager');
  await ensureSource(managerRoot, logger);
  const uv = uvCommand(managerRoot);
  await ensureRuntime(managerRoot, uv, logger);
  const frontend = createHandshakeFrontend(root);
  const port = Number(new URL(origin).port);
  const logFile = path.join(root, 'data', 'doubao-manager.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const output = fs.openSync(logFile, 'a');
  const child = spawn(uv, ['run', '--project', managerRoot, 'python', path.join(root, 'doubao-service.py'), '--project-root', managerRoot, '--port', String(port)], {
    cwd: managerRoot,
    env: { ...process.env, DOUPOOL_FRONTEND_DIR: frontend },
    stdio: ['ignore', output, output],
    windowsHide: true
  });
  child.once('exit', code => logger(`DoubaoManager 已退出（${code ?? 'signal'}）`));
  const cleanup = () => stopTree(child);
  process.once('exit', cleanup);
  process.once('SIGINT', () => { cleanup(); process.exit(130); });
  process.once('SIGTERM', () => { cleanup(); process.exit(143); });

  for (let attempt = 0; attempt < 120; attempt++) {
    if (await healthy(origin)) {
      logger(`DoubaoManager 已随工作台启动：${origin}`);
      return { origin, managed: true, child, stop: cleanup };
    }
    if (child.exitCode !== null) break;
    await wait(500);
  }
  stopTree(child);
  throw new Error(`DoubaoManager 启动失败，请查看 ${logFile}`);
}

export const managerDefaults = { repository: MANAGER_REPOSITORY, port: DEFAULT_PORT };
