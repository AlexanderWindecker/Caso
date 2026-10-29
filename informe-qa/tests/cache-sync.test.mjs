import test from 'node:test';
import assert from 'node:assert/strict';
import {syncCachedReports} from '../src/cache-sync.js';

test('Dos informes que superan juntos 26 MB se recuperan en solicitudes independientes',async()=>{
  const cached=[{uid:'a',cases:[{evidence:[{data:'a'.repeat(15*1024*1024)}]}]},{uid:'b',cases:[{evidence:[{data:'b'.repeat(13*1024*1024)}]}]}];
  assert.ok(Buffer.byteLength(JSON.stringify({reports:cached}))>26*1024*1024);
  const calls=[],disk=[];
  const result=await syncCachedReports(cached,[],async report=>{
    const body={reports:[report]};assert.ok(Buffer.byteLength(JSON.stringify(body))<26*1024*1024);
    calls.push(report.uid);disk.push(report);return [...disk];
  });
  assert.deepEqual(calls,['a','b']);assert.equal(result.length,2);assert.equal(result[0],cached[0]);assert.equal(result[1],cached[1]);
});

test('Una caché idéntica no se envía aunque cambie la revisión o el orden de las propiedades',async()=>{
  const cached=[{uid:'a',_diskRevision:'old',cases:[{name:'Caso',evidence:[{data:'IMAGE',caption:'Conservar'}]}]}];
  const disk=[{cases:[{evidence:[{caption:'Conservar',data:'IMAGE'}],name:'Caso'}],_diskRevision:'new',uid:'a'}];
  const before=structuredClone({cached,disk});
  const result=await syncCachedReports(cached,disk,async()=>{assert.fail('No se debe importar una copia idéntica');});
  assert.equal(result,disk);assert.deepEqual({cached,disk},before);
});

test('Cambios sin sincronizar y registros ausentes se envían sin modificar las copias originales',async()=>{
  const cached=[{uid:'a',cases:[{name:'Editado',almSubject:'A',expected:'Step 1: Resultado',evidence:[{data:'NEW'}]}]},{uid:'b',cases:[]}];
  const disk=[{uid:'a',cases:[{name:'Anterior',evidence:[{data:'OLD'}]}]}];const before=structuredClone({cached,disk}),calls=[];
  await syncCachedReports(cached,disk,async report=>{calls.push(report);return disk;});
  assert.deepEqual(calls,cached);assert.deepEqual({cached,disk},before);
});

test('Errores de recuperación se propagan sin borrar ni cambiar caché o disco',async()=>{
  const cached=[{uid:'a',cases:[]}],disk=[];
  await assert.rejects(()=>syncCachedReports(cached,disk,async()=>{throw new Error('Sin conexión');}),/Sin conexión/);
  assert.deepEqual(cached,[{uid:'a',cases:[]}]);assert.deepEqual(disk,[]);
});
