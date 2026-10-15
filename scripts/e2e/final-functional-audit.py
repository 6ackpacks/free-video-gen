"""Independent final-release audit. All mutations are intercepted; no generation."""
import copy,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192')
OUT=Path('data/e2e-final-functional-audit');OUT.mkdir(exist_ok=True)
report={'pages':[],'defects':[],'mockedWrites':[],'providerCalls':0,'realMutations':0}
with sync_playwright() as pw:
 browser=pw.chromium.launch();ctx=browser.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page()
 catalog=page.request.get(BASE+'/api/studio').json();fixture=copy.deepcopy(catalog)
 source=copy.deepcopy(next(p for p in catalog['projects'] if p.get('plans')))
 source['id']='audit-project';source['name']='独立功能检查';fixture['projects']=[source]
 job={'id':'audit-job','projectId':source['id'],'templateId':source['plans'][0]['templateId'],'templateName':source['plans'][0]['snapshot']['name'],'status':'complete','outputs':['fixture.mp4'],'duration':10,'createdAt':'2026-10-15T00:00:00Z','sceneId':source['scene'],'prompt':'测试描述'}
 errors=[];fail_preferences=False;page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
  if path=='/api/studio':r.fulfill(json=fixture);return
  if path=='/api/studio/works':r.fulfill(json=[job]);return
  if path=='/api/workspace-state':r.fulfill(json={'favorite':[]});return
  if path=='/api/studio/projects/audit-project':r.fulfill(json=source);return
  if path=='/api/studio/settings' and req.method=='POST' and fail_preferences:
   report['mockedWrites'].append({'path':path,'failure':True});r.fulfill(status=503,json={'error':'模拟偏好保存失败'});return
  if path=='/api/studio/projects' and req.method=='POST':
   value=req.post_data_json;report['mockedWrites'].append({'path':path,'plans':len(value.get('plans',[]))});r.fulfill(json={**value,'id':'redo-fixture'});return
  if req.method not in ['GET','HEAD']:
   report['mockedWrites'].append({'path':path});r.fulfill(json={'id':'mock','ok':True});return
  if path.startswith('/api/video/') or path.startswith('/api/video-posters/'):
   r.fulfill(status=404,json={'error':'fixture has no media'});return
  r.continue_()
 def guard(r):
  if not r.request.url.startswith(BASE):r.fulfill(status=404,body='External media blocked by audit');return
  route(r)
 ctx.route('**/*',guard)
 for path in ['/studio','/templates','/projects','/assets','/works','/settings','/replicate','/accounts']:
  errors.clear();page.goto(BASE+path,wait_until='networkidle');page.wait_for_timeout(350)
  buttons=page.locator('button:visible').all_text_contents()
  row={'path':path,'buttons':buttons,'pageErrors':errors.copy(),'textLength':len(page.locator('body').inner_text())}
  for width in [1440,760,390]:
   page.set_viewport_size({'width':width,'height':1000});page.wait_for_timeout(80)
   if page.evaluate('document.documentElement.scrollWidth>innerWidth+1'):report['defects'].append({'path':path,'issue':'horizontal overflow','width':width})
  page.set_viewport_size({'width':1440,'height':1000})
  if page.locator('#helpButton').is_visible():
   page.locator('#helpButton').click();expect(page.locator('#modal')).to_be_visible();page.locator('#modal .close').click();expect(page.locator('#modal')).not_to_be_visible();row['help']='pass'
  report['pages'].append(row)
 # Connection failure must give an actionable message without an unhandled exception.
 page.goto(BASE+'/settings',wait_until='networkidle');page.locator('#generalSettings').click()
 fail_preferences=True;errors.clear();values=page.locator('#defaultRoute option').evaluate_all('(els)=>els.map(e=>e.value)')
 if len(values)>1:
  current=page.locator('#defaultRoute').input_value();page.locator('#defaultRoute').select_option(next(v for v in values if v!=current));page.wait_for_timeout(350)
  if errors:report['defects'].append({'priority':'P2','path':'/settings','issue':'default model save failure produces unhandled rejection and selected UI diverges from persisted settings','errors':errors.copy(),'location':'studio-ui.js settingsPage defaultRoute.onchange'})
  expect(page.locator('#defaultRoute')).to_have_value(current);expect(page.locator('#toast')).to_contain_text('模拟偏好保存失败')
 fail_preferences=False;errors.clear()
 # Legacy jobs lack planId: the redo button must retain a usable template.
 page.goto(BASE+'/works?video=audit-job',wait_until='networkidle');expect(page.locator('#redoWork')).to_be_visible()
 page.locator('#redoWork').click();page.wait_for_timeout(500)
 redo=next(v for v in report['mockedWrites'] if v['path']=='/api/studio/projects')
 if redo['plans']==0:report['defects'].append({'priority':'P2','path':'/works?video=audit-job','issue':'redo historical job missing planId creates zero-plan project','location':'studio-ui.js redoWork clone.plans.filter'})
 assert redo['plans']==1,'Historical redo must retain one template'
 report['pageErrors']=errors
 browser.close()
OUT.joinpath('report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=True))
