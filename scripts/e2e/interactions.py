import os
import copy, json, re, uuid
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192')
OUT=Path('data/e2e-interactions'); OUT.mkdir(exist_ok=True)
checks=[]
def passed(name):
    checks.append(name); print('PASS '+name,flush=True)

with sync_playwright() as pw:
    browser=pw.chromium.launch()
    context=browser.new_context(viewport={'width':1473,'height':950})
    page=context.new_page(); page.set_default_timeout(7000)
    errors=[]; blocked=[]; submissions=[]; projects={}; fail_submit=False
    page.on('pageerror',lambda e:errors.append(str(e)))
    overview=page.request.get(BASE+'/api/studio').json()
    original_project_ids=[p['id'] for p in overview['projects']]
    overview=copy.deepcopy(overview)
    image='/design-assets/scene-footspa.webp'
    overview['assets']=[{'id':'e2e-image','name':'E2E产品照片','type':'upload','confirmed':True,'previewUrl':image,'scene':'jewelry'}, {'id':'e2e-pending','name':'待确认照片','type':'generated','confirmed':False,'previewUrl':image}, {'id':'e2e-brand','name':'E2E品牌','type':'brand','materials':'仅使用确认过的品牌事实'}]
    templates={t['id']:t for t in overview['templates']}
    def detail(p):
        result=copy.deepcopy(p); count=sum(v['count'] for v in p['plans'])
        result.update(readiness={'count':count,'ready':count,'errors':[]},adopted=[])
        return result
    def routes(route):
        req=route.request; path=req.url.split(BASE)[-1].split('?')[0]
        if path=='/api/references' and req.method=='GET':
            route.fulfill(json=[]);return
        if path=='/api/studio' and req.method=='GET':
            route.fulfill(json={**overview,'projects':list(projects.values())}); return
        if path=='/api/studio/projects' and req.method=='POST':
            value=req.post_data_json
            if not value.get('id'):
                value={'id':str(uuid.uuid4()),'createdAt':'2026-10-13T00:00:00Z','updatedAt':'2026-10-13T00:00:00Z','trials':[],'submissions':[],'stage':'templates',**value}
            previous=projects.get(value['id'],{})
            for plan in value.get('plans',[]):
                old=next((v for v in previous.get('plans',[]) if v['id']==plan['id']),{})
                plan['prompts']=old.get('prompts',[]);plan['promptsDirty']=old.get('promptsDirty',False);plan.setdefault('rows',[]);plan.setdefault('shotImages',[])
                plan.setdefault('snapshot',templates[plan['templateId']])
            projects[value['id']]=value;route.fulfill(json=value);return
        match=re.match(r'/api/studio/projects/([^/]+)(?:/(prompts|submit|draft))?$',path)
        if match and match[1] in projects:
            project=projects[match[1]]
            if req.method=='GET': route.fulfill(json=detail(project));return
            body=req.post_data_json
            if match[2]=='prompts':
                for update in body['plans']:
                    plan=next(v for v in project['plans'] if v['id']==update['id']);plan.update(update)
                    if body.get('confirm'):plan['promptsDirty']=False
                route.fulfill(json=detail(project));return
            if match[2]=='submit':
                submissions.append(body)
                route.fulfill(status=503 if fail_submit else 200,json={'error':'E2E模拟服务暂不可用'} if fail_submit else {'id':'e2e-batch'});return
        if path.startswith('/api/studio/assets/') and req.method=='PATCH':
            asset=next(a for a in overview['assets'] if a['id']==path.rsplit('/',1)[-1]);asset.update(req.post_data_json);route.fulfill(json=asset);return
        if path=='/api/studio/settings' and req.method=='POST':
            overview['settings'].update(req.post_data_json);route.fulfill(json=overview['settings']);return
        if path=='/api/studio/connection-test' and req.method=='POST':route.fulfill(json={'api':{'message':'E2E连接成功'},'video':{'message':'E2E视频服务正常'}});return
        if req.method not in ['GET','HEAD']:
            blocked.append(path);route.fulfill(status=409,json={'error':'E2E未配置的写入已拦截'});return
        route.continue_()
    context.route('**/api/**',routes)
    try:
        page.goto(BASE+'/studio',wait_until='networkidle')
        assert '全部行业' not in page.locator('#app').inner_text()
        assert page.locator('[data-industry]').count()==6
        page.locator('[data-industry=jewelry]').click();expect(page.locator('[data-type-card]')).to_have_count(4)
        page.reload(wait_until='networkidle');assert 'active' in page.locator('[data-industry=jewelry]').get_attribute('class')
        passed('首页行业选择、记忆与通用类型去重')
        page.locator('#startIndustry').click();expect(page.locator('#enterProject')).to_be_disabled()
        assert not projects
        page.locator('[data-project-industry=footspa]').click();expect(page.locator('[data-project-type]')).to_have_count(5)
        page.locator('[data-project-type="footspa:environment"]').click()
        page.locator('#newProjectName').fill('   ');expect(page.locator('#enterProject')).to_be_disabled()
        page.locator('#newProjectName').fill('E2E隔离制作项目');page.locator('#enterProject').click();page.wait_for_selector('#templateGrid')
        assert len(projects)==1
        project=next(iter(projects.values())); project_id=project['id']
        assert project['templateTypeId']=='footspa:environment'
        passed('项目选择前不建记录、空名称拦截、进入制作仅创建一次')
        page.goto(BASE+'/studio?type=missing-e2e-template',wait_until='networkidle')
        expect(page.locator('#app')).to_contain_text('模板类型不存在')
        assert len(projects)==1
        page.goto(BASE+'/studio?project='+project_id,wait_until='networkidle')
        passed('不存在的模板入口报错且不创建空项目')
        page.locator('[data-select]').nth(0).check();page.locator('[data-select]').nth(1).check();page.locator('[data-select]').nth(2).check()
        expect(page.locator('#generatePrompts')).to_be_enabled()
        for i,count in enumerate([5,3,2]):page.locator('[data-action-row]').nth(i).locator('[data-field=count]').fill(str(count))
        page.locator('#projectVideoRoute').select_option('wan-tokendance');page.locator('#projectRatio').select_option('16:9');page.locator('#projectResolution').select_option('720P');page.locator('#projectReferenceMode').select_option('first-frame')
        page.locator('#commonAssets').click();assert page.locator('[data-common-id]').count()==1
        page.locator('[data-common-id]').click();page.wait_for_timeout(800)
        assert [p['count'] for p in projects[project_id]['plans']]==[5,3,2]
        assert all(p['imageIds']==['e2e-image'] for p in projects[project_id]['plans'])
        expect(page.locator('#actionSummary')).to_contain_text('共 10 条视频')
        page.reload(wait_until='networkidle');expect(page.locator('[data-select]:checked')).to_have_count(3)
        assert page.locator('#projectVideoRoute').input_value()=='wan-tokendance'
        passed('三个动作5/3/2共10条、只可选已确认素材、保存恢复与参数重选')
        page.locator('[data-images]').first.click();page.locator('[data-image-source=materials]').click()
        page.locator('#mapping').select_option('one-to-one')
        expect(page.locator('.bottom')).to_contain_text('已选 1/5 张')
        page.locator('#confirmMapping').click()
        expect(page.locator('#toast')).to_contain_text('逐张制作需要 5 张底图')
        assert page.locator('#mapping').is_visible()
        page.locator('#mapping').select_option('common');page.locator('#confirmMapping').click();page.wait_for_selector('#templateGrid')
        assert projects[project_id]['stage']=='templates'
        passed('素材数量不足拦截、共用底图不增加视频数量')
        for plan in projects[project_id]['plans']:
            plan['prompts']=[plan['snapshot']['name']+'已确认测试文案']*plan['count'];plan['promptsDirty']=False
        page.reload(wait_until='networkidle');page.locator('#promptTab').click()
        fail_submit=True;page.locator('#trial').click()
        expect(page.locator('#toast')).to_contain_text('模拟服务暂不可用');expect(page.locator('#trial')).to_be_enabled()
        assert page.locator('#submitParameters').count()==0 and page.locator('#confirmSubmit').count()==0
        fail_submit=False;page.locator('#trial').click();page.wait_for_url('**/works?project=*')
        assert submissions[-1]['trial'] and submissions[-1]['generationSettings']['ratio']=='16:9'
        assert submissions[-1]['requestId']==submissions[-2]['requestId']
        passed('预设参数直接提交；失败可重试且同请求去重；无重复参数或确认弹窗')
        page.goto(BASE+'/templates',wait_until='networkidle')
        projects[project_id]['plans'][0]['duration']=6
        page.goto(BASE+'/studio?project='+project_id,wait_until='networkidle')
        page.locator('#templateTab').click();page.locator('#projectVideoRoute').select_option('apimart');page.locator('#promptTab').click();assert page.locator('#trialSlot option').count()==5
        passed('试片可单独选择支持的动作，其他动作时长不阻挡单条试片')
        page.goto(BASE+'/assets',wait_until='networkidle');page.locator('#assetSearch').fill('不存在');expect(page.locator('#assetGrid .card')).to_have_count(0)
        page.locator('#assetSearch').fill('');page.locator('[data-asset-check=e2e-image]').check()
        page.locator('[data-type=brand]').click()
        expect(page.locator('#useAssets')).to_be_disabled()
        passed('素材筛选清理隐藏选择，避免操作不可见素材')
        page.goto(BASE+'/settings',wait_until='networkidle');page.locator('#testImageConnection').click();expect(page.locator('#imageConnectionResult')).to_contain_text('连接成功')
        page.locator('#generalSettings').click();assert page.locator('#defaultRoute').is_visible()
        page.locator('#preferences').click();assert page.locator('#defaultRoute').is_visible()
        passed('设置页连接结果与通用／偏好切换')
        signatures=[]
        for url in ['/studio','/studio?new=1','/templates','/replicate','/works','/assets','/settings']:
            page.goto(BASE+url,wait_until='networkidle')
            signatures.append(page.locator('.app-sidebar nav a').evaluate_all('(els)=>els.map(e=>[e.textContent.trim(),e.getAttribute("href")])'))
            assert page.locator('.app-sidebar').count()==1
            for width in [1473,1100,760,520,390]:
                page.set_viewport_size({'width':width,'height':950});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(url,width)
            page.set_viewport_size({'width':1473,'height':950})
        assert all(s==signatures[0] for s in signatures)
        passed('七个制作页面导航一致、390至1473宽度无横向溢出')
        page.goto(BASE+'/legacy?tab=accounts',wait_until='networkidle');page.screenshot(path=str(OUT/'protected-account-pool.png'))
        assert '豆包账号池' in page.locator('body').inner_text()
        passed('受保护的原始豆包账号池页面可加载')
        assert not errors,errors
        assert not blocked,blocked
        actual_ids=[p['id'] for p in page.request.get(BASE+'/api/studio').json()['projects']]
        assert actual_ids==original_project_ids
        passed('无页面异常、无测试数据写入真实项目、无生成接口实调用')
    except Exception:
        page.screenshot(path=str(OUT/'failure.png'),full_page=True)
        (OUT/'failure.txt').write_text(page.locator('body').inner_text(),encoding='utf-8')
        raise
    finally:
        (OUT/'report.json').write_text(json.dumps({'checks':checks,'pageErrors':errors,'blockedWrites':blocked,'mockSubmissions':len(submissions)},ensure_ascii=False,indent=2),encoding='utf-8')
        browser.close()
