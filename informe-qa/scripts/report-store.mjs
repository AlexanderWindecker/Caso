import {mkdir,readdir,readFile,open,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {validateBackup,reportEvidenceGroups} from '../src/model.js';
const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/i.test(id);
function plain(report){const copy=structuredClone(report);delete copy._diskRevision;return copy;}
async function entries(path){try{return await readdir(path);}catch(e){if(e.code==='ENOENT')return [];throw e;}}
async function atomic(path,value){const temporary=path+'.pending-'+randomUUID(),file=await open(temporary,'wx');try{await file.writeFile(value);await file.sync();}finally{await file.close();}await rename(temporary,path);}
export class ReportStore{
  constructor(root){this.root=root;this.queue=Promise.resolve();}
  locked(fn){const next=this.queue.catch(()=>{}).then(fn);this.queue=next;return next;}
  directory(id){if(!validId(id))throw new Error('Identificador de informe inválido.');return join(this.root,'reports',id);}
  async pack(report){const copy=plain(report);await mkdir(join(this.root,'images'),{recursive:true});for(const group of reportEvidenceGroups(copy))for(const e of group){if(e.dataRef&&!e.data)continue;const digest=hash(e.data),path=join(this.root,'images',digest+'.txt');try{await readFile(path);}catch(error){if(error.code!=='ENOENT')throw error;await atomic(path,e.data);}delete e.data;e.dataRef=digest;}return copy;}
  async unpack(record){const report=structuredClone(record.report);for(const group of reportEvidenceGroups(report))for(const e of group){if(e.data&&!e.dataRef)continue;if(!/^[a-f0-9]{64}$/.test(e.dataRef))throw new Error('Referencia de evidencia inválida.');e.data=await readFile(join(this.root,'images',e.dataRef+'.txt'),'utf8');if(hash(e.data)!==e.dataRef)throw new Error('Una evidencia no coincide con su copia guardada.');delete e.dataRef;}return {...report,_diskRevision:record.revision};}
  async records(id){const dir=this.directory(id),names=(await entries(dir)).filter(n=>/^snapshot-\d{12}-[a-f0-9-]+\.json$/.test(n)).sort();return {dir,names};}
  async latest(id){const {dir,names}=await this.records(id);if(!names.length)return null;return JSON.parse(await readFile(join(dir,names.at(-1)),'utf8'));}
  async get(id){const record=await this.latest(id);return record&&!record.deleted?this.unpack(record):null;}
  async all(){const ids=(await entries(join(this.root,'reports'))).filter(validId),reports=[];for(const id of ids){const report=await this.get(id);if(report)reports.push(report);}return reports;}
  async write(report,baseRevision=null){return this.locked(async()=>{
    validateBackup({format:'caso-qa-v1',reports:[report]});const id=report.uid,dir=this.directory(id),current=await this.latest(id),packed=await this.pack(report),digest=hash(JSON.stringify(canonical(packed)));await mkdir(dir,{recursive:true});
    if(current&&!current.deleted&&current.digest===digest)return this.unpack(current);
    if((current?.revision||null)!==baseRevision){
      const revision=randomUUID();await atomic(join(dir,'conflict-'+Date.now()+'-'+revision+'.json'),JSON.stringify({revision,kind:'conflict',savedAt:new Date().toISOString(),report:packed,digest}));
      const error=new Error('Otra ventana guardó una versión más reciente. Tu borrador quedó protegido en Historial; no se sobrescribió el informe.');error.status=409;throw error;
    }
    const record={revision:randomUUID(),sequence:(current?.sequence||0)+1,savedAt:new Date().toISOString(),report:packed,digest};await atomic(join(dir,`snapshot-${String(record.sequence).padStart(12,'0')}-${record.revision}.json`),JSON.stringify(record));return this.unpack(record);
  });}
  async import(reports){validateBackup({format:'caso-qa-v1',reports});for(const input of reports){let report=plain(input);const record=await this.latest(report.uid);if(record?.deleted){if(report.updated<=record.savedAt)continue;report={...report,uid:randomUUID(),title:report.title+' (copia del navegador)'};}else if(record){const current=await this.unpack(record);if(JSON.stringify(canonical(plain(current)))===JSON.stringify(canonical(report)))continue;report={...report,uid:randomUUID(),title:report.title+' (copia del navegador)'};}await this.write(report,null);}return this.all();}
  async history(id){const dir=this.directory(id),names=(await entries(dir)).filter(n=>/^(snapshot-|conflict-).*\.json$/.test(n)),items=[];for(const name of names){const r=JSON.parse(await readFile(join(dir,name),'utf8'));items.push({revision:r.revision,savedAt:r.savedAt,title:r.report.title,cases:r.report.cases.length,kind:r.deleted?'deleted':r.kind||'saved'});}return items.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));}
  async version(id,revision){if(!validId(revision))throw new Error('Versión inválida.');const dir=this.directory(id),name=(await entries(dir)).find(n=>n.endsWith('-'+revision+'.json'));if(!name)throw new Error('No se encontró esa versión.');return this.unpack(JSON.parse(await readFile(join(dir,name),'utf8')));}
  async remove(id,baseRevision){return this.locked(async()=>{const current=await this.latest(id);if(!current||current.revision!==baseRevision){const error=new Error('El informe cambió en otra ventana. Volvé a abrirlo antes de eliminar.');error.status=409;throw error;}const record={...current,revision:randomUUID(),sequence:current.sequence+1,savedAt:new Date().toISOString(),deleted:true};await atomic(join(this.directory(id),`snapshot-${String(record.sequence).padStart(12,'0')}-${record.revision}.json`),JSON.stringify(record));return {deleted:true};});}
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function storageAPI(store){return async request=>{const u=new URL(request.url),path=u.pathname;if(request.headers.get('origin')&&request.headers.get('origin')!==u.origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Origen no permitido.'},403);if(request.method==='POST'&&(!request.headers.get('content-type')?.includes('application/json')||request.headers.get('origin')!==u.origin))return json({error:'Se requiere una solicitud desde la aplicación.'},403);try{
    if(path==='/api/storage/reports'&&request.method==='GET')return json({reports:await store.all()});
    if(path==='/api/storage/history'&&request.method==='GET'){const versions=[];for(const id of (await entries(join(store.root,'reports'))).filter(validId))versions.push(...(await store.history(id)).map(v=>({...v,uid:id})));return json({versions:versions.sort((a,b)=>b.savedAt.localeCompare(a.savedAt))});}
    if(path==='/api/storage/import'&&request.method==='POST'){const data=await request.json();return json({reports:await store.import(data.reports)});}
    const match=path.match(/^\/api\/storage\/reports\/([a-f0-9-]{36})(?:\/(history|delete|versions\/([a-f0-9-]{36})))?$/i);if(!match)return json({error:'Ruta no encontrada.'},404);const [,id,action,revision]=match;
    if(request.method==='GET'&&action==='history')return json({versions:await store.history(id)});
    if(request.method==='GET'&&revision)return json({report:await store.version(id,revision)});
    if(request.method==='POST'){const data=await request.json();if(action==='delete')return json(await store.remove(id,data.baseRevision));if(!action&&data.report?.uid===id)return json({report:await store.write(data.report,data.baseRevision)});}
    return json({error:'Método no permitido.'},405);
  }catch(error){return json({error:error.message},error.status||400);}};}
