import os
import copy,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
Path('data/e2e-interactions').mkdir(parents=True,exist_ok=True)
BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192')
with sync_playwright() as p:
    browser=p.chromium.launch();context=browser.new_context(viewport={'width':1473,'height':950});page=context.new_page();page.set_default_timeout(6000)
    overview=copy.deepcopy(page.request.get(BASE+'/api/studio').json()); errors=[];writes=[];checks=[];marks={'favorite':[]}
    page.on('pageerror',lambda e:errors.append(str(e)))
    jobs=[{'id':'e2e-'+status,'templateId':'e2e-template','templateName':'E2E产品展示','projectId':'e2e-project','batchId':'e2e-batch','sceneId':'footspa','duration':5,'status':status,'createdAt':'2026-10-13T00:00:00Z','outputs':['https://example.invalid/e2e.mp4'] if status=='complete' else [],'error':'模拟生成失败' if status=='error' else ''} for status in ['complete','error','queued','running']]
    def route(r):
        req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
        if path=='/api/studio':r.fulfill(json=overview);return
        if path=='/api/studio/works':r.fulfill(json=jobs);return
        if path=='/api/workspace-state':
            if req.method=='PUT':marks.update(req.post_data_json)
            r.fulfill(json=marks);return
        if path.startswith('/api/studio/jobs/') and req.method=='POST':
            job=next(j for j in jobs if j['id']==path.split('/')[-2]);job['status']='queued' if path.endswith('/retry') else 'cancelled';r.fulfill(json=job);return
        if path=='/api/studio/templates' and req.method=='POST':
            body=req.post_data_json;writes.append(body);item={'id':'e2e-new-action','source':'my','actionIds':['e2e-new-action'],**body}
            overview['templates'].append(item)
            overview['templateTypes'].append({'id':body['catalogType'],'name':body['catalogName'],'scene':body['scene'],'industryId':body['industryId'],'actionIds':[item['id']],'source':'my','categoryId':'custom'})
            overview['templateGroups'].append({'id':body['catalogType'],'name':body['catalogName'],'description':body['description'],'materials':body['imageRules'],'source':'my','categoryId':'custom','image':'/design-assets/scene-footspa.webp','industryIds':[body['industryId']],'variantIds':[body['catalogType']]})
            r.fulfill(json=item);return
        if path.startswith('/api/video/'):
            r.fulfill(status=404,json={'error':'测试作品不含真实媒体'});return
        if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected write '+path)
        r.continue_()
    context.route('**/api/**',route)
    try:
        page.goto(BASE+'/templates',wait_until='networkidle');page.locator('#createType').click()
        form=page.locator('#createTypeForm');form.locator('[type=submit]').click();assert not writes
        form.locator('[name=industry]').select_option('jewelry');form.locator('[name=name]').fill('E2E新品展示')
        form.locator('[name=actionName]').fill('展示正面');form.locator('[name=description]').fill('展示真实产品正面');form.locator('[name=materials]').fill('真实产品图片');form.locator('[type=submit]').click()
        expect(page.locator('#modal')).not_to_be_visible();assert len(writes)==1 and writes[0]['industryId']=='jewelry'
        page.locator('[data-catalog-source=my]').click();expect(page.locator('#catalogCards')).to_contain_text('E2E新品展示')
        checks.append('自建模板必填校验、行业绑定、首个动作保存及我的分类显示')
        page.goto(BASE+'/works',wait_until='domcontentloaded');expect(page.locator('.work')).to_have_count(4)
        page.locator('[data-work-check=e2e-complete]').check();expect(page.locator('#downloadSelected')).to_be_enabled()
        page.locator('#workStatus').select_option('error');expect(page.locator('.work')).to_have_count(1)
        expect(page.locator('#downloadSelected')).to_be_disabled()
        page.locator('[data-retry=e2e-error]').click();expect(page.locator('.work')).to_have_count(0)
        page.locator('#workStatus').select_option('queued');expect(page.locator('.work')).to_have_count(2)
        page.locator('[data-cancel=e2e-queued]').locator('..').locator('..').locator('summary').click()
        page.locator('[data-cancel=e2e-queued]').click();expect(page.locator('.work')).to_have_count(1)
        page.locator('#workStatus').select_option('');page.locator('#workSearch').fill('不存在');expect(page.locator('.work')).to_have_count(0)
        page.locator('#workSearch').fill('');page.locator('#favoriteWorksFilter').click();expect(page.locator('.work')).to_have_count(0)
        checks.append('作品状态与搜索筛选、隐藏选择清理、失败重试、排队取消和收藏筛选')
        assert not errors,errors
        print(json.dumps({'checks':checks,'pageErrors':errors,'realWrites':0},ensure_ascii=False))
    except Exception:
        page.screenshot(path='data/e2e-interactions/library-works-failure.png',full_page=True);raise
    finally:
        Path('data/e2e-interactions/library-works-report.json').write_text(json.dumps({'checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8');browser.close()
