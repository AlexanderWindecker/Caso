import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import JSZip from 'jszip';
import {newReport,newCase,newStandaloneBug} from '../src/model.js';
import {moveCase} from '../src/case-order.js';
import {newRetest,retestSources} from '../src/retests.js';
import {ReportStore} from '../scripts/report-store.mjs';
import {createWord} from '../src/document.js';
import {createCaseArchive} from '../src/case-archive.js';
function setup(){const r=newReport();r.cases=Array.from({length:13},(_,i)=>{const c=newCase(i+1);c.name='CASO ORDEN '+String(i+1).padStart(2,'0');c.steps='Pasos del caso '+(i+1);c.reviewed=i%2===0;return c;});return r;}
test('Arrastrar en ambos sentidos renumera todos los casos y mantiene sus datos e identidad',()=>{
  const r=setup(),original=r.cases[8],uid=original.uid;original.selected=false;original.bug.enabled=true;original.bug.title='Defecto conservado';const content=structuredClone(original);delete content.id;
  assert.equal(moveCase(r,uid,r.cases[0].uid,'before'),true);assert.equal(r.cases[0],original);assert.deepEqual(r.cases.map(c=>c.id),Array.from({length:13},(_,i)=>'CP-'+String(i+1).padStart(3,'0')));
  const current=structuredClone(original);delete current.id;assert.deepEqual(current,content);assert.equal(moveCase(r,uid,r.cases.at(-1).uid,'after'),true);assert.equal(r.cases.at(-1),original);assert.equal(original.id,'CP-013');assert.equal(new Set(r.cases.map(c=>c.uid)).size,13);
});
test('Reordenar actualiza referencias de validaciones por UID sin confundir bugs independientes',()=>{
  const r=setup(),c=r.cases[8];c.bug.enabled=true;const v=newRetest(r,retestSources(r)[0]);r.retests.push(v);const independent=newStandaloneBug();r.bugs.push(independent);const other=newRetest(r,retestSources(r).find(s=>s.sourceUid===independent.uid));r.retests.push(other);const before=structuredClone(other);
  moveCase(r,c.uid,r.cases[0].uid);assert.equal(v.sourceId,'CP-001');assert.equal(v.sourceUid,c.uid);assert.equal(v.groupUid,c.uid);assert.deepEqual(other,before);
});
test('Soltar en la misma posición o con destinos inválidos no cambia el informe',()=>{
  const r=setup(),before=JSON.stringify(r);assert.equal(moveCase(r,r.cases[0].uid,r.cases[0].uid),false);assert.equal(moveCase(r,r.cases[0].uid,r.cases[1].uid,'before'),false);assert.equal(moveCase(r,r.cases[1].uid,r.cases[0].uid,'after'),false);assert.equal(moveCase(r,'missing',r.cases[0].uid),false);assert.equal(moveCase(r,r.cases[0].uid,'missing'),false);assert.equal(moveCase(r,r.cases[0].uid,r.cases[2].uid,'invalid'),false);assert.equal(JSON.stringify(r),before);
});
test('Nuevo orden y números sobreviven al reinicio, aparecen en Word y conservan el historial anterior',async()=>{
  const r=setup(),moved=r.cases[8],root=await mkdtemp(join(tmpdir(),'caso-case-order-'));
  try{const store=new ReportStore(root),before=await store.write(r);moveCase(r,moved.uid,r.cases[0].uid);await store.write(r,before._diskRevision);const recovered=await new ReportStore(root).get(r.uid);assert.equal(recovered.cases[0].uid,moved.uid);assert.equal(recovered.cases[0].id,'CP-001');assert.equal((await store.version(r.uid,before._diskRevision)).cases[8].uid,moved.uid);
    const doc=await JSZip.loadAsync(await(await createWord(recovered)).arrayBuffer()),xml=await doc.file('word/document.xml').async('string');assert.ok(xml.indexOf(moved.name)<xml.indexOf(recovered.cases[1].name));
    const zip=await JSZip.loadAsync(await(await createCaseArchive(recovered)).arrayBuffer());assert.ok(Object.keys(zip.files)[0].includes(moved.name));
  }finally{await rm(root,{recursive:true,force:true});}
});
