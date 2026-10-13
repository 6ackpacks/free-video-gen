import {readSecret} from './secrets.js';
import {shouldGenerateAudio} from './wan.js';
// TokenDance Seedance Generations protocol: https://tokendance.space/docs/protocol-seedance-generations
export function createSeedanceProvider({model,fetchImpl=fetch}){
 const key=readSecret('TOKENDANCE'),base='https://tokendance.space/gateway/ark/v3/generations/tasks';
 async function request(url,options={}){let res;try{res=await fetchImpl(url,{...options,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(60000)});}catch(e){const err=new Error('TokenDance Seedance连接失败或超时');err.transient=true;throw err;}let data;try{data=await res.json();}catch{throw Error('TokenDance返回无效响应');}if(!res.ok){const err=new Error(String(data.error?.message||data.message||'Seedance请求失败').split(key||'__NO_KEY__').join('[已隐藏]'));err.status=res.status;throw err;}return data;}
 return {model,configured:!!key,supportsIdempotency:false,async submit(job){
 if(!key)throw Error('TokenDance尚未配置密钥');const max=model==='seedance-2.5'?30:15,duration=Number(job.duration);if(!Number.isInteger(duration)||duration<4||duration>max)throw Error(`此模型支持4–${max}秒`);
 const images=job.referenceMode==='reference-image'?(job.referenceImageUrls||[]):job.referenceImageUrl?[job.referenceImageUrl]:[];if(images.length>(model==='seedance-2.5'?30:9))throw Error('参考图片数量超过模型限制');
 const content=[{type:'text',text:job.prompt},...images.map(url=>({type:'image_url',image_url:{url},role:job.referenceMode==='reference-image'?'reference_image':'first_frame'}))];
 const data=await request(base,{method:'POST',body:JSON.stringify({model,content,resolution:String(job.resolution||'720P').toLowerCase(),ratio:images.length&&job.referenceMode!=='reference-image'&&job.autoRatio!==false?'adaptive':job.ratio||'9:16',duration,generate_audio:!!job.nativeAudio||shouldGenerateAudio(job.prompt),watermark:false})});if(!data.id)throw Error('Seedance未返回任务编号');return {id:data.id,status:'waiting',outputs:[]};
 },async status(id){const d=await request(base+'/'+encodeURIComponent(id));return {status:({queued:'waiting',running:'running',succeeded:'complete',failed:'error',cancelled:'error',expired:'error'})[d.status]||'waiting',outputs:d.content?.video_url?[{url:d.content.video_url}]:[],error:String(d.error?.message||'').split(key||'__NO_KEY__').join('[已隐藏]')};}};
}
