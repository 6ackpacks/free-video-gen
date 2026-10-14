import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function createNativeVideoAdapter({store,createView,openAccount,directory,wait=pause}) {
 const pause=wait;
 const file=path.join(directory,'desktop-video-tasks.json'),tasks=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[];
 const persist=()=>{fs.writeFileSync(file+'.tmp',JSON.stringify(tasks,null,2));fs.renameSync(file+'.tmp',file);};
 for(const t of tasks)if(!['complete','error'].includes(t.status)){t.status='needs_review';t.error='工作台已重启，请核对原会话，不自动重复发送';}persist();
 const code=fs.readFileSync(new URL('../integrations/DoubaoManager/src/doupool/video/browser.py',import.meta.url),'utf8');const chain=/CHAIN_SCRIPT = r"""([\s\S]*?)"""/.exec(code)?.[1];
 const fromChain=data=>{const queue=[data];while(queue.length){const item=queue.shift();if(typeof item==='string'){try{queue.push(JSON.parse(item));}catch{}}else if(item&&typeof item==='object'){const video=item.video;if(video&&video.status===3&&video.download_url?.startsWith('https://'))return video.download_url;queue.push(...Object.values(item));}}return '';};
 const load=async(view,url)=>{for(let i=0;i<3;i++){try{await view.webContents.loadURL(url);return;}catch(e){if(!/ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED/.test(e.message)||i===2)throw e;await pause(1500);}}};
 const state=async view=>view.webContents.executeJavaScript(`(()=>{const visible=e=>!!e&&e.getClientRects().length>0;return {url:location.href,text:(document.querySelector('main')||document.body).innerText.slice(-24000),captcha:[...document.querySelectorAll('#captcha_container,[class*=captcha_verify]')].some(visible),videos:[...document.querySelectorAll('video')].map(v=>v.currentSrc||v.src||v.querySelector('source')?.src).filter(v=>v?.startsWith('https://'))};})()`,true);
 async function send(view,text){
  const current=await state(view);if(current.captcha)throw Error('需要手动完成豆包安全验证');
  const focused=await view.webContents.executeJavaScript(`(()=>{const e=[...document.querySelectorAll('[contenteditable="true"]')].filter(e=>e.getClientRects().length).at(-1);if(!e)return false;e.focus();return true;})()`,true);if(!focused)throw Error('未找到豆包输入框');
  view.webContents.insertText(text);await pause(300);view.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});view.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});
 }
 async function run(task,account){
  try {
   const view=await createView(account.id);
   await load(view,'https://www.doubao.com/chat/');
   let ready=false,requestedFresh=false;const readyUntil=Date.now()+30000;
   while(Date.now()<readyUntil){const page=await state(view);if(page.captcha){task.status='verification_required';task.message='需要安全验证，请从任务记录打开账号池完成';persist();await pause(1000);continue;}
    const inputReady=await view.webContents.executeJavaScript(`(()=>[...document.querySelectorAll('[contenteditable="true"],textarea')].some(e=>e.getClientRects().length))()`,true);
    if(inputReady&&!/\/chat\/\d+/.test(page.url)){ready=true;break;}
    if(inputReady&&!requestedFresh){requestedFresh=await view.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('button,[role="button"],a')].find(b=>b.getClientRects().length&&/新对话|新聊天|开启新对话/.test([b.innerText,b.getAttribute('aria-label'),b.getAttribute('title'),b.getAttribute('data-testid')].join(' ')));if(!b)return false;b.click();return true;})()`,true);}await pause(500);
   }
   if(!ready)throw Error('未发送：新会话输入区未就绪，请检查登录或页面加载状态');
   const initial=await state(view);const oldVideos=new Set(initial.videos);
   if(task.imagePaths.length){
    const debug=view.webContents.debugger;debug.attach('1.3');try{const doc=await debug.sendCommand('DOM.getDocument');const input=await debug.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'input[type=file]'});if(!input.nodeId)throw Error('豆包上传入口尚未加载');await debug.sendCommand('DOM.setFileInputFiles',{nodeId:input.nodeId,files:task.imagePaths});}finally{debug.detach();}await pause(5000);
   }
   let sent=false,confirmed=false;const deadline=Date.now()+20*60*1000;
   while(Date.now()<deadline){
    if(view.webContents.isDestroyed())throw Error('账号窗口关闭，请重新打开后核对会话');
    const current=await state(view);task.lastResponse=current.text.slice(-9000);const match=/\/chat\/(\d+)/.exec(current.url);if(match&&!task.conversationId&&task.sendAttemptedAt)task.conversationId=match[1];const sameConversation=!task.conversationId||match?.[1]===task.conversationId;
    if(current.captcha){task.status='verification_required';task.message='请在右侧豆包页面手动完成安全验证，完成后继续';persist();await pause(3000);continue;}
    if(!sent){task.sendAttemptedAt=new Date().toISOString();persist();await send(view,`请实际生成一条${task.duration}秒、${task.ratio}的视频，使用${task.model==='seedance_v2.0_mini'?'Seedance 2.0 Mini':'Seedance 2.0'}。${task.imagePaths.length?'请把已上传图片作为首帧。':''}${task.prompt}`);sent=true;task.status='starting';task.message='已操作发送，正在等待豆包接收与视频方案';persist();await pause(6000);continue;}
    let result=sameConversation?current.videos.find(v=>!oldVideos.has(v)):'';
    if(!result&&chain&&task.conversationId){try{const response=await view.webContents.executeJavaScript(`(${chain})(${JSON.stringify({conversationId:task.conversationId})})`,true);if(response.status===200)result=fromChain(response.data);}catch{}}if(result){Object.assign(task,{status:'complete',resultUrl:result,message:'已取得真实视频成片'});persist();return;}
    if(sameConversation&&/预计.{0,20}分钟|正在生成视频|视频生成中|正在为你生成|已开始生成/.test(current.text)){task.status='generating';task.message='豆包已开始生成，等待成片';persist();}
    else if(sameConversation&&!confirmed&&/确认.{0,30}(生成|开始)|确定.{0,20}生成|方案.{0,20}(确认|满意)/.test(current.text)){await pause(3000);await send(view,'确认方案，请立即实际生成视频，不要再只输出文字方案。');confirmed=true;task.status='starting';task.message='已自动确认豆包方案，等待视频任务';persist();}
    await pause(5000);
   }
   task.status='needs_review';task.message='尚未取得成片，请在本次会话核对，不自动重新发送';persist();
  } catch(error){task.status=task.sendAttemptedAt?'needs_review':'error';task.error=(task.sendAttemptedAt?'需核对：':'')+error.message;persist();}
 }
 return {
  start(input){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(String(input.requestId||'')))throw Error('缺少稳定任务编号');if(![5,10].includes(Number(input.duration))||!['9:16','16:9','1:1','3:4','4:3','21:9'].includes(input.ratio)||!['seedance_v2.0_mini','seedance_v2.0','seedance_v2.0_std'].includes(input.model))throw Error('豆包参数不受支持');if(!Array.isArray(input.imagePaths||[])||(input.imagePaths||[]).length>9)throw Error('最多九张参考图片');const account=store.state.accounts.find(v=>v.managerAccountId===input.accountId);if(!account)throw Error('该执行账号没有对应的桌面登录会话');const prior=tasks.find(t=>t.requestId===input.requestId);if(prior)return prior;if(tasks.some(t=>!['complete','error','needs_review'].includes(t.status)))throw Error('已有豆包视频正在执行，请等待完成');const root=path.resolve(process.env.LOCALAPPDATA,'DoubaoManager','DoubaoManager');const imagePaths=(input.imagePaths||[]).map(v=>{const resolved=fs.realpathSync(v);if(!resolved.startsWith(root+path.sep)||!['.png','.jpg','.jpeg','.webp'].includes(path.extname(resolved).toLowerCase()))throw Error('图片不是本地任务素材');return resolved;});if(!input.prompt||input.prompt.length>1900)throw Error('视频描述长度无效');const task={id:randomUUID(),requestId:input.requestId,accountId:input.accountId,imagePaths,prompt:input.prompt,duration:input.duration,ratio:input.ratio,model:input.model,status:'starting',createdAt:new Date().toISOString()};tasks.unshift(task);persist();run(task,account);return task;},
  isBusy(id){const account=store.state.accounts.find(v=>v.id===id);return tasks.some(t=>t.accountId===account?.managerAccountId&&!['complete','error','needs_review'].includes(t.status));},
  activeConversation(id){const account=store.state.accounts.find(v=>v.id===id);return tasks.find(t=>t.accountId===account?.managerAccountId&&!['complete','error','needs_review'].includes(t.status))?.conversationId||'';},
  async query(id){const task=tasks.find(t=>t.id===id);if(!task?.conversationId)throw Error('没有已发送会话，不能查询成片');if(tasks.some(v=>v.accountId===task.accountId&&v.id!==id&&!['complete','error','needs_review'].includes(v.status)))throw Error('该账号正在执行其他任务，请完成后查询历史成片');const account=store.state.accounts.find(a=>a.managerAccountId===task.accountId);await openAccount(account.id);const view=await createView(account.id);await load(view,'https://www.doubao.com/chat/'+task.conversationId);await pause(3000);const current=await state(view);task.lastResponse=current.text.slice(-9000);if(current.captcha){task.message='请在账号池手动完成验证后查询';persist();return task;}let result='';if(!result&&chain){try{const response=await view.webContents.executeJavaScript(`(${chain})(${JSON.stringify({conversationId:task.conversationId})})`,true);task.queryStatus=response.status;task.queryCode=response.data?.code;if(response.status===200)result=fromChain(response.data);}catch(e){task.queryError=e.message;}}if(result)Object.assign(task,{status:'complete',resultUrl:result,message:'已从原会话取回成片',error:''});persist();return task;},
  get(id){const task=tasks.find(t=>t.id===id);if(!task)throw Error('桌面视频任务不存在');return task;}
 };
}
