import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ReportStore} from './report-store.mjs';

const copySuffix=/(?: \(copia del navegador\))+$/;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
function signature(report){const content={...report};for(const key of ['uid','title','created','updated','_diskRevision'])delete content[key];return createHash('sha256').update(JSON.stringify(canonical(content))).digest('hex');}
export async function planBrowserCopies(store){
  const active=await store.all(),originals=active.filter(report=>!copySuffix.test(report.title)),plan=[];
  for(const copy of active.filter(report=>copySuffix.test(report.title))){
    const baseTitle=copy.title.replace(copySuffix,''),digest=signature(await store.pack(copy));let match;
    for(const original of originals){
      const {dir,names}=await store.records(original.uid);
      for(const name of names){const record=JSON.parse(await readFile(join(dir,name),'utf8'));
        if(!record.deleted&&record.report.title===baseTitle&&signature(record.report)===digest){match={originalUid:original.uid,originalRevision:record.revision};break;}
      }
      if(match)break;
    }
    if(match)plan.push({copyUid:copy.uid,copyRevision:copy._diskRevision,title:copy.title,...match});
  }
  return plan;
}
export async function archiveBrowserCopies(store,plan){
  const archived=[];
  for(const item of plan){
    const original=await store.get(item.originalUid);if(!original)continue;
    // Recheck the contents and revision immediately before archiving the copy.
    const copy=await store.get(item.copyUid),historical=await store.version(item.originalUid,item.originalRevision);
    if(!copy||copy._diskRevision!==item.copyRevision||copy.title.replace(copySuffix,'')!==historical.title||signature(copy)!==signature(historical))continue;
    try{await store.remove(item.copyUid,item.copyRevision);archived.push(item.copyUid);}catch(error){if(error.status!==409)throw error;}
  }
  return archived;
}
async function main(){
  const store=new ReportStore(fileURLToPath(new URL('../data/',import.meta.url))),plan=await planBrowserCopies(store);
  console.log(JSON.stringify({action:'preview',copies:plan.map(p=>({uid:p.copyUid,title:p.title,originalUid:p.originalUid}))},null,2));
  if(!process.argv.includes('--apply')||!plan.length)return;
  const root=fileURLToPath(new URL('../recovery/',import.meta.url));await mkdir(root,{recursive:true});
  const manifest=join(root,'browser-copies-'+randomUUID()+'.json');await writeFile(manifest,JSON.stringify({created:new Date().toISOString(),plan},null,2));
  const archived=await archiveBrowserCopies(store,plan);
  await writeFile(manifest,JSON.stringify({created:new Date().toISOString(),plan,archived},null,2));
  console.log(JSON.stringify({archived:archived.length,active:(await store.all()).length,manifest}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
