import json,time,sqlite3,urllib.request,uuid
from pathlib import Path
from platformdirs import user_data_path
class NativeVideoRunner:
 def run(self,profile_dir,prompt,model,ratio,duration,update,cancel_event,*,mode='t2v',image_paths=None):
  db=sqlite3.connect(Path(user_data_path('DoubaoManager'))/'doupool.sqlite3');row=db.execute('select id from account where profile_dir=?',(str(profile_dir),)).fetchone();db.close()
  if not row:raise RuntimeError('桌面账号没有对应的执行记录')
  db=sqlite3.connect(Path(user_data_path('DoubaoManager'))/'doupool.sqlite3');record=db.execute("select id from videotask where account_id=? and prompt=? and status='starting' order by created_at desc limit 1",(row[0],prompt)).fetchone();db.close()
  if not record:raise RuntimeError('找不到原始任务编号，不能安全提交')
  base='http://127.0.0.1:4192/api/desktop/video-tasks'
  payload={'requestId':record[0],'accountId':row[0],'prompt':prompt,'model':model,'ratio':ratio,'duration':duration,'imagePaths':image_paths or []}
  req=urllib.request.Request(base,data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'},method='POST')
  try:task=json.load(urllib.request.urlopen(req,timeout=30))
  except urllib.error.HTTPError as e:raise RuntimeError('桌面创建被拒绝：'+e.read().decode()[:300])
  except Exception as e:raise RuntimeError('需核对：桌面提交接收状态未知，请按原任务编号查询') from e
  update(remote_task_id=task['id'])
  for _ in range(300):
   if cancel_event.is_set():raise RuntimeError('需核对：调度已暂停，请核对桌面已有视频任务')
   try:task=json.load(urllib.request.urlopen(base+'/'+task['id'],timeout=15))
   except Exception as e:raise RuntimeError('需核对：桌面结果查询中断，不要重新发送') from e
   status=task['status'];update(status='generating' if status=='generating' else 'starting',conversation_id=task.get('conversationId',''),error_message=task.get('message',''))
   if status=='complete':return {'result_url':task['resultUrl'],'fallback_result_url':task['resultUrl'],'conversation_id':task.get('conversationId',''),'remote_task_id':task['id']}
   if status in ('error','needs_review'):raise RuntimeError(('需核对：' if task.get('conversationId') or task.get('sendAttemptedAt') else '')+(task.get('error') or task.get('message') or '请核对豆包会话'))
   time.sleep(5)
  raise RuntimeError('需核对：豆包成片待核对，请查看原会话')
