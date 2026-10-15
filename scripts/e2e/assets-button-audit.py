"""Exercise asset actions with mocked writes and injected service failures."""
import base64,copy,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4192';OUT=Path('data/e2e-assets-buttons');OUT.mkdir(exist_ok=True)
report={'checks':[],'defects':[],'realMutations':0,'providerCalls':0}
with sync_playwright() as pw:
 b=pw.chromium.launch();ctx=b.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();catalog=page.request.get(BASE+'/api/studio').json();fixture=copy.deepcopy(catalog);fixture.update(projects=[],imageTasks=[])
 fixture['assets']=[{'id':'asset-a','name':'环境照片','type':'upload','confirmed':True,'scene':'food','previewUrl':'/design-assets/visual-generic-v3.webp'},{'id':'asset-b','name':'人物照片','type':'upload','confirmed':True,'scene':'massage','previewUrl':'/design-assets/visual-generic-v3.webp'}]
 errors=[];all_errors=[];fail='';writes=[];page.on('pageerror',lambda e:(errors.append(str(e)),all_errors.append(str(e))))
 def route(r):
  req=r.request;p=req.url.split(BASE)[-1].split('?')[0]
  if not req.url.startswith(BASE):r.fulfill(status=404,body='Blocked external');return
  if p=='/api/studio':r.fulfill(json=fixture);return
  if req.method not in ['GET','HEAD']:
   writes.append(p)
   if fail and (fail=='patch' and req.method=='PATCH' or fail=='upload' and p=='/api/references' or fail=='brand' and p=='/api/story-subjects'):
    r.fulfill(status=503,json={'error':'模拟素材保存失败'});return
   if p=='/api/references':
    a={'id':'uploaded','name':req.post_data_json['name'],'type':'upload','confirmed':True,'previewUrl':'/design-assets/visual-generic-v3.webp'};fixture['assets'].append(a);r.fulfill(json=a);return
   if p.startswith('/api/studio/assets/') and req.method=='PATCH':
    a=next(a for a in fixture['assets'] if a['id']==p.rsplit('/',1)[1]);a.update(req.post_data_json);r.fulfill(json=a);return
   if p=='/api/story-subjects':
    a={'id':'brand-new','name':req.post_data_json['name'],'materials':req.post_data_json['materials'],'type':'brand'};fixture['assets'].append(a);r.fulfill(json=a);return
   raise AssertionError('Unexpected write '+p)
  if p.startswith('/api/'):r.fulfill(json=[]);return
  r.continue_()
 ctx.route('**/*',route)
 def load():page.goto(BASE+'/assets',wait_until='networkidle')
 def menu(id):page.locator('[data-asset-check="'+id+'"]').locator('..').locator('..').locator('summary').click()
 png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=')
 def upload():
  with page.expect_file_chooser() as f:page.locator('#assetUpload').click()
  f.value.set_files({'name':'测试上传.png','mimeType':'image/png','buffer':png})
 load();upload();expect(page.locator('[data-asset-check="uploaded"]')).to_be_visible();report['checks'].append('upload confirms and displays asset')
 page.locator('#brandUpload').click();page.locator('#newBrandName').fill('测试品牌');page.locator('#newBrandFacts').fill('已确认的服务信息');page.locator('#saveBrand').click();expect(page.locator('#modal')).not_to_be_visible();page.locator('[data-type="brand"]').click();expect(page.locator('#assetGrid')).to_contain_text('测试品牌');page.locator('[data-type="all"]').click();report['checks'].append('brand creation and category filter')
 menu('asset-a');page.locator('[data-favorite="asset-a"]').click();expect(page.locator('[data-favorite="asset-a"]')).to_contain_text('已收藏')
 menu('asset-a');page.locator('[data-archive-asset="asset-a"]').click();expect(page.locator('[data-asset-check="asset-a"]')).to_have_count(0);page.locator('[data-type="archived"]').click();menu('asset-a');page.locator('[data-archive-asset="asset-a"]').click();page.locator('[data-type="all"]').click();expect(page.locator('[data-asset-check="asset-a"]')).to_be_visible();report['checks'].append('favorite, archive and restore')
 menu('asset-a');page.locator('[data-classify-asset="asset-a"]').click();page.locator('#classifyScene').select_option('ktv');page.locator('#saveClassify').click();expect(page.locator('#modal')).not_to_be_visible();assert fixture['assets'][0]['scene']=='ktv'
 for id in ['asset-a','asset-b']:page.locator('[data-asset-check="'+id+'"]').check()
 page.locator('#favoriteAssets').click();expect(page.locator('#toast')).to_contain_text('所选素材已收藏');page.locator('#moveAssets').click();page.locator('#moveScene').select_option('food');page.locator('#confirmMove').click();expect(page.locator('#modal')).not_to_be_visible();assert all(a['scene']=='food' for a in fixture['assets'][:2]);page.locator('#assetSearch').fill('人物');expect(page.locator('[data-asset-check]:checked')).to_have_count(1);report['checks'].append('single classify, batch favorite/move and hidden selection cleanup')
 fixture['assets'][0]['archived']=True;page.set_viewport_size({'width':1280,'height':720});load();page.locator('[data-type="archived"]').click();menu('asset-a')
 try:
  page.locator('[data-archive-asset="asset-a"]').click(timeout=1500);report['checks'].append('archive restore clickable at 1280x720')
 except Exception as e:
  page.screenshot(path=str(OUT/'restore-menu-covered.png'),full_page=True);report['defects'].append({'priority':'P2','action':'restore-low-viewport','issue':'fixed bottom toolbar intercepts restore menu click at 1280x720','location':'studio-ui.css asset-menu/bottom','error':str(e)[-1800:]})
 fixture['assets'][0]['archived']=False;page.set_viewport_size({'width':1440,'height':1000})
 # Fault injection captures unhandled rejections without changing product code.
 for action in ['favorite','archive','classify','bulk-favorite','bulk-move','upload','brand']:
  fail='';load();errors.clear();fail='upload' if action=='upload' else 'brand' if action=='brand' else 'patch'
  if action in ['favorite','archive','classify']:
   menu('asset-a')
   if action=='favorite':page.locator('[data-favorite="asset-a"]').click()
   elif action=='archive':page.locator('[data-archive-asset="asset-a"]').click()
   else:page.locator('[data-classify-asset="asset-a"]').click();page.locator('#saveClassify').click()
  elif action.startswith('bulk-'):
   page.locator('[data-asset-check="asset-a"]').check()
   if action=='bulk-favorite':page.locator('#favoriteAssets').click()
   else:page.locator('#moveAssets').click();page.locator('#confirmMove').click()
  elif action=='upload':upload()
  else:page.locator('#brandUpload').click();page.locator('#newBrandName').fill('失败品牌');page.locator('#newBrandFacts').fill('测试');page.locator('#saveBrand').click()
  page.wait_for_timeout(300)
  if errors:report['defects'].append({'priority':'P2','action':action,'issue':'unhandled async rejection and no recovery message','errors':errors.copy(),'location':'studio-ui.js assetBottom/assetsPage'})
  else:
   expect(page.locator('#toast')).to_contain_text('模拟素材保存失败')
   control={'favorite':'[data-favorite="asset-a"]','archive':'[data-archive-asset="asset-a"]','classify':'#saveClassify','bulk-favorite':'#favoriteAssets','bulk-move':'#confirmMove','upload':'#assetUpload','brand':'#saveBrand'}[action]
   expect(page.locator(control)).to_be_enabled();report['checks'].append(action+' failure shown and button restored')
 fail='';report['mockedWrites']=len(writes);report['pageErrors']=all_errors;b.close()
OUT.joinpath('report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=True))
