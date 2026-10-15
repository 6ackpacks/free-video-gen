"""Real cached MP4 playback and seeking; blocks every write/provider request."""
import json,time
from pathlib import Path
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:4192';OUT=Path('data/release-validation-20261015')
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'));results=[]
with sync_playwright() as pw:
 browser=pw.chromium.launch();context=browser.new_context();page=context.new_page();errors=[]
 page.on('pageerror',lambda error:errors.append(str(error)))
 def guard(route):
  if route.request.url==BASE+'/__media-check':route.fulfill(content_type='text/html',body='<!doctype html><title>Local media check</title>');return
  if route.request.method not in ['GET','HEAD']:raise AssertionError('write blocked '+route.request.url)
  route.continue_()
 context.route('**/*',guard)
 page.goto(BASE+'/__media-check',wait_until='domcontentloaded')
 for case in manifest['cases']:
  if case['status']!='complete' or not (Path('data/videos')/(case['jobId']+'.mp4')).exists():continue
  result=page.evaluate('''async ({id})=>{
   const v=document.createElement('video');v.muted=true;v.playsInline=true;v.controls=true;document.body.append(v);
   let waiting=0;v.addEventListener('waiting',()=>waiting++);const started=performance.now();
   try{
    await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=()=>reject(Error('media '+v.error?.code));v.src='/api/video/'+id+'?preview=1';setTimeout(()=>reject(Error('load timeout')),30000);});
    const loadMs=performance.now()-started;await v.play();
    await new Promise((resolve,reject)=>{const deadline=performance.now()+8000;const tick=()=>v.currentTime>0.7?resolve():performance.now()>deadline?reject(Error('playback stalled')):setTimeout(tick,100);tick();});
    const before=v.getVideoPlaybackQuality?.();const seekStart=performance.now();v.currentTime=v.duration*0.7;
    await new Promise((resolve,reject)=>{v.onseeked=resolve;setTimeout(()=>reject(Error('seek timeout')),10000);});
    const result={loadMs:Math.round(loadMs),seekMs:Math.round(performance.now()-seekStart),duration:v.duration,width:v.videoWidth,height:v.videoHeight,waiting,totalFrames:before?.totalVideoFrames,droppedFrames:before?.droppedVideoFrames};
    v.pause();v.removeAttribute('src');v.load();v.remove();return result;
   }catch(error){v.remove();return {error:error.message};}
  }''',{'id':case['jobId']})
  results.append({'type':case['typeId'],'jobId':case['jobId'],**result})
 browser.close()
report={'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%S'),'videos':results,'pageErrors':errors,'failures':[r for r in results if r.get('error')]}
(OUT/'playback-checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False))
