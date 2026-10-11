import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {hasSecret} from './secrets.js';
const fields=['APIMART_BASE_URL','IMAGE_MODEL','VIDEO_MODEL','PROMPT_MODEL','SCENE_ANALYSIS_MODEL','TEXT_PROVIDER','TOKENDANCE_CHAT_BASE_URL','TOKENDANCE_PROMPT_MODEL','TOKENDANCE_VISION_MODEL'];
export function loadStudioConnections(root){const file=path.join(root,'data','studio-connections.json');if(!fs.existsSync(file))return;const saved=JSON.parse(fs.readFileSync(file,'utf8'));for(const key of [...fields,'VIDEO_API_KEY_DPAPI_FILE','TOKENDANCE_API_KEY_DPAPI_FILE'])if(Object.hasOwn(saved,key))process.env[key]=saved[key];}
export function publicConnections(){return {values:Object.fromEntries(fields.map(k=>[k,process.env[k]||''])),videoKeyConfigured:hasSecret('VIDEO'),textKeyConfigured:hasSecret('TOKENDANCE')};}
export function saveStudioConnections(root,input){
  if(input.values?.TEXT_PROVIDER==='tokendance'&&!input.textKey&&!hasSecret('TOKENDANCE'))throw Error('请先填写文本服务密钥');
  const file=path.join(root,'data','studio-connections.json'),saved=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};
  for(const key of fields)if(input.values?.[key]!==undefined){const value=String(input.values[key]).trim();if(value.length>250||/[\r\n]/.test(value))throw Error('配置值无效');if(key.endsWith('BASE_URL')&&value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw Error('服务地址必须使用 HTTPS，密钥请在独立字段填写');}if(key==='TEXT_PROVIDER'&&!['','tokendance'].includes(value))throw Error('文本服务配置无效');saved[key]=value;}
  for(const [prefix,key] of [['VIDEO','videoKey'],['TOKENDANCE','textKey']])if(input[key]){
    if(process.platform!=='win32')throw Error('当前平台需通过现有安全密钥配置工具保存');
    const filename=path.join(root,'data',prefix.toLowerCase()+'-studio-'+randomUUID()+'.dpapi');
    const script='$text=[Console]::In.ReadToEnd(); $secure=ConvertTo-SecureString -String $text -AsPlainText -Force; ConvertFrom-SecureString $secure | Set-Content -LiteralPath $env:STUDIO_SECRET_FILE -NoNewline';
    const result=spawnSync(path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{input:String(input[key]),encoding:'utf8',env:{...process.env,STUDIO_SECRET_FILE:filename}});
    if(result.status!==0)throw Error('Windows 加密保存失败');
    saved[prefix+'_API_KEY_DPAPI_FILE']=filename;
  }
  fs.writeFileSync(file+'.tmp',JSON.stringify(saved,null,2));fs.renameSync(file+'.tmp',file);for(const key of [...fields,'VIDEO_API_KEY_DPAPI_FILE','TOKENDANCE_API_KEY_DPAPI_FILE'])if(Object.hasOwn(saved,key))process.env[key]=saved[key];for(const [prefix,key] of [['VIDEO','videoKey'],['TOKENDANCE','textKey']])if(input[key]){delete process.env[prefix+'_API_KEY'];delete process.env[prefix+'_API_KEY_FILE'];}return publicConnections();
}
