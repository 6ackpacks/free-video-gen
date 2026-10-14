"""Project deletion and promotion layout; fixture APIs, no real deletion."""
import copy,json
from pathlib import Path
from urllib.request import urlopen
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4192';ROOT=Path.cwd();OUT=ROOT/'data/e2e-project-delete';OUT.mkdir(exist_ok=True)
catalog=json.load(urlopen(BASE+'/api/studio'));fixture=copy.deepcopy(catalog);sample=copy.deepcopy(catalog['projects'][0]);fixture['projects']=[dict(sample,id='delete-'+str(i),name='待整理项目'+str(i)) for i in range(3)];calls=[];errors=[];blocked=False
with sync_playwright() as pw:
 b=pw.chromium.launch();page=b.new_page(viewport={'width':1440,'height':1000});page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
  if path.endswith(('.js','.css')) and (ROOT/path.lstrip('/')).is_file():r.fulfill(body=(ROOT/path.lstrip('/')).read_text(encoding='utf-8'),content_type='text/javascript' if path.endswith('.js') else 'text/css');return
  if path=='/api/studio':r.fulfill(json=fixture);return
  if path=='/api/studio/works':r.fulfill(json=[]);return
  if path=='/api/studio/projects/delete':
   calls.append(req.post_data_json)
   if blocked:r.fulfill(status=400,json={'error':'项目仍有进行中任务，请先完成任务'});return
   ids=req.post_data_json['projectIds'];fixture['projects']=[p for p in fixture['projects'] if p['id'] not in ids];r.fulfill(json={'deleted':ids,'mediaRetained':True});return
  if path.startswith('/api/'):
   if req.method!='GET':raise AssertionError('unexpected write '+path)
   r.fulfill(json={});return
  r.continue_()
 page.route('**/*',route)
 try:
  page.goto(BASE+'/projects',wait_until='networkidle');expect(page.locator('[data-project-card]')).to_have_count(3);expect(page.locator('#deleteSelectedProjects')).to_be_disabled()
  page.locator('[data-select-project="delete-0"]').check();page.locator('#deleteSelectedProjects').click();expect(page.locator('#modal')).to_contain_text('待整理项目0');page.locator('#cancelProjectDelete').click();assert not calls;expect(page.locator('[data-project-card]')).to_have_count(3)
  page.locator('#projectSearch').fill('待整理项目1');page.locator('#selectAllProjects').check();expect(page.locator('#projectSelectionCount')).to_have_text('已选 1 个');page.locator('#deleteSelectedProjects').click();page.locator('#confirmProjectDelete').click();expect(page.locator('[data-project-card]')).to_have_count(0);assert calls[-1]['projectIds']==['delete-1']
  page.locator('#projectSearch').fill('');expect(page.locator('[data-project-card]')).to_have_count(2);blocked=True;page.locator('[data-delete-project="delete-0"]').click();page.locator('#confirmProjectDelete').click();expect(page.locator('#toast')).to_contain_text('进行中任务');expect(page.locator('[data-project-card]')).to_have_count(2);page.locator('#cancelProjectDelete').click();blocked=False
  page.locator('#selectAllProjects').check();page.screenshot(path=str(OUT/'projects-selected.png'),full_page=True);page.locator('#deleteSelectedProjects').click();page.locator('#confirmProjectDelete').click();expect(page.locator('[data-project-card]')).to_have_count(0);assert set(calls[-1]['projectIds'])=={'delete-0','delete-2'};page.reload(wait_until='networkidle');expect(page.locator('[data-project-card]')).to_have_count(0)
  page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');assert not errors,errors;print(json.dumps({'checks':['single and batch delete','cancel preserves projects','filtered select all','active rejection preserves cards','refresh preserves removal','mobile no overflow'],'realDeletes':0}))
 finally:b.close()
