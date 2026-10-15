"""Real read-only release gallery, locally mocked media; never generate/cache."""
import json,re
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4192';OUT=Path('data/e2e-final-design');MEDIA=(OUT/'preview-fixture.mp4').read_bytes()
results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch()
 for width,height in [(1440,900),(1280,720),(390,844)]:
  ctx=browser.new_context(viewport={'width':width,'height':height});page=ctx.new_page();errors=[];blocked=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  def intercept(route):
   req=route.request;path=req.url.split(BASE)[-1].split('?')[0]
   if req.method not in ['GET','HEAD']:blocked.append(path);route.fulfill(status=403,json={'error':'只读审查'});return
   if path.startswith('/api/video-posters/'):
    route.fulfill(body=Path('design-assets/visual-environment-v3.webp').read_bytes(),content_type='image/webp');return
   if path.startswith('/api/video/'):
    if path.endswith('/cache'):route.fulfill(json={'ready':True,'bytes':len(MEDIA),'running':False});return
    match=re.match(r'bytes=(\d+)-(\d*)',req.headers.get('range',''))
    if match:
     start=int(match[1]);end=int(match[2]) if match[2] else len(MEDIA)-1
     route.fulfill(status=206,body=MEDIA[start:end+1],content_type='video/mp4',headers={'Content-Range':f'bytes {start}-{end}/{len(MEDIA)}','Accept-Ranges':'bytes'});return
    route.fulfill(body=MEDIA,content_type='video/mp4');return
   route.continue_()
  ctx.route('**/api/**',intercept)
  page.goto(BASE+'/works?release=20261015',wait_until='networkidle');expect(page.locator('#releaseTotal')).not_to_contain_text('正在读取')
  total=page.locator('.release-video-card').count();label=page.locator('#releaseTotal').inner_text()
  overflow=page.evaluate('document.documentElement.scrollWidth>innerWidth')
  page.screenshot(path=str(OUT/f'release-{width}.png'),full_page=True)
  page.locator('#releaseIndustry').select_option('footspa');page.wait_for_timeout(100)
  footspa=page.locator('.release-video-card').count()
  page.locator('#releaseFilter').select_option('complete');page.wait_for_timeout(100)
  ready=page.locator('[data-release-play]:not([disabled])').count()
  if ready:
   page.locator('[data-release-play]:not([disabled])').first.click();expect(page.locator('.studio-media-dialog video')).to_be_visible()
   expect(page.locator('.studio-media-dialog [data-retry]')).not_to_be_visible()
   playlist=page.locator('.studio-media-dialog [data-position]').inner_text()
   assert int(playlist.split('/')[-1].strip())==ready,(playlist,ready)
   expect(page.locator('.studio-media-dialog .wb-preview-title')).to_contain_text('足浴')
   page.screenshot(path=str(OUT/f'release-preview-{width}.png'))
   page.get_by_role('button',name='关闭视频预览').click()
   page.locator('[data-release-mark$=":adjust"]').first.click()
   page.locator('#releaseFilter').select_option('adjust');page.wait_for_timeout(100)
   marked=page.locator('.release-video-card').count();assert marked>=1
  else:playlist='no completed footspa';marked=0
  assert not errors,errors;assert not blocked,blocked
  results.append({'viewport':[width,height],'label':label,'totalCards':total,'footspaCards':footspa,'readyFootspa':ready,'markedCards':marked,'playlist':playlist,'overflow':overflow,'errors':errors,'blockedWrites':blocked})
  ctx.close()
 browser.close()
(OUT/'release-review.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(results,ensure_ascii=False))
