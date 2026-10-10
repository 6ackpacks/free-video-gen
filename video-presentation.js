import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class VideoPresentation {
  constructor(directory) {
    this.directory=directory;fs.mkdirSync(directory,{recursive:true});
    this.file=path.join(directory,'examples.json');
    this.examples=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{};
  }
  save(){fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.examples,null,2));fs.renameSync(this.file+'.tmp',this.file);}
  key(packId,actionId){return `${packId}:${actionId}`;}
  example(packId,actionId,jobs){
    const chosen=this.examples[this.key(packId,actionId)];
    if(chosen?.fileId)return {...chosen,videoUrl:`/api/template-examples/media/${chosen.fileId}`,posterId:chosen.fileId,source:'uploaded'};
    const job=jobs.find(j=>j.id===chosen?.jobId&&j.status==='complete'&&j.outputs?.length&&j.actionId===actionId&&(j.packId||'foot-spa-store')===packId)||jobs.find(j=>j.status==='complete'&&j.outputs?.length&&j.actionId===actionId&&(j.packId||'foot-spa-store')===packId);
    return job?{jobId:job.id,title:job.actionName||job.skillName,duration:job.duration,videoUrl:`/api/video/${job.id}?preview=1`,posterId:job.id,source:'history'}:null;
  }
  assign(packId,actionId,jobId,jobs){
    const job=jobs.find(j=>j.id===jobId&&j.status==='complete'&&j.outputs?.length&&j.actionId===actionId&&(j.packId||'foot-spa-store')===packId);
    if(!job)throw Error('请选择该模板已经完成的视频');
    this.examples[this.key(packId,actionId)]={jobId};this.save();return this.example(packId,actionId,jobs);
  }
  upload(packId,actionId,input){
    const data=/^data:video\/mp4;base64,([A-Za-z0-9+/=]+)$/.exec(input.dataUrl||'');
    if(!data)throw Error('请上传 MP4 示例视频');
    const bytes=Buffer.from(data[1],'base64');
    if(bytes.length<12||bytes.length>50*1024*1024||bytes.toString('ascii',4,8)!=='ftyp')throw Error('示例须为有效 MP4，大小最多 50 MB');
    const fileId=randomUUID();fs.writeFileSync(path.join(this.directory,fileId+'.mp4'),bytes);
    this.examples[this.key(packId,actionId)]={fileId,title:String(input.name||'本地示例').slice(0,100)};this.save();return this.example(packId,actionId,[]);
  }
  local(id){return /^[a-f0-9-]{36}$/i.test(id)&&Object.values(this.examples).some(e=>e.fileId===id)?path.join(this.directory,id+'.mp4'):null;}
  poster(id){if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('视频编号无效');return path.join(this.directory,id+'.jpg');}
  savePoster(id,dataUrl){
    const data=/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl||'');if(!data)throw Error('封面格式无效');
    const bytes=Buffer.from(data[1],'base64');if(bytes.length>500000||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('封面须为 500 KB 以内的 JPEG');
    const file=this.poster(id);if(!fs.existsSync(file)){fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);}return file;
  }
}
