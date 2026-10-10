import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

export function subtitleCues(text,duration) {
  const lines=String(text||'').split('\n').map(s=>s.trim()).filter(Boolean);
  if(!Number.isFinite(duration)||duration<=0||duration>120||!lines.length||lines.length>100)throw Error('请使用120秒以内的视频，并填写1–100句字幕');
  return lines.map((line,i)=>{const match=/^\[(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\]\s*(.+)$/.exec(line),start=match?Number(match[1]):duration*i/lines.length,end=match?Number(match[2]):duration*(i+1)/lines.length,text=match?match[3]:line;if(start<0||end<=start||end>duration+.1||text.length>300)throw Error('字幕时间或句子长度无效');return {start,end,text};});
}
const stamp=t=>{const c=Math.round(t*100);return `${Math.floor(c/360000)}:${String(Math.floor(c/6000)%60).padStart(2,'0')}:${String(Math.floor(c/100)%60).padStart(2,'0')}.${String(c%100).padStart(2,'0')}`;};
export function subtitleASS(input) {
  const {duration,text}=input,size=Number(input.size),bottom=Number(input.bottom),width=Number(input.width),height=Number(input.height);
  if(!Number.isFinite(size)||size<16||size>64||!Number.isFinite(bottom)||bottom<5||bottom>30||!Number.isFinite(width)||!Number.isFinite(height)||width<16||height<16||width>8192||height>8192)throw Error('字幕尺寸或视频尺寸无效');
  const h=Math.round(720*height/width),cues=subtitleCues(text,Number(duration));
  return `[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: ${h}\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Microsoft YaHei,${size},&H00FFFFFF,&H00FFFFFF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,2,44,44,${Math.round(h*bottom/100)},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`+cues.map(c=>`Dialogue: 0,${stamp(c.start)},${stamp(c.end)},Default,,0,0,0,,${c.text.replace(/\\/g,'／').replace(/{/g,'（').replace(/}/g,'）')}`).join('\n');
}
export class SubtitleRenderer {
  constructor(directory,media) {
    this.directory=directory;this.media=media;this.tasks=new Map();this.pending=Promise.resolve();fs.mkdirSync(directory,{recursive:true});
    for(const id of fs.readdirSync(directory)){const f=path.join(directory,id,'task.json');if(!fs.existsSync(f))continue;try{const task=JSON.parse(fs.readFileSync(f));if(['queued','saving','rendering'].includes(task.status)){task.status='error';task.error='工作台重启中断了渲染，请重新提交';}this.tasks.set(id,task);}catch{}}
  }
  save(task){fs.writeFileSync(path.join(this.directory,task.id,'task.json'),JSON.stringify(task));}
  get(id){const task=this.tasks.get(id);if(!task)throw Error('字幕任务不存在');return task;}
  file(id){const task=this.get(id);if(task.status!=='complete')throw Error('字幕成片尚未完成');return path.join(this.directory,id,'result.mp4');}
  async upload(req){const id=randomUUID(),dir=path.join(this.directory,'uploads');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,id);let bytes=0;const handle=await fs.promises.open(file,'wx');try{for await(const chunk of req){bytes+=chunk.length;if(bytes>300*1024*1024)throw Error('本机视频不能超过300MB');await handle.write(chunk);}if(bytes<12)throw Error('视频文件为空');return {id};}catch(e){await handle.close();fs.rmSync(file,{force:true});throw e;}finally{await handle.close().catch(()=>{});}}
  create(input,job) {
    const ass=subtitleASS(input);let source;
    if(!job){if(!/^[a-f0-9-]{36}$/.test(input.uploadId||''))throw Error('请先导入本机视频');source=path.join(this.directory,'uploads',input.uploadId);if(!fs.existsSync(source))throw Error('导入的视频不存在');}
    const task={id:randomUUID(),jobId:job?.id||'local',status:'queued',progress:0,createdAt:new Date().toISOString(),text:String(input.text),size:input.size,bottom:input.bottom};
    const dir=path.join(this.directory,task.id);fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'subtitles.ass'),ass);this.tasks.set(task.id,task);this.save(task);
    const run=this.pending.then(async()=>{
      task.status='saving';this.save(task);if(job)source=await this.media.save(job);
      task.status='rendering';this.save(task);
      await new Promise((resolve,reject)=>{
        const process=spawn(ffmpeg,['-hide_banner','-nostdin','-y','-i',source,'-t','120','-vf',"scale=trunc(min(720\\,iw)/2)*2:-2,ass=subtitles.ass",'-map','0:v:0','-map','0:a?','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-progress','pipe:1','result.mp4'],{cwd:dir,windowsHide:true});
        let log='';const timer=setTimeout(()=>{process.kill();reject(Error('字幕渲染超过10分钟，请重试'));},600000);
        process.stdout.on('data',chunk=>{const value=/out_time_us=(\d+)/.exec(chunk.toString());if(value)task.progress=Math.min(99,Math.round(Number(value[1])/1000000/input.duration*100));});
        process.stderr.on('data',chunk=>{log=(log+chunk.toString()).slice(-5000);});process.on('error',reject);process.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('视频编码失败：'+log.slice(-700)));});
      });
      if(fs.statSync(path.join(dir,'result.mp4')).size<100)throw Error('字幕成片为空');task.status='complete';task.progress=100;this.save(task);
    }).catch(error=>{task.status='error';task.error=error.message;this.save(task);});this.pending=run;return task;
  }
}
