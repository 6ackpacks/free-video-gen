import os
import copy,json,re,uuid
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE=os.environ.get('E2E_BASE_URL','http://127.0.0.1:4192');OUT=Path('data/e2e-creative');OUT.mkdir(exist_ok=True)
with sync_playwright() as pw:
    b=pw.chromium.launch();context=b.new_context(viewport={'width':1500,'height':940});page=context.new_page();page.set_default_timeout(8000)
    catalog=copy.deepcopy(page.request.get(BASE+'/api/studio').json());projects={};submitted=[];image_requests=[];errors=[];checks=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    catalog['assets']=[{'id':id,'name':name,'type':'upload','confirmed':True,'previewUrl':'/design-assets/scene-story.webp','scene':'jewelry'} for id,name in [('product','真实产品图'),('person','人物图'),('scene','场景图'),('frame','合成关键帧')]]
    def route(r):
        req=r.request;path=req.url.split(BASE)[-1].split('?')[0]
        if path=='/api/studio':r.fulfill(json={**catalog,'projects':list(projects.values())});return
        if path=='/api/references' and req.method=='POST':
            body=req.post_data_json;assert body['base64'] and body['mime']=='image/webp'
            asset={'id':'uploaded-product','name':body['name'],'type':'upload','confirmed':True,'previewUrl':'/design-assets/scene-story.webp','scene':'jewelry'};catalog['assets'].append(asset);r.fulfill(json=asset);return
        if path.startswith('/api/studio/assets/') and req.method=='PATCH':r.fulfill(json={'confirmed':True});return
        if path=='/api/studio/projects' and req.method=='POST':
            value=req.post_data_json
            if not value.get('id'):value={'id':str(uuid.uuid4()),'stage':'templates','createdAt':'2026-10-13T00:00:00Z','updatedAt':'2026-10-13T00:00:00Z','trials':[],'submissions':[],**value}
            previous=projects.get(value['id'],{})
            for plan in value['plans']:
                old=next((p for p in previous.get('plans',[]) if p['id']==plan['id']),{});plan.setdefault('prompts',old.get('prompts',[]));plan.setdefault('snapshot',next(t for t in catalog['templates'] if t['id']==plan['templateId']))
            projects[value['id']]=value;r.fulfill(json=value);return
        m=re.match(r'/api/studio/projects/([^/]+)(?:/(prompts|submit))?$',path)
        if m and m[1] in projects:
            project=projects[m[1]]
            if req.method=='GET':r.fulfill(json={**project,'readiness':{'count':sum(p['count'] for p in project['plans']),'ready':1,'errors':[]},'adopted':[]});return
            body=req.post_data_json
            if m[2]=='prompts':
                for update in body['plans']:next(p for p in project['plans'] if p['id']==update['id']).update(update)
                r.fulfill(json=project);return
            if m[2]=='submit':submitted.append(body);r.fulfill(json={'id':'e2e-video'});return
        if path=='/api/studio/images' and req.method=='POST':image_requests.append(req.post_data_json);r.fulfill(status=400,json={'error':'E2E已拦截真实生图'});return
        if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected write '+path)
        r.continue_()
    context.route('**/api/**',route)
    try:
        page.goto(BASE+'/templates',wait_until='networkidle')
        assert page.locator('[data-type-card="massage:service"]').count()==1
        expect(page.locator('[data-type-card="massage:service"]')).to_contain_text('按摩护理展示')
        assert '待接入' not in page.locator('#app').inner_text()
        page.locator('[data-type-card="common:avatar-talk"] a.primary').click();page.locator('[data-project-industry=jewelry]').click();page.locator('#enterProject').click();page.wait_for_selector('#creativeMaterials')
        p=next(iter(projects.values()));pid=p['id'];assert p['templateTypeId']=='jewelry:avatar-talk'
        assert page.locator('[data-upload-role]').count()==3
        expect(page.locator('#generatePrompts')).to_contain_text('补充产品图与文案')
        page.locator('[data-product-field=name]').fill('银色项链');page.locator('[data-product-field=sellingPoints]').fill('银色外观，真实礼盒');page.locator('[data-product-field=script]').fill('这是我们的银色项链，包装如图。')
        for role,id in [('productImageIds','product'),('personImageIds','person'),('sceneImageIds','scene')]:
            page.locator('[data-pick-role='+role+']').click();page.locator('[data-common-id='+id+']').click();expect(page.locator('#creativeMaterials .role-thumbs img')).to_have_count(['product','person','scene'].index(id)+1)
        assert projects[pid]['materials']=={'productImageIds':['product'],'personImageIds':['person'],'sceneImageIds':['scene']}
        with page.expect_file_chooser() as chooser:page.locator('[data-upload-role=productImageIds]').click()
        chooser.value.set_files(str(Path('design-assets/scene-story.webp').resolve()))
        expect(page.locator('#creativeMaterials .role-thumbs img')).to_have_count(4)
        assert projects[pid]['materials']['productImageIds']==['product','uploaded-product']
        page.locator('[data-select]').check();page.locator('#projectVideoRoute').select_option('wan-tokendance');page.locator('#projectRatio').select_option('9:16');page.locator('#projectResolution').select_option('720P');page.locator('#projectReferenceMode').select_option('reference-image')
        page.locator('#commonAssets').click();page.locator('[data-common-id=frame]').click()
        expect(page.locator('#generatePrompts')).to_be_enabled()
        page.locator('[data-product-field=name]').fill('');expect(page.locator('#generatePrompts')).to_be_disabled()
        page.locator('[data-product-field=name]').fill('银色项链');expect(page.locator('#generatePrompts')).to_be_enabled()
        page.screenshot(path=str(OUT/'avatar-inputs.png'),full_page=False)
        page.reload(wait_until='networkidle');expect(page.locator('[data-product-field=name]')).to_have_value('银色项链');expect(page.locator('#creativeMaterials .role-thumbs img')).to_have_count(4)
        assert page.locator('#projectVideoRoute').input_value()==''
        page.locator('#avatarMode').select_option('audio-driven');expect(page.locator('#avatarAudioUrl')).to_be_visible();page.locator('#avatarAudioUrl').fill('https://assets.example/voice.mp3');page.wait_for_timeout(650);assert projects[pid]['audioUrl'].endswith('voice.mp3')
        page.locator('#avatarMode').select_option('native');page.wait_for_timeout(650)
        for plan in projects[pid]['plans']:plan['prompts']=['已确认口播'];plan['promptsDirty']=False
        page.locator('#promptTab').click();page.locator('#trial').click();f=page.locator('#submitParameters')
        for key,value in [('videoRoute','wan-tokendance'),('ratio','9:16'),('resolution','720P'),('referenceMode','reference-image')]:f.locator('[name='+key+']').select_option(value)
        f.locator('[type=submit]').click();page.wait_for_selector('#confirmSubmit');page.locator('#confirmSubmit').click();page.wait_for_url('**/works?project=*')
        assert len(submitted)==1 and submitted[0]['generationSettings']['referenceMode']=='reference-image'
        checks.append('数字人口播可创建制作项目；三类素材绑定、文案、保存恢复、配音方式切换与模拟提交')
        page.goto(BASE+'/studio?new=1&group=common:service&industry=jewelry&direction=unboxing-review',wait_until='networkidle');page.locator('#enterProject').click();page.wait_for_selector('#creativeMaterials')
        pp=next(reversed(projects.values()));assert pp['videoDirection']=='unboxing-review'
        page.locator('[data-recipe-link=continuous-commercial]').click();page.wait_for_timeout(250);assert next(reversed(projects.values()))['videoDirection']=='continuous-commercial'
        checks.append('视频方向带入项目，点击后实际修改项目要求')
        page.goto(BASE+'/studio?new=1&group=massage:service',wait_until='networkidle');page.locator('#enterProject').click();page.wait_for_selector('[data-massage-field=bodyArea]')
        assert page.locator('[data-product-field=name]').count()==0
        page.locator('[data-massage-field=bodyArea]').select_option('足部');page.locator('[data-massage-field=position]').fill('顾客坐姿，脚放软垫上');page.locator('[data-massage-field=contact]').fill('双手保持正确接触，连续轻柔护理');page.wait_for_timeout(650)
        assert next(reversed(projects.values()))['massageSpec']['bodyArea']=='足部'
        assert page.locator('[data-select]').count()>=6
        page.screenshot(path=str(OUT/'massage-special.png'),full_page=False)
        for width in [1500,1100,760,520,390]:page.set_viewport_size({'width':width,'height':940});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        checks.append('按摩特色模板与护理部位、姿态、接触要求保存；原动作保留；响应式布局')
        assert not errors,errors;print(json.dumps({'checks':checks,'pageErrors':errors,'paidRequests':0},ensure_ascii=False))
    except Exception:
        page.screenshot(path=str(OUT/'failure.png'),full_page=True);(OUT/'failure.txt').write_text(page.locator('body').inner_text(),encoding='utf-8');raise
    finally:
        (OUT/'report.json').write_text(json.dumps({'checks':checks,'pageErrors':errors},ensure_ascii=False,indent=2),encoding='utf-8');b.close()
