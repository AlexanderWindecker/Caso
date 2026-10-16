import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const url='http://localhost:4310';
async function running(){try{const response=await fetch(url+'/api/status',{signal:AbortSignal.timeout(600)});const body=await response.json();return typeof body.configured==='boolean';}catch{return false;}}
if(!await running()){
  const server=spawn(process.execPath,['--env-file-if-exists=.env.local',resolve(root,'scripts/serve.mjs')],{cwd:root,detached:true,stdio:'ignore',windowsHide:true});server.unref();
  for(let i=0;i<30&&!await running();i++)await new Promise(r=>setTimeout(r,200));
  if(!await running()){console.error('No se pudo iniciar Caso. Revisá si el puerto 4310 está ocupado.');process.exit(1);}
}
if(!process.argv.includes('--no-open')){
  const opener=process.platform==='win32'?spawn('explorer.exe',[url],{detached:true,stdio:'ignore',windowsHide:true}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{detached:true,stdio:'ignore'});opener.unref();
}
console.log('Caso disponible en '+url);
