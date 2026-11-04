import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ReportStore} from '../scripts/report-store.mjs';
import {newReport} from '../src/model.js';
import {planBrowserCopies,archiveBrowserCopies} from '../scripts/reconcile-browser-copies.mjs';

test('Archivar copias históricas conserva versiones y excluye los borradores con datos distintos',async t=>{
  const root=await mkdtemp(join(tmpdir(),'qa-copy-cleanup-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=new ReportStore(root),r=newReport();r.title='Informe original';r.cases[0].actual='Versión anterior';r.cases[0].evidence=[{uid:crypto.randomUUID(),name:'captura.png',caption:'Evidencia conservada',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII='}];const first=await store.write(r);
  r.cases[0].actual='Última versión';await store.write(r,first._diskRevision);
  const copy={...first,uid:crypto.randomUUID(),title:first.title+' (copia del navegador)'};delete copy._diskRevision;await store.write(copy);
  const distinct=structuredClone(copy);distinct.uid=crypto.randomUUID();distinct.cases[0].actual='Edición única';await store.write(distinct);
  const plan=await planBrowserCopies(store);assert.deepEqual(plan.map(p=>p.copyUid),[copy.uid]);
  await archiveBrowserCopies(store,plan);assert.equal((await store.all()).length,2);assert.equal(await store.get(copy.uid),null);
  const history=await store.history(copy.uid);assert.ok(history.some(v=>v.kind==='deleted'));assert.equal((await store.version(copy.uid,history.find(v=>v.kind==='saved').revision)).cases[0].actual,'Versión anterior');
  await store.import([copy]);assert.equal((await store.all()).length,2);
});
test('Una copia modificada después de revisar el plan se mantiene activa',async t=>{
  const root=await mkdtemp(join(tmpdir(),'qa-copy-changed-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=new ReportStore(root),r=newReport();r.title='Informe';await store.write(r);
  const copy=await store.write({...r,uid:crypto.randomUUID(),title:'Informe (copia del navegador)'});const plan=await planBrowserCopies(store);
  copy.cases[0].actual='Cambio posterior';await store.write(copy,copy._diskRevision);
  assert.deepEqual(await archiveBrowserCopies(store,plan),[]);assert.equal((await store.all()).length,2);
});
