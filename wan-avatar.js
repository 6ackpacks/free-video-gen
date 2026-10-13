import {readSecret} from './secrets.js';
export function createAvatarProvider({key=readSecret('DASHSCOPE'),workspaceId=process.env.DASHSCOPE_WORKSPACE_ID||'',fetchImpl=fetch}={}){
 const validWorkspace=/^[a-zA-Z0-9-]{1,100}$/.test(workspaceId),base=validWorkspace?`https://${workspaceId}.cn-beijing.maas.aliyuncs.com/api/v1`:'';
 async function request(url,options={}){
  if(!key||!base)throw Error('请在模型设置中填写北京地域百炼业务空间ID，并配置对应密钥');
  const response=await fetchImpl(url,{...options,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-DashScope-Async':'enable'},signal:AbortSignal.timeout(60000)});
  const data=await response.json();if(!response.ok||data.code){const error=Error(String(data.output?.message||data.message||'配音对口型接口请求失败').replaceAll(key,'[密钥已隐藏]'));error.status=response.status;throw error;}return data;
 }
 return {id:'wan-avatar',model:'wan2.2-s2v',name:'阿里云配音对口型',configured:!!key&&validWorkspace,
  async submit(job){if(!job.referenceImageUrl||!job.audioUrl)throw Error('配音对口型需要人物与商品合成图和配音地址');const audio=new URL(job.audioUrl);if(audio.protocol!=='https:'||audio.username||audio.password)throw Error('配音地址必须为HTTPS');if(!['480P','720P'].includes(job.resolution))throw Error('对口型画质仅支持480P或720P');
   const data=await request(base+'/services/aigc/image2video/video-synthesis',{method:'POST',body:JSON.stringify({model:'wan2.2-s2v',input:{image_url:job.referenceImageUrl,audio_url:job.audioUrl},parameters:{resolution:job.resolution}})});if(!data.output?.task_id)throw Error('对口型接口未返回任务编号');return {id:data.output.task_id,status:'waiting',outputs:[]};},
  async status(id){const data=await request(base+'/tasks/'+encodeURIComponent(id)),o=data.output||{},url=o.results?.video_url||o.video_url;return {status:({PENDING:'waiting',RUNNING:'running',SUCCEEDED:'complete',FAILED:'error',CANCELED:'error',UNKNOWN:'error'})[o.task_status]||'waiting',outputs:url?[{url}]:[],error:o.task_status==='FAILED'?o.message||'对口型生成失败':''};}
 };
}
