import os,json,copy
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192');OUT=Path('data/e2e-generation-presets');OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch();ctx=b.new_context(viewport={'width':1500,'height':940});page=ctx.new_page();page.set_default_timeout(8000);catalog=page.request.get(BASE+'/api/studio').json();project=copy.deepcopy(next(v for v in catalog['projects'] if v['plans']));project['stage']='templates';project['plans']=project['plans'][:1];plan=project['plans'][0];plan.update(count=1,videoRoute='wan-tokendance',duration=5,resolution='720P',ratio='9:16',prompts=['5秒，9:16，固定机位敲门后等待，人物自然连续运动。'],promptsDirty=False,imageIds=['test-frame'],mapping='common');catalog['assets']=[{'id':'test-frame','name':'横屏底图','type':'upload','confirmed':True,'previewUrl':'/test-landscape.svg'}];catalog['projects']=[project];submissions=[];fail=True;errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  global fail,project
  req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
  if path=='/api/studio':r.fulfill(json=catalog);return
  if path=='/api/studio/projects/'+project['id'] and req.method=='GET':r.fulfill(json={**project,'readiness':{'count':1,'ready':1,'errors':[]},'adopted':[]});return
  if path=='/api/studio/works':r.fulfill(json=[]);return
  if path=='/api/studio/projects' and req.method=='POST':project=req.post_data_json;catalog['projects']=[project];r.fulfill(json=project);return
  if path=='/api/studio/projects/'+project['id'] and req.method=='GET':r.fulfill(json={**project,'readiness':{'count':1,'ready':1,'errors':[]},'adopted':[]});return
  if path.endswith('/prompts') and req.method=='POST':
   for v in req.post_data_json['plans']:next(p for p in project['plans'] if p['id']==v['id'])['prompts']=v['prompts']
   r.fulfill(json=project);return
  if path.endswith('/submit') and req.method=='POST':
   submissions.append(req.post_data_json);r.fulfill(status=500 if fail else 200,json={'error':'测试提交失败'} if fail else {'id':'mock-batch'});return
  if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected write '+path)
  r.continue_()
 ctx.route('**/api/**',route);ctx.route('**/test-landscape.svg',lambda r:r.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#acc3eb"/></svg>'))
 try:
  page.goto(BASE+'/studio?project='+project['id'],wait_until='networkidle');expect(page.locator('#projectVideoRoute')).to_have_value('wan-tokendance');expect(page.locator('#projectRatio')).to_have_value('auto');expect(page.locator('#projectResolution')).to_have_value('720P');expect(page.locator('#projectReferenceMode')).to_have_value('first-frame')
  page.locator('#promptTab').click();page.locator('#submit').click();expect(page.locator('#toast')).to_contain_text('视频未提交：测试提交失败');assert page.locator('#submitParameters').count()==0;assert page.locator('#confirmSubmit').count()==0;expect(page.locator('#submit')).to_be_enabled()
  assert project['plans'][0]['ratio']=='16:9';assert '16:9' in project['plans'][0]['prompts'][0];assert submissions[-1]['generationSettings']['ratio']=='auto'
  page.screenshot(path=str(OUT/'inline-submit-error.png'));fail=False;page.locator('#submit').click();page.wait_for_url('**/works?project=*');assert len(submissions)==2 and submissions[0]['requestId']==submissions[1]['requestId'];assert not errors,errors
  print(json.dumps({'checks':['预设服务、720P、首帧自动带出','画幅自动匹配横屏底图并更新提示词','点击直接提交，无参数或第二次确认弹窗','失败明确反馈且可重试，同一提交标识防重复'],'pageErrors':errors,'paidRequests':0},ensure_ascii=False))
 finally:b.close()
