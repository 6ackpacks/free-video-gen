import { normalizeReplica } from './replica-workflow.js';

export async function analyzeReplicaTemplate(input,provider,report=()=>{}) {
  let previous=null,validationError='';
  for(let attempt=1;attempt<=3;attempt++){
    report({analysisAttempt:attempt,analysisMessage:attempt===1?'正在分析参考画面':'模型结果格式不完整，正在修正模板（'+attempt+'/3）'});
    // Transport failures must not cause more paid calls. Only invalid model
    // output is repaired, with its exact validation error and previous result.
    let result;
    try{result=await provider.analyzeReplica({...input,repair:previous!==null?{error:validationError,previous}:null});}
    catch(error){if(!error.invalidModelOutput)throw error;previous=error.rawOutput||'';validationError=error.message;continue;}
    try{return normalizeReplica(result);}
    catch(error){previous=result;validationError=error.message;}
  }
  throw Error('复刻模板格式未通过校验：'+validationError+'。请重试分析；已上传的参考关键帧仍保留。');
}
