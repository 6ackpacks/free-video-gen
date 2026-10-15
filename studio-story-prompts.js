// Check known service-claim and authoring-instruction leaks before video handoff.
// This is a narrow regression guard, not a full semantic fact checker.
export function storyPromptIssues(prompt, facts='') {
 const issues=[];
 for(const match of String(prompt).matchAll(/已消毒|微肿|肿胀|消肿|治愈|请生成完整脚本|确认资料无误|资料已确认|等待用户确认|未知信息待确认/g)) {
  const prefix=String(prompt).slice(0,match.index).split(/[。；;\n]/).at(-1).slice(-30);
  if(/禁止|避免|不得|不要|不新增|不声称|不编造|不宣传|不出现/.test(prefix))continue;
  if(/已消毒|微肿|肿胀|消肿|治愈/.test(match[0])&&String(facts).includes(match[0]))continue;
  issues.push(match[0]);
 }
 return [...new Set(issues)];
}

export async function rewriteStudioPrompts(provider,request) {
 let result=await provider.rewritePrompts(request);
 if(request.mode!=='story')return result;
 const check=value=>(value.items||[]).flatMap(item=>storyPromptIssues(item.prompt,request.context?.brandFacts));
 const issues=check(result);
 if(!issues.length)return result;
 result=await provider.rewritePrompts({...request,outputRequirements:[request.outputRequirements,'上一版含未提供的服务事实或写稿指令：'+issues.join('、')+'。请重新依据原始用户资料编写；删除这些新增内容，不把它们改写成角色对白。只返回最终视频内容。'].filter(Boolean).join('\n')});
 const remaining=check(result);
 if(remaining.length)throw Error('短剧内容仍含未确认事实或后台措辞：'+remaining.join('、')+'。本次未提交视频，请调整宣传资料或重新生成内容。');
 return result;
}
