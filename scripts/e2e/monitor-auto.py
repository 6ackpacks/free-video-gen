"""Monitor automatic production UI, fixture APIs only; no generation service calls."""
import copy,json,base64
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4192';OUT=Path('data/e2e-monitor-auto');OUT.mkdir(exist_ok=True)
catalog=json.load(urlopen(BASE+'/api/studio'));p=copy.deepcopy(next(v for v in catalog['projects'] if v.get('templateTypeId')=='footspa:monitor' and v['plans']));p.update(id='auto-browser',commonImageId='',materials={'sceneImageIds':[],'personImageIds':[],'productImageIds':[]});p['plans']=p['plans'][:1];p['plans'][0].update(count=3,imageIds=[],mapping='common',prompts=[],promptsDirty=False)
catalog.update(projects=[p],assets=[],imageTasks=[]);task=None;jobs=[];requests=[];errors=[]
with sync_playwright() as pw:
 b=pw.chromium.launch();ctx=b.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();page.set_default_timeout(15000);page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  global p,task
  req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
  if not path.startswith('/api/') and path.endswith(('.js','.css')) and Path(path.lstrip('/')).is_file():r.fulfill(content_type='text/javascript' if path.endswith('.js') else 'text/css',body=Path(path.lstrip('/')).read_text(encoding='utf-8'));return
  if path=='/api/studio':r.fulfill(json=catalog);return
  if path=='/api/studio/projects/auto-browser':r.fulfill(json=p);return
  if path=='/api/studio/projects' and req.method=='POST':p=copy.deepcopy(req.post_data_json);catalog['projects']=[p];r.fulfill(json=p);return
  if path=='/api/references' and req.method=='POST':
   a={'id':'uploaded-scene','name':'我的门店','type':'upload','confirmed':True,'previewUrl':'data:image/png;base64,'+req.post_data_json['base64']};catalog['assets'].append(a);r.fulfill(json=a);return
  if path=='/api/studio/works':r.fulfill(json=jobs);return
  if path.endswith('/generate-video'):
   requests.append(req.post_data_json);task={'id':'auto-task','requestId':req.post_data_json['requestId'],'status':'preparing','stage':'images','imageTotal':3,'imageCompleted':0,'prepareImages':True};r.fulfill(json=task);return
  if path=='/api/studio/video-productions/auto-task':r.fulfill(json=task);return
  if path.endswith('/monitor-workflow'):r.fulfill(content_type='application/json',body='null');return
  if path.startswith('/api/'):
   if req.method!='GET':raise AssertionError('unexpected write '+path)
   r.fulfill(json={});return
  r.continue_()
 ctx.route('**/*',route)
 try:
  page.goto(BASE+'/studio?project=auto-browser&step=production',wait_until='networkidle');expect(page.locator('#studioSubmit')).to_be_enabled();expect(page.locator('#studioGenerateImage')).to_be_hidden();expect(page.locator('#studioCompletedPrompts')).to_be_hidden();page.locator('#studioSubmit').click();expect(page.locator('.studio-image-loading')).to_be_visible();expect(page.locator('.studio-image-loading')).to_contain_text('图片 0/3');assert requests[0]['prepareImages'];assert requests[0]['sceneReferenceIds']==[];page.screenshot(path=str(OUT/'auto-producing.png'),full_page=True)
  task.update(status='error',error='第二张图片生成失败');expect(page.locator('#studioPreviewRetry')).to_be_visible();expect(page.locator('#studioPreviewRetry')).to_have_text('重试未完成的制作');
  with page.expect_response(lambda r:r.url.endswith('/generate-video')):page.locator('#studioPreviewRetry').click()
  assert requests[0]['requestId']==requests[1]['requestId']
  preview='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII='
  catalog['assets']=[{'id':'frame-'+str(i),'name':'自动监控底图'+str(i),'type':'generated','confirmed':True,'projectId':'auto-browser','previewUrl':preview} for i in range(3)];p['plans'][0].update(imageIds=[a['id'] for a in catalog['assets']],mapping='one-to-one',prompts=['锁定对应底图，摄像头全程固定']*3);task.update(status='submitted',imageCompleted=3);jobs.extend([{'id':'video-'+str(i),'projectId':p['id'],'planId':p['plans'][0]['id'],'slotIndex':i,'status':'complete','templateName':'监控动作','outputs':[{'url':'/mock-video'}],'prompt':p['plans'][0]['prompts'][i]} for i in range(3)])
  expect(page.locator('.studio-image-thumb')).to_have_count(3);expect(page.locator('#studioResults video')).to_have_count(3);expect(page.locator('#studioCompletedPrompts')).to_be_visible();expect(page.locator('.studio-image-loading')).to_have_count(0);assert len(requests)==2
  task['jobs']=jobs
  expect(page.locator('#studioSubmit')).to_contain_text('再生成一批')
  with page.expect_response(lambda r:r.url.endswith('/generate-video')):page.locator('#studioSubmit').click()
  assert requests[-1]['requestId']!=requests[1]['requestId']
  page.evaluate('localStorage.clear()');p.update(commonImageId='',materials={'sceneImageIds':[],'personImageIds':[],'productImageIds':[]});p['plans'][0].update(imageIds=[],prompts=[],mapping='common');catalog['assets']=[];jobs.clear();task=None;page.reload(wait_until='networkidle')
  with page.expect_file_chooser() as chooser:page.locator('#studioUpload').click()
  chooser.value.set_files({'name':'我的门店.png','mimeType':'image/png','buffer':base64.b64decode(preview.split(',')[1])});expect(page.locator('.studio-image-thumb')).to_have_count(1)
  with page.expect_response(lambda r:r.url.endswith('/generate-video')):page.locator('#studioSubmit').click()
  assert requests[-1]['sceneReferenceIds']==['uploaded-scene']
  page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(400);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors;print(json.dumps({'checks':['no upload starts production','no upfront prompt or AI-image button','image progress visible','failed intent retries with same request ID','generated pictures and videos appear in project','prompts only after video completion','mobile no overflow'],'providerCalls':0}));
 finally:b.close()
