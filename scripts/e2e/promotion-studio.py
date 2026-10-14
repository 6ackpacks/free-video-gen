"""Isolated browser checks: all APIs are fixtures and no provider is invoked."""
import copy,json,threading
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from urllib.request import urlopen
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'data'/'e2e-promotion';OUT.mkdir(exist_ok=True)
catalog=json.load(urlopen('http://127.0.0.1:4192/api/studio'))
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kw):super().__init__(*args,directory=str(ROOT),**kw)
 def do_GET(self):
  if self.path.split('?')[0]=='/studio':self.path='/studio.html'
  if not self.path.split('?')[0].endswith(('.html','.js','.css','.png','.webp','.svg')):self.send_error(404);return
  super().do_GET()
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
BASE='http://127.0.0.1:'+str(server.server_port)
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch();ctx=browser.new_context(viewport={'width':1450,'height':1020});page=ctx.new_page();page.set_default_timeout(10000)
  type_=next(v for v in catalog['templateTypes'] if v['id']=='food:environment');template=next(v for v in catalog['templates'] if v['id']==type_['actionIds'][0]);r=next(v for v in catalog['routes'] if v['id']=='doubao')
  project={'id':'promotion-browser','name':'街角咖啡馆环境宣传','industryId':'food','scene':'food','templateTypeId':type_['id'],'stage':'templates','materials':{'sceneImageIds':['scene'],'productImageIds':[],'personImageIds':[]},'promotion':{'enabled':True,'name':'街角咖啡馆','sellingPoints':'自然光与独立座位','copy':'来这里，给自己一段放松的时间。'},'productBrief':{},'massageSpec':{},'plans':[{'id':'plan','templateId':template['id'],'snapshot':template,'displayFormat':'space','count':3,'duration':5,'videoRoute':r['id'],'resolution':r['resolutions'][0],'ratio':'9:16','autoRatio':False,'referenceMode':'reference-image','mapping':'common','imageIds':['scene'],'rows':[],'shotImages':[],'prompts':[],'promptsDirty':False}],'trials':[],'submissions':[]}
  fixture=copy.deepcopy(catalog);fixture['projects']=[project];
  for route_config in fixture['routes']:
   if route_config['id'] in ['wan-tokendance','tokendance-seedance-2.0','tokendance-seedance-2.5']:route_config['configured']=True
  fixture['assets']=[{'id':'scene','type':'upload','confirmed':True,'name':'门店环境实拍','previewUrl':'/design-assets/scene-footspa.webp'}]
  task=None;jobs=[];writes=[];errors=[];presets=[];page.on('pageerror',lambda e:errors.append(str(e)))
  def intercept(route):
   global project,task,jobs,presets
   req=route.request;path=req.url.split(BASE)[-1].split('?')[0]
   if path=='/api/studio':route.fulfill(json=fixture);return
   if path=='/api/studio/projects/promotion-browser' and req.method=='GET':route.fulfill(json=project);return
   if path=='/api/studio/projects' and req.method=='POST':project=req.post_data_json;fixture['projects']=[project];writes.append(path);route.fulfill(json=project);return
   if path=='/api/studio/works':route.fulfill(json=jobs);return
   if path=='/api/studio/promotion-presets':
    if req.method=='POST':presets.append({'id':'saved-preset','name':req.post_data_json['name'],'industryId':'food','version':1});writes.append(path);route.fulfill(json=presets[-1]);return
    route.fulfill(json=presets);return
   if path=='/api/studio/promotion-presets/saved-preset/apply':writes.append(path);route.fulfill(json=project);return
   if path=='/api/studio/projects/promotion-browser/produce':
    body=req.post_data_json;writes.append(body);task={'id':'production-test','status':'preparing','projectId':project['id']};route.fulfill(json=task);return
   if path=='/api/studio/productions/production-test':route.fulfill(json=task);return
   if path.startswith('/api/video/'):route.fulfill(status=404,body='fixture video');return
   if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected real mutation: '+path)
   route.fulfill(json={})
  ctx.route('**/api/**',intercept)
  page.goto(BASE+'/studio?project=promotion-browser',wait_until='networkidle');expect(page.locator('#promotionSample')).to_be_visible();expect(page.locator('[data-display-format]')).to_have_count(5)
  assert not page.locator('#exportProjectPrompts').count();assert not page.locator('[data-prompt]').count()
  page.locator('[data-promotion-field="copy"]').fill('坐下来喝杯咖啡。');page.wait_for_timeout(650);assert project['promotion']['copy']=='坐下来喝杯咖啡。'
  page.locator('#savePromotionPreset').click();page.locator('#promotionPresetName').fill('咖啡馆配套一');page.locator('#confirmSavePromotionPreset').click();expect(page.locator('#promotionPreset')).to_have_value('saved-preset')
  page.locator('[data-display-format="tour"]').check();expect(page.locator('[data-display-count]')).to_have_count(2);page.locator('[data-display-format="tour"]').uncheck();page.wait_for_timeout(650)
  page.screenshot(path=str(OUT/'environment-form.png'),full_page=True)
  expect(page.locator('#projectVideoModel')).to_be_visible();assert not page.locator('#projectVideoModel').evaluate('(e)=>!!e.closest("details")')
  page.locator('#projectVideoRoute').select_option('wan-tokendance');page.locator('#projectVideoModel').select_option('tokendance-seedance-2.5');expect(page.locator('#modelDurationHint')).to_contain_text('30')
  page.locator('#projectResolution').select_option('1080P');page.locator('#projectRatio').select_option('16:9');page.locator('#projectReferenceMode').select_option('first-frame');page.wait_for_timeout(500)
  expect(page.locator('#projectVideoModel')).to_have_value('tokendance-seedance-2.5');assert all(v['videoRoute']=='tokendance-seedance-2.5' and v['resolution']=='1080P' and v['ratio']=='16:9' and v['referenceMode']=='first-frame' for v in project['plans'])
  page.reload(wait_until='networkidle');expect(page.locator('#projectVideoModel')).to_have_value('tokendance-seedance-2.5');page.screenshot(path=str(OUT/'visible-model-settings.png'),full_page=True)
  page.locator('#projectRatio').select_option('auto');page.wait_for_timeout(500)
  page.locator('#promotionSample').click();expect(page.locator('#promotionProgress')).to_contain_text('自动开始生成视频');assert len([v for v in writes if isinstance(v,dict) and v.get('mode')=='sample'])==1
  expect(page.locator('[data-promotion-field="name"]')).to_be_disabled();expect(page.locator('#projectVideoModel')).to_be_disabled();assert project['plans'][0]['autoRatio'] is True;assert project['plans'][0]['ratio']=='16:9'
  task.update(status='submitted',batchId='sample-batch');jobs=[{'id':'sample-job','projectId':project['id'],'planId':'plan','slotIndex':0,'isTrial':True,'status':'complete','outputs':[{'url':'https://example.org/test.mp4'}],'prompt':'镜头小幅推进，保留真实空间。','templateName':'空间全景','createdAt':'2026-10-14T01:00:00Z'}]
  expect(page.locator('#promotionRemaining')).to_have_text('满意，生成剩余 2 条',timeout=10000);expect(page.locator('#promotionSample')).to_be_enabled();assert page.url.endswith('project=promotion-browser')
  page.locator('video').evaluate('(v)=>v.dataset.keepPlayer="yes"');page.wait_for_timeout(4500);assert page.locator('video').get_attribute('data-keep-player')=='yes'
  page.locator('#promotionRemaining').click();expect(page.locator('#promotionProgress')).to_contain_text('自动开始生成视频');assert next(v for v in writes if isinstance(v,dict) and v.get('mode')=='remaining')['jobId']=='sample-job'
  task.update(status='error',error='模拟制作失败');expect(page.locator('#promotionProgress')).to_contain_text('模拟制作失败',timeout=10000);expect(page.locator('#promotionSample')).to_be_enabled()
  page.screenshot(path=str(OUT/'sample-review.png'),full_page=True)
  project['templateTypeId']='food:service';project['plans'][0]['displayFormat']='process';project['name']='咖啡馆服务宣传';ctx.clear_cookies();page.evaluate('localStorage.clear()');page.reload(wait_until='networkidle')
  expect(page.locator('[data-promotion-field="serviceProcess"]')).to_be_visible();expect(page.locator('[data-display-format="dialogue"]')).to_be_visible();page.screenshot(path=str(OUT/'service-form.png'),full_page=True)
  page.set_viewport_size({'width':850,'height':1000});page.wait_for_timeout(200);assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
  assert not errors,errors
  print(json.dumps({'checks':['生成模型常驻显示并分组切换','模型与画质保存后刷新保留且用于样片','跟随真实底图比例','可复用宣传预设','环境与服务五种模板','一次点击自动准备并提交样片','完成后同页播放与生成剩余','失败显示与恢复操作','轮询保留视频播放器','窄屏无横向溢出'],'pageErrors':errors,'providerCalls':0},ensure_ascii=False))
  browser.close()
finally:server.shutdown();server.server_close()
