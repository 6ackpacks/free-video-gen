import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createNativeVideoAdapter} from './electron/video-adapter.js';
test('空白新会话直接发送，不依赖新对话按钮，不弹出账号池；重复请求不再次发送',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'native-video-'));let sends=0,opens=0;let url='https://www.doubao.com/chat/';
 const view={webContents:{loadURL:async v=>{url=v;},isDestroyed:()=>false,insertText:()=>{},sendInputEvent:e=>{if(e.type==='keyUp'){sends++;url='https://www.doubao.com/chat/123';}},executeJavaScript:async code=>{if(code.includes('captcha:'))return {url,text:sends?'已开始生成视频':'欢迎',captcha:false,videos:sends?['https://example.com/result.mp4']:[]};if(code.includes('inputReady')||code.includes('.some(e=>e.getClientRects()'))return true;if(code.includes('e.focus()'))return true;throw Error('不应依赖新对话按钮：'+code.slice(0,80));}}};
 const adapter=createNativeVideoAdapter({store:{state:{accounts:[{id:'local',managerAccountId:1}]}},createView:async()=>view,openAccount:async()=>{opens++;},directory:dir,wait:async()=>{}});
 const input={requestId:'original-task',accountId:1,duration:5,ratio:'9:16',model:'seedance_v2.0_mini',imagePaths:[],prompt:'真实门店走廊中的自然行走'};
 const task=adapter.start(input);for(let i=0;i<50&&task.status!=='complete';i++)await new Promise(r=>setImmediate(r));
 assert.equal(task.status,'complete');assert.equal(task.conversationId,'123');assert.equal(sends,1);assert.equal(opens,0);assert.equal(adapter.start(input).id,task.id);assert.equal(sends,1);fs.rmSync(dir,{recursive:true,force:true});
});
