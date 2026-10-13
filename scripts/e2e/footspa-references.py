import os, json, copy, uuid, re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192')
OUT=Path('data/e2e-footspa-references'); OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as pw:
    browser=pw.chromium.launch();context=browser.new_context(viewport={'width':1500,'height':940});page=context.new_page();page.set_default_timeout(8000)
    catalog=page.request.get(BASE+'/api/studio').json();projects={};errors=[];checks=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def route(r):
        req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
        if path=='/api/studio':r.fulfill(json={**catalog,'projects':list(projects.values())});return
        if path=='/api/studio/projects' and req.method=='POST':
            body=req.post_data_json
            if not body.get('id'):body={'id':str(uuid.uuid4()),'stage':'templates','trials':[],'submissions':[],**body}
            projects[body['id']]=copy.deepcopy(body);r.fulfill(json=body);return
        if path.endswith('/draft') and req.method=='POST':
            project=projects[path.split('/')[-2]]
            for plan in project['plans']:
                plan['prompts']=[page.request.post(BASE+'/api/footspa-prompt',data={'actionId':plan['snapshot']['actionId'],'duration':plan['duration'],'ratio':plan.get('ratio','9:16')}).json()['prompt'] for _ in range(plan['count'])]
                plan['promptsDirty']=False
            project['stage']='prompts';r.fulfill(json={'id':'mock-footspa-draft','status':'complete'});return
        if path=='/api/studio/drafts/mock-footspa-draft':r.fulfill(json={'id':'mock-footspa-draft','status':'complete'});return
        if path.startswith('/api/studio/projects/') and req.method=='GET':r.fulfill(json=projects[path.rsplit('/',1)[-1]]);return
        if path=='/api/footspa-prompt':r.continue_();return
        if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected write: '+path)
        r.continue_()
    context.route('**/api/**',route)
    try:
        assert len([t for t in catalog['templates'] if t.get('packId')=='foot-spa-store'])==25
        assert len(catalog['footspaSources'])==18
        assert sum(bool(c['videoUrl']) for c in catalog['footspaReferenceClips'])==17
        assert all(c['source'] for c in catalog['footspaReferenceClips'])
        for c in catalog['footspaReferenceClips']:
            if c['videoUrl']:
                response=page.request.get(BASE+c['videoUrl'],headers={'Range':'bytes=0-127'});assert response.status==206;assert len(response.body())==128
                assert page.request.get(BASE+c['posterUrl']).status==200
        checks.append('25动作、18来源、17本地MP4；所有封面与范围播放请求成功')
        page.goto(BASE+'/studio?new=1&group=footspa%3Amonitor',wait_until='networkidle');page.locator('[data-project-industry=footspa]').click();page.locator('#enterProject').click();page.wait_for_selector('#templateGrid')
        expect(page.locator('#creativeMaterials')).to_contain_text('人物参考（可选）')
        page.locator('#reviewFootspaPrompts').click();expect(page.locator('.prompt-acceptance-list article')).to_have_count(25)
        with page.expect_download() as pending:page.locator('#exportAllFootspaPrompts').click()
        download=pending.value;download.save_as(OUT/'all-prompts.md');assert (OUT/'all-prompts.md').read_text(encoding='utf8').count('## ')==25
        page.screenshot(path=str(OUT/'prompt-acceptance.png'));page.locator('#modal .close').click()
        page.locator('#browseFootspaReferences').click();expect(page.locator('.reference-clip')).to_have_count(18)
        expect(page.locator('.reference-placeholder')).to_have_count(1)
        for video in page.locator('.reference-media video').all():
            result=video.evaluate('''v => new Promise(resolve => { const timer=setTimeout(()=>resolve({error:'timeout'}),7000);v.addEventListener('loadeddata',()=>{clearTimeout(timer);resolve({duration:v.duration,width:v.videoWidth})},{once:true});v.addEventListener('error',()=>{clearTimeout(timer);resolve({error:v.error?.message})},{once:true});v.load(); })''')
            assert result.get('duration',0)>0 and result.get('width',0)>0,result
        page.screenshot(path=str(OUT/'reference-library.png'))
        page.locator('.reference-source-list summary').click();expect(page.locator('.reference-source-list>a')).to_have_count(18)
        assert all(a.get_attribute('target')=='_blank' and 'noopener' in a.get_attribute('rel') for a in page.locator('.reference-source-list>a').all())
        page.locator('#modal .close').click();checks.append('17视频全部浏览器解码成功；仅外链参考保持相同卡片布局；18抖音入口可用')
        page.locator('.more-action-library summary').click()
        row=page.locator('[data-action-row="footspa:action-16"]');row.locator('[data-action-prompt]').click()
        expect(page.locator('#footspaPromptText')).to_have_value(re.compile('女技师先进入，客人随后进入'))
        expect(page.locator('#footspaPromptText')).to_have_value(re.compile('未提供人物图'))
        page.locator('#previewPromptDuration').select_option('8');expect(page.locator('#footspaPromptText')).to_have_value(re.compile('8秒'))
        page.locator('#previewPromptIdentity').select_option('reference');expect(page.locator('#footspaPromptText')).to_have_value(re.compile('优先保持对应人物参考图中的面容与穿搭'))
        page.screenshot(path=str(OUT/'action-prompt.png'));page.locator('#modal .close').click()
        page.locator('[data-action-row="footspa:action-06"] .action-visual').click();expect(page.locator('.reference-empty')).to_contain_text('暂无参考视频')
        expect(page.locator('#referencePrompt')).to_be_enabled();page.locator('#modal .close').click()
        checks.append('直接生成动作提示词，人数和进入顺序保留；无视频动作仍可使用')
        row.scroll_into_view_if_needed();page.wait_for_timeout(150);before=page.evaluate('scrollY');url=page.url
        row.locator('[data-select]').check();assert abs(page.evaluate('scrollY')-before)<5;assert page.url==url
        row.locator('[data-field="count"]').fill('3');row.locator('[data-field="count"]').press('Tab')
        expect(row.locator('[data-field="count"]')).to_have_value('3');checks.append('勾选不导航、不滚动到顶部；动作数量独立编辑')
        for width in [1500,1100,760,520,390]:
            page.set_viewport_size({'width':width,'height':940});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.set_viewport_size({'width':1500,'height':940});page.screenshot(path=str(OUT/'production.png'))
        assert page.locator('#prepareActionPrompts').is_enabled();assert page.locator('#generatePrompts').is_disabled()
        page.locator('#prepareActionPrompts').click();page.wait_for_selector('[data-prompt]');expect(page.locator('[data-prompt]')).to_have_count(3)
        with page.expect_download() as pending:page.locator('#exportProjectPrompts').click()
        pending.value.save_as(OUT/'project-prompts.md')
        checks.append('25模板验收与全部导出；8秒和人物身份切换；无底图无视频参数也能走独立提示词生成与导出流程（文本任务为模拟）')
        assert not errors,errors
        print(json.dumps({'checks':checks,'pageErrors':errors,'paidRequests':0,'realProjectWrites':0},ensure_ascii=False))
    except Exception:
        page.screenshot(path=str(OUT/'failure.png'),full_page=True);raise
    finally:
        (OUT/'report.json').write_text(json.dumps({'checks':checks,'pageErrors':errors,'paidRequests':0},ensure_ascii=False,indent=2),encoding='utf8');browser.close()
