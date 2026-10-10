import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import {subtitleCues,subtitleASS,SubtitleRenderer} from './subtitle-renderer.js';
test('字幕时间、时长和样式校验，文字不能注入 ASS 指令',()=>{
  assert.deepEqual(subtitleCues('[0-1] 第一句\n[1-2] 第二句',2).map(c=>c.start),[0,1]);
  assert.throws(()=>subtitleCues('[0-3] 越界',2));assert.throws(()=>subtitleCues('字幕',121));
  const ass=subtitleASS({text:'{\\pos(0,0)}中文',duration:2,size:32,bottom:14,width:720,height:1280});assert.ok(!ass.includes('{\\pos'));assert.ok(ass.includes('中文'));
});
test('本机字幕生成可解码的 H264/AAC MP4，任务和成片重启后保留',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'subtitles-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const source=path.join(dir,'source.mp4');
  const generated=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=180x320:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-y',source],{windowsHide:true});assert.equal(generated.status,0,generated.stderr?.toString());
  const renderer=new SubtitleRenderer(path.join(dir,'renders'),{save:async()=>source});const task=renderer.create({text:'中文字幕',duration:1,size:32,bottom:14,width:180,height:320},{id:'test'});await renderer.pending;assert.equal(task.status,'complete',task.error);
  const rendered=renderer.file(task.id),decoded=spawnSync(ffmpeg,['-hide_banner','-i',rendered,'-f','null','-'],{windowsHide:true});assert.equal(decoded.status,0,decoded.stderr.toString());assert.match(decoded.stderr.toString(),/Video: h264/);assert.match(decoded.stderr.toString(),/Audio: aac/);
  const reopened=new SubtitleRenderer(path.join(dir,'renders'),{});assert.equal(reopened.get(task.id).status,'complete');assert.equal(reopened.file(task.id),rendered);
});
