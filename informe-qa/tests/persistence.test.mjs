import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ReportStore,storageAPI} from '../scripts/report-store.mjs';
import {newReport} from '../src/model.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
async function setup(){const root=await mkdtemp(join(tmpdir(),'caso-persist-test-'));return {root,store:new ReportStore(root)};}
test('Informe, favoritos, omisiones e imágenes sobreviven al reinicio; las imágenes no se duplican por versión',async()=>{const {root,store}=await setup(),r=newReport();r.title='Persistencia';r.favorite=true;r.cases[0].name='Caso original';r.cases[0].omittedFields={rules:true};r.cases[0].evidence=[{uid:crypto.randomUUID(),name:'captura.png',caption:'Evidencia',data:png}];const first=await store.write(r);r.cases[0].objective='Cambio guardado';await store.write(r,first._diskRevision);const restarted=new ReportStore(root),saved=await restarted.get(r.uid);assert.equal(saved.favorite,true);assert.equal(saved.cases[0].objective,'Cambio guardado');assert.equal(saved.cases[0].evidence[0].data,png);assert.equal(saved.cases[0].omittedFields.rules,true);assert.equal((await readdir(join(root,'images'))).length,1);assert.equal((await restarted.history(r.uid)).length,2);const old=await restarted.version(r.uid,first._diskRevision);assert.equal(old.cases[0].objective,'');assert.equal(old.cases[0].evidence[0].data,png);});
test('Una pestaña desactualizada no sobrescribe el informe y su borrador queda recuperable',async()=>{const {store}=await setup(),r=newReport(),first=await store.write(r);const a=structuredClone(r),b=structuredClone(r);a.cases[0].objective='Versión nueva';b.cases[0].objective='Borrador de otra pestaña';const latest=await store.write(a,first._diskRevision);await assert.rejects(()=>store.write(b,first._diskRevision),e=>e.status===409);assert.equal((await store.get(r.uid)).cases[0].objective,'Versión nueva');const history=await store.history(r.uid),draft=history.find(v=>v.kind==='conflict');assert.ok(draft);assert.equal((await store.version(r.uid,draft.revision)).cases[0].objective,'Borrador de otra pestaña');assert.equal((await store.get(r.uid))._diskRevision,latest._diskRevision);});
test('Migración de otros perfiles agrega informes y conserva ambas versiones si hay diferencias',async()=>{const {store}=await setup(),r=newReport();r.cases[0].objective='Disco';await store.write(r);let all=await store.import([r]);assert.equal(all.length,1);const local=structuredClone(r);local.cases[0].objective='Perfil distinto';all=await store.import([local]);assert.equal(all.length,2);assert.ok(all.some(r=>r.cases[0].objective==='Disco'));assert.ok(all.some(r=>r.cases[0].objective==='Perfil distinto'));});
test('Una caché que coincide con una versión anterior no crea una copia al abrir repetidamente',async()=>{
  const {store}=await setup(),r=newReport();r.title='Original';const old=await store.write(r);
  r.title='Título actualizado';r.cases[0].actual='Cambio reciente';await store.write(r,old._diskRevision);
  for(let i=0;i<3;i++){const all=await store.import([old]);assert.equal(all.length,1);assert.equal(all[0].title,'Título actualizado');}
  assert.equal((await store.history(r.uid)).length,2);
});
test('Una caché con cambios propios y revisión vigente se guarda en el mismo informe',async()=>{
  const {store}=await setup(),saved=await store.write(newReport());saved.cases[0].actual='Edición sin sincronizar';
  const all=await store.import([saved]);assert.equal(all.length,1);assert.equal(all[0].uid,saved.uid);assert.equal(all[0].cases[0].actual,'Edición sin sincronizar');
});
test('Solo cambiar updated no recupera copias del contenido actual ni de una versión anterior',async()=>{
  const {store}=await setup(),r=newReport(),old=await store.write(r);r.cases[0].actual='Nueva versión';const current=await store.write(r,old._diskRevision);
  old.updated='2099-01-01T00:00:00.000Z';current.updated='2099-01-02T00:00:00.000Z';
  await store.import([old,current]);assert.equal((await store.all()).length,1);assert.equal((await store.history(r.uid)).length,2);
});
test('Deshacer un cambio desde la revisión vigente conserva la intención aunque coincida con una versión histórica',async()=>{
  const {store}=await setup(),r=newReport(),first=await store.write(r);r.cases[0].actual='Cambio';const current=await store.write(r,first._diskRevision);
  current.cases[0].actual='';const all=await store.import([current]);assert.equal(all.length,1);assert.equal(all[0].cases[0].actual,'');
});
test('Una divergencia real se recupera una sola vez aunque la caché se reenvíe',async()=>{
  const {store}=await setup(),r=newReport(),saved=await store.write(r);r.cases[0].actual='Cambió en disco';await store.write(r,saved._diskRevision);
  saved.cases[0].actual='Borrador diferente';let recovered;
  for(let i=0;i<3;i++){const all=await store.import([saved]);assert.equal(all.length,2);const copy=all.find(v=>v.uid!==r.uid);assert.equal(copy.cases[0].actual,'Borrador diferente');if(recovered)assert.equal(copy.uid,recovered.uid);recovered=copy;}
  recovered.title='Recuperación editada';const edited=await store.write(recovered,recovered._diskRevision);
  assert.equal((await store.import([saved])).find(v=>v.uid===recovered.uid).title,'Recuperación editada');
  await store.remove(edited.uid,edited._diskRevision);assert.equal((await store.import([saved])).length,1);
});
test('Dos importaciones concurrentes del mismo borrador no crean recuperaciones duplicadas',async()=>{
  const {store}=await setup(),r=newReport();await store.write(r);r.cases[0].actual='Borrador';
  await Promise.all([store.import([r]),store.import([r])]);assert.equal((await store.all()).length,2);
});
test('Eliminación conserva todo el historial y no reaparece por una caché antigua',async()=>{const {store}=await setup(),r=newReport(),saved=await store.write(r);await store.remove(r.uid,saved._diskRevision);assert.equal(await store.get(r.uid),null);assert.equal((await store.all()).length,0);assert.equal((await store.version(r.uid,saved._diskRevision)).cases.length,1);await store.import([r]);assert.equal((await store.all()).length,0);});
test('Dos guardados simultáneos sobre la misma versión preservan ganador y borrador',async()=>{const {store}=await setup(),r=newReport(),saved=await store.write(r),a=structuredClone(r),b=structuredClone(r);a.title='Uno';b.title='Dos';const result=await Promise.allSettled([store.write(a,saved._diskRevision),store.write(b,saved._diskRevision)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.filter(r=>r.status==='rejected').length,1);assert.equal((await store.history(r.uid)).length,3);});
test('API permite lectura compartida entre perfiles y rechaza escrituras de otros sitios',async()=>{const {store}=await setup(),handler=storageAPI(store),r=newReport();let response=await handler(new Request('http://localhost:4310/api/storage/reports/'+r.uid,{method:'POST',headers:{origin:'https://otro.example','Content-Type':'application/json'},body:JSON.stringify({report:r})}));assert.equal(response.status,403);response=await handler(new Request('http://localhost:4310/api/storage/reports/'+r.uid,{method:'POST',headers:{origin:'http://localhost:4310','Content-Type':'application/json'},body:JSON.stringify({report:r,baseRevision:null})}));assert.equal(response.status,200);response=await handler(new Request('http://127.0.0.1:4310/api/storage/reports'));assert.equal((await response.json()).reports.length,1);response=await handler(new Request('http://localhost:4310/api/storage/history'));assert.equal((await response.json()).versions.length,1);});
