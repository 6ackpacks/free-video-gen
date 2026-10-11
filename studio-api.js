export async function studioApi(service,req,res,url,{body,reply}) {
  const route=url.pathname;if(!route.startsWith('/api/studio'))return false;
  const {domain,queue}=service;
  const send=value=>{reply(res,200,value);return true;};
  const referenceVideo=/^\/api\/studio\/reference-videos\/([a-f0-9-]{36})$/.exec(route);
  if(referenceVideo){
    const source=service.replicaSources.get(referenceVideo[1]);
    const {default:fs}=await import('node:fs'),{default:path}=await import('node:path');
    const file=path.join(service.replicaSources.directory,source.id,'source.mp4');
    if(req.method==='GET'){if(!fs.existsSync(file))throw Error('历史参考只保存关键帧，原视频未保存在本机');await service.media.serveLocal(file,{id:source.id},req,res);return true;}
    if(req.method==='POST'){
      const pieces=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>300*1024*1024)throw Error('参考视频超过300MB');pieces.push(chunk);}const bytes=Buffer.concat(pieces);
      if(bytes.length<12||bytes.toString('ascii',4,8)!=='ftyp')throw Error('请上传有效MP4参考视频');
      fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);source.videoUrl=`/api/studio/reference-videos/${source.id}`;service.replicaSources.save();return send(source);
    }
  }
  if(route==='/api/studio'&&req.method==='GET')return send(service.overview());
  if(route==='/api/studio/templates'&&req.method==='POST')return send(domain.saveTemplate(await body(req)));
  const template=/^\/api\/studio\/templates\/([^/]+)$/.exec(route);
  if(template&&req.method==='PATCH'){const t=domain.template(decodeURIComponent(template[1]));t.archived=!!(await body(req)).archived;domain.save();return send(t);}
  if(route==='/api/studio/projects'&&req.method==='POST')return send(domain.saveProject(await body(req)));
  const project=/^\/api\/studio\/projects\/([^/]+)(?:\/(prompts|submit|adopt|draft))?$/.exec(route);
  if(project){
    const p=domain.project(project[1]);
    if(req.method==='GET')return send(service.project(p.id));
    if(req.method==='POST'){
      const input=await body(req);
      if(project[2]==='draft'){
        const existing=service.drafts.tasks.find(t=>t.projectId===p.id&&t.status==='running');if(existing)return send(existing);
        const task=service.drafts.create({projectId:p.id,requestId:input.requestId});task.projectId=p.id;p.promptTaskId=task.id;p.stage='prompts';domain.save();service.drafts.save();return send(task);
      }
      if(project[2]==='submit')return send(service.submit({...input,projectId:p.id}));
      if(project[2]==='prompts'){
        for(const plan of p.plans){const change=input.plans?.find(v=>v.id===plan.id);if(change){if(!Array.isArray(change.prompts)||change.prompts.length!==plan.count||change.prompts.some(v=>typeof v!=='string'||!v.trim()||v.length>16000))throw Error('提示词条数或内容无效');plan.prompts=change.prompts;plan.scriptConfirmed=!!change.scriptConfirmed;if(input.confirm)plan.promptsDirty=false;}}
        domain.save();return send(service.project(p.id));
      }
      if(project[2]==='adopt'){
        const t=p.trials.find(t=>t.jobId===input.jobId);if(!t||queue.state.jobs.find(j=>j.id===t.jobId)?.status!=='complete')throw Error('请等待试片完成');
        t.adopted=true;
        if(!domain.adopted(p,queue).includes(t)){t.adopted=false;throw Error('内容或设置已变更，旧试片不能抵扣');}
        for(const other of p.trials)if(other!==t&&other.planId===t.planId&&other.index===t.index)other.adopted=false;
        domain.save();return send(service.project(p.id));
      }
    }
  }
  const task=/^\/api\/studio\/(drafts|image-tasks)\/([^/]+)$/.exec(route);
  if(task&&req.method==='GET')return send((task[1]==='drafts'?service.drafts:service.images).get(task[2]));
  const imageRetry=/^\/api\/studio\/image-tasks\/([^/]+)\/items\/([^/]+)\/retry$/.exec(route);
  if(imageRetry&&req.method==='POST'){const input=await body(req);return send(await service.images.retry(imageRetry[1],imageRetry[2],input.externalId));}
  if(route==='/api/studio/images'&&req.method==='POST')return send(service.images.create(await body(req)));
  const asset=/^\/api\/studio\/assets\/([^/]+)$/.exec(route);
  if(asset&&req.method==='PATCH'){
    const input=await body(req);if(!service.assets().some(a=>a.id===asset[1]))throw Error('素材不存在');
    const metadata=domain.state.assets[asset[1]]||{};
    for(const key of ['confirmed','archived','favorite','scene','role'])if(input[key]!==undefined)metadata[key]=input[key];
    domain.state.assets[asset[1]]=metadata;domain.save();return send(metadata);
  }
  if(route==='/api/studio/works'&&req.method==='GET')return send(service.works());
  const job=/^\/api\/studio\/jobs\/([^/]+)\/(retry|cancel|reconcile)$/.exec(route);
  if(job&&req.method==='POST'){
    const current=queue.state.jobs.find(j=>j.id===job[1]);if(!current)throw Error('作品不存在');
    if(job[2]==='cancel'){if(!['queued','draft_pending','review_pending'].includes(current.status)||current.providerId)throw Error('已提交上游，无法取消');current.status='cancelled';queue.save();return send(current);}
    if(job[2]==='reconcile'){
      const input=await body(req),externalId=current.providerId||String(input.externalId||'');
      if(!externalId||externalId.length>150||!/^[-a-zA-Z0-9_:]+$/.test(externalId))throw Error('缺少上游任务编号，请在账号池核对后再处理');
      const result=await service.provider.status(externalId,current);current.providerId=externalId;Object.assign(current,result);queue.save();return send(current);
    }
    if(current.providerId){const result=await service.provider.status(current.providerId,current);if(result.status!=='error'){Object.assign(current,result);queue.save();return send(current);}}
    return send(queue.retry(current.id));
  }
  if(route==='/api/studio/settings'&&req.method==='POST'){const input=await body(req);if(input.paused!==undefined)domain.state.settings.paused=!!input.paused;if(input.defaultRoute&&service.provider.routes.some(r=>r.id===input.defaultRoute&&r.configured))domain.state.settings.defaultRoute=input.defaultRoute;domain.save();return send(domain.state.settings);}
  if(route==='/api/studio/connection-test'&&req.method==='POST')return send({video:await service.provider.doubao.info(),api:await service.provider.health?.()||{message:'此服务未提供无付费连接检查'}});
  if(route==='/api/studio/downloads'&&req.method==='POST'){
    const input=await body(req),requested=new Set(input.jobIds||[]),jobs=service.works().filter(j=>requested.has(j.id)&&j.status==='complete'&&j.outputs?.length);
    if(!jobs.length)throw Error('没有已完成的视频');
    const id=input.requestId; if(!/^[a-f0-9-]{36}$/i.test(id||''))throw Error('下载标识无效');
    return send({...service.media.start({id},jobs),id,excluded:requested.size-jobs.length});
  }
  const download=/^\/api\/studio\/downloads\/([^/]+)(\/archive)?$/.exec(route);
  if(download&&req.method==='GET'){
    const jobs=service.media.runJobs(download[1],service.works()).filter(j=>j.status==='complete');
    if(!service.media.runs.has(download[1]))throw Error('下载准备记录不存在，请重新选择作品');
    if(download[2]){await service.media.archive(jobs,res,'works.zip');return true;}
    return send(service.media.status(download[1],jobs));
  }
  throw Error('接口不存在');
}
