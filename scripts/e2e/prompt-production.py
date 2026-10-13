import os,json,copy
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192');OUT=Path('data/e2e-prompt-production');OUT.mkdir(exist_ok=True)
with sync_playwright() as pw:
 b=pw.chromium.launch();ctx=b.new_context(viewport={'width':1500,'height':940});page=ctx.new_page();page.set_default_timeout(10000);catalog=page.request.get(BASE+'/api/studio').json();project=copy.deepcopy(next(p for p in catalog['projects'] if len(p['plans'])>=2));project['stage']='prompts';project.pop('promptTaskId',None);project['plans']=project['plans'][:2];submitted=[];errors=[];polls=0;task=None
 for plan in project['plans']:plan.update(count=1,duration=5,videoRoute='wan-tokendance',resolution='720P',ratio='9:16',referenceMode='first-frame',mapping='common',imageIds=['test-frame'],prompts=[],promptsDirty=False)
 catalog['projects']=[project];catalog['assets']=[{'id':'test-frame','name':'真实底图','type':'upload','confirmed':True,'previewUrl':'/design-assets/scene-footspa.webp'}];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  global task,polls,project
  req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
  if path=='/api/studio':r.fulfill(json=catalog);return
  if path=='/api/studio/works':r.fulfill(json=[]);return
  if path=='/api/studio/projects' and req.method=='POST':
   incoming=req.post_data_json
   for new in incoming['plans']:
    old=next(p for p in project['plans'] if p['id']==new['id']);new['prompts']=old['prompts'];new['promptsDirty']=old['promptsDirty']
   project=incoming;catalog['projects']=[project];r.fulfill(json=project);return
  if path=='/api/studio/projects/'+project['id'] and req.method=='GET':r.fulfill(json={**project,'readiness':{'count':2,'ready':2,'errors':[]},'adopted':[]});return
  if path.endswith('/draft') and req.method=='POST':task={'id':'fake-draft','status':'running','total':2,'completed':0};project['promptTaskId']=task['id'];r.fulfill(json=task);return
  if path=='/api/studio/drafts/fake-draft':
   polls+=1
   if polls>=2:project['plans'][0]['prompts']=['第一条：固定监控机位，轻敲房门后等待，5秒。'];task['completed']=1
   if polls>=3:project['plans'][1]['prompts']=['第二条：轻推房门后独自进入，5秒。'];task.update(status='complete',completed=2)
   r.fulfill(json=task);return
  if path.endswith('/prompts') and req.method=='POST':
   for update in req.post_data_json['plans']:
    plan=next(p for p in project['plans'] if p['id']==update['id']);plan['prompts']=update['prompts']
    if req.post_data_json.get('confirm'):plan['promptsDirty']=False
   r.fulfill(json=project);return
  if path.endswith('/submit') and req.method=='POST':submitted.append(req.post_data_json);r.fulfill(json={'id':'mock-production'});return
  if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected mutation '+path)
  r.continue_()
 ctx.route('**/api/**',route)
 try:
  page.goto(BASE+'/studio?project='+project['id'],wait_until='networkidle');expect(page.locator('#regeneratePrompts')).to_have_text('生成缺少的提示词');expect(page.locator('#submit')).to_be_disabled();expect(page.locator('#trial')).to_be_disabled()
  page.locator('#regeneratePrompts').click();expect(page.locator('#draftNotice')).to_contain_text('提示词正在生成');expect(page.locator('#submit')).to_be_disabled();expect(page.locator('#trial')).to_be_disabled();expect(page.locator('[data-prompt]').first).to_have_value('第一条：固定监控机位，轻敲房门后等待，5秒。');expect(page.locator('[data-prompt]').first).to_be_disabled()
  expect(page.locator('#draftNotice')).to_contain_text('提示词已准备好');expect(page.locator('[data-prompt]')).to_have_count(2);expect(page.locator('#submit')).to_be_enabled();expect(page.locator('#trial')).to_be_enabled();assert not submitted
  project['plans'][0]['promptsDirty']=True;page.reload(wait_until='networkidle');expect(page.locator('[data-confirm-prompt]')).to_be_visible();expect(page.locator('#submit')).to_be_disabled();page.locator('[data-confirm-prompt]').click();expect(page.locator('#submit')).to_be_enabled();page.screenshot(path=str(OUT/'ready-for-production.png'))
  page.locator('#trial').click();page.wait_for_url('**/works?project=*');assert len(submitted)==1 and submitted[0]['trial'];assert not errors,errors
  print(json.dumps({'checks':['缺少提示词时本页补全入口，阻止空提交','生成过程中逐条展示真实文本，生产按钮禁用','完成后自动展示两条提示词并开放生产','待更新提示词可明确确认使用','点击试片进入作品任务页'],'pageErrors':errors,'paidRequests':0},ensure_ascii=False))
 finally:b.close()
