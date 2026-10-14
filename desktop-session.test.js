import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {prepareSessionDirectory} from './electron/session-directory.js';
import {AccountStore} from './electron/account-store.js';
test('旧登录分区与账号登记一起迁移，重启保留关联，已有新目录不会被旧数据覆盖',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'session-dir-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const legacy=path.join(root,'legacy');fs.mkdirSync(path.join(legacy,'Partitions','first'),{recursive:true});fs.writeFileSync(path.join(legacy,'Partitions','first','state'),'retained');fs.writeFileSync(path.join(legacy,'Local State'),'browser-state');fs.writeFileSync(path.join(legacy,'doubao-accounts.json'),JSON.stringify({accounts:[{id:'one',managerAccountId:'remote-one'},{id:'two',managerAccountId:'remote-two'}]}));
 // Simulate interrupted copying: directory exists, account registry does not.
 fs.mkdirSync(path.join(root,'data','desktop-session'),{recursive:true});const directory=prepareSessionDirectory(root,legacy);const store=new AccountStore(directory);assert.equal(store.state.accounts.length,2);assert.equal(fs.readFileSync(path.join(directory,'Partitions','first','state'),'utf8'),'retained');store.add({name:'第三个账号'});prepareSessionDirectory(root,legacy);assert.equal(new AccountStore(directory).state.accounts.length,3);assert.equal(new AccountStore(directory).state.accounts[0].managerAccountId,'remote-one');
});
