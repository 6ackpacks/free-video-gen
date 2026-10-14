// Delete project records while retaining reusable media and completed work.
export function deleteProjects(service,input){
 const ids=input?.projectIds;
 if(!Array.isArray(ids)||!ids.length||ids.length>500||ids.some(id=>typeof id!=='string'||!id))throw Error('请选择要删除的项目');
 const unique=[...new Set(ids)],projects=unique.map(id=>service.domain.project(id));
 for(const p of projects){
  const busy=service.videoProduction?.busy(p.id)||service.promotionProduction?.busy(p.id)||service.drafts?.tasks.some(t=>t.projectId===p.id&&t.status==='running')||service.images?.tasks.some(t=>t.projectId===p.id&&(t.status==='running'||t.items?.some(i=>i.status==='needs_review')))||service.monitorWorkflow?.tasks.some(t=>t.projectId===p.id&&t.status==='images');
  const jobs=service.queue.state.jobs.filter(j=>j.projectId===p.id);
  if(busy||jobs.some(j=>!['complete','error','cancelled'].includes(j.status)))throw Error('“'+p.name+'”仍有进行中或待核对任务，请先完成、停止或核对任务后再删除');
 }
 const state=service.domain.state,previous=state.projects,backup=state.deletedProjects;
 state.deletedProjects=[...(backup||[]),...projects.map(p=>({...structuredClone(p),deletedAt:new Date().toISOString()}))];
 state.projects=previous.filter(p=>!unique.includes(p.id));
 try{service.domain.save();}catch(error){state.projects=previous;state.deletedProjects=backup;throw error;}
 return {deleted:unique,mediaRetained:true};
}
