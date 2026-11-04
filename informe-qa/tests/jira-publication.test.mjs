import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {JiraPublications,jiraAPI} from '../scripts/jira/publications.mjs';
import {JiraGateway} from '../scripts/jira/mcp-tools.mjs';
import {prepareWithAgent} from '../scripts/jira/agents/orchestrator.mjs';
import {newReport,bugEntries,validateBackup} from '../src/model.js';
import {resetClonedCaseBugs} from '../src/case-bugs.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
const option=(id,name)=>({id,name});
function metadata(projectKey='CF'){
  const field=(id,name,allowedValues=[],required=true)=>({id,name,allowedValues,required,schema:{}});
  return {projectKey,baseUrl:'https://jira.example.test',user:{name:'qa'},attachments:{enabled:true,uploadLimit:1000000},fields:[
    field('summary','Resumen'),field('description','Descripción'),field('project','Proyecto'),field('issuetype','Tipo'),field('reporter','Informador'),
    field('components','Componente(s)',[option(projectKey+'-component','ABM Empresas')]),field('versions','Version(es) Afectadas',[option(projectKey+'-version','1.3.9')]),
    field('customfield_11206','Tipo de defecto',[option('defect','Defecto')]),field('customfield_10729','Criticidad',[option('critical','Crítico')]),
    ...(projectKey==='GUV'?[]:[field('customfield_10405','Ambiente',[option('testing','Testing')])])
  ]};
}
function report(projectKey='CF'){
  const r=newReport();r.app=projectKey;r.version='1.3.9';r.ticket='TEST-123';
  const c=r.cases[0];Object.assign(c.bug,{enabled:true,title:'No guarda',description:'Al guardar falla',expected:'Debe guardar',actual:'Muestra error',severity:'Crítica',component:'ABM Empresas'});c.steps='Abrir\nGuardar';
  c.evidence=[{uid:crypto.randomUUID(),name:'caso.png',caption:'Error',data:png}];
  c.bug.evidence=[{uid:crypto.randomUUID(),name:'bug.png',caption:'Detalle',data:png}];return r;
}
function fakeMcp(){
  const calls=[],remote={issue:null,attachments:new Map()};
  return {calls,remote,failCreate:null,failAttach:false,async call(name,args){
    calls.push({name,args});
    if(name==='qaJiraMetadata')return metadata(args.projectKey);
    if(name==='qaJiraFindPublication')return remote.issue;
    if(name==='qaJiraCreateDefect'){
      if(this.failCreate==='400'){const e=new Error('Campo inválido');e.status=400;throw e;}
      remote.issue={key:args.fields.project.key+'-999',url:'https://jira.example.test/browse/'+args.fields.project.key+'-999'};
      if(this.failCreate==='unknown'){const e=new Error('Respuesta perdida');e.uncertain=true;throw e;}
      return remote.issue;
    }
    if(name==='qaJiraAttachEvidence'){
      const result=remote.attachments.get(args.name)||{id:String(remote.attachments.size+1),name:args.name};remote.attachments.set(args.name,result);
      if(this.failAttach){this.failAttach=false;throw new Error('Respuesta de adjunto perdida');}return result;
    }
    throw new Error('Herramienta inesperada');
  }};
}
async function setup(t,r=report()){
  const root=await mkdtemp(join(tmpdir(),'qa-jira-'));t.after(()=>rm(root,{recursive:true,force:true}));const mcp=fakeMcp(),reports={get:async()=>structuredClone(r)};
  return {r,mcp,root,reports,service:new JiraPublications({root,reports,mcp}),args:[r.uid,r.cases[0].uid]};
}
for(const key of ['CF','GUV','DH'])test(`Agente ${key} prepara IDs reales, criticidad y evidencias sin publicar`,async()=>{
  const r=report(key),mcp=fakeMcp(),plan=await prepareWithAgent(r,bugEntries(r)[0],mcp);
  assert.deepEqual(plan.errors,[]);assert.equal(plan.projectKey,key);assert.equal(plan.payload.versions[0].id,key+'-version');assert.equal(plan.payload.fixVersions,undefined);
  assert.equal(plan.payload.customfield_10729.id,'critical');assert.equal(plan.selectedEvidence.length,2);
  for(const text of ['Resultado esperado','Debe guardar','Resultado obtenido','Muestra error','TEST-123','Testing'])assert.ok(plan.description.includes(text),text);
  assert.equal(plan.environmentInDescriptionOnly,key==='GUV');assert.equal(!!plan.payload.customfield_10405,key!=='GUV');
  assert.equal(mcp.calls.length,1);
});
test('La preparación rechaza campos faltantes, IDs de otro proyecto y una versión parcial',async()=>{
  const r=report();r.version='1.3';r.cases[0].bug.actual='';r.cases[0].bug.jiraDraft={projectKey:'CF',componentId:'GUV-component',evidenceIds:[]};
  const plan=await prepareWithAgent(r,bugEntries(r)[0],fakeMcp());
  for(const text of ['Versión','Componente','Resultado obtenido','evidencia'])assert.ok(plan.errors.some(e=>e.includes(text)),text);
});
test('Publicación persiste el vínculo y no duplica al reiniciar o repetir',async t=>{
  const {service,mcp,args,root,reports,r}=await setup(t),prepared=await service.prepare(...args);
  const publication=await service.publish(...args,prepared.preparationId);assert.equal(publication.status,'complete');assert.equal(publication.uploaded,2);
  const again=await new JiraPublications({root,reports,mcp}).publish(...args);assert.equal(again.key,publication.key);
  assert.equal(mcp.calls.filter(c=>c.name==='qaJiraCreateDefect').length,1);assert.equal(mcp.remote.attachments.size,2);
  assert.equal(r.ticket,'TEST-123');assert.equal(r.cases[0].bug.ticket,undefined);
  r.cases[0].bug.jiraPublication=publication;assert.equal(validateBackup({format:'caso-qa-v1',reports:[r]})[0].cases[0].bug.jiraPublication.key,'CF-999');
});
test('Adjunto con respuesta perdida se reintenta sobre el mismo ticket',async t=>{
  const {service,mcp,args}=await setup(t),prepared=await service.prepare(...args);mcp.failAttach=true;
  const first=await service.publish(...args,prepared.preparationId);assert.equal(first.status,'attachments_pending');assert.equal(first.key,'CF-999');
  const second=await service.publish(...args);assert.equal(second.status,'complete');assert.equal(mcp.remote.attachments.size,2);
  assert.equal(mcp.calls.filter(c=>c.name==='qaJiraCreateDefect').length,1);
});
test('Respuesta de creación perdida se reconcilia sin crear un segundo ticket',async t=>{
  const {service,mcp,args}=await setup(t),prepared=await service.prepare(...args);mcp.failCreate='unknown';
  const first=await service.publish(...args,prepared.preparationId);assert.equal(first.status,'unknown');
  const second=await service.publish(...args);assert.equal(second.status,'complete');assert.equal(mcp.calls.filter(c=>c.name==='qaJiraCreateDefect').length,1);
});
test('Una creación incierta sin resultado en búsqueda permanece bloqueada para evitar duplicados',async t=>{
  const {service,mcp,args}=await setup(t),prepared=await service.prepare(...args);mcp.failCreate='unknown';await service.publish(...args,prepared.preparationId);mcp.remote.issue=null;
  const second=await service.publish(...args);assert.equal(second.status,'unknown');assert.equal(mcp.calls.filter(c=>c.name==='qaJiraCreateDefect').length,1);
});
test('Un respaldo conserva también el resultado incierto y permite reconciliarlo sin recrear',async t=>{
  const {service,mcp,args,r,root}=await setup(t),prepared=await service.prepare(...args);mcp.failCreate='unknown';
  const uncertain=await service.publish(...args,prepared.preparationId);r.cases[0].bug.jiraPublication=uncertain;
  assert.equal(validateBackup({format:'caso-qa-v1',reports:[r]})[0].cases[0].bug.jiraPublication.status,'unknown');
  await rm(root,{recursive:true,force:true});
  assert.equal((await service.publish(...args)).status,'complete');assert.equal(mcp.calls.filter(c=>c.name==='qaJiraCreateDefect').length,1);
});
test('Error 400 permite corregir y revisar otra vez, sin tratarlo como éxito',async t=>{
  const {service,mcp,args}=await setup(t),prepared=await service.prepare(...args);mcp.failCreate='400';assert.equal((await service.publish(...args,prepared.preparationId)).status,'failed');
  mcp.failCreate=null;const next=await service.prepare(...args);assert.equal((await service.publish(...args,next.preparationId)).status,'complete');
});
test('Un cambio después de revisar invalida la publicación',async t=>{
  const {service,mcp,args,r}=await setup(t),prepared=await service.prepare(...args);r.cases[0].bug.expected='Otro resultado';
  await assert.rejects(()=>service.publish(...args,prepared.preparationId),/cambió/);assert.ok(!mcp.calls.some(c=>c.name==='qaJiraCreateDefect'));
});
test('Una publicación concurrente no vuelve a crear el mismo defecto',async t=>{
  const {service,mcp,args}=await setup(t),prepared=await service.prepare(...args);
  const results=await Promise.allSettled([service.publish(...args,prepared.preparationId),service.publish(...args,prepared.preparationId)]);
  assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(mcp.calls.filter(c=>c.name==='qaJiraCreateDefect').length,1);
  const rejected=results.find(r=>r.status==='rejected');if(rejected)assert.equal(rejected.reason.status,409);
});
test('Restaurar un vínculo con adjuntos pendientes reintenta sin duplicar el ticket',async t=>{
  const {service,mcp,args,r,root}=await setup(t),prepared=await service.prepare(...args);mcp.failAttach=true;
  const partial=await service.publish(...args,prepared.preparationId);r.cases[0].bug.jiraPublication=partial;
  await rm(root,{recursive:true,force:true});
  const complete=await service.publish(...args);assert.equal(complete.status,'complete');assert.equal(mcp.calls.filter(c=>c.name==='qaJiraCreateDefect').length,1);
});
test('Una evidencia original modificada no reemplaza silenciosamente el adjunto pendiente',async t=>{
  const {service,mcp,args,r}=await setup(t),prepared=await service.prepare(...args);mcp.failAttach=true;
  await service.publish(...args,prepared.preparationId);r.cases[0].evidence=[];
  const partial=await service.publish(...args);assert.equal(partial.status,'attachments_pending');assert.match(partial.error,/Falta una evidencia original/);
  assert.equal(mcp.calls.filter(c=>c.name==='qaJiraCreateDefect').length,1);
});
test('Ambiente del informe se propone por coincidencia y no se cambia a Testing silenciosamente',async()=>{
  const r=report();r.environment='Producción';const meta=metadata();meta.fields.find(f=>f.name==='Ambiente').allowedValues.push(option('production','Produccion'));
  const plan=await prepareWithAgent(r,bugEntries(r)[0],{call:async()=>meta});assert.equal(plan.selections.environmentId,'production');
});
test('Duplicar un caso elimina el vínculo de publicación y su selección de evidencias',()=>{
  const r=report(),c=r.cases[0];c.bug.jiraPublication={key:'CF-99'};c.bug.jiraDraft={projectKey:'CF'};resetClonedCaseBugs(c);
  assert.equal(c.bug.jiraPublication,undefined);assert.equal(c.bug.jiraDraft,undefined);
});
test('API rechaza publicación desde otro origen antes de llamar al servicio',async()=>{
  const handler=jiraAPI({publish:()=>{throw new Error('No debería invocarse');}});
  const response=await handler(new Request('http://localhost:4310/api/jira/publish',{method:'POST',headers:{origin:'https://otro.test','Content-Type':'application/json'},body:'{}'}));assert.equal(response.status,403);
});
test('Gateway procesa todas las páginas de campos y conserva IDs de opciones',async()=>{
  const paths=[];const gateway=new JiraGateway({baseUrl:'https://jira.example.test',authorization:'Bearer offline',fetcher:async url=>{
    paths.push(url);if(url.endsWith('/myself'))return Response.json({name:'qa'});if(url.endsWith('/attachment/meta'))return Response.json({enabled:true,uploadLimit:100});
    return Response.json(url.includes('startAt=0')?{values:[{fieldId:'summary',name:'Resumen',required:true}],total:2,isLast:false}:{values:[{fieldId:'customfield_1',name:'Criticidad',allowedValues:[{id:'7',value:'Alta'},{id:'8',value:'Deshabilitada',disabled:true}]}],total:2,isLast:true});
  }});
  const data=await gateway.metadata('CF');assert.equal(data.fields.length,2);assert.deepEqual(data.fields[1].allowedValues,[{id:'7',name:'Alta',value:'Alta'}]);assert.ok(paths.some(p=>p.includes('startAt=1')));
});
test('Gateway reconoce un adjunto previo antes de volver a subirlo',async()=>{
  const digest=createHash('sha256').update(Buffer.from(png.split(',')[1],'base64')).digest('hex').slice(0,20),name='qa-'+digest+'.png',methods=[];
  const gateway=new JiraGateway({baseUrl:'https://jira.example.test',authorization:'Bearer offline',fetcher:async(url,options)=>{methods.push(options.method);return Response.json({fields:{attachment:[{id:'1',filename:name}]}});}});
  assert.equal((await gateway.attach({issueKey:'CF-1',name,data:png})).id,'1');assert.deepEqual(methods,['GET']);
});
test('Gateway envía los bytes de la evidencia como multipart con la autenticación de servidor',async()=>{
  const bytes=Buffer.from(png.split(',')[1],'base64'),digest=createHash('sha256').update(bytes).digest('hex').slice(0,20),name='qa-'+digest+'.png';
  let posted=false;
  const gateway=new JiraGateway({baseUrl:'https://jira.example.test',authorization:'Bearer offline',fetcher:async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer offline');assert.equal(options.redirect,'error');
    if(options.method==='GET')return Response.json({fields:{attachment:[]}});
    posted=true;assert.equal(url,'https://jira.example.test/rest/api/2/issue/CF-1/attachments');assert.equal(options.headers['X-Atlassian-Token'],'no-check');assert.equal(options.headers['Content-Type'],undefined);
    const file=options.body.get('file');assert.equal(file.name,name);assert.equal(file.type,'image/png');assert.deepEqual(Buffer.from(await file.arrayBuffer()),bytes);
    return Response.json([{id:'123'}]);
  }});
  assert.equal((await gateway.attach({issueKey:'CF-1',name,data:png})).id,'123');assert.ok(posted);
});
