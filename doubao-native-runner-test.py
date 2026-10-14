import importlib.util,unittest,tempfile,sqlite3,json,io,threading
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('native_runner','doubao-native-runner.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Tests(unittest.TestCase):
 def test_directory_change_keeps_task_account(self):
  with tempfile.TemporaryDirectory() as root:
   db=sqlite3.connect(Path(root)/'doupool.sqlite3');db.execute('create table videotask(id text,account_id text,prompt text,status text,created_at text)');db.execute("insert into videotask values('task-original','account-original','prompt','starting','today')");db.commit();db.close()
   responses=[io.BytesIO(json.dumps({'id':'native-id'}).encode()),io.BytesIO(json.dumps({'status':'complete','resultUrl':'https://example.com/result.mp4','conversationId':'conversation'}).encode())]
   with patch.object(module,'user_data_path',return_value=root),patch.object(module.urllib.request,'urlopen',side_effect=responses) as request:
    result=module.NativeVideoRunner().run(Path(root)/'old-profile-directory','prompt','seedance_v2.0_mini','9:16',5,lambda **kw:None,threading.Event())
    payload=json.loads(request.call_args_list[0].args[0].data);self.assertEqual(payload['accountId'],'account-original');self.assertEqual(payload['requestId'],'task-original');self.assertEqual(result['remote_task_id'],'native-id')
 def test_ambiguous_task_does_not_send(self):
  with tempfile.TemporaryDirectory() as root:
   db=sqlite3.connect(Path(root)/'doupool.sqlite3');db.execute('create table videotask(id text,account_id text,prompt text,status text,created_at text)');db.executemany('insert into videotask values(?,?,?,?,?)',[(str(i),'account','prompt','starting','today') for i in range(2)]);db.commit();db.close()
   with patch.object(module,'user_data_path',return_value=root),patch.object(module.urllib.request,'urlopen') as request:
    with self.assertRaisesRegex(RuntimeError,'唯一'):module.NativeVideoRunner().run(Path(root),'prompt','seedance_v2.0_mini','9:16',5,lambda **kw:None,threading.Event())
    request.assert_not_called()
if __name__=='__main__':unittest.main()
