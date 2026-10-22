import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import JSZip from 'jszip';
import {newReport,newStandaloneBug,validateBackup} from '../src/model.js';
import {filterIndependentBugs} from '../src/independent-bugs.js';
import {createBugWord} from '../src/document.js';
import {ReportStore} from '../scripts/report-store.mjs';
test('Filtros de bugs combinan ticket, componente, severidad y prioridad',()=>{
  const r=newReport();r.ticket='CF-215';const a=newStandaloneBug(),b=newStandaloneBug(2),legacy=newStandaloneBug(3);
  Object.assign(a.bug,{component:'Administración / Empresas',severity:'Alta',priority:'Alta'});Object.assign(b.bug,{ticket:'INC-100',component:'Pagos',severity:'Media',priority:'Baja'});delete legacy.bug.component;r.bugs.push(a,b,legacy);
  assert.deepEqual(filterIndependentBugs(r,{ticket:'cf-2',component:'administracion',severity:'alta',priority:'alta'}),[a]);
  assert.deepEqual(filterIndependentBugs(r,{ticket:'inc',component:'pag',severity:'Media',priority:'Baja'}),[b]);
  assert.equal(filterIndependentBugs(r,{component:'Empresas',priority:'Baja'}).length,0);assert.equal(filterIndependentBugs(r).length,3);assert.equal(filterIndependentBugs(r,{component:'   '}).length,3);assert.equal(filterIndependentBugs(newReport()).length,0);
});
test('Componente se guarda, se respalda y se exporta con el bug',async()=>{
  const r=newReport(),b=newStandaloneBug();b.bug.title='Defecto con componente';b.bug.component='ABM Empresas / Pago con imputabilidad';r.bugs.push(b);const root=await mkdtemp(join(tmpdir(),'caso-component-'));
  try{const store=new ReportStore(root);await store.write(r);const saved=await new ReportStore(root).get(r.uid);assert.equal(saved.bugs[0].bug.component,b.bug.component);assert.equal(validateBackup({format:'caso-qa-v1',reports:[saved]}).length,1);const zip=await JSZip.loadAsync(await(await createBugWord(saved,{caseUid:b.uid})).arrayBuffer());assert.ok((await zip.file('word/document.xml').async('string')).includes(b.bug.component));delete saved.bugs[0].bug.component;assert.equal(validateBackup({format:'caso-qa-v1',reports:[saved]}).length,1);saved.bugs[0].bug.component=123;assert.throws(()=>validateBackup({format:'caso-qa-v1',reports:[saved]}),/componente/);}finally{await rm(root,{recursive:true,force:true});}
});
