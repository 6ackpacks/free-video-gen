"""Reference import -> analysis -> generation, synthetic video and mock APIs only."""
import json,shutil,subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4192';OUT=Path('data/e2e-replica-buttons');OUT.mkdir(exist_ok=True)
report={'checks':[],'defects':[],'providerCalls':0,'realMutations':0};video=OUT/'synthetic-reference.mp4'
if not video.exists():
 bundled=Path('node_modules/ffmpeg-static/ffmpeg.exe');ffmpeg=str(bundled.resolve()) if bundled.exists() else shutil.which('ffmpeg')
 assert ffmpeg,'Install local ffmpeg-static or ffmpeg to create the synthetic fixture'
 subprocess.run([ffmpeg,'-hide_banner','-loglevel','error','-y','-f','lavfi','-i','color=c=slategray:s=320x240:r=12:d=2','-c:v','libx264','-pix_fmt','yuv420p',str(video)],check=True)
with sync_playwright() as pw:
 b=pw.chromium.launch();ctx=b.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();page.set_default_timeout(10000);errors=[];mode='import-fail';sources=[];submissions=[];writes=[]
 replica={'summary':'固定双镜头的产品介绍','template':'{{主体}}，镜头平移展示细节。','variables':[{'key':'主体','label':'主体名称','values':['测试产品']}],'fixedRules':['不新增品牌文字'],'beats':[{'start':0,'end':.5,'action':'展示产品整体'},{'start':.5,'end':1,'action':'镜头推近细节'}]}
 route_config={'id':'doubao','name':'豆包','model':'seedance_v2.0_mini','configured':True,'duration':{'values':[5,10,15]},'resolutions':['720P'],'referenceMode':'reference-image'}
 page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  req=r.request;p=req.url.split(BASE)[-1].split('?')[0]
  if not req.url.startswith(BASE):r.fulfill(status=404,body='Blocked external');return
  if req.method not in ['GET','HEAD']:writes.append(p)
  if p=='/api/provider':r.fulfill(json={'routes':[route_config]});return
  if p=='/api/references' or p=='/api/action-packs':r.fulfill(json=[]);return
  if p=='/api/replica-sources':
   if req.method=='GET':r.fulfill(json=sources);return
   if mode=='import-fail':r.fulfill(status=503,json={'error':'模拟参考导入失败'});return
   incoming=req.post_data_json;source={'id':'source-fixture','name':incoming['name'],'duration':incoming['duration'],'width':320,'height':240,'frames':[{'time':i/6,'url':'/design-assets/visual-generic-v3.webp'} for i in range(12)]};sources.append(source);r.fulfill(json=source);return
  if p=='/api/studio/reference-videos/source-fixture':
   if req.method=='POST':r.fulfill(json={'ok':True});return
   r.fulfill(content_type='video/mp4',body=video.read_bytes());return
  if p=='/api/replica-analysis':
   if req.method=='GET':r.fulfill(json={'task':None});return
   if mode=='analysis-start-fail':r.fulfill(status=503,json={'error':'模拟分析提交失败'});return
   r.fulfill(json={'id':'analysis-fixture','status':'running'});return
  if p=='/api/replica-analysis/analysis-fixture':r.fulfill(json={'id':'analysis-fixture','status':'error','error':'模拟解析结果失败'} if mode=='analysis-result-fail' else {'id':'analysis-fixture','status':'complete','result':replica});return
  if p=='/api/replica-batches':
   submissions.append(req.post_data_json)
   r.fulfill(status=503 if mode=='generation-fail' else 200,json={'error':'模拟视频提交失败'} if mode=='generation-fail' else {'id':'batch-fixture'});return
  if p=='/api/jobs':r.fulfill(json=[{'id':'mock-video-job','index':1,'status':'queued','outputs':[]}]);return
  if p=='/api/replica-presets':r.fulfill(status=503 if mode=='preset-fail' else 200,json={'error':'模拟模板保存失败'} if mode=='preset-fail' else {'id':'preset-fixture'});return
  if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected mutation '+p)
  if p.startswith('/api/'):r.fulfill(json={});return
  r.continue_()
 ctx.route('**/*',route)
 page.goto(BASE+'/replicate?upload=1',wait_until='networkidle')
 def upload(data):
  with page.expect_file_chooser() as f:page.locator('#directReferenceUpload').click()
  f.value.set_files(data)
 upload({'name':'坏视频.mp4','mimeType':'video/mp4','buffer':b'invalid-video'});expect(page.locator('#status')).to_contain_text('无法解码');expect(page.locator('#directReferenceUpload')).to_be_enabled();report['checks'].append('invalid source decode releases upload button')
 upload(str(video.resolve()));expect(page.locator('#status')).to_contain_text('模拟参考导入失败');expect(page.locator('#directReferenceUpload')).to_be_enabled();report['checks'].append('source import 503 releases upload button')
 mode='import-ok';upload(str(video.resolve()));expect(page.locator('#status')).to_contain_text('关键帧已保存在本机');assert len(sources[0]['frames'])==12;report['checks'].append('synthetic reference upload extracts 12 frames and mock video persists')
 mode='analysis-start-fail';page.locator('#replicaNext').click();expect(page.locator('#status')).to_contain_text('模拟分析提交失败');expect(page.locator('#referenceVideo')).to_be_enabled()
 mode='analysis-result-fail';page.locator('#replicaNext').click();expect(page.locator('#status')).to_contain_text('模拟解析结果失败');expect(page.locator('#referenceVideo')).to_be_enabled();report['checks'].append('analysis start/result failures release busy state')
 mode='analysis-ok';page.locator('#replicaNext').click();expect(page.locator('[data-shot-action]')).to_have_count(2);page.locator('[data-shot-action="0"]').fill('展示真实产品整体');page.locator('#replicaNext').click();expect(page.locator('#replicaReview')).to_contain_text('展示真实产品整体');page.locator('#replicaNext').click();expect(page.locator('#bulk')).to_be_enabled();report['checks'].append('analysis -> editable content -> planning confirmation -> generation')
 def generate():
  page.locator('#bulk').click();f=page.locator('#generationSettingsForm');expect(f).to_be_visible()
  for name,value in [('videoRoute','doubao'),('ratio','9:16'),('resolution','720P'),('duration','10'),('actionPackId','__keep__'),('referenceMode','first-frame')]:f.locator('[name="'+name+'"]').select_option(value)
  f.locator('[type=submit]').click()
 mode='generation-fail';generate();expect(page.locator('#status')).to_contain_text('模拟视频提交失败');expect(page.locator('#bulk')).to_be_enabled()
 mode='generation-ok';generate();expect(page.locator('#results')).to_contain_text('排队中');assert len(submissions)==2 and submissions[0]['requestId']==submissions[1]['requestId'];report['checks'].append('generation failure retry preserves request ID and releases button')
 mode='preset-fail';page.locator('#savePreset').click();page.locator('#confirmSaveTemplate').click();expect(page.locator('#status')).to_contain_text('模拟模板保存失败');expect(page.locator('#confirmSaveTemplate')).to_be_enabled();mode='preset-ok';page.locator('#confirmSaveTemplate').click();expect(page.locator('#status')).to_contain_text('已保存到模板中心');report['checks'].append('template save error can retry')
 assert not errors,errors;report['pageErrors']=errors;report['mockedWrites']=len(writes);b.close()
OUT.joinpath('report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=True))
