import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import JSZip from 'jszip';
import {newReport,newCase} from '../src/model.js';
import {createCaseArchive} from '../src/case-archive.js';
import {downloadsAPI} from '../scripts/downloads.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
test('40 casos producen 40 Word independientes, con su plantilla, ticket y evidencias',async()=>{
  const r=newReport();r.ticket='JIRA-400';r.template.case.sections[1].title='Objetivo personalizado';
  r.cases=Array.from({length:41},(_,i)=>{const c=newCase(i+1);c.name='CASO_UNICO_'+String(i+1).padStart(3,'0');c.objective='Objetivo '+c.name;c.steps='Abrir '+c.name+'\nGuardar';c.evidence=[{uid:crypto.randomUUID(),name:'captura.png',caption:'Evidencia '+c.name,data:png}];return c;});
  r.cases[40].selected=false;const before=JSON.stringify(r),progress=[];
  const blob=await createCaseArchive(r,{dimensions:async()=>({width:1,height:1}),onProgress:p=>progress.push(p)});
  const archive=await JSZip.loadAsync(await blob.arrayBuffer()),files=Object.keys(archive.files);
  assert.equal(files.length,40);assert.equal(blob.type,'application/zip');assert.equal(JSON.stringify(r),before);
  for(const [i,path] of files.entries()){
    assert.ok(path.endsWith('.docx'));const doc=await JSZip.loadAsync(await archive.file(path).async('uint8array')),xml=await doc.file('word/document.xml').async('string');
    for(const value of [r.cases[i].name,'JIRA-400','Objetivo personalizado','Paso 1','Paso 2','Evidencia '+r.cases[i].name])assert.ok(xml.includes(value),path+': '+value);
    assert.ok(!xml.includes(r.cases[(i+1)%40].name));assert.ok(!xml.includes('CASO_UNICO_041'));assert.equal((xml.match(/<w:drawing>/g)||[]).length,1);assert.ok(xml.includes('1.2 '));
  }
  assert.deepEqual(progress.filter(p=>p.phase==='documents').map(p=>p.completed),Array.from({length:41},(_,i)=>i));assert.equal(progress.at(-1).phase,'archive');
});
test('Nombres repetidos o con separadores generan archivos seguros, distintos y sin carpetas',async()=>{
  const r=newReport();r.title='CF - ABM Empresa';r.cases=[newCase(1),newCase(1)];r.cases.forEach(c=>{c.name='../Duplicado: nombre/archivo';});
  const zip=await JSZip.loadAsync(await(await createCaseArchive(r)).arrayBuffer());const files=Object.keys(zip.files);assert.equal(files.length,2);assert.notEqual(files[0],files[1]);assert.ok(files.every(p=>!/[<>:"/\\|?*]/.test(p)));
  assert.ok(files.every(p=>p.startsWith('CF - ABM Empresa - ')));assert.ok(files[1].endsWith(' (2).docx'));
  r.cases.forEach(c=>c.omittedFields.name=true);const hidden=await JSZip.loadAsync(await(await createCaseArchive(r)).arrayBuffer());assert.ok(Object.keys(hidden.files).every(p=>!p.includes('Duplicado')));
});
test('La exportación separada valida selección y todos los obligatorios antes de empezar',async()=>{
  const r=newReport();r.cases[0].selected=false;await assert.rejects(()=>createCaseArchive(r),/Seleccioná/);r.cases[0].selected=true;r.cases.push(newCase(2));const field=r.template.case.sections[0].fields.find(f=>f.key==='name');field.required=true;r.cases[0].name='Completo';let started=false;await assert.rejects(()=>createCaseArchive(r,{onProgress:()=>{started=true;}}),/CP-002/);assert.equal(started,false);
});
test('Descarga ZIP grande conserva extensión y contenido; un ZIP inválido se rechaza',async()=>{
  const root=await mkdtemp(join(tmpdir(),'caso-zip-download-'));
  try{
    const handler=downloadsAPI(root),zip=new JSZip();zip.file('caso.docx',new Uint8Array(27*1024*1024));const bytes=await zip.generateAsync({type:'uint8array',compression:'STORE'}),filename='Pruebas separadas.zip';
    const request=data=>new Request('http://localhost/api/downloads',{method:'POST',headers:{Origin:'http://localhost','X-Download-Filename':encodeURIComponent(filename),'Content-Type':'application/zip'},body:data});
    const prepared=await handler(request(bytes));assert.equal(prepared.status,200);const result=await prepared.json(),response=await handler(new Request('http://localhost'+result.url));assert.equal(result.filename,filename);assert.equal(response.headers.get('Content-Type'),'application/zip');assert.ok(response.headers.get('Content-Disposition').includes('.zip'));assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);assert.equal((await handler(request('invalid'))).status,400);
  }finally{await rm(root,{recursive:true,force:true});}
});
