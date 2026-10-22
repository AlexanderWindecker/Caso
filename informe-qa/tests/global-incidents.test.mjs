import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {newReport,newStandaloneBug} from '../src/model.js';
import {newRetest,retestSources} from '../src/retests.js';
import {allIndependentBugs,allRetests,allRetestSources,globalRetestReport} from '../src/global-incidents.js';
import {createRetestWord,createRetestArchive} from '../src/retest-document.js';
function setup(){
  const a=newReport(),b=newReport();a.ticket='CF-A';b.ticket='CF-B';const bugA=newStandaloneBug();bugA.bug.title='INCIDENCIA A';bugA.bug.component='Empresas';a.bugs.push(bugA);const bugB=structuredClone(bugA);bugB.bug.title='INCIDENCIA B';bugB.bug.component='Pagos';b.bugs.push(bugB);
  const retA=newRetest(a,retestSources(a)[0]);retA.actual='VALIDACION A';a.retests.push(retA);const retB=structuredClone(retA);retB.bugTitle='INCIDENCIA B';retB.ticket='CF-B';retB.actual='VALIDACION B';b.retests.push(retB);return {a,b,bugA,bugB,retA,retB};
}
test('Lista global incluye bugs de todos los informes y usa el ticket de su propietario',()=>{
  const {a,b,bugB}=setup(),entries=allIndependentBugs([a,b]);assert.equal(entries.length,2);assert.notEqual(entries[0].key,entries[1].key);assert.equal(allIndependentBugs([a,b],{ticket:'cf-b',component:'pagos'})[0].owner,b);const entry=entries.find(e=>e.owner===b);entry.bug.bug.component='Pagos actualizado';assert.equal(bugB.bug.component,'Pagos actualizado');assert.equal(a.bugs[0].bug.component,'Empresas');
});
test('Validaciones y fuentes globales distinguen copias restauradas con los mismos UID',()=>{
  const {a,b}=setup(),entries=allRetests([a,b]),sources=allRetestSources([a,b]);assert.equal(entries.length,2);assert.equal(sources.length,2);assert.notEqual(entries[0].key,entries[1].key);assert.notEqual(sources[0].key,sources[1].key);assert.equal(sources[1].ownerUid,b.uid);assert.equal(sources[1].ticket,'CF-B');entries[1].record.status='Corregido';assert.equal(b.retests[0].status,'Corregido');assert.equal(a.retests[0].status,'Pendiente');
});
test('Word global e individual exportan registros de varios informes sin confundir identificadores repetidos',async()=>{
  const {a,b}=setup(),snapshot=globalRetestReport([a,b]);assert.equal(snapshot.retests.length,2);assert.notEqual(snapshot.retests[0].uid,snapshot.retests[1].uid);
  const text=async blob=>{const zip=await JSZip.loadAsync(await blob.arrayBuffer());return zip.file('word/document.xml').async('string');};const combined=await text(await createRetestWord(snapshot));assert.ok(combined.includes('VALIDACION A'));assert.ok(combined.includes('VALIDACION B'));
  const individual=await text(await createRetestWord(snapshot,{uid:snapshot.retests[1].uid}));assert.ok(individual.includes('VALIDACION B'));assert.ok(!individual.includes('VALIDACION A'));
  const zip=await JSZip.loadAsync(await(await createRetestArchive(snapshot)).arrayBuffer());assert.equal(Object.keys(zip.files).length,2);snapshot.retests[0].actual='CAMBIO EN COPIA DE EXPORTACION';assert.equal(a.retests[0].actual,'VALIDACION A');
});
