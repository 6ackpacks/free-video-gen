"""Validate common two-page UI using local fixtures, without generation or real writes."""
import copy,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4192';OUT=Path('data/e2e-shared-flow');OUT.mkdir(exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch();probe=browser.new_page();catalog=probe.request.get(BASE+'/api/studio').json();probe.close();checks=[]
 for type_id in ['massage:service','food:environment','food:service','food:story','food:avatar-talk','ktv:interaction']:
  ctx=browser.new_context(viewport={'width':1500,'height':1000});page=ctx.new_page();page.set_default_timeout(10000);errors=[];writes=[];page.on('pageerror',lambda e:errors.append(str(e)))
  type_=next(t for t in catalog['templateTypes'] if t['id']==type_id)
  project={'id':'shared-flow-test','name':'两步制作测试','scene':type_['scene'],'industryId':type_['industryId'],'templateTypeId':type_id,'stage':'templates','plans':[],'submissions':[],'trials':[],'materials':{'sceneImageIds':[],'personImageIds':[],'productImageIds':[]},'productBrief':{},'massageSpec':{},'promotion':{},'brandName':'测试主体','brandFacts':'仅用于界面验证'}
  fixture=copy.deepcopy(catalog);fixture['projects']=[project];fixture['assets']=[{'id':'prepared','type':'upload','name':'已准备护理原图','confirmed':True,'previewUrl':'/design-assets/visual-generic-v2.png'}];task=None
  def intercept(r):
   global project,task
   req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
   if path=='/api/studio':r.fulfill(json=fixture);return
   if path=='/api/studio/projects/shared-flow-test' and req.method=='GET':r.fulfill(json=project);return
   if path=='/api/studio/projects' and req.method=='POST':project=req.post_data_json;fixture['projects']=[project];writes.append(path);r.fulfill(json=project);return
   if path=='/api/studio/works':r.fulfill(json=[]);return
   if path=='/api/studio/promotion-presets':r.fulfill(json=[]);return
   if path=='/api/studio/projects/shared-flow-test/generate-video':writes.append(req.post_data_json);task={'id':'home-task','status':'preparing','stage':'content'};r.fulfill(json=task);return
   if path=='/api/studio/video-productions/home-task':r.fulfill(json=task);return
   if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected write '+path)
   r.fulfill(json={})
  ctx.route('**/api/**',intercept)
  page.goto(BASE+'/studio?project=shared-flow-test',wait_until='networkidle');expect(page.locator('#sharedContinue')).to_be_visible();expect(page.locator('#sharedContinue')).to_be_disabled();assert page.locator('[data-shared-template]').count()>0
  if type_id=='massage:service':
   expect(page.locator('[data-shared-template="massage:home-pov-full"]')).to_be_visible();page.locator('#homeSceneChoice').select_option('bed');page.locator('[data-shared-template="massage:home-pov-full"]').check()
  elif type_id=='food:environment':page.locator('[data-shared-template="tour"]').check()
  else:page.locator('[data-shared-template]').first.check()
  expect(page.locator('#sharedSelectedCount')).to_have_text('1');page.locator('#sharedContinue').click();expect(page.locator('[data-shared-step="production"]')).to_be_visible();page.wait_for_url('**step=production')
  if type_id=='massage:service':
   expect(page.locator('#homePhotoScene')).to_have_value('bed');expect(page.locator('#projectVideoModel')).to_be_visible();page.locator('[data-home-frame]').select_option('prepared');page.screenshot(path=str(OUT/'home-photo-production.png'),full_page=True)
   page.locator('#homePhotoGenerate').click();expect(page.locator('#homePhotoProgress')).to_contain_text('自动生成视频');assert any(isinstance(v,dict) and v.get('trial') is False and v.get('prepareImages') is False for v in writes)
   task.update(status='error',error='模拟失败');expect(page.locator('#homePhotoProgress')).to_contain_text('模拟失败',timeout=10000)
  else:page.screenshot(path=str(OUT/(type_id.replace(':','-')+'-production.png')),full_page=True)
  if type_id in ['food:environment','food:service']:
   expect(page.locator('#projectVideoRoute')).not_to_be_visible();expect(page.locator('#projectVideoModel')).to_be_visible();expect(page.locator('[data-display-duration]')).to_have_value('10');expect(page.locator('#sharedBackTemplates')).to_be_visible()
   page.locator('#projectVideoModel').select_option('doubao');expect(page.locator('[data-display-duration] option')).to_have_count(3)
   assert page.locator('[data-display-duration] option').all_text_contents()==['5','10','15']
   if page.locator('#projectVideoModel option[value="tokendance-seedance-2.0"]').count():
    page.locator('#projectVideoModel').select_option('tokendance-seedance-2.0');page.locator('[data-display-duration]').select_option('7');expect(page.locator('[data-display-duration]')).to_have_value('7')
   page.screenshot(path=str(OUT/(type_id.replace(':','-')+'-models.png')),full_page=True)
  assert page.locator('button:visible').filter(has_text=__import__('re').compile('试片|样片')).count()==0
  page.locator('[data-shared-step="templates"]').first.click();expect(page.locator('#sharedContinue')).to_be_visible();expect(page.locator('#sharedSelectedCount')).to_have_text('1');expect(page.locator('[data-shared-template]:checked')).to_have_count(1)
  page.reload(wait_until='networkidle');expect(page.locator('#sharedSelectedCount')).to_have_text('1');page.screenshot(path=str(OUT/(type_id.replace(':','-')+'-selection.png')),full_page=True)
  assert not errors,(type_id,errors)
  checks.append({'type':type_id,'templates':page.locator('[data-shared-template]').count(),'pageErrors':errors});ctx.close()
 print(json.dumps({'checks':checks,'providerCalls':0,'realMutations':0},ensure_ascii=False));browser.close()
