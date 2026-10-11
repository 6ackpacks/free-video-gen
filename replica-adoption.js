import {createHash} from 'node:crypto';

export function replicaSignature(input) {
  const keys=['name','replica','duration','ratio','resolution','videoRoute','referenceImageIds','presetId','customer','referenceMode','actionPackId','actionPack','creativeBrief'];
  return createHash('sha256').update(JSON.stringify(Object.fromEntries(keys.map(k=>[k,input[k]])))).digest('hex');
}
export function planReplicaSubmission(input, planned, jobs) {
  const signature=replicaSignature(input);
  if(input.trial&&Number(input.count)!==1)throw Error('试片只能提交一条');
  let prompts=planned.prompts;
  if(input.adoptedTrialId){
    const trial=jobs.find(j=>j.id===input.adoptedTrialId);
    if(!trial?.isReplicaTrial||trial.status!=='complete'||trial.replicaSignature!==signature)throw Error('试片已失效，请核对模板、内容、底图与生成设置后重新采纳');
    prompts=prompts.slice(1);
    if(!prompts.length)throw Error('采纳的试片已覆盖本次全部画面，无需再次生成');
  }
  return {prompts:prompts.map(j=>({...j,isReplicaTrial:!!input.trial,replicaSignature:signature})),adoptedTrialId:input.adoptedTrialId||''};
}
