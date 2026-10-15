import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createNativeVideoAdapter,videoQuotaExhausted} from './electron/video-adapter.js';
test('空白新会话直接发送，不依赖新对话按钮，不弹出账号池；重复请求不再次发送',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-video-'));let sends=0,opens=0;let url='https://www.doubao.com/chat/';
 const view={webContents:{loadURL:async v=>{url=v;},isDestroyed:()=>false,insertText:()=>{},sendInputEvent:e=>{if(e.type==='keyUp'){sends++;url='https://www.doubao.com/chat/123';}},executeJavaScript:async code=>{if(code.includes('captcha:'))return {url,text:sends?'已开始生成视频':'欢迎',captcha:false,videos:sends?['https://example.com/result.mp4']:[]};if(code.includes('inputReady')||code.includes('.some(e=>e.getClientRects()'))return true;if(code.includes('e.focus()'))return true;throw Error('不应依赖新对话按钮：'+code.slice(0,80));}}};
 const adapter=createNativeVideoAdapter({store:{state:{accounts:[{id:'local',managerAccountId:1}]}},createView:async()=>view,openAccount:async()=>{opens++;},directory:dir,wait:async()=>{}});
 const input={requestId:'original-task',accountId:1,duration:15,ratio:'9:16',model:'seedance_v2.0_mini',imagePaths:[],prompt:'真实门店走廊中的自然行走'};
 const task=adapter.start(input);for(let i=0;i<50&&task.status!=='complete';i++)await new Promise(r=>setImmediate(r));
 assert.equal(task.status,'complete');assert.equal(task.conversationId,'123');assert.equal(sends,1);assert.equal(opens,0);assert.equal(adapter.start(input).id,task.id);assert.equal(sends,1);fs.rmSync(dir,{recursive:true,force:true});
});

test('豆包两轮确认各发送一次，旧方案不会重复确认，最终取回同会话成片',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-two-confirms-'));let sends=0,url='https://www.doubao.com/chat/',typed='';const sent=[];
 const view={webContents:{loadURL:async v=>url=v,isDestroyed:()=>false,insertText:text=>{typed=text;},sendInputEvent:e=>{if(e.type==='keyUp'){sends++;sent.push(typed);url='https://www.doubao.com/chat/321';}},executeJavaScript:async code=>{if(code.includes('captcha:')){const reply=sends===1?'确认后我再开始生成视频。':sends===2?'方案已保存，请再次确认开始生成。':'视频已生成';return {url,text:sent.join('\n')+'\n'+reply,assistantText:reply,captcha:false,videos:sends>=3?['https://example.com/final.mp4']:[]};}if(code.includes('.some(e=>e.getClientRects()'))return true;if(code.includes('e.focus()'))return true;if(code.includes('pull_singe_chain'))return {status:500};throw Error('unexpected script');}}};
 const adapter=createNativeVideoAdapter({store:{state:{accounts:[{id:'local',managerAccountId:1}]}},createView:async()=>view,openAccount:async()=>assert.fail('不可自动弹出账号'),directory:dir,wait:async()=>{}});const task=adapter.start({requestId:'two-confirm',accountId:1,duration:5,ratio:'9:16',model:'seedance_v2.0_mini',imagePaths:[],prompt:'固定监控画面'});for(let i=0;i<100&&task.status!=='complete';i++)await new Promise(r=>setImmediate(r));assert.equal(task.status,'complete');assert.equal(sends,3);assert.equal(task.confirmationSteps.length,2);assert.equal(task.conversationId,'321');fs.rmSync(dir,{recursive:true,force:true});
});

test('重启后查询原会话继续确认，不重新发送视频初始请求',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-resume-'));let sends=0,typed='',url='';const initial='原来的已接收视频请求';fs.writeFileSync(path.join(dir,'desktop-video-tasks.json'),JSON.stringify([{id:'saved',requestId:'old',accountId:1,conversationId:'456',status:'starting',imagePaths:[],duration:5,ratio:'9:16',model:'seedance_v2.0_mini',prompt:initial,lastSentText:initial,sendAttemptedAt:'2026-10-14'}]));
 const view={webContents:{loadURL:async v=>url=v,isDestroyed:()=>false,insertText:text=>typed=text,sendInputEvent:e=>{if(e.type==='keyUp'){sends++;assert.match(typed,/确认方案/);}},executeJavaScript:async code=>{if(code.includes('captcha:'))return {url,text:initial+'\n'+(sends?typed+'\n视频完成':'确认后我开始生成视频。'),captcha:false,videos:sends?['https://example.com/resumed.mp4']:[]};if(code.includes('.some(e=>e.getClientRects()'))return true;if(code.includes('e.focus()'))return true;return {status:500};}}};
 const adapter=createNativeVideoAdapter({store:{state:{accounts:[{id:'local',managerAccountId:1}]}},createView:async()=>view,openAccount:async()=>assert.fail('不可自动弹出账号池'),directory:dir,wait:async()=>{}});await adapter.query('saved');for(let i=0;i<50&&adapter.get('saved').status!=='complete';i++)await new Promise(r=>setImmediate(r));assert.equal(adapter.get('saved').status,'complete');assert.equal(sends,1);assert.equal(url,'https://www.doubao.com/chat/456');fs.rmSync(dir,{recursive:true,force:true});
});

test('输入框未就绪时不标记已发送；文本框恢复后同一请求可安全重试',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-input-'));let sends=0,available=false,url='https://www.doubao.com/chat/';const view={webContents:{loadURL:async v=>url=v,isDestroyed:()=>false,insertText:()=>{},sendInputEvent:e=>{if(e.type==='keyUp'){sends++;url='https://www.doubao.com/chat/789';}},executeJavaScript:async code=>{if(code.includes('captcha:'))return {url,text:sends?'已生成视频':'欢迎',captcha:false,videos:sends?['https://example.com/ok.mp4']:[]};if(code.includes('e.focus()')){assert.ok(code.includes('textarea'));return available;}if(code.includes('.some(e=>e.getClientRects()'))return true;return {status:500};}}};
 const adapter=createNativeVideoAdapter({store:{state:{accounts:[{id:'local',managerAccountId:1}]}},createView:async()=>view,openAccount:async()=>{},directory:dir,wait:async()=>{}}),input={requestId:'recover-input',accountId:1,duration:5,ratio:'9:16',model:'seedance_v2.0_mini',imagePaths:[],prompt:'空走廊'};const task=adapter.start(input);for(let i=0;i<60&&task.status!=='error';i++)await new Promise(r=>setImmediate(r));assert.equal(task.status,'error');assert.equal(task.sendAttemptedAt,undefined);assert.equal(sends,0);available=true;assert.equal(adapter.start(input).id,task.id);for(let i=0;i<50&&task.status!=='complete';i++)await new Promise(r=>setImmediate(r));assert.equal(task.status,'complete');assert.equal(sends,1);fs.rmSync(dir,{recursive:true,force:true});
});

test('验证超时后原窗口迟到的会话接收事件仍保存编号，并继续原任务不重发',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-late-ack-'));let stamp=Date.now(),sends=0,url='https://www.doubao.com/chat/',completed=false;const events=new Map();const view={webContents:{on:(name,fn)=>events.set(name,fn),removeListener:(name)=>events.delete(name),loadURL:async v=>url=v,isDestroyed:()=>false,insertText:()=>{},sendInputEvent:e=>{if(e.type==='keyUp')sends++;},executeJavaScript:async code=>{if(code.includes('captcha:'))return {url,text:'原请求',captcha:false,videos:completed?['https://example.com/late.mp4']:[]};if(code.includes('e.focus()')||code.includes('.some(e=>e.getClientRects()'))return true;return {status:500};}}};
 const adapter=createNativeVideoAdapter({store:{state:{accounts:[{id:'local',managerAccountId:1}]}},createView:async()=>view,directory:dir,wait:async()=>{stamp+=6*60*1000;},now:()=>stamp});const task=adapter.start({requestId:'late',accountId:1,duration:5,ratio:'9:16',model:'seedance_v2.0_mini',imagePaths:[],prompt:'原请求'});for(let i=0;i<50&&task.status!=='needs_review';i++)await new Promise(r=>setImmediate(r));assert.equal(task.status,'needs_review');assert.equal(task.conversationId,undefined);assert.equal(sends,1);completed=true;url='https://www.doubao.com/chat/999';events.get('did-navigate-in-page')({},url,true);for(let i=0;i<50&&task.status!=='complete';i++)await new Promise(r=>setImmediate(r));assert.equal(task.conversationId,'999');assert.equal(task.status,'complete');assert.equal(sends,1);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'desktop-video-tasks.json')))[0].conversationId,'999');fs.rmSync(dir,{recursive:true,force:true});
});


test('明确的视频日额度耗尽不是临时限流，历史原会话证据恢复为明确失败',async()=>{
 assert.equal(videoQuotaExhausted('今日视频生成免费次数用完了，你明天再来'),true);
 assert.equal(videoQuotaExhausted('STREAM_ERROR rate limited'),false);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-quota-'));
 try{fs.writeFileSync(path.join(dir,'desktop-video-tasks.json'),JSON.stringify([{id:'quota',status:'needs_review',lastSentText:'确认方案',lastResponse:'生成视频中\n确认方案\n今日视频生成免费次数用完了，你明天再来'}]));
 const adapter=createNativeVideoAdapter({store:{state:{accounts:[]}},createView:async()=>{throw Error('不应发送');},directory:dir});
 assert.equal(adapter.get('quota').status,'error');assert.equal(adapter.get('quota').failureCode,'daily_quota_exhausted');assert.equal((await adapter.query('quota')).status,'error');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
