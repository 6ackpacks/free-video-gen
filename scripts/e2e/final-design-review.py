"""Read real catalog, mock every write/media endpoint; inspect production layout."""
import copy, json, re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
BASE='http://127.0.0.1:4192'
OUT=Path('data/e2e-final-design');OUT.mkdir(exist_ok=True)
JOB_ID='11111111-1111-4111-8111-111111111111'
with sync_playwright() as pw:
 browser=pw.chromium.launch(); probe=browser.new_page()
 catalog=probe.request.get(BASE+'/api/studio').json()
 source=next(p for p in catalog['projects'] if p.get('templateTypeId')=='footspa:environment' or p.get('templateTypeId','').endswith(':environment'))
 project=probe.request.get(BASE+'/api/studio/projects/'+source['id']).json();probe.close()
 for asset in catalog['assets']:asset['previewUrl']='/design-assets/visual-environment-v3.webp'
 job={'id':JOB_ID,'projectId':project['id'],'batchId':'review-batch','status':'complete','outputs':['https://fixture.invalid/video.mp4'],'videoRoute':'doubao','templateName':'人物带逛 · 验收夹具','skillName':'人物带逛 · 验收夹具','duration':10,'createdAt':'2026-10-15T02:00:00Z','prompt':'仅测试页面，不生成视频'}
 media=Path('data/e2e-final-design/preview-fixture.mp4').read_bytes()
 results=[]
 for width,height in [(1440,900),(1280,720),(390,844)]:
  ctx=browser.new_context(viewport={'width':width,'height':height});page=ctx.new_page();errors=[];writes=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def intercept(route):
   req=route.request;path=req.url.split(BASE)[-1].split('?')[0]
   if req.method not in ['GET','HEAD']:
    writes.append(path)
    if path=='/api/studio/settings':route.fulfill(status=500,json={'error':'模拟保存失败'});return
    route.fulfill(status=403,json={'error':'界面审查禁止真实写入'});return
   if path=='/api/studio':route.fulfill(json=catalog);return
   if path=='/api/studio/projects/'+project['id']:route.fulfill(json=project);return
   if path=='/api/studio/works':route.fulfill(json=[job]);return
   if path=='/api/studio/promotion-presets':route.fulfill(json=[]);return
   if path=='/api/studio/connections':route.fulfill(json={'values':{},'videoKeyConfigured':True,'textKeyConfigured':True});return
   if path.startswith('/api/video/'):
    if path.endswith('/cache'):route.fulfill(json={'ready':True,'running':False,'bytes':len(media),'totalBytes':len(media)});return
    match=re.match(r'bytes=(\d+)-(\d*)',req.headers.get('range',''))
    if match:
     start=int(match[1]);end=int(match[2]) if match[2] else len(media)-1
     route.fulfill(status=206,body=media[start:end+1],content_type='video/mp4',headers={'Content-Range':f'bytes {start}-{end}/{len(media)}','Accept-Ranges':'bytes'});return
    route.fulfill(body=media,content_type='video/mp4');return
   if path=='/api/jobs/'+JOB_ID:route.fulfill(json=job);return
   if path=='/api/jobs':route.fulfill(json=[job]);return
   if path.startswith('/api/studio/productions/'):route.fulfill(json={'status':'complete'});return
   if path.startswith('/api/video-posters/'):route.fulfill(status=404);return
   route.fulfill(json={})
  ctx.route('**/api/**',intercept)
  page.goto(BASE+'/studio?project='+project['id']+'&step=production',wait_until='networkidle')
  expect(page.locator('.media-open').first).to_be_visible()
  overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth')
  hero=page.locator('.promotion-inputs').bounding_box()
  page.screenshot(path=str(OUT/f'production-{width}.png'),full_page=True)
  page.locator('.media-open').first.click();expect(page.locator('.studio-media-dialog[open]')).to_be_visible()
  expect(page.locator('.studio-media-dialog video')).to_be_visible()
  media_state=page.evaluate('''async()=>{const inline=document.querySelector('#app video'),large=document.querySelector('.studio-media-dialog video');await inline.play();await large.play();return {inlinePaused:inline.paused,previewPaused:large.paused};}''')
  dialog=page.locator('.studio-media-dialog').bounding_box();video=page.locator('.studio-media-dialog video').bounding_box()
  assert media_state['inlinePaused'] and not media_state['previewPaused'],media_state
  assert '?preview=1' in page.locator('.studio-media-dialog video').get_attribute('src')
  page.locator('.studio-media-dialog .wb-toolbar a').scroll_into_view_if_needed()
  toolbar=page.locator('.studio-media-dialog .wb-toolbar').bounding_box()
  buttons=page.locator('.studio-media-dialog .wb-toolbar button,.studio-media-dialog .wb-toolbar a').evaluate_all('''els=>els.map(el=>{const r=el.getBoundingClientRect();return {text:el.textContent,hidden:el.hidden,display:getComputedStyle(el).display,disabled:el.disabled||false,width:r.width,height:r.height,onscreen:r.top>=0&&r.bottom<=innerHeight,hit:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};})''')
  page.screenshot(path=str(OUT/f'preview-viewport-{width}.png'))
  next_enabled=page.locator('.studio-media-dialog [data-next]').is_enabled()
  page.screenshot(path=str(OUT/f'preview-{width}.png'),full_page=True)
  page.get_by_role('button',name='关闭视频预览').click();expect(page.locator('.studio-media-dialog')).to_have_count(0)
  page.goto(BASE+'/settings',wait_until='networkidle')
  visible=page.locator('#app').inner_text()
  assert not re.search(r'TokenDance|APIMart|阿里云百炼|grok',visible),visible
  previous=page.locator('#defaultModelPreference').input_value()
  choices=page.locator('#defaultModelPreference option').evaluate_all('(els)=>els.map(e=>e.value)')
  other=next((v for v in choices if v!=previous),None)
  if other:
   page.locator('#defaultModelPreference').select_option(other)
   expect(page.locator('#toast')).to_contain_text('保存失败')
   expect(page.locator('#defaultModelPreference')).to_have_value(previous)
  settings_overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth')
  page.screenshot(path=str(OUT/f'settings-{width}.png'),full_page=True)
  assert not errors,errors
  results.append({'viewport':[width,height],'productionOverflow':overflow,'inputsTop':hero['y'],'dialog':dialog,'video':video,'mediaState':media_state,'toolbar':toolbar,'buttons':buttons,'settingsOverflow':settings_overflow,'nextEnabled':next_enabled,'errors':errors,'mockedWrites':writes})
  ctx.close()
 browser.close();(OUT/'review.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(results,ensure_ascii=False))
