// Isolated browser-test server. All Jira operations are simulated; real credentials are never read.
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import worker from '../../worker/index.js';
import {ReportStore,storageAPI} from '../../scripts/report-store.mjs';
import {JiraPublications,jiraAPI} from '../../scripts/jira/publications.mjs';
import {newReport,newStandaloneBug} from '../../src/model.js';
import {defaultTemplate} from '../../src/templates.js';
import {TemplateStore,templatesAPI} from '../../scripts/template-store.mjs';
const root=await mkdtemp(join(tmpdir(),'qa-jira-browser-')),reports=new ReportStore(root);
const r=newReport();r.title='QA Jira - prueba aislada';r.app='Cobranza de facturas (CF)';r.version='1.3.9';r.ticket='TEST-123';
if(process.env.HEADER_FIXTURE==='1')r.app='CU125 - Reporte Auditoria';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
const image=name=>({uid:crypto.randomUUID(),name,caption:name,data:png});
Object.assign(r.cases[0].bug,{enabled:true,title:'Error al guardar',description:'El formulario muestra un error',expected:'Guardar los datos',actual:'Se muestra un error',severity:'Crítica',component:'ABM Empresas'});
r.cases[0].steps='Abrir formulario\nGuardar';r.cases[0].evidence=[image('caso.png')];r.cases[0].bug.evidence=[image('bug.png')];
const independent=newStandaloneBug();Object.assign(independent.bug,{title:'Bug independiente',description:'Falla una consulta',expected:'Mostrar datos',actual:'No hay datos',severity:'Alta',component:'ABM Empresas'});independent.evidence=[image('independiente.png')];r.bugs.push(independent);await reports.write(r);
let failAttachment=false;const calls=[],uploaded=new Map();
const mcp={async call(name,args){
  calls.push(name);
  if(name==='qaJiraMetadata'){
    const f=(id,name,values=[],required=true)=>({id,name,required,allowedValues:values.map(([id,name])=>({id,name})),schema:{}});
    return {projectKey:args.projectKey,user:{name:'qa'},attachments:{enabled:true,uploadLimit:1000000},fields:[f('summary','Resumen'),f('description','Descripción'),f('project','Proyecto'),f('issuetype','Tipo'),f('reporter','Informador'),f('components','Componente(s)',[['component','ABM Empresas']]),f('versions','Version(es) Afectadas',[['version','1.3.9']]),f('customfield_11206','Tipo de defecto',[['defect','Defecto'],['improvement','Mejora']]),f('customfield_10729','Criticidad',[['critical','Crítico'],['high','Alta']]),...(args.projectKey==='GUV'?[]:[f('customfield_10405','Ambiente',[['testing','Testing']])])]};
  }
  if(name==='qaJiraCreateDefect')return {key:args.fields.project.key+'-900',url:'https://jira.example.test/browse/'+args.fields.project.key+'-900'};
  if(name==='qaJiraAttachEvidence'){if(failAttachment){failAttachment=false;throw new Error('Fallo simulado al cargar adjunto');}const result=uploaded.get(args.name)||{id:String(uploaded.size+1),name:args.name};uploaded.set(args.name,result);return result;}
  if(name==='qaJiraFindPublication')return null;
  throw new Error('Herramienta no simulada');
}};
const storage=storageAPI(reports),jira=jiraAPI(new JiraPublications({root:join(root,'publications'),reports,mcp}));
const templates=templatesAPI(new TemplateStore(join(root,'templates')));
const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1:4312');let response;
  if(url.pathname==='/__test/state')response=Response.json({calls,uploaded:uploaded.size,reports:await reports.all()});
  else if(url.pathname==='/__test/fail-attachment'){failAttachment=true;response=Response.json({ok:true});}
  else{
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const request=new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    response=url.pathname.startsWith('/api/jira/')?await jira(request):url.pathname.startsWith('/api/storage/')?await storage(request):url.pathname==='/api/templates'?await templates(request):await worker.fetch(request);
  }
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(error){res.writeHead(500);res.end(error.message);}});
server.listen(4312,'127.0.0.1',()=>console.log('Prueba aislada: http://127.0.0.1:4312'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await rm(root,{recursive:true,force:true});process.exit(0);}));
