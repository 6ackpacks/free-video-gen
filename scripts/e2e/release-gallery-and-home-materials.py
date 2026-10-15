"""Release review gallery and home-massage role controls, fully mocked mutations/media."""
import base64,copy,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4192';OUT=Path('data/e2e-release-gallery');OUT.mkdir(exist_ok=True)
report={'checks':[],'pageErrors':[],'realMutations':0,'providerCalls':0}
with sync_playwright() as pw:
 b=pw.chromium.launch();ctx=b.new_context(viewport={'width':1440,'height':1000});page=ctx.new_page();catalog=page.request.get(BASE+'/api/studio').json();fixture=copy.deepcopy(catalog);fixture['projects']=[];fixture['assets']=[];fixture['imageTasks']=[]
 jobs=[];errors=[];writes=[];cache_ids=[];batch_reads=[];works_error=False
 page.on('pageerror',lambda e:errors.append(str(e)))
 ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444']
 for i,type_id in enumerate(['footspa:environment','food:service','ktv:environment','massage:service']):
  t=next(t for t in catalog['templateTypes'] if t['id']==type_id);template=next(v for v in catalog['templates'] if v['id']==t['actionIds'][0]);p={'id':'release-fixture-'+str(i),'name':'验收·'+type_id,'templateTypeId':type_id,'industryId':t['industryId'],'scene':t['scene'],'plans':[{'id':'plan'+str(i),'templateId':template['id'],'snapshot':template,'imageIds':[]} ]};fixture['projects'].append(p)
  jobs.append({'id':ids[i],'projectId':p['id'],'batchId':'different-batch-'+str(i),'templateName':template['name'],'status':['complete','complete','error','queued'][i],'outputs':['fixture.mp4'] if i<2 else [],'duration':10,'createdAt':'2026-10-15T00:00:00Z','error':'模拟生成失败' if i==2 else ''})
 def route(r):
  global works_error
  req=r.request;p=req.url.split(BASE)[-1].split('?')[0]
  if not req.url.startswith(BASE):r.fulfill(status=404,body='Blocked external media');return
  if p=='/api/studio':r.fulfill(json=fixture);return
  if p=='/api/studio/works':r.fulfill(status=503 if works_error else 200,json={'error':'模拟读取失败'} if works_error else jobs);return
  if p.startswith('/api/jobs/'):
   r.fulfill(json=next(j for j in jobs if j['id']==p.rsplit('/',1)[1]));return
  if p=='/api/jobs':batch_reads.append(req.url);r.fulfill(json=[]);return
  if p.startswith('/api/video/') and p.endswith('/cache'):
   cache_ids.append(p.split('/')[3]);r.fulfill(json={'ready':True});return
  if p.startswith('/api/video/') or p.startswith('/api/video-posters/'):
   r.fulfill(status=404,json={'error':'Fixture media unavailable'});return
  if p=='/api/references' and req.method=='POST':
   asset={'id':'uploaded-role','name':req.post_data_json['name'],'type':'upload','confirmed':True,'previewUrl':'/design-assets/visual-generic-v3.webp'};fixture['assets'].append(asset);writes.append(p);r.fulfill(json=asset);return
  if p.startswith('/api/studio/assets/') and req.method=='PATCH':writes.append(p);r.fulfill(json={'confirmed':True});return
  if p=='/api/studio/projects' and req.method=='POST':
   incoming=req.post_data_json;fixture['projects']=[v for v in fixture['projects'] if v['id']!=incoming['id']]+[incoming];writes.append(p);r.fulfill(json=incoming);return
  if p.startswith('/api/studio/projects/') and req.method=='GET':r.fulfill(json=next(v for v in fixture['projects'] if v['id']==p.rsplit('/',1)[1]));return
  if req.method not in ['GET','HEAD']:raise AssertionError('Unexpected mutation '+p)
  if p.startswith('/api/'):r.fulfill(json=[]);return
  r.continue_()
 ctx.route('**/*',route)
 page.goto(BASE+'/works?release=20261015',wait_until='networkidle');expect(page.locator('#releaseTotal')).to_contain_text('2 / 27');expect(page.locator('.release-video-card')).to_have_count(27)
 page.locator('#releaseFilter').select_option('complete');expect(page.locator('.release-video-card')).to_have_count(2)
 page.locator('#releaseIndustry').select_option('food');expect(page.locator('.release-video-card')).to_have_count(1);page.locator('#releaseIndustry').select_option('')
 page.locator('[data-release-mark="'+ids[0]+':good"]').click();expect(page.locator('[data-release-mark="'+ids[0]+':good"]')).to_have_attribute('aria-pressed','true');assert page.evaluate('(id)=>localStorage.getItem("release-review:"+id)',ids[0])=='good'
 page.locator('[data-release-mark="'+ids[1]+':adjust"]').click();page.locator('#releaseFilter').select_option('adjust');expect(page.locator('.release-video-card')).to_have_count(1)
 page.reload(wait_until='networkidle');expect(page.locator('[data-release-mark="'+ids[0]+':good"]')).to_have_attribute('aria-pressed','true');expect(page.locator('[data-release-mark="'+ids[1]+':adjust"]')).to_have_attribute('aria-pressed','true')
 report['checks'].append('industry/status filters and verdict localStorage survive reload')
 page.locator('[data-release-play="'+ids[0]+'"]').click();expect(page.locator('[data-position]')).to_have_text('1 / 2');page.locator('[data-next]').click();expect(page.locator('[data-position]')).to_have_text('2 / 2');expect(page.locator('[data-next]')).to_be_disabled();page.locator('[data-prev]').click();expect(page.locator('[data-position]')).to_have_text('1 / 2');assert ids[1] in cache_ids;assert not batch_reads
 page.locator('.studio-media-dialog header button').click();report['checks'].append('playlist previous/next spans separate batch IDs without batch lookup')
 page.locator('#releaseFilter').select_option('error');expect(page.locator('.release-video-card')).to_have_count(1);expect(page.locator('#releaseVideos')).to_contain_text('模拟生成失败');works_error=True;page.locator('#releaseRefresh').click();expect(page.locator('#releaseFeedback')).to_contain_text('模拟读取失败');works_error=False;page.locator('#releaseRefresh').click();expect(page.locator('#releaseFeedback')).to_contain_text('任务自动更新');report['checks'].append('failed job filter and refresh failure recovery')
 # Home-massage role upload and removal affect associations only.
 t=next(v for v in catalog['templates'] if v['id']=='massage:home-pov-full')
 p={'id':'home-role-fixture','name':'护理素材验收','scene':'massage','industryId':'massage','templateTypeId':'massage:service','stage':'templates','plans':[{'id':'home-plan','templateId':t['id'],'snapshot':t,'count':1,'duration':10,'videoRoute':'doubao','resolution':'720P','ratio':'9:16','referenceMode':'first-frame','imageIds':[],'mapping':'common','rows':[],'shotImages':[],'prompts':[]}],'materials':{'sceneImageIds':['scene'],'personImageIds':['person'],'productImageIds':[]},'massageSpec':{'homeScene':'sofa'},'trials':[],'submissions':[]}
 fixture['projects'].append(p);fixture['assets']=[{'id':id,'type':'upload','confirmed':True,'name':id,'previewUrl':'/design-assets/visual-generic-v3.webp'} for id in ['scene','person']]
 page.goto(BASE+'/studio?project=home-role-fixture&step=production',wait_until='networkidle');expect(page.locator('[data-home-remove]')).to_have_count(2);page.locator('[data-home-preview="scene"]').click();expect(page.locator('#modal .big-preview')).to_be_visible();page.locator('#modal .close').click()
 png=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1cAAAAASUVORK5CYII=')
 with page.expect_file_chooser() as choice:page.locator('[data-home-upload="sceneImageIds"]').click()
 choice.value.set_files({'name':'家庭新图.png','mimeType':'image/png','buffer':png});expect(page.locator('[data-home-remove]')).to_have_count(3)
 page.locator('[data-home-remove="sceneImageIds:uploaded-role"]').click();expect(page.locator('[data-home-remove]')).to_have_count(2)
 saved=next(v for v in fixture['projects'] if v['id']==p['id']);assert saved['materials']['sceneImageIds']==['scene'];assert saved['materials']['personImageIds']==['person'];assert any(a['id']=='uploaded-role' for a in fixture['assets'])
 page.reload(wait_until='networkidle');expect(page.locator('[data-home-remove]')).to_have_count(2);report['checks'].append('home role preview/upload/removal persists without deleting asset or other role')
 assert not errors,errors;report['pageErrors']=errors;report['mockedWrites']=len(writes);b.close()
OUT.joinpath('report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=True))
