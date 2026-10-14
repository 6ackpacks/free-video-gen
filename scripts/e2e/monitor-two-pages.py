"""Exercise the project work line using mocked local endpoints; no generation calls."""
import copy,json,os,base64
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192')
OUT=Path('data/e2e-monitor-two-pages');OUT.mkdir(exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch();context=browser.new_context(viewport={'width':1500,'height':1000});page=context.new_page();page.set_default_timeout(10000)
 catalog=page.request.get(BASE+'/api/studio').json()
 project=copy.deepcopy(next(p for p in catalog['projects'] if p.get('templateTypeId')=='footspa:monitor' and p['plans']))
 project.update(id='mock-line',name='监控获客 · 单页验收',commonImageId='',materials={'sceneImageIds':[],'personImageIds':[],'productImageIds':[]})
 project['plans']=project['plans'][:1];plan=project['plans'][0];plan.update(count=2,prompts=[],imageIds=[],videoRoute='wan-tokendance',duration=5,resolution='720P',mapping='one-to-one')
 catalog.update(projects=[project],assets=[],imageTasks=[])
 flow=None;jobs=[];uploads=[];submits=[];settings=[];errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=')
 poster=next(c['posterUrl'] for t in catalog['templates'] for c in t.get('referenceClips',[]) if c.get('posterUrl'))
 png=page.request.get(BASE+poster).body()
 transforms=[]
 def route(r):
  global flow,project,jobs
  req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
  if not path.startswith('/api/') and Path(path.lstrip('/')).is_file() and path.endswith(('.js','.css','.svg')):r.fulfill(content_type='image/svg+xml' if path.endswith('.svg') else 'text/css' if path.endswith('.css') else 'text/javascript',body=Path(path.lstrip('/')).read_text(encoding='utf-8'));return
  if path=='/studio':r.fulfill(content_type='text/html',body=Path('studio.html').read_text(encoding='utf-8'));return
  if path.startswith('/mock-frame/'):r.fulfill(content_type='image/png',body=png);return
  if path=='/api/studio':r.fulfill(json=catalog);return
  if path=='/api/studio/works':r.fulfill(json=jobs);return
  if path=='/api/studio/projects/mock-line':r.fulfill(json=project);return
  if path=='/api/studio/projects':
   project=copy.deepcopy(req.post_data_json);catalog['projects']=[project];r.fulfill(json=project);return
  if path=='/api/references' and req.method=='POST':
   ref={'id':'source-'+str(len(uploads)), 'type':'upload','name':req.post_data_json['name'],'previewUrl':'/mock-frame/'+str(len(uploads))};uploads.append(ref);catalog['assets'].append(ref);r.fulfill(json=ref);return
  if path.endswith('/monitor-workflow/settings'):
   settings.append(req.post_data_json);r.fulfill(content_type='application/json',body=json.dumps(flow));return
  if path.endswith('/monitor-workflow/confirm'):
   flow['status']='drafting';r.fulfill(content_type='application/json',body=json.dumps(flow));return
  if path=='/api/image-transforms' and req.method=='POST':
   transforms.append(req.post_data_json);catalog['assets'].append({'id':'processed','name':'监控加工结果','type':'generated','confirmed':False,'previewUrl':'/mock-frame/processed'});r.fulfill(json={'id':'transform-test','status':'running'});return
  if path=='/api/image-transforms/transform-test':r.fulfill(json={'id':'transform-test','status':'complete','resultReferenceId':'processed'});return
  if path.startswith('/api/studio/assets/') and req.method=='PATCH':
   a=next(a for a in catalog['assets'] if a['id']==path.split('/')[-1]);a.update(req.post_data_json);r.fulfill(json=a);return
  if path.endswith('/draft'):
   r.fulfill(json={'id':'mock-draft','status':'running','completed':0,'total':2});return
  if path=='/api/studio/drafts/mock-draft':
   r.fulfill(json={'id':'mock-draft','status':'complete' if project['plans'][0]['prompts'] else 'running','completed':len(project['plans'][0]['prompts']),'total':2});return
  if path.endswith('/monitor-workflow'):
   if req.method=='POST':
    flow={'id':'flow','status':'images_ready','autoVideo':False,'slots':[{'id':'slot-'+str(i),'planId':project['plans'][0]['id'],'index':i,'status':'complete','referenceId':'frame-'+str(i)} for i in range(2)]}
    for slot in flow['slots']:catalog['assets'].append({'id':slot['referenceId'],'name':'动作首帧','type':'generated','confirmed':False,'monitorView':True,'previewUrl':'/mock-frame/'+slot['id']})
    project['plans'][0]['imageIds']=['frame-0','frame-1']
   r.fulfill(content_type='application/json',body=json.dumps(flow));return
  if path.endswith('/prompts'):
   if req.post_data_json.get('slot'):
    slot=req.post_data_json['slot'];next(v for v in project['plans'] if v['id']==slot['planId'])['prompts'][slot['index']]=slot['prompt'];r.fulfill(json=project);return
   for change in req.post_data_json['plans']:next(v for v in project['plans'] if v['id']==change['id'])['prompts']=change['prompts']
   r.fulfill(json=project);return
  if path=='/api/studio/video-productions/mock-production':r.fulfill(json={'id':'mock-production','status':'submitted'});return
  if path.endswith('/generate-video'):
   project['plans'][0]['prompts']=['自动准备的第一条视频描述','自动准备的第二条视频描述'];project['plans'][0]['promptsDirty']=False
   submits.append(req.post_data_json);jobs=[{'id':'video-a','projectId':'mock-line','planId':project['plans'][0]['id'],'slotIndex':0,'status':'queued','prompt':project['plans'][0]['prompts'][0],'videoRoute':'doubao','templateName':'视频1','providerProgress':{'message':'尚未分配账号'}},{'id':'video-b','projectId':'mock-line','planId':project['plans'][0]['id'],'slotIndex':1,'status':'error','prompt':'prompt','error':'网页输入框未找到，尚未发送','videoRoute':'doubao','templateName':'视频2'}];r.fulfill(json={'id':'mock-production','status':'submitted'});return
  if path=='/api/studio/jobs/video-b/retry':jobs[1]['status']='queued';jobs[1]['error']='';r.fulfill(json=jobs[1]);return
  if path.startswith('/api/footspa-references/') and req.method=='GET':r.continue_();return
  if path.startswith('/api/'):
   if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected write '+path)
   r.fulfill(json={});return
  r.continue_()
 context.route('**/*',route)
 try:
  page.goto(BASE+'/studio?project=mock-line&step=templates',wait_until='networkidle')
  expect(page.locator('.studio-action-grid')).not_to_have_count(0)
  assert page.locator('.studio-action-card textarea').count()==0
  expect(page.locator('.brand img')).to_be_visible()
  page.screenshot(path=str(OUT/'templates-desktop.png'),full_page=True)
  page.locator('#studioNext').click();expect(page.locator('#studioUpload')).to_be_visible();assert 'step=production' in page.url
  with page.expect_file_chooser() as chooser:page.locator('#studioUpload').click()
  chooser.value.set_files([{'name':'场景1.png','mimeType':'image/png','buffer':png},{'name':'场景2.png','mimeType':'image/png','buffer':png}])
  expect(page.locator('.studio-image-thumb')).to_have_count(2)
  assert len(project['materials']['sceneImageIds'])==2
  assert project['plans'][0]['mapping']=='common' and len(project['plans'][0]['imageIds'])==1
  expect(page.locator('#studioTransform')).to_be_enabled()
  page.locator('#studioAssets').click();expect(page.locator('#modal img')).not_to_have_count(0);page.locator('#modal .close').click()
  expect(page.locator('#studioCompletedPrompts')).to_be_hidden();expect(page.locator('[data-prompt]')).to_have_count(0)
  page.locator('#projectVideoModel').select_option('tokendance-seedance-2.5');expect(page.locator('#projectVideoModel')).to_be_enabled()
  expect(page.locator('#studioSubmit')).to_be_enabled();page.locator('#studioSubmit').click()
  expect(page.locator('#studioResults')).to_contain_text('网页输入框未找到，尚未发送');assert len(submits)==1 and submits[0]['generationSettings']['videoRoute']=='tokendance-seedance-2.5'
  expect(page.locator('#studioCompletedPrompts')).to_be_hidden()
  page.locator('[data-retry-studio-job]').click();expect(page.locator('[data-retry-studio-job]')).to_have_count(0)
  jobs[0].update(status='complete',outputs=[{'url':'/mock-video'}]);expect(page.locator('#studioResults video')).to_have_count(1)
  page.locator('#studioResults video').evaluate('(v)=>v.dataset.testKeep="same-node"');jobs[1]['providerProgress']={'message':'等待分配'};page.wait_for_timeout(3000);expect(page.locator('#studioResults video')).to_have_attribute('data-test-keep','same-node')
  page.screenshot(path=str(OUT/'production-desktop.png'),full_page=True)
  page.locator('[data-step=templates]').first.click();expect(page.locator('#studioNext')).to_be_visible();page.wait_for_timeout(3000);page.locator('#studioNext').click();expect(page.locator('.studio-image-thumb')).to_have_count(2)
  expect(page.locator('[data-prompt]')).to_have_count(1);expect(page.locator('#studioCompletedPrompts')).to_be_visible();page.locator('[data-prompt]').first.fill('成片后人工修改');page.locator('h1').click();page.wait_for_timeout(800);expect(page.locator('[data-prompt]').first).to_have_value('成片后人工修改')
  page.locator('#studioTransform').click();expect(page.locator('#studioUseOriginal')).to_have_text('✓ 采用这张底图');expect(page.locator('.studio-image-thumb')).to_have_count(3);assert len(transforms)==1
  page.locator('#studioUseOriginal').click();page.wait_for_timeout(3200);expect(page.locator('#studioUseOriginal')).to_have_text('✓ 直接使用原图');assert next(a for a in catalog['assets'] if a['id']=='processed')['confirmed'];assert all(any(a['id']==u['id'] for a in catalog['assets']) for u in uploads)
  page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(500);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(OUT/'production-mobile.png'),full_page=True)
  assert not errors,errors
  print(json.dumps({'checks':['两页导航与选择保留','双图上传预览与素材缩略图','原图直接复用多条视频，不强制生图','选择模型后一次提交，提示词后台自动准备','成片之前不显示提示词，成片之后可编辑并保存','同页视频提交失败重试及稳定播放器','手机无横向溢出'],'paidRequests':0,'pageErrors':errors},ensure_ascii=False))
 finally:browser.close()
