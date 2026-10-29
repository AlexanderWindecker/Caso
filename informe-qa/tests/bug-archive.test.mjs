import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {newReport,newBug,newStandaloneBug,bugEntries} from '../src/model.js';
import {createBugArchive} from '../src/bug-archive.js';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l4sAAAAASUVORK5CYII=';
const image=caption=>({uid:crypto.randomUUID(),name:'e.png',caption,data:png});

test('40 bugs generan 40 Word con pasos, ticket y evidencias propios, sin mezclar bugs hermanos',async()=>{
  const r=newReport(),c=r.cases[0];r.title='Informe QA';r.ticket='JIRA-400';r.template.bug.sections[0].title='Detalle personalizado';
  c.selected=false;c.steps='PASOS HEREDADOS';c.evidence=[image('CAPTURA DEL CASO')];c.bug.enabled=true;c.bug.title='BUG_UNICO_001';c.bug.evidence=[image('CAPTURA PROPIA 001')];
  c.additionalBugs=Array.from({length:38},(_,i)=>({...newBug(),uid:crypto.randomUUID(),enabled:true,title:'BUG_UNICO_'+String(i+2).padStart(3,'0'),steps:'PASOS PROPIOS '+(i+2),evidence:[image('CAPTURA PROPIA '+String(i+2).padStart(3,'0'))]}));
  c.additionalBugs.push({...newBug(),uid:crypto.randomUUID(),enabled:false,title:'BUG INACTIVO NO EXPORTABLE'});
  const independent=newStandaloneBug();independent.bug.title='BUG_UNICO_040';independent.steps='PASOS INDEPENDIENTES';independent.evidence=[image('CAPTURA PROPIA 040')];r.bugs.push(independent);
  const before=structuredClone(r),progress=[],entries=bugEntries(r),blob=await createBugArchive(r,{dimensions:async()=>({width:1,height:1}),onProgress:p=>progress.push(p)});
  const zip=await JSZip.loadAsync(await blob.arrayBuffer()),files=Object.keys(zip.files);assert.equal(files.length,40);assert.equal(blob.type,'application/zip');assert.deepEqual(r,before);
  for(const [i,file] of files.entries()){
    const doc=await JSZip.loadAsync(await zip.file(file).async('uint8array')),xml=await doc.file('word/document.xml').async('string');
    assert.ok(file.endsWith('.docx'));assert.ok(xml.includes(entries[i].bug.title));assert.ok(!xml.includes(entries[(i+1)%40].bug.title));assert.ok(!xml.includes('BUG INACTIVO NO EXPORTABLE'));
    assert.ok(xml.includes('JIRA-400'));assert.ok(xml.includes('Detalle personalizado'));assert.ok(xml.includes('CAPTURA PROPIA '+String(i+1).padStart(3,'0')));
    assert.equal((xml.match(/<w:drawing>/g)||[]).length,1);
    assert.ok(!xml.includes('CAPTURA DEL CASO'));
    assert.ok(xml.includes(i===0?'PASOS HEREDADOS':i===39?'PASOS INDEPENDIENTES':'PASOS PROPIOS '+(i+1)));
  }
  assert.deepEqual(progress.filter(p=>p.phase==='documents').map(p=>p.completed),Array.from({length:41},(_,i)=>i));assert.equal(progress.at(-1).phase,'archive');
});

test('Nombres repetidos se diferencian y no generan rutas ni caracteres inválidos',async()=>{
  const r=newReport(),c=r.cases[0];c.bug.enabled=true;c.bug.title='../Duplicado: archivo/bug';
  const b=newStandaloneBug();b.bug.title=c.bug.title;r.bugs.push(b);
  const zip=await JSZip.loadAsync(await(await createBugArchive(r)).arrayBuffer()),names=Object.keys(zip.files);
  assert.equal(names.length,2);assert.notEqual(names[0],names[1]);assert.ok(names[1].endsWith(' (2).docx'));assert.ok(names.every(name=>!/[<>:"/\\|?*]/.test(name)));
  c.bug.omittedFields={title:true};b.bug.omittedFields={title:true};const hidden=await JSZip.loadAsync(await(await createBugArchive(r)).arrayBuffer());assert.ok(Object.keys(hidden.files).every(name=>!name.includes('Duplicado')));
});

test('ZIP valida bugs activos y campos requeridos antes de generar documentos',async()=>{
  const r=newReport();await assert.rejects(()=>createBugArchive(r),/No hay bugs/);
  r.cases[0].bug.enabled=true;r.template.bug.sections[0].fields.find(f=>f.key==='title').required=true;let started=false;
  await assert.rejects(()=>createBugArchive(r,{onProgress:()=>{started=true;}}),/obligatorios/);assert.equal(started,false);
});
