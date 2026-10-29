import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import JSZip from 'jszip';
import {newReport,newStandaloneBug,validateBackup,reportEvidenceGroups} from '../src/model.js';
import {newRetest,retestSources,filterRetests,validateRetests,retestExportEntries,remapRetestSources} from '../src/retests.js';
import {createRetestWord,createRetestArchive} from '../src/retest-document.js';
import {ReportStore} from '../scripts/report-store.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
const image=caption=>({uid:crypto.randomUUID(),name:'captura.png',caption,data:png});
async function unpack(blob){const zip=await JSZip.loadAsync(await blob.arrayBuffer());return {xml:await zip.file('word/document.xml').async('string'),zip};}
function setup(){const report=newReport();report.ticket='JIRA-123';report.version='1.0';report.author='Responsable QA';const c=report.cases[0];c.bug.enabled=true;c.bug.title='BUG DE ORIGEN';c.bug.expected='Debe guardar';c.bug.actual='No guarda';c.bug.steps='PASO PROPIO DEL BUG';c.steps='PASO DEL CASO';c.evidence=[image('ORIGINAL NO EXPORTABLE')];return {report,c};}

test('Restaurar respaldo conserva el vínculo con los nuevos identificadores de casos',()=>{
  const {report,c}=setup(),r=newRetest(report,retestSources(report)[0]);report.retests.push(r);
  const copy={...report,cases:report.cases.map(c=>({...c,uid:crypto.randomUUID()}))};remapRetestSources(report,copy);assert.equal(copy.retests[0].sourceUid,copy.cases[0].uid);assert.equal(copy.retests[0].groupUid,copy.cases[0].uid);assert.equal(report.retests[0].sourceUid,c.uid);assert.notEqual(copy.retests[0].sourceUid,c.uid);assert.equal(validateBackup({format:'caso-qa-v1',reports:[copy]}).length,1);
});

test('Retesteo copia el bug y crea intentos independientes sin reutilizar evidencias',()=>{
  const {report,c}=setup(),source=retestSources(report)[0],first=newRetest(report,source);report.retests.push(first);
  assert.equal(first.steps,'PASO PROPIO DEL BUG');assert.equal(first.expected,c.bug.expected);assert.equal(first.ticket,'JIRA-123');assert.equal(first.sourceId,c.id);assert.equal(first.attempt,1);assert.deepEqual(first.evidence,[]);assert.equal(first.originalEvidenceCount,0);
  first.steps='PASOS ADAPTADOS';first.actual='Persiste en 1.0';first.status='Persiste';first.evidence.push(image('Captura del primer intento'));report.version='1.1';
  const second=newRetest(report,null,first);report.retests.push(second);assert.equal(second.attempt,2);assert.equal(second.groupUid,first.groupUid);assert.equal(second.version,'1.1');assert.equal(second.steps,'PASOS ADAPTADOS');assert.equal(second.actual,'');assert.equal(second.status,'Pendiente');assert.deepEqual(second.evidence,[]);
  c.bug.title='Título modificado después';c.bug.steps='Otros pasos';assert.equal(first.bugTitle,'BUG DE ORIGEN');assert.equal(second.bugTitle,'BUG DE ORIGEN');assert.equal(first.steps,'PASOS ADAPTADOS');assert.equal(c.steps,'PASO DEL CASO');validateRetests(report.retests);
});
test('Retesteo admite bugs independientes y externos; filtros por ticket, versión y estado',()=>{
  const {report}=setup(),b=newStandaloneBug();b.bug.title='BUG INDEPENDIENTE';b.steps='Abrir inicio';report.bugs.push(b);const sources=retestSources(report);assert.equal(sources.length,2);
  const own=newRetest(report,sources[1]);assert.equal(own.sourceKind,'standalone');assert.equal(own.steps,'Abrir inicio');report.retests.push(own);
  const external=newRetest(report);external.bugTitle='DEFECTO EXTERNO';external.ticket='EXT-789';external.version='2.5';external.status='Bloqueado';report.retests.push(external);
  assert.deepEqual(filterRetests(report,{query:'ext-789',version:'2.5',status:'Bloqueado'}),[external]);assert.equal(filterRetests(report,{status:'Corregido'}).length,0);assert.equal(filterRetests(report,{query:'independiente'}).length,1);assert.equal(external.sourceKind,'external');
});
test('Retesteos, capturas, intentos y respaldos sobreviven al reinicio y conservan historial',async()=>{
  const {report}=setup(),r=newRetest(report,retestSources(report)[0]);r.evidence=[image('RETESTEO GUARDADO')];report.retests.push(r);const root=await mkdtemp(join(tmpdir(),'caso-retests-'));
  try{const store=new ReportStore(root),saved=await store.write(report);r.status='Corregido';await store.write(report,saved._diskRevision);const recovered=await new ReportStore(root).get(report.uid);assert.equal(recovered.retests[0].status,'Corregido');assert.equal(recovered.retests[0].evidence[0].data,png);assert.equal((await store.version(report.uid,saved._diskRevision)).retests[0].status,'Pendiente');assert.equal((await readdir(join(root,'images'))).length,1);assert.equal(validateBackup(JSON.parse(JSON.stringify({format:'caso-qa-v1',reports:[recovered]})))[0].retests[0].sourceUid,report.cases[0].uid);assert.ok(reportEvidenceGroups(recovered).includes(recovered.retests[0].evidence));delete recovered.retests;assert.equal(validateBackup({format:'caso-qa-v1',reports:[recovered]}).length,1);}finally{await rm(root,{recursive:true,force:true});}
});
test('Word de retesteos contiene tabla, detalle y solo evidencias de los intentos seleccionados',async()=>{
  const {report}=setup(),r=newRetest(report,retestSources(report)[0]);r.actual='AHORA GUARDA';r.status='Corregido';r.evidence=[image('EVIDENCIA NUEVA DEL RETESTEO')];r.observations='Corrección validada';report.retests.push(r);
  const excluded=newRetest(report);excluded.bugTitle='NO INCLUIR';excluded.selected=false;report.retests.push(excluded);
  const result=await unpack(await createRetestWord(report,{dimensions:async()=>({width:1,height:1})}));
  for(const text of ['Resumen de validaciones','<w:tbl>','BUG DE ORIGEN','JIRA-123','PASO PROPIO DEL BUG','Debe guardar','AHORA GUARDA','Corregido','EVIDENCIA NUEVA DEL RETESTEO','Corrección validada','Responsable QA'])assert.ok(result.xml.includes(text),text);
  for(const text of ['NO INCLUIR','ORIGINAL NO EXPORTABLE','PASO DEL CASO'])assert.ok(!result.xml.includes(text),text);assert.equal((result.xml.match(/<w:drawing>/g)||[]).length,1);
  const ordinary=await unpack(await(await import('../src/document.js')).createWord(report,{dimensions:async()=>({width:1,height:1})}));assert.ok(!ordinary.xml.includes('AHORA GUARDA'));
});
test('Word individual y ZIP no mezclan intentos ni estados y conservan nombres únicos',async()=>{
  const {report}=setup(),a=newRetest(report,retestSources(report)[0]);a.actual='OBTENIDO INTENTO UNO';a.status='Persiste';report.retests.push(a);const b=newRetest(report,null,a);b.actual='OBTENIDO INTENTO DOS';b.status='Corregido';report.retests.push(b);
  const single=await unpack(await createRetestWord(report,{uid:b.uid}));assert.ok(single.xml.includes(b.actual));assert.ok(!single.xml.includes(a.actual));
  const archive=await JSZip.loadAsync(await(await createRetestArchive(report)).arrayBuffer()),files=Object.keys(archive.files);assert.equal(files.length,2);assert.ok(files.every(name=>name.endsWith('.docx')));
  for(const [i,name] of files.entries()){const doc=await JSZip.loadAsync(await archive.file(name).async('uint8array')),xml=await doc.file('word/document.xml').async('string');assert.ok(xml.includes([a,b][i].actual));assert.ok(!xml.includes([b,a][i].actual));}
});
test('Validación rechaza estados, fechas o capturas inválidas; exportar exige selección y datos mínimos',async()=>{
  const {report}=setup(),r=newRetest(report);report.retests.push(r);assert.throws(()=>retestExportEntries(report),/título/);r.bugTitle='Bug externo';r.ticket='';assert.throws(()=>retestExportEntries(report),/ticket/);r.ticket='EXT-1';validateRetests(report.retests);
  for(const [key,value] of [['status','Cerrado en Jira'],['date','2026-02-31'],['attempt',0]]){const copy=structuredClone(report.retests);copy[0][key]=value;assert.throws(()=>validateRetests(copy));}
  const copy=structuredClone(report.retests);copy[0].evidence=[{...image('Inválida'),data:'data:image/svg+xml,<svg/>'}];assert.throws(()=>validateRetests(copy),/evidencias/);
  r.selected=false;await assert.rejects(()=>createRetestWord(report),/Seleccioná/);assert.throws(()=>validateRetests([r,r]),/inválido/);
});
test('Word y ZIP de retesteos usan ticket y datos propios sin arrastrar informe ni ID del bug',async()=>{
  const {report}=setup(),r=newRetest(report,retestSources(report)[0]);r.version='VERSION PROBADA';r.author='RESPONSABLE RETESTEO';r.actual='RESULTADO RETESTEO';r.ticket='CF-340';report.retests.push(r);
  report.title='INFORME AJENO';report.app='APLICACION AJENA';report.version='VERSION DEL INFORME';report.author='AUTOR DEL INFORME';r.sourceId='BUG-999';
  const result=await unpack(await createRetestWord(report));for(const path of ['word/document.xml','word/header1.xml','docProps/core.xml']){const text=await result.zip.file(path).async('string');for(const absent of ['INFORME AJENO','APLICACION AJENA','VERSION DEL INFORME','AUTOR DEL INFORME','BUG-999','Caso / Bug de origen'])assert.ok(!text.includes(absent),path+': '+absent);}
  assert.ok(result.xml.includes('Informe de incidencia'));assert.ok(result.xml.includes('Resumen de validaciones'));assert.ok(!result.xml.includes('INFORME DE RETESTEO'));assert.ok(!result.xml.includes('Retesteo de bugs'));assert.ok((await result.zip.file('word/header1.xml').async('string')).includes('Informe de incidencia'));
  for(const expected of ['CF-340','VERSION PROBADA','RESPONSABLE RETESTEO','RESULTADO RETESTEO'])assert.ok(result.xml.includes(expected));
  const zip=await JSZip.loadAsync(await(await createRetestArchive(report)).arrayBuffer());assert.ok(Object.keys(zip.files).every(name=>name.startsWith('CF-340 - ')&&!name.includes(report.title)));
});
