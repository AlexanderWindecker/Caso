import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import JSZip from 'jszip';
import {newReport,newCase,newBug,bugEntries,validateBackup,reportEvidenceGroups} from '../src/model.js';
import {caseBugEntries,hasCaseBug,resetClonedCaseBugs,removeCaseBug} from '../src/case-bugs.js';
import {createBugWord,createWord} from '../src/document.js';
import {coverageStatus} from '../src/coverage.js';
import {retestSources,newRetest,remapRetestSources} from '../src/retests.js';
import {moveCase} from '../src/case-order.js';
import {ReportStore} from '../scripts/report-store.mjs';
const image=caption=>({uid:crypto.randomUUID(),name:'e.png',caption,data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII='});
function setup(){const r=newReport(),c=r.cases[0];c.name='Caso con defectos';c.steps='Paso del caso';c.bug.enabled=true;c.bug.title='PRIMER DEFECTO';c.bug.evidence=[image('SOLO PRIMERO')];c.evidence=[image('HEREDADA DEL CASO')];c.additionalBugs=[{...newBug(),uid:crypto.randomUUID(),enabled:true,title:'SEGUNDO DEFECTO',steps:'PASO DEL SEGUNDO',evidence:[image('SOLO SEGUNDO')]}];return {r,c};}
async function document(blob){return (await JSZip.loadAsync(await blob.arrayBuffer())).file('word/document.xml').async('string');}

test('Varios bugs mantienen identidad y datos del bug original; desactivar uno no oculta el otro',()=>{
  const {r,c}=setup(),before=structuredClone(c);assert.equal(bugEntries(r).length,2);assert.equal(caseBugEntries(c)[0].uid,c.uid);assert.equal(caseBugEntries(c)[1].uid,c.additionalBugs[0].uid);assert.deepEqual(c,before);
  c.bug.enabled=false;assert.equal(bugEntries(r).length,1);assert.equal(hasCaseBug(c),true);assert.equal(coverageStatus(c),'failed');assert.equal(c.bug.title,'PRIMER DEFECTO');
  c.additionalBugs[0].enabled=false;assert.equal(hasCaseBug(c),false);assert.equal(bugEntries(r).length,0);assert.equal(caseBugEntries(c,true).length,2);
});

test('Cada Word contiene solo las evidencias del bug elegido, sin las del caso ni las de sus hermanos',async()=>{
  const {r,c}=setup(),uid=c.additionalBugs[0].uid,options={dimensions:async()=>({width:1,height:1})};
  const first=await document(await createBugWord(r,{...options,caseUid:c.uid}));assert.match(first,/PRIMER DEFECTO/);assert.match(first,/SOLO PRIMERO/);assert.doesNotMatch(first,/HEREDADA DEL CASO|SEGUNDO DEFECTO|SOLO SEGUNDO/);
  const second=await document(await createBugWord(r,{...options,caseUid:uid}));assert.match(second,/SEGUNDO DEFECTO/);assert.match(second,/PASO DEL SEGUNDO/);assert.match(second,/SOLO SEGUNDO/);assert.doesNotMatch(second,/HEREDADA DEL CASO|PRIMER DEFECTO|SOLO PRIMERO/);
  const all=await document(await createBugWord(r,options));assert.match(all,/PRIMER DEFECTO/);assert.match(all,/SEGUNDO DEFECTO/);assert.doesNotMatch(all,/HEREDADA DEL CASO/);
  const regular=await document(await createWord(r,options));assert.doesNotMatch(regular,/PRIMER DEFECTO|SEGUNDO DEFECTO/);assert.match(regular,/HEREDADA DEL CASO/);
});

test('Validaciones y reordenamiento distinguen bugs del mismo caso; restaurar remapea ambas identidades',()=>{
  const {r,c}=setup(),sources=retestSources(r);assert.equal(sources.length,2);assert.equal(sources[0].sourceUid,c.uid);assert.equal(sources[1].sourceUid,c.additionalBugs[0].uid);assert.equal(sources[1].sourceId,c.id);
  r.retests=sources.map(source=>newRetest(r,source));assert.equal(r.retests[0].attempt,1);assert.equal(r.retests[1].attempt,1);assert.notEqual(r.retests[0].groupUid,r.retests[1].groupUid);
  const other=newCase(2);r.cases.push(other);moveCase(r,c.uid,other.uid,'after');assert.equal(r.retests[0].sourceId,'CP-002');assert.equal(r.retests[1].sourceId,'CP-002');
  const copy=structuredClone(r);for(const entry of copy.cases){entry.uid=crypto.randomUUID();for(const bug of entry.additionalBugs||[])bug.uid=crypto.randomUUID();}
  remapRetestSources(r,copy);assert.equal(copy.retests[0].sourceUid,copy.cases[1].uid);assert.equal(copy.retests[1].sourceUid,copy.cases[1].additionalBugs[0].uid);validateBackup({format:'caso-qa-v1',reports:[copy]});
});

test('Clonar mantiene los textos de todos los bugs, renueva IDs y no copia ninguna evidencia',()=>{
  const {c}=setup(),before=structuredClone(c),copy=resetClonedCaseBugs(structuredClone(c));copy.evidence=[];
  assert.equal(copy.bug.title,c.bug.title);assert.equal(copy.additionalBugs[0].title,c.additionalBugs[0].title);assert.notEqual(copy.additionalBugs[0].uid,c.additionalBugs[0].uid);assert.deepEqual(copy.bug.evidence,[]);assert.deepEqual(copy.additionalBugs[0].evidence,[]);assert.deepEqual(c,before);
});

test('Eliminar bug adicional conserva el original, las evidencias del caso y las validaciones históricas',()=>{
  const {r,c}=setup(),original=structuredClone(c.bug),evidence=structuredClone(c.evidence);
  r.retests=retestSources(r).map(source=>newRetest(r,source));const history=structuredClone(r.retests);
  assert.equal(removeCaseBug(c,c.additionalBugs[0].uid),true);assert.deepEqual(c.additionalBugs,[]);assert.deepEqual(c.bug,original);assert.deepEqual(c.evidence,evidence);assert.deepEqual(r.retests,history);assert.equal(bugEntries(r).length,1);validateBackup({format:'caso-qa-v1',reports:[r]});
});

test('Eliminar el bug original no reasigna la identidad de sus hermanos ni borra el caso',()=>{
  const {r,c}=setup(),additional=structuredClone(c.additionalBugs),evidence=structuredClone(c.evidence),uid=c.uid;
  assert.equal(removeCaseBug(c,uid),true);assert.equal(c.bug,undefined);assert.equal(c.primaryBugRemoved,true);assert.equal(c.uid,uid);assert.deepEqual(c.additionalBugs,additional);assert.deepEqual(c.evidence,evidence);assert.equal(caseBugEntries(c)[0].uid,additional[0].uid);assert.equal(hasCaseBug(c),true);validateBackup({format:'caso-qa-v1',reports:[r]});
  assert.equal(removeCaseBug(c,additional[0].uid),true);assert.equal(hasCaseBug(c),false);assert.deepEqual(bugEntries(r),[]);assert.equal(r.cases.length,1);const before=structuredClone(c);assert.equal(removeCaseBug(c,'no-existe'),false);assert.deepEqual(c,before);
});

test('Guardar, respaldar y recuperar incluyen todas las evidencias; los informes antiguos no se migran',async()=>{
  const {r,c}=setup(),root=await mkdtemp(join(tmpdir(),'caso-multi-bug-'));
  try{assert.equal(reportEvidenceGroups(r).filter(group=>group.length).length,3);const store=new ReportStore(root),saved=await store.write(r),loaded=await new ReportStore(root).get(r.uid);assert.deepEqual(loaded,saved);assert.deepEqual(loaded.cases[0],c);validateBackup({format:'caso-qa-v1',reports:[loaded]});
    removeCaseBug(loaded.cases[0],loaded.cases[0].uid);const after=await store.write(loaded,loaded._diskRevision);assert.equal((await store.get(r.uid)).cases[0].bug,undefined);assert.deepEqual((await store.version(r.uid,saved._diskRevision)).cases[0].bug,c.bug);assert.deepEqual(after.cases[0].additionalBugs,c.additionalBugs);
    const legacy=newReport(),before=structuredClone(legacy);validateBackup({format:'caso-qa-v1',reports:[legacy]});bugEntries(legacy);assert.deepEqual(legacy,before);
    const invalid=structuredClone(r);invalid.cases[0].additionalBugs[0].evidence[0].data='invalid';assert.throws(()=>validateBackup({format:'caso-qa-v1',reports:[invalid]}),/imagen/);
  }finally{assert.ok(root.startsWith(join(tmpdir(),'caso-multi-bug-')));await rm(root,{recursive:true,force:true});}
});
