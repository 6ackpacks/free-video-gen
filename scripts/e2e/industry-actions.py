import os
import copy,json,re,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192')
OUT=Path('data/e2e-industry-actions');OUT.mkdir(exist_ok=True)
with sync_playwright() as p:
    b=p.chromium.launch();context=b.new_context(viewport={'width':1500,'height':940});page=context.new_page();page.set_default_timeout(7000)
    catalog=page.request.get(BASE+'/api/studio').json();projects={};writes=[];errors=[];checks=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def route(r):
        req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
        if path=='/api/studio':r.fulfill(json={**catalog,'projects':list(projects.values())});return
        if path=='/api/studio/industries' and req.method=='POST':
            name=req.post_data_json['name'];writes.append(name);industry={'id':'industry-e2e','name':name}
            if not any(i['id']==industry['id'] for i in catalog['industries']):
                catalog['industries'].append(industry)
                for category in ['environment','service','story','avatar-talk']:
                    original=next(t for t in catalog['templateTypes'] if t['id']=='footspa:'+category);t=copy.deepcopy(original);t.update(id=industry['id']+':'+category,industryId=industry['id'],scene='story' if category=='story' else industry['id']);catalog['templateTypes'].append(t)
                    g=next(g for g in catalog['templateGroups'] if g['id']=='common:'+category);g['industryIds'].append(industry['id']);g['variantIds'].append(t['id'])
            r.fulfill(json=industry);return
        if path=='/api/studio/projects' and req.method=='POST':
            body=req.post_data_json
            if not body.get('id'):body={'id':str(uuid.uuid4()),'stage':'templates','trials':[],'submissions':[],'createdAt':'2026-10-13T00:00:00Z','updatedAt':'2026-10-13T00:00:00Z',**body}
            for plan in body['plans']:plan.setdefault('prompts',[])
            projects[body['id']]=body;r.fulfill(json=body);return
        if path.startswith('/api/studio/projects/') and req.method=='GET':r.fulfill(json=projects[path.rsplit('/',1)[-1]]);return
        if path.endswith('/prompts') and req.method=='POST':r.fulfill(json={'saved':True});return
        if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected write '+path)
        r.continue_()
    context.route('**/api/**',route)
    try:
        page.goto(BASE+'/templates',wait_until='networkidle')
        assert page.locator('[data-type-card="common:avatar-talk"]').count()==1
        assert page.locator('[data-type-card="common:service"] [data-recipe-link]').count()==3
        assert page.locator('[data-type-card="common:service"]').inner_text().find('数字人商品口播')==-1
        for group in ['footspa:monitor','common:service','common:environment','common:story','common:avatar-talk']:
            page.goto(BASE+'/templates',wait_until='networkidle');page.locator('[data-type-card="'+group+'"] a.primary').click()
            page.wait_for_selector('#chooserIndustryChips');assert 'new=1' in page.url and not projects
            assert page.locator('[data-project-industry]').count()>=1
        checks.append('独立数字人模板与三个产品展示方向分开；五类使用入口均进入行业确认且不提前建项目')
        page.goto(BASE+'/studio?new=1&group=common:service',wait_until='networkidle')
        page.locator('#newIndustryName').fill('宠物用品');page.locator('#addIndustryForm button').click()
        expect(page.locator('[data-project-industry=industry-e2e]')).to_have_attribute('aria-pressed','true')
        assert writes==['宠物用品'];assert not projects;assert page.locator('[data-project-type]').count()==1
        page.locator('#enterProject').click();page.wait_for_selector('#templateGrid');assert len(projects)==1
        assert next(iter(projects.values()))['industryId']=='industry-e2e'
        page.goto(BASE+'/studio?new=1',wait_until='networkidle');expect(page.locator('[data-project-industry=industry-e2e]')).to_have_count(1)
        checks.append('输入新行业、确认通用类型、进入项目、再次打开行业仍可选择')
        page.goto(BASE+'/studio?new=1&group=footspa:monitor',wait_until='networkidle')
        page.locator('#enterProject').click();page.wait_for_selector('#templateGrid')
        library=page.locator('.more-action-library');expect(library.locator('summary')).to_contain_text('还有 11 个动作')
        library.locator('summary').click();target=library.locator('[data-action-row]').nth(5)
        target.scroll_into_view_if_needed();page.evaluate('window.e2eRow=document.querySelectorAll(".more-action-library [data-action-row]")[5];window.e2eCheckbox=e2eRow.querySelector("input");window.e2eScroll=scrollY;window.e2eId=e2eRow.dataset.actionRow;window.e2eOrdinal=[...document.querySelectorAll("[data-action-row]")].indexOf(e2eRow)')
        target.locator('[data-select]').check()
        assert page.evaluate('e2eRow.isConnected && e2eCheckbox.isConnected && e2eCheckbox.checked')
        assert page.evaluate('[...document.querySelectorAll("[data-action-row]")].indexOf(e2eRow)===e2eOrdinal')
        assert page.evaluate('Math.abs(scrollY-e2eScroll)<3')
        assert library.get_attribute('open') is not None
        target.locator('[data-field=count]').fill('3');page.wait_for_timeout(650)
        assert next(reversed(projects.values()))['plans'][0]['count']==3
        target.locator('[data-select]').uncheck();assert page.evaluate('e2eRow.isConnected&&!e2eCheckbox.checked')
        target.locator('[data-select]').check();target.locator('.action-visual').click();expect(page.locator('#modal')).to_be_visible();page.locator('#modal .close').click()
        page.locator('#projectVideoRoute').select_option('wan-tokendance');assert page.locator('.more-action-library').get_attribute('open') is not None
        page.screenshot(path=str(OUT/'action-library.png'),full_page=False)
        checks.append('完整动作库强引导；勾选不替换行、不重排、不滚动；展开状态与数量保存；预览可用')
        for width in [1500,1100,760,520,390]:
            page.set_viewport_size({'width':width,'height':940});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        checks.append('动作区390至1500宽度无横向溢出')
        assert not errors,errors
        print(json.dumps({'checks':checks,'pageErrors':errors,'realProjectWrites':0,'paidRequests':0},ensure_ascii=False))
    except Exception:
        page.screenshot(path=str(OUT/'failure.png'),full_page=True);(OUT/'failure.txt').write_text(page.locator('body').inner_text(),encoding='utf-8');raise
    finally:
        (OUT/'report.json').write_text(json.dumps({'checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8');b.close()
