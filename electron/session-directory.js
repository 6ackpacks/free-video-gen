import fs from 'node:fs';
import path from 'node:path';
// Copy the account registry last so an interrupted migration is retried, never treated as empty.
export function prepareSessionDirectory(projectRoot,legacy){
 const directory=path.join(projectRoot,'data','desktop-session'),registry=path.join(directory,'doubao-accounts.json');
 if(fs.existsSync(registry))return directory;
 fs.mkdirSync(directory,{recursive:true});
 for(const name of ['Partitions','Local State','desktop-video-tasks.json']){const source=path.join(legacy,name);if(fs.existsSync(source))fs.cpSync(source,path.join(directory,name),{recursive:true,force:true});}
 if(fs.existsSync(path.join(legacy,'doubao-accounts.json')))fs.copyFileSync(path.join(legacy,'doubao-accounts.json'),registry);
 return directory;
}
