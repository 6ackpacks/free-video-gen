import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {listContentPacks} from '../content-packs.js';
const root=fileURLToPath(new URL('..',import.meta.url));
const files=fs.readdirSync(root).filter(f=>f.endsWith('.js'));
for(const file of files){const result=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});if(result.status!==0)throw Error(file+'\n'+result.stderr);}
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){const html=fs.readFileSync(path.join(root,file),'utf8');for(const match of html.matchAll(/(?:src|href)="\/([^"?#]+\.(?:js|css))"/g))if(!fs.existsSync(path.join(root,match[1])))throw Error(`${file} 引用不存在的资源 ${match[1]}`);}
const packs=listContentPacks();console.log(`构建检查通过：${files.length} 个 JavaScript 文件、HTML 静态资源、${packs.length} 个内容包。原生应用无需编译转换。`);
