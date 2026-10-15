"""Inspect only existing local acceptance videos; never submit provider jobs."""
import json,re,subprocess,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'data/release-validation-20261015'
FFMPEG=Path.home()/'Apps/free-video-gen-runtime/ffmpeg.exe'
manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf-8'))
checks=[]
for case in manifest['cases']:
 if case['status']!='complete':continue
 file=ROOT/'data/videos'/f"{case['jobId']}.mp4"
 if not file.exists():continue
 result=subprocess.run([str(FFMPEG),'-hide_banner','-i',str(file)],capture_output=True,encoding='utf-8',errors='replace',creationflags=subprocess.CREATE_NO_WINDOW)
 info=result.stderr
 duration=re.search(r'Duration: (\d+):(\d+):([\d.]+)',info)
 seconds=sum(float(v)*m for v,m in zip(duration.groups(),[3600,60,1])) if duration else None
 requested=case.get('duration') or 10
 record={'type':case['typeId'],'jobId':case['jobId'],'bytes':file.stat().st_size,'requestedDuration':requested,'actualDuration':seconds,'video':next((line.split('Video: ',1)[1] for line in info.splitlines() if 'Video: ' in line),''),'audio':next((line.split('Audio: ',1)[1] for line in info.splitlines() if 'Audio: ' in line),''),'cached':True,'durationMatches':seconds is not None and abs(seconds-requested)<0.5}
 try:
  req=urllib.request.Request(f"http://127.0.0.1:4192/api/video/{case['jobId']}?preview=1",headers={'Range':'bytes=0-1023'})
  with urllib.request.urlopen(req,timeout=45) as response:
   record['rangeStatus']=response.status;record['rangeBytes']=len(response.read());record['contentRange']=response.headers.get('Content-Range')
 except Exception as error:record['rangeError']=str(error)
 frame=OUT/(case['typeId'].replace(':','-')+'-frames.jpg')
 if not frame.exists():
  subprocess.run([str(FFMPEG),'-y','-i',str(file),'-vf',f'fps=3/{requested},scale=180:320,tile=3x1','-frames:v','1',str(frame)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=subprocess.CREATE_NO_WINDOW)
 checks.append(record)
(OUT/'media-checks.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checked':len(checks),'durationMismatch':[v['type'] for v in checks if not v['durationMatches']],'rangeFailures':[v['type'] for v in checks if v.get('rangeStatus')!=206]},ensure_ascii=False))
