import os,json,copy
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192');OUT=Path('data/e2e-production-feedback');OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch();ctx=b.new_context(viewport={'width':1500,'height':940});page=ctx.new_page();page.set_default_timeout(8000);errors=[];checks=[];page.on('pageerror',lambda e:errors.append(str(e)))
 catalog=page.request.get(BASE+'/api/studio').json();project=catalog['projects'][0];jobs=[]
 ctx.add_init_script("""window.accountSelections=[];window.accountBounds=[];window.doubaoAccounts={list:async()=>({accounts:[{id:'local-a',name:'测试账号',nickname:'测试账号',managerAccountId:'remote-a',status:'running'}]}),select:async id=>accountSelections.push(id),conversation:async(id,chat)=>accountSelections.push(id+':'+chat),setBounds:r=>accountBounds.push(r),hide:()=>{},sync:async()=>({manager:{display_name:'测试账号'}})};""")
 def route(r):
  req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
  if path=='/api/studio/works':r.fulfill(json=jobs);return
  if path=='/api/doubao/task-records':r.fulfill(json=[{'id':'task-1','account_id':'remote-a','account_name':'测试账号','prompt':'实际发送：固定高位镜头，敲门后等待，5秒。','status':'succeeded','conversation_id':'12345','result_url':'https://example.com/test.mp4','created_at':'2026-10-13T12:00:00Z'}]);return
  if path=='/api/doubao/accounts':r.fulfill(json=[{'id':'remote-a','display_name':'测试账号','enabled':True,'status':'active','video_quota_used':1}]);return
  if path=='/api/references':r.fulfill(json=[]);return
  if req.method not in ['GET','HEAD']:r.fulfill(json={'error':'测试不执行实际写入'});return
  r.continue_()
 ctx.route('**/api/**',route)
 try:
  page.goto(BASE+'/studio?type=footspa%3Amonitor&project='+project['id'],wait_until='networkidle')
  expect(page.locator('#projectProductionStatus')).to_contain_text('视频尚未提交');expect(page.locator('#projectProductionStatus')).to_contain_text('底图：1 张已生成');checks.append('真实最新项目明确区分底图成功和视频未提交')
  jobs=[{'id':'job-a','projectId':project['id'],'templateId':'footspa:action-01','templateName':'女技师敲门并等待','sceneId':'footspa','status':'error','error':'生成服务拒绝，请检查账号额度','createdAt':'2026-10-13T12:00:00Z','duration':5,'outputs':[],'prompt':'测试提示词'}]
  page.goto(BASE+'/works?project='+project['id']+'&submitted=1',wait_until='networkidle');expect(page.locator('#workResultStatus')).to_contain_text('视频生成失败');expect(page.locator('#workResultStatus')).to_contain_text('检查账号额度');page.screenshot(path=str(OUT/'failure-feedback.png'))
  jobs[0]['status']='waiting';jobs[0]['error']='';page.reload(wait_until='networkidle');expect(page.locator('#workResultStatus')).to_contain_text('视频任务正在处理');expect(page.locator('#workResultStatus')).to_contain_text('提交成功不代表视频已经生成')
  jobs[0]['status']='complete';page.reload(wait_until='networkidle');expect(page.locator('#workResultStatus')).to_contain_text('需核对 1');assert page.locator('.work-play').count()==0
  checks.append('失败原因、处理中和缺成片地址均明确；无视频地址不会冒充可预览成片')
  page.goto(BASE+'/accounts',wait_until='networkidle');expect(page.locator('#accountsPage')).to_be_visible();assert page.locator('.app-sidebar').count()==0
  record=page.locator('.account-task-record');record.locator('summary').click();expect(record).to_contain_text('实际发送：固定高位镜头')
  record.locator('[data-record-account]').click();page.wait_for_function("accountSelections.includes('local-a:12345')")
  bounds=page.evaluate('accountBounds.at(-1)');assert bounds['x']>=0 and bounds['y']>=0;assert bounds['x']+bounds['width']<=1500 and bounds['y']+bounds['height']<=940
  page.screenshot(path=str(OUT/'restored-accounts.png'));checks.append('恢复左右账号布局；实际提示词、状态、会话入口可查看；嵌入窗口边界不越出页面（桌面接口模拟）')
  assert not errors,errors
  print(json.dumps({'checks':checks,'pageErrors':errors,'paidRequests':0},ensure_ascii=False))
 finally:
  (OUT/'report.json').write_text(json.dumps({'checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf8');b.close()
