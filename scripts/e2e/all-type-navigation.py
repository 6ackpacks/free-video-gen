"""Select, configure and return for every catalog type. Never submits generation."""
import copy,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192');OUT=Path('data/e2e-all-type-navigation');OUT.mkdir(exist_ok=True)
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch();probe=browser.new_page();catalog=probe.request.get(BASE+'/api/studio').json();probe.close()
 for type_ in catalog['templateTypes']:
  if type_['id']=='footspa:monitor':continue # Covered in monitor-two-pages.py with upload and retries.
  ctx=browser.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();page.set_default_timeout(7000);errors=[];writes=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  project={'id':'all-type-check','name':'类型按钮验收','scene':type_['scene'],'industryId':type_['industryId'],'templateTypeId':type_['id'],'stage':'templates','plans':[],'submissions':[],'trials':[],'materials':{'sceneImageIds':[],'personImageIds':[],'productImageIds':[]},'productBrief':{},'massageSpec':{},'promotion':{},'brandName':'测试品牌','brandFacts':'测试事实'}
  fixture=copy.deepcopy(catalog);fixture.update(projects=[project],assets=[],imageTasks=[])
  def intercept(r):
   global project
   req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
   if path=='/api/studio':r.fulfill(json=fixture);return
   if path=='/api/studio/projects/all-type-check':r.fulfill(json=project);return
   if path=='/api/studio/projects' and req.method=='POST':project=req.post_data_json;fixture['projects']=[project];writes.append(path);r.fulfill(json=project);return
   if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected mutation '+path)
   if path.startswith('/api/'):r.fulfill(json=[] if path in ['/api/studio/works','/api/studio/promotion-presets'] else {});return
   r.continue_()
  ctx.route('**/api/**',intercept)
  result={'type':type_['id'],'status':'pass'}
  try:
   page.goto(BASE+'/studio?project=all-type-check',wait_until='networkidle');expect(page.locator('#sharedContinue')).to_be_disabled();page.locator('[data-shared-template]').first.check();expect(page.locator('#sharedSelectedCount')).to_have_text('1');page.locator('#sharedContinue').click();page.wait_for_url('**step=production')
   expect(page.locator('#projectVideoModel')).to_be_visible();page.locator('#projectVideoModel').select_option('doubao');page.wait_for_timeout(200);expect(page.locator('#projectVideoModel')).to_have_value('doubao')
   assert page.locator('button:visible').filter(has_text=__import__('re').compile('试片|样片')).count()==0
   for width in [1440,760,390]:
    page.set_viewport_size({'width':width,'height':1000});page.wait_for_timeout(60);assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'overflow {width}'
   page.set_viewport_size({'width':1440,'height':1000});page.locator('[data-shared-step="templates"]').first.click();expect(page.locator('#sharedSelectedCount')).to_have_text('1');page.reload(wait_until='networkidle');expect(page.locator('#sharedSelectedCount')).to_have_text('1');assert not errors,errors
   result['actions']=page.locator('[data-shared-template]').count()
  except Exception as e:
   result.update(status='fail',error=str(e),pageErrors=errors);page.screenshot(path=str(OUT/(type_['id'].replace(':','-')+'.png')),full_page=True)
  results.append(result);print(json.dumps(result,ensure_ascii=True),flush=True);ctx.close()
 browser.close()
OUT.joinpath('report.json').write_text(json.dumps({'types':results,'providerCalls':0,'realMutations':0},ensure_ascii=False,indent=2),encoding='utf-8')
assert all(r['status']=='pass' for r in results)
