import os,json,copy
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192')
OUT=Path('data/e2e-product-audit');OUT.mkdir(exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch();ctx=browser.new_context(viewport={'width':1500,'height':940});page=ctx.new_page();page.set_default_timeout(10000)
 catalog=page.request.get(BASE+'/api/studio').json();project=copy.deepcopy(next(p for p in catalog['projects'] if p.get('templateTypeId')=='footspa:monitor' and p['plans']))
 project['stage']='prompts';project.pop('promptTaskId',None);project['plans']=project['plans'][:1];plan=project['plans'][0];plan.update(count=1,duration=5,videoRoute='wan-tokendance',resolution='720P',ratio='9:16',referenceMode='first-frame',mapping='common',imageIds=['audit-frame'],prompts=['5秒，9:16，固定高位监控机位，敲门后等待。'],promptsDirty=False)
 project['commonImageId']='audit-frame';catalog['projects']=[project];catalog['assets']=[{'id':'audit-frame','name':'门店普通参考','type':'upload','confirmed':True,'monitorView':False,'previewUrl':'/design-assets/scene-footspa.webp'}]
 task={'id':'audit-task','projectId':project['id'],'planId':plan['id'],'status':'error','items':[{'id':'failed-frame','name':'失败底图','status':'error','error':'模拟图片失败'}]};foreign_task={'id':'other-task','projectId':project['id'],'planId':'other-plan','status':'error','items':[{'id':'other-failed','name':'Other action only','status':'error','error':'Foreign failure'}]};catalog['imageTasks']=[foreign_task,task]
 jobs=[{'id':'audit-video','projectId':project['id'],'status':'error','templateName':plan['snapshot']['name'],'error':'模拟视频失败','outputs':[]}];writes=[];errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  global project
  req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
  if path=='/api/studio':r.fulfill(json=catalog);return
  if path=='/api/studio/works':r.fulfill(json=jobs);return
  if path=='/api/studio/projects/'+project['id'] and req.method=='GET':r.fulfill(json={**project,'readiness':{'count':1,'ready':1,'errors':[]},'adopted':[]});return
  if path=='/api/studio/projects' and req.method=='POST':
   incoming=req.post_data_json
   for value in incoming['plans']:
    old=next(v for v in project['plans'] if v['id']==value['id']);value['prompts']=old['prompts'];value['promptsDirty']=old['promptsDirty']
   project=incoming;catalog['projects']=[project];writes.append(path);r.fulfill(json=project);return
  if path.endswith('/prompts') and req.method=='POST':
   for update in req.post_data_json['plans']:
    p=next(v for v in project['plans'] if v['id']==update['id']);p['prompts']=update['prompts'];p['promptsDirty']=False if req.post_data_json.get('confirm') else p['promptsDirty']
   writes.append(path);r.fulfill(json=project);return
  if path=='/api/studio/assets/audit-frame' and req.method=='PATCH':catalog['assets'][0].update(req.post_data_json);writes.append(path);r.fulfill(json=catalog['assets'][0]);return
  if path=='/api/studio/jobs/audit-video/retry' and req.method=='POST':jobs[0]['status']='queued';writes.append(path);r.fulfill(json=jobs[0]);return
  if path=='/api/studio/image-tasks/audit-task':r.fulfill(json=task);return
  if path=='/api/studio/image-tasks/audit-task/items/failed-frame/retry' and req.method=='POST':task['status']='running';task['items'][0]['status']='waiting';writes.append(path);r.fulfill(json=task);return
  if req.method not in ['GET','HEAD']:raise AssertionError('Real write prohibited '+path)
  r.continue_()
 ctx.route('**/api/**',route)
 try:
  page.goto(BASE+'/studio?project='+project['id'],wait_until='networkidle');expect(page.locator('#projectVideoModel')).to_be_visible();expect(page.locator('#monitorViewWarning')).to_be_visible()
  original=page.locator('[data-prompt]').input_value();page.locator('#projectVideoModel').select_option('tokendance-seedance-2.0');expect(page.locator('#modelDurationHint')).to_contain_text('4');expect(page.locator('[data-prompt]')).to_have_value(original);expect(page.locator('#regeneratePrompts')).to_be_visible();assert page.url.endswith(project['id'])
  page.locator('#projectVideoModel').select_option('tokendance-seedance-2.5');expect(page.locator('#modelDurationHint')).to_contain_text('4–30');expect(page.locator('[data-prompt]')).to_have_value(original);page.locator('#projectVideoModel').select_option('tokendance-seedance-2.0');page.locator('#projectResolution').select_option('1080P');expect(page.locator('#projectResolution')).to_have_value('1080P');page.locator('#projectRatio').select_option('16:9');page.wait_for_timeout(250);expect(page.locator('#projectRatio')).to_have_value('16:9');expect(page.locator('[data-prompt]')).to_have_value(original.replace('9:16','16:9'));assert project['plans'][0]['autoRatio'] is False
  page.locator('#confirmMonitorFrame').click();expect(page.locator('#monitorViewWarning')).to_have_count(0)
  page.locator('[data-project-retry]').click();expect(page.locator('#toast')).to_contain_text('已恢复失败任务');assert '/api/studio/jobs/audit-video/retry' in writes
  page.locator('[data-prompt-images]').click();expect(page.locator('#confirmMapping')).to_be_visible();page.locator('#backTemplates').click();expect(page.locator('[data-prompt]')).to_be_visible();expect(page.locator('#projectVideoModel')).to_have_value('tokendance-seedance-2.0')
  page.locator('[data-prompt-images]').click();expect(page.locator('[data-local-image-retry]')).to_have_count(1);expect(page.locator('#imageTaskState')).not_to_contain_text('Foreign failure');expect(page.locator('[data-local-image-retry]')).to_be_visible();page.locator('[data-local-image-retry]').click();page.wait_for_timeout(300);assert '/api/studio/image-tasks/audit-task/items/failed-frame/retry' in writes
  page.locator('#confirmMapping').click();expect(page.locator('[data-prompt]')).to_be_visible();page.screenshot(path=str(OUT/'editable-video-settings.png'));catalog['imageTasks']=[foreign_task];page.wait_for_timeout(500);project['stage']='prompts';page.reload(wait_until='networkidle');page.locator('[data-prompt-images]').click();expect(page.locator('[data-local-image-retry]')).to_have_count(0);expect(page.locator('#imageTaskState')).not_to_contain_text('Foreign failure');assert not errors,errors
  print(json.dumps({'checks':['确认页原地编辑Seedance模型画质画幅且保留提示词','普通参考图监控提醒及人工确认','项目内失败视频重试','图片工作台返回来源提示词页','图片失败原地重试并确认返回'],'pageErrors':errors,'paidRequests':0,'interceptedWrites':len(writes)},ensure_ascii=False))
 finally:browser.close()



