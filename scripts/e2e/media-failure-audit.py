"""Fault-inject preview and archive failures. No real downloads, writes or providers."""
import copy,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
BASE='http://127.0.0.1:4192';OUT=Path('data/e2e-media-failures');OUT.mkdir(exist_ok=True)
report={'checks':[],'defects':[],'providerCalls':0,'realMutations':0}
with sync_playwright() as pw:
 b=pw.chromium.launch();ctx=b.new_context();page=ctx.new_page();catalog=page.request.get(BASE+'/api/studio').json();errors=[];mode='download-start-failure'
 job={'id':'11111111-1111-4111-8111-111111111111','status':'complete','templateName':'测试成片','outputs':['fixture.mp4'],'duration':10,'createdAt':'2026-10-15T00:00:00Z','sceneId':'food'}
 page.on('pageerror',lambda e:errors.append(str(e)))
 def route(r):
  p=r.request.url.split(BASE)[-1].split('?')[0]
  if p=='/api/studio':r.fulfill(json=catalog);return
  if p=='/api/studio/works':r.fulfill(json=[job]);return
  if p=='/api/workspace-state':r.fulfill(json={'favorite':[]});return
  if p=='/api/jobs/'+job['id']:r.fulfill(json=job);return
  if p=='/api/studio/downloads':
   r.fulfill(status=503 if mode=='download-start-failure' else 200,json={'error':'模拟下载服务不可用'} if mode=='download-start-failure' else {'id':'archive-fixture','total':1,'excluded':0});return
  if p=='/api/studio/downloads/archive-fixture':
   r.fulfill(status=200 if mode=='archive-ready' else 503,json={'ready':True,'complete':1,'total':1,'errors':[]} if mode=='archive-ready' else {'error':'模拟打包状态查询失败'});return
  if p=='/api/video/'+job['id']+'/cache':r.fulfill(status=503,json={'error':'模拟缓存不可用'});return
  if p.startswith('/api/video/') or p.startswith('/api/video-posters/'):r.fulfill(status=404,json={'error':'模拟媒体源已失效'});return
  if r.request.method not in ['GET','HEAD']:raise AssertionError('unexpected mutation '+p)
  r.continue_()
 def guard(r):
  if not r.request.url.startswith(BASE):r.fulfill(status=404,body='External media blocked by audit');return
  route(r)
 ctx.route('**/*',guard)
 page.goto(BASE+'/works',wait_until='networkidle');page.locator('[data-work-check]').check();page.locator('#downloadSelected').click();expect(page.locator('#toast')).to_contain_text('模拟下载服务不可用');assert not errors;report['checks'].append('archive start failure displayed')
 mode='download-poll-failure';errors.clear();page.locator('#downloadSelected').click();expect(page.locator('#downloadState')).to_be_visible();page.wait_for_timeout(400)
 if errors:report['defects'].append({'priority':'P2','issue':'archive polling rejection unhandled; dialog stays preparing with no retry/error','location':'studio-ui.js downloadWorks.poll','errors':errors.copy()})
 expect(page.locator('#downloadState')).to_contain_text('模拟打包状态查询失败');expect(page.locator('#retryWorkDownload')).to_be_visible()
 mode='archive-ready';page.locator('#retryWorkDownload').click();expect(page.locator('#archiveLink')).to_be_visible();expect(page.locator('#archiveLink')).to_have_attribute('href','/api/studio/downloads/archive-fixture/archive');report['checks'].append('archive polling failure and recovery')
 page.locator('#modal .close').click();errors.clear();page.locator('[data-open-work]').first.click();expect(page.locator('.preview-layout video')).to_be_visible();page.wait_for_timeout(700)
 assert page.evaluate('typeof WorkbenchUI.dialog==="function" && typeof WorkbenchUI.preview==="function" && typeof VideoPreview.open==="function"')
 page.locator('.preview-layout video').evaluate('(v)=>{v.load();v.play().catch(()=>{})}')
 expect(page.locator('.studio-media-status')).to_contain_text('视频暂时无法播放');expect(page.locator('.media-reload')).to_be_visible();page.locator('.media-reload').click();report['checks'].append('inline missing source shows recovery controls')
 page.locator('.media-open').click();expect(page.locator('.studio-media-dialog')).to_be_visible();expect(page.locator('.wb-preview-status')).to_contain_text('模拟缓存不可用');expect(page.locator('[data-retry]')).to_be_visible();page.locator('[data-retry]').click();expect(page.locator('.wb-preview-status')).to_contain_text('模拟缓存不可用');report['checks'].append('large preview globals present and cache failure recoverable')
 page.locator('.studio-media-dialog a[download]').click();expect(page.locator('.studio-media-dialog').last.locator('[role=status]')).to_contain_text('下载准备失败：模拟缓存不可用');report['checks'].append('single-video download dialog has no missing global dependency')
 assert not errors,errors
 report['pageErrors']=errors;page.screenshot(path=str(OUT/'missing-video-source.png'),full_page=True);b.close()
OUT.joinpath('report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(report,ensure_ascii=True))
