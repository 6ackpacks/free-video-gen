"""Exercise the project work line using mocked local endpoints; no generation calls."""
import copy,json,os,base64
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192')
OUT=Path('data/e2e-monitor-line');OUT.mkdir(exist_ok=True)
with sync_playwright() as pw:
 browser=pw.chromium.launch();context=browser.new_context(viewport={'width':1500,'height':1000});page=context.new_page();page.set_default_timeout(10000)
 catalog=page.request.get(BASE+'/api/studio').json()
 project=copy.deepcopy(next(p for p in catalog['projects'] if p.get('templateTypeId')=='footspa:monitor' and p['plans']))
 project.update(id='mock-line',name='监控获客 · 单页验收',commonImageId='',materials={'sceneImageIds':[],'personImageIds':[],'productImageIds':[]})
 project['plans']=project['plans'][:1];plan=project['plans'][0];plan.update(count=2,prompts=[],imageIds=[],videoRoute='wan-tokendance',duration=5,resolution='720P',mapping='one-to-one')
 catalog.update(projects=[project],assets=[],imageTasks=[])
 flow=None;jobs=[];uploads=[];submits=[];settings=[];errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=')
 def route(r):
  global flow,project,jobs
  req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
  if path=='/monitor-workspace.js':r.fulfill(content_type='text/javascript',body=Path('monitor-workspace.js').read_text(encoding='utf-8'));return
  if path.startswith('/mock-frame/'):r.fulfill(content_type='image/png',body=png);return
  if path=='/api/studio':r.fulfill(json=catalog);return
  if path=='/api/studio/works':r.fulfill(json=jobs);return
  if path=='/api/studio/projects/mock-line':r.fulfill(json=project);return
  if path=='/api/studio/projects':
   project=copy.deepcopy(req.post_data_json);catalog['projects']=[project];r.fulfill(json=project);return
  if path=='/api/references' and req.method=='POST':
   ref={'id':'source-'+str(len(uploads)), 'type':'upload','name':req.post_data_json['name'],'previewUrl':'/mock-frame/'+str(len(uploads))};uploads.append(ref);catalog['assets'].append(ref);r.fulfill(json=ref);return
  if path.endswith('/monitor-workflow/settings'):
   settings.append(req.post_data_json);r.fulfill(json=flow);return
  if path.endswith('/monitor-workflow/confirm'):
   flow['status']='drafting';r.fulfill(json=flow);return
  if path.endswith('/monitor-workflow'):
   if req.method=='POST':
    flow={'id':'flow','status':'images_ready','autoVideo':False,'slots':[{'id':'slot-'+str(i),'planId':project['plans'][0]['id'],'index':i,'status':'complete','referenceId':'frame-'+str(i)} for i in range(2)]}
    for slot in flow['slots']:catalog['assets'].append({'id':slot['referenceId'],'name':'动作首帧','type':'generated','confirmed':False,'monitorView':True,'previewUrl':'/mock-frame/'+slot['id']})
    project['plans'][0]['imageIds']=['frame-0','frame-1']
   r.fulfill(json=flow);return
  if path.endswith('/prompts'):
   for change in req.post_data_json['plans']:next(v for v in project['plans'] if v['id']==change['id'])['prompts']=change['prompts']
   r.fulfill(json=project);return
  if path.endswith('/submit'):
   submits.append(req.post_data_json);jobs=[{'id':'video-a','projectId':'mock-line','status':'queued','prompt':project['plans'][0]['prompts'][0],'videoRoute':'doubao','templateName':'视频1','providerProgress':{'message':'尚未分配账号'}},{'id':'video-b','projectId':'mock-line','status':'error','prompt':'prompt','error':'网页输入框未找到，尚未发送','videoRoute':'doubao','templateName':'视频2'}];r.fulfill(json={'id':'batch'});return
  if path=='/api/studio/jobs/video-b/retry':jobs[1]['status']='queued';jobs[1]['error']='';r.fulfill(json=jobs[1]);return
  if path.startswith('/api/'):
   if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected write '+path)
   r.fulfill(json={});return
  r.continue_()
 context.route('**/*',route)
 try:
  page.goto(BASE+'/studio?project=mock-line',wait_until='networkidle');expect(page.locator('#linePrepare')).to_be_enabled()
  with page.expect_file_chooser() as chooser:page.locator('#lineUpload').click()
  chooser.value.set_files([{'name':'场景1.png','mimeType':'image/png','buffer':png},{'name':'场景2.png','mimeType':'image/png','buffer':png}])
  expect(page.locator('#sceneCount')).to_have_text('2张');assert len(project['materials']['sceneImageIds'])==2;expect(page.locator('.monitor-sources img')).to_have_count(2)
  page.locator('[data-action-picker] summary').click();assert page.locator('.line-action-library article').count()>=25;assert page.locator('.line-action-library textarea').count()==0;page.locator('[data-action-picker] summary').click();page.locator('#linePrepare').click();expect(page.locator('#lineFrames img')).to_have_count(2);assert page.url==BASE+'/studio?project=mock-line'
  page.locator('#lineConfirmFrames').click();expect(page.locator('#lineNotice')).to_contain_text('正在准备视频提示词')
  page.locator('#projectVideoModel').select_option('tokendance-seedance-2.5');expect(page.locator('#projectVideoModel')).to_be_enabled();assert settings[-1]['videoRoute']=='tokendance-seedance-2.5'
  project['plans'][0]['prompts']=['5秒，9:16，固定高位监控，敲门并等待。','5秒，9:16，固定高位监控，敲门并等待。'];flow['status']='ready'
  expect(page.locator('[data-line-prompt]')).to_have_count(2);expect(page.locator('#lineSubmit')).to_be_enabled()
  page.locator('#linePrompts summary').first.click();first=page.locator('[data-line-prompt]').first;first.fill('人工修改后的提示词');page.locator('h1').click();page.wait_for_timeout(3100);expect(first).to_have_value('人工修改后的提示词')
  page.locator('#lineSubmit').click();expect(page.locator('#lineResults')).to_contain_text('尚未向生成服务提交');expect(page.locator('#lineResults')).to_contain_text('网页输入框未找到，尚未发送');assert len(submits)==1 and submits[0]['generationSettings']['videoRoute']=='tokendance-seedance-2.5';assert '/studio?project=mock-line' in page.url
  page.locator('[data-line-retry-video]').click();expect(page.locator('[data-line-retry-video]')).to_have_count(0)
  jobs[0].update(status='complete',outputs=[{'url':'/mock-video'}]);expect(page.locator('#lineResults video')).to_have_count(1);page.locator('#lineResults video').evaluate('(v)=>v.dataset.testKeep="same-node"');jobs[1]['providerProgress']={'message':'等待分配'};page.wait_for_timeout(3000);expect(page.locator('#lineResults video')).to_have_attribute('data-test-keep','same-node')
  page.screenshot(path=str(OUT/'single-work-line.png'),full_page=True);page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(500);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');page.screenshot(path=str(OUT/'mobile.png'),full_page=True);assert not errors,errors
  print(json.dumps({'checks':['多选上传两图全部保存并展示','每个视频显示独立监控首帧','提示词后台处理中可切换Seedance2.5并保存','人工提示词修改不被轮询覆盖','同页提交、真实错误提示及单项重试','其他任务更新不销毁已有播放器'],'paidRequests':0,'pageErrors':errors},ensure_ascii=False))
 finally:browser.close()
