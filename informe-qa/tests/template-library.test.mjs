import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {TemplateStore,templatesAPI} from '../scripts/template-store.mjs';
import {defaultTemplate} from '../src/templates.js';
import {newReport} from '../src/model.js';
async function setup(run){const root=await mkdtemp(join(tmpdir(),'caso-library-'));try{await run(new TemplateStore(root),root);}finally{await rm(root,{recursive:true,force:true});}}
test('Biblioteca crea, edita, elige predeterminada y elimina sin cambiar los informes',async()=>setup(async(store,root)=>{
  let data=await store.get();assert.equal(data.entries.length,1);const originalId=data.defaultId;
  const template={...defaultTemplate(),name:'Regresión'};data=await store.change({action:'create',template,baseRevision:data.revision});const added=data.entries.find(e=>e.template.name==='Regresión');assert.equal(data.defaultId,originalId);
  const report=newReport(added.template);data=await store.change({action:'default',id:added.id,baseRevision:data.revision});assert.equal(data.template.name,'Regresión');
  const changed={...added.template,name:'Regresión actualizada'};changed.case.sections=[];changed.case.sections=[{id:'solo',title:'Nueva sección',fields:[]}];
  data=await store.change({action:'update',id:added.id,template:changed,baseRevision:data.revision});assert.equal(data.entries.length,2);assert.equal(data.template.name,'Regresión actualizada');assert.equal(report.template.name,'Regresión');assert.equal(report.template.case.sections.length,8);
  assert.deepEqual(await new TemplateStore(root).get(),data);
  data=await store.change({action:'delete',id:added.id,baseRevision:data.revision});assert.equal(data.defaultId,originalId);assert.equal(report.template.name,'Regresión');await assert.rejects(()=>store.change({action:'delete',id:originalId,baseRevision:data.revision}),/al menos una/);
}));
test('Migración recupera nombres anteriores y conserva exactamente la predeterminada existente',async()=>setup(async(store,root)=>{
  const first={revision:crypto.randomUUID(),template:{...defaultTemplate(),name:'Funcional'},savedAt:'2026-10-19T10:00:00Z'},second={revision:crypto.randomUUID(),template:{...defaultTemplate(),name:'Especial'},savedAt:'2026-10-19T11:00:00Z'};
  for(const item of [first,second])await writeFile(join(root,item.revision+'.json'),JSON.stringify(item));await writeFile(join(root,'current.json'),JSON.stringify(second));
  let data=await store.get();assert.equal(data.entries.length,2);assert.equal(data.defaultId,second.revision);assert.deepEqual(data.template,second.template);
  data=await store.change({action:'default',id:first.revision,baseRevision:data.revision});assert.equal(data.template.name,'Funcional');assert.deepEqual(JSON.parse(await readFile(join(root,'current.json'),'utf8')),second);assert.equal((await new TemplateStore(root).get()).entries.length,2);
}));
test('Nombres duplicados y ediciones concurrentes no reemplazan plantillas',async()=>setup(async(store)=>{
  let data=await store.get();const base=data.revision;data=await store.change({action:'create',template:{...defaultTemplate(),name:'Otra'},baseRevision:base});
  await assert.rejects(()=>store.change({action:'create',template:{...defaultTemplate(),name:'otra'},baseRevision:data.revision}),/ese nombre/);
  await assert.rejects(()=>store.change({action:'default',id:data.defaultId,baseRevision:base}),/otra ventana/);
  assert.deepEqual(await store.get(),data);await assert.rejects(()=>store.change({action:'update',id:'inexistente',template:defaultTemplate(),baseRevision:data.revision}),/no está disponible/);
}));
test('API administra catálogo con control de origen y devuelve conflictos 409',async()=>setup(async(store)=>{
  const api=templatesAPI(store),send=data=>api(new Request('http://localhost/api/templates',{method:'POST',headers:{origin:'http://localhost','content-type':'application/json'},body:JSON.stringify(data)}));
  const response=await send({action:'create',template:{...defaultTemplate(),name:'API'},baseRevision:null});assert.equal(response.status,200);const data=await response.json();assert.equal(data.entries.length,2);assert.equal((await send({action:'default',id:data.defaultId,baseRevision:null})).status,409);
  assert.equal((await api(new Request('http://localhost/api/templates',{method:'POST',headers:{origin:'https://otro.example','content-type':'application/json'},body:'{}'}))).status,403);
}));
