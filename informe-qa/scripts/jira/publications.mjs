import {mkdir,readFile,rename,open,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {bugEntries} from '../../src/model.js';
import {prepareWithAgent} from './agents/orchestrator.mjs';

const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const fingerprint=(report,entry)=>{const bug={...entry.bug};delete bug.jiraPublication;return hash(JSON.stringify({reportUid:report.uid,app:report.app,version:report.version,omitted:report.omittedFields,ticket:report.ticket,bug,steps:entry.steps,evidence:entry.evidence}));};
const publicRecord=record=>record?Object.fromEntries(['publicationId','projectKey','key','url','status','updatedAt','error','uploaded','total','evidence','attachments'].filter(k=>record[k]!==undefined).map(k=>[k,record[k]])):null;
const safeError=error=>String(error.message||'No se pudo completar la operación con Jira.').slice(0,1800);
export class JiraPublications{
  constructor({root,reports,mcp}){this.root=root;this.reports=reports;this.mcp=mcp;this.prepared=new Map();}
  file(reportUid,bugUid){if(!uuid(reportUid)||!uuid(bugUid))throw new Error('Identificador de informe o bug inválido.');return join(this.root,reportUid+'-'+bugUid+'.json');}
  async load(reportUid,bugUid){try{return JSON.parse(await readFile(this.file(reportUid,bugUid),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  async save(reportUid,bugUid,record){await mkdir(this.root,{recursive:true});record.updatedAt=new Date().toISOString();const path=this.file(reportUid,bugUid),temporary=path+'.'+randomUUID()+'.pending',file=await open(temporary,'wx');try{await file.writeFile(JSON.stringify(record));await file.sync();}finally{await file.close();}await rename(temporary,path);}
  async entry(reportUid,bugUid){
    this.file(reportUid,bugUid);const report=await this.reports.get(reportUid);if(!report)throw new Error('El informe no está guardado o fue eliminado.');
    const entry=bugEntries(report).find(e=>e.uid===bugUid);if(!entry)throw new Error('El bug no está activo o fue eliminado.');return {report,entry};
  }
  async status(reportUid,bugUid){const {entry}=await this.entry(reportUid,bugUid);return publicRecord(await this.load(reportUid,bugUid)||entry.bug.jiraPublication);}
  async prepare(reportUid,bugUid){
    const {report,entry}=await this.entry(reportUid,bugUid);
    const publication=await this.status(reportUid,bugUid);
    if(publication?.key)return {publication,alreadyCreated:true};
    const plan=await prepareWithAgent(report,entry,this.mcp),preparationId=randomUUID();
    for(const [id,p] of this.prepared)if(p.expires<Date.now())this.prepared.delete(id);
    if(this.prepared.size>=10)this.prepared.delete(this.prepared.keys().next().value);
    this.prepared.set(preparationId,{reportUid,bugUid,fingerprint:fingerprint(report,entry),plan,expires:Date.now()+10*60*1000});
    const {payload,selectedEvidence,...preview}=plan;
    return {...preview,preparationId,publication};
  }
  async lock(reportUid,bugUid,action){
    await mkdir(this.root,{recursive:true});const path=this.file(reportUid,bugUid)+'.lock';
    let handle;
    try{handle=await open(path,'wx');}catch(error){
      if(error.code!=='EEXIST')throw error;
      let stale=false;try{const owner=JSON.parse(await readFile(path,'utf8'));if(Number.isInteger(owner.pid)&&owner.pid>0){try{process.kill(owner.pid,0);}catch(e){stale=e.code==='ESRCH';}}}catch{}
      if(!stale){const busy=new Error('Este bug ya se está publicando. Esperá y consultá su estado.');busy.status=409;throw busy;}
      await unlink(path);handle=await open(path,'wx');
    }
    try{await handle.writeFile(JSON.stringify({pid:process.pid}));return await action();}finally{await handle.close();await unlink(path).catch(()=>{});}
  }
  async publish(reportUid,bugUid,preparationId){return this.lock(reportUid,bugUid,async()=>{
    let record=await this.load(reportUid,bugUid);
    const {report,entry}=await this.entry(reportUid,bugUid);
    // A restored report retains the link and cannot create a second ticket for that bug.
    if(!record&&entry.bug.jiraPublication?.publicationId){record={...entry.bug.jiraPublication};record.marker='qaexport'+record.publicationId.replaceAll('-','');await this.save(reportUid,bugUid,record);}
    if(record?.key)return this.attachRemaining(reportUid,bugUid,record,entry);
    if(record&&['creating','unknown'].includes(record.status)){
      const found=await this.mcp.call('qaJiraFindPublication',{projectKey:record.projectKey,marker:record.marker});
      if(!found){record.status='unknown';record.error='Jira todavía no confirmó el resultado. Volvé a consultar más tarde; no se creará otro ticket.';await this.save(reportUid,bugUid,record);return publicRecord(record);}
      Object.assign(record,found,{status:'attachments_pending',error:''});await this.save(reportUid,bugUid,record);return this.attachRemaining(reportUid,bugUid,record,entry);
    }
    const prepared=this.prepared.get(preparationId);
    if(!prepared||prepared.expires<Date.now()||prepared.reportUid!==reportUid||prepared.bugUid!==bugUid||prepared.fingerprint!==fingerprint(report,entry))throw new Error('El bug cambió o la vista previa venció. Volvé a preparar el ticket.');
    if(prepared.plan.errors.length)throw new Error(prepared.plan.errors.join(' '));
    const plan=prepared.plan;
    record={publicationId:record?.publicationId||randomUUID(),projectKey:plan.projectKey,status:'creating',attachments:{},evidence:plan.selectedEvidence.map(e=>({uid:e.uid,digest:hash(Buffer.from(e.data.split(',')[1],'base64')),extension:e.data.startsWith('data:image/png')?'png':'jpg'})),total:plan.selectedEvidence.length,uploaded:0};
    record.marker='qaexport'+record.publicationId.replaceAll('-','');
    await this.save(reportUid,bugUid,record);
    try{
      const found=await this.mcp.call('qaJiraCreateDefect',{fields:{...plan.payload,description:plan.description+'\n\nReferencia de publicación QA: '+record.marker}});
      Object.assign(record,found,{status:'attachments_pending',error:''});
      await this.save(reportUid,bugUid,record);
    }catch(error){record.status=error.status>=400&&error.status<500&&!error.uncertain?'failed':'unknown';record.error=safeError(error);await this.save(reportUid,bugUid,record);return publicRecord(record);}
    return this.attachRemaining(reportUid,bugUid,record,entry);
  });}
  async attachRemaining(reportUid,bugUid,record,entry){
    if(record.status==='complete')return publicRecord(record);
    const evidence=[...(entry.evidence||[]),...(entry.bug.evidence||[])];record.attachments||={};record.status='attachments_pending';record.error='';
    for(const item of record.evidence||[]){
      if(record.attachments[item.uid])continue;
      const image=evidence.find(e=>e.uid===item.uid&&hash(Buffer.from(e.data.split(',')[1],'base64'))===item.digest);
      if(!image){record.error='Falta una evidencia original de esta publicación. Recuperala desde Historial antes de reintentar.';break;}
      const name=record.publicationId.replaceAll('-','').slice(0,12)+'-'+item.uid.replace(/[^a-zA-Z0-9]/g,'').slice(0,12)+'-'+item.digest.slice(0,20)+'.'+item.extension;
      try{record.attachments[item.uid]=await this.mcp.call('qaJiraAttachEvidence',{issueKey:record.key,name,data:image.data});record.uploaded=Object.keys(record.attachments).length;await this.save(reportUid,bugUid,record);}catch(error){record.error=safeError(error);break;}
    }
    if((record.evidence||[]).length&&record.uploaded===record.total)record.status='complete';
    await this.save(reportUid,bugUid,record);return publicRecord(record);
  }
}

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export function jiraAPI(service){return async request=>{
  const url=new URL(request.url);
  if(request.headers.get('sec-fetch-site')==='cross-site'||request.headers.get('origin')&&request.headers.get('origin')!==url.origin)return json({error:'Origen no permitido.'},403);
  if(request.method!=='POST'||request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.includes('application/json'))return json({error:'Se requiere una solicitud desde la aplicación.'},403);
  try{
    const raw=await request.text();if(raw.length>10000)return json({error:'Solicitud demasiado grande.'},413);
    const {reportUid,bugUid,preparationId}=JSON.parse(raw);
    if(url.pathname==='/api/jira/prepare')return json(await service.prepare(reportUid,bugUid));
    if(url.pathname==='/api/jira/status')return json({publication:await service.status(reportUid,bugUid)});
    if(url.pathname==='/api/jira/publish')return json({publication:await service.publish(reportUid,bugUid,preparationId)});
    return json({error:'Ruta no encontrada.'},404);
  }catch(error){return json({error:safeError(error)},error.status>=400&&error.status<500?error.status:400);}
};}
