import os,copy,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192');OUT=Path('data/e2e-project-library');OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch();ctx=b.new_context(viewport={'width':1500,'height':940});page=ctx.new_page();page.set_default_timeout(8000);errors=[];page.on('pageerror',lambda e:errors.append(str(e)));catalog=page.request.get(BASE+'/api/studio').json();sample=copy.deepcopy(next(v for v in catalog['projects'] if v['plans']));sample.update(name='足浴监控项目',commonImageId='used-image');empty=copy.deepcopy(sample);empty.update(id='empty-project',name='新建空白项目',plans=[],commonImageId='',materials={},submissions=[],promptTaskId='');catalog['projects']=[sample,empty];catalog['assets']=[{'id':'used-image','name':'上传场景','type':'upload','previewUrl':'/design-assets/scene-footspa.webp','confirmed':True},{'id':'generated-image','name':'生成底图','type':'generated','previewUrl':'/design-assets/scene-footspa.webp','confirmed':True},{'id':'other-image','name':'别的项目素材','type':'generated','previewUrl':'/design-assets/scene-story.webp','projectId':'other'}];catalog['imageTasks']=[{'id':'image-task','projectId':sample['id'],'status':'complete','items':[{'status':'complete','referenceIdResult':'generated-image'}]}]
 for plan in sample['plans']:plan['imageIds']=['used-image'];plan['rows']=[];plan['shotImages']=[]
 sample['materials']={};jobs=[{'id':'finished','projectId':sample['id'],'templateId':sample['plans'][0]['templateId'],'templateName':'敲门等待','sceneId':'footspa','status':'complete','outputs':['test.mp4'],'createdAt':'2026-10-14T00:00:00Z','duration':5,'prompt':'测试提示词'},{'id':'missing-output','projectId':sample['id'],'templateId':sample['plans'][0]['templateId'],'templateName':'敲门等待','sceneId':'footspa','status':'complete','outputs':[],'createdAt':'2026-10-14T00:00:00Z','duration':5,'prompt':'测试提示词'},{'id':'historical','templateId':'historical','templateName':'历史作品','sceneId':'footspa','status':'queued','outputs':[],'createdAt':'2026-10-13T00:00:00Z','duration':5,'prompt':'历史提示词'}]
 def route(r):
  path=r.request.url.split(BASE)[-1].split('?')[0]
  if path=='/api/studio':r.fulfill(json=catalog);return
  if path=='/api/studio/works':r.fulfill(json=jobs);return
  if path.startswith('/api/video/'):r.fulfill(status=404,json={'error':'模拟任务未存真实视频'});return
  if r.request.method not in ['GET','HEAD']:raise AssertionError('Unexpected mutation '+path)
  r.continue_()
 ctx.route('**/api/**',route)
 try:
  page.goto(BASE+'/projects',wait_until='networkidle');expect(page.locator('[data-app-nav=works]')).to_have_text('项目');expect(page.locator('[data-project-card]')).to_have_count(2);expect(page.locator('[data-project-card="'+sample['id']+'"]')).to_contain_text('2 张素材');expect(page.locator('[data-project-card="empty-project"]')).to_contain_text('0 条成片');page.screenshot(path=str(OUT/'projects.png'))
  page.locator('#projectSearch').fill('空白');expect(page.locator('[data-project-card]')).to_have_count(1);page.locator('#projectSearch').fill('');page.locator('[data-project-card="'+sample['id']+'"] a',has_text='打开项目').click();expect(page.locator('.project-asset-grid .card')).to_have_count(2);expect(page.locator('.project-video-grid .card')).to_have_count(2);expect(page.locator('.project-video-grid video')).to_have_count(1);expect(page.locator('.project-video-grid')).to_contain_text('待获取成片地址');assert '别的项目素材' not in page.locator('#app').inner_text()
  page.locator('[data-project-asset="generated-image"]').first.click();expect(page.locator('#modalBody')).to_contain_text('生成底图');page.locator('#modal .close').click();page.locator('#refreshProjectLibrary').click();expect(page.locator('.project-asset-grid .card')).to_have_count(2);page.screenshot(path=str(OUT/'project-detail.png'))
  for width in [1500,1100,760,390]:page.set_viewport_size({'width':width,'height':940});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
  page.locator('#projectWorks').click();expect(page.locator('.work')).to_have_count(2);page.get_by_role('link',name='查看全部作品 →').click();expect(page.locator('.work')).to_have_count(3)
  assert not errors,errors;print(json.dumps({'checks':['侧栏项目入口，历史草稿及空项目均展示','搜索项目，素材与成片真实计数','项目详情只显示关联素材，图片可放大','无视频地址不冒充成片，刷新可用','一键本项目作品和全部作品，保留历史作品','390–1500宽度无横向溢出'],'pageErrors':errors,'paidRequests':0,'realWrites':0},ensure_ascii=False))
 finally:b.close()
