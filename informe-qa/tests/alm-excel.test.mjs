import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import JSZip from 'jszip';
import {almFields,almValue,addAlmTemplateFields} from '../src/alm-fields.js';
import {almRows,almHeaders,createAlmExcel,excelMime,almExportProblems} from '../src/alm-excel.js';
import {newReport,newCase,validateBackup} from '../src/model.js';
import {validateTemplate,templateFields,fieldValue} from '../src/templates.js';
import {ReportStore} from '../scripts/report-store.mjs';
import {downloadsAPI} from '../scripts/downloads.mjs';
import {renderTemplateField} from '../src/fields-ui.js';

function fixture(){const r=newReport(),c=r.cases[0];c.name='Validar consulta';c.almPriority='MEDIA';c.almIntegration='SI';c.almRegression='NO';c.objective='Consultar cheque';c.testData='CMC7: 0000123';c.steps='1. Ingresar\n\nPaso 2: Consultar';c.expected='Se muestra la consulta';c.preconditions='Servicio disponible';c.role='Operador';c.existingData='Cheque creado';c.dependencies='Servicio bancario';c.evidence=[{uid:crypto.randomUUID(),name:'PRIVATE_EVIDENCE.png',caption:'PRIVATE_CAPTION',data:'data:image/png;base64,AAAA'}];c.bug.enabled=true;c.bug.evidence=[{...c.evidence[0],uid:crypto.randomUUID()}];return r;}

test('ALM exporta una fila por paso, completa identidad solo al inicio y ubica el esperado final sin modificar el caso',()=>{
  const r=fixture(),c=r.cases[0],before=structuredClone(r);c.almPriority='ALTA';c.almIntegration='SI';c.almRegression='NO';c.almComplexity='Media';const saved=structuredClone(r);
  const rows=almRows(r,{subject:'Pruebas\\Cheques'});
  assert.equal(rows.length,2);assert.equal(rows[0].length,14);
  assert.deepEqual(rows[0].slice(0,4),['Pruebas\\Cheques','Validar consulta','MANUAL','IMPORTED']);
  assert.deepEqual(rows[1].slice(0,4),['','','','IMPORTED']);for(const column of [0,1,2,5,6,7])assert.equal(rows[1][column],'');
  assert.equal(rows[0][4],'Consultar cheque\n\nDatos de prueba:\nCMC7: 0000123');
  assert.deepEqual(rows[0].slice(5,10),['ALTA','SI','NO','Positivo','Media']);
  assert.equal(rows[0][10],'Servicio disponible\nUsuario / Rol requerido: Operador\nDatos existentes necesarios: Cheque creado\nDependencias con otros sistemas: Servicio bancario');
  assert.deepEqual(rows[0].slice(11),['Step 1','Ingresar','']);assert.deepEqual(rows[1].slice(11),['Step 2','Consultar','Se muestra la consulta']);
  assert.deepEqual(r,saved);assert.deepEqual(c.evidence,before.cases[0].evidence);assert.equal(c.almSubject,undefined);
});

test('ALM respeta Subject propio, valores vacíos explícitos y selección; evita fusionar casos homónimos',()=>{
  const r=fixture(),c=r.cases[0];c.almSubject='Propio\\Carpeta';c.almType='OTRO';c.almStatus='';
  const excluded=newCase(2);excluded.name='No exportar';excluded.selected=false;r.cases.push(excluded);
  assert.equal(almRows(r,{subject:'Común'})[0][0],'Propio\\Carpeta');assert.equal(almRows(r)[0][2],'OTRO');assert.equal(almRows(r)[0][3],'');
  assert.equal(almRows(r).length,2);excluded.selected=true;excluded.name=c.name;excluded.almSubject=c.almSubject;
  assert.throws(()=>almRows(r),/único caso/);excluded.almSubject='Otra carpeta';excluded.steps='';assert.equal(almRows(r).at(-1)[11],'Step 1');
  assert.equal(almRows(r).at(-1)[12],'');
});

test('Paso 1 agrupa todas sus líneas de ejecución en una sola fila y conserva el resultado final',()=>{
  const r=fixture(),c=r.cases[0];c.steps='Paso 1: Abrir SoapUI y seleccionar el servicio. Seleccionar GET.\nIngresar el CMC7 en la URL.\nEjecutar Submit.\n\nVerificar la respuesta.\nComparar con GUV.';
  const before=structuredClone(r),rows=almRows(r,{subject:'Pruebas'});
  assert.equal(rows.length,1);assert.equal(rows[0][11],'Step 1');assert.equal(rows[0][12],c.steps.slice('Paso 1: '.length));assert.equal(rows[0][13],c.expected);assert.deepEqual(r,before);
});

test('Los seis campos de cabecera se completan una vez por caso, también al iniciar el siguiente',async()=>{
  const r=fixture(),other=newCase(2);Object.assign(other,{name:'Otro caso',almSubject:'Imported\\BI-002',almPriority:'BAJA',almIntegration:'NO',almRegression:'SI',steps:'Paso 1: Abrir\nPaso 2: Guardar',expected:'Guardado'});r.cases.push(other);
  const before=structuredClone(r),rows=almRows(r,{subject:'Imported\\BI-001'});
  assert.equal(rows.length,4);
  assert.equal(rows[0][0],'Imported\\BI-001');assert.equal(rows[0][1],'Validar consulta');assert.equal(rows[2][0],'Imported\\BI-002');assert.equal(rows[2][1],'Otro caso');
  for(const index of [1,3])for(const column of [0,1,2,5,6,7])assert.equal(rows[index][column],'');
  assert.equal(rows[2][5],'BAJA');assert.equal(rows[2][6],'NO');assert.equal(rows[2][7],'SI');
  const zip=await JSZip.loadAsync(await(await createAlmExcel(r,{subject:'Imported\\BI-001'})).arrayBuffer());const sheet=await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.equal((sheet.match(/>Validar consulta<\/t>/g)||[]).length,1);assert.equal((sheet.match(/>Otro caso<\/t>/g)||[]).length,1);
  assert.match(sheet,/<c r="A3"[^>]*><is><t[^>]*><\/t>/);assert.deepEqual(r,before);
});

test('Se avisa por esperados intermedios sin bloquear un resultado general final',()=>{
  const r=fixture(),rows=almRows(r,{subject:'A'}),problems=almExportProblems(rows);
  assert.deepEqual(problems.errors,[]);assert.equal(problems.warnings.length,1);assert.match(problems.warnings[0],/Step 1/);
  r.cases[0].expected='Step 1: Inicio\nStep 2: Fin';assert.deepEqual(almExportProblems(almRows(r,{subject:'A'})),{errors:[],warnings:[]});
});

test('La descarga permite faltantes y solo avisa, incluso sin descripción o resultado esperado',async()=>{
  const r=fixture(),c=r.cases[0];c.almStatus='';c.objective='';c.testData='';c.steps='Paso 1: Abrir';
  assert.deepEqual(almExportProblems(almRows(r,{subject:'A'})).errors,[]);
  c.almPriority='';c.almIntegration='';c.almRegression='';c.almType='';
  const problems=almExportProblems(almRows(r,{subject:'A'}));for(const field of ['Prioridad','Integración','Regresión','Type'])assert.ok(problems.warnings.some(error=>error.includes(field)));
  assert.deepEqual(problems.errors,[]);assert.ok((await createAlmExcel(r,{subject:'A'})).size>0);
  c.almPriority='MEDIA';c.almIntegration='SI';c.almRegression='NO';c.almType='MANUAL';c.steps='';c.expected='';
  const missing=almExportProblems(almRows(r,{subject:'A'})).warnings;assert.ok(missing.some(error=>error.includes('Description (Design Steps)')));assert.ok(missing.some(error=>error.includes('Resultado esperado')));assert.ok((await createAlmExcel(r,{subject:'A'})).size>0);
});

test('Asteriscos de ALM se muestran en el formulario sin cambiar requisitos de Word ni cabeceras Excel',()=>{
  const c=newCase(),escape=String;
  for(const f of almFields){const html=renderTemplateField(c,f,{escape});assert.equal(html.includes('class="required-mark"'),['almSubject','almType','almPriority','almIntegration','almRegression'].includes(f.key));assert.equal(f.required,false);}
  for(const key of ['name','steps','expected']){const html=renderTemplateField(c,{key,label:key,type:'text',options:[],required:false},{escape});assert.match(html,/Obligatorio para Excel ALM/);}
  assert.ok(almHeaders.every(header=>!header.includes('*')));
});

test('Se exportan casos incompletos sin Subject ni nombre, sin inventar datos ni mezclar sus avisos',async()=>{
  const r=newReport();r.cases.push(newCase(2));r.cases[1].steps='Paso 1: Abrir\nPaso 2: Consultar';r.cases[1].expected='Respuesta';
  const before=structuredClone(r),rows=almRows(r),problems=almExportProblems(rows);
  assert.equal(rows.length,3);assert.ok(problems.warnings.filter(message=>message.includes('falta Subject')).length===2);assert.deepEqual(problems.errors,[]);
  assert.equal(rows[0][0],'');assert.equal(rows[1][0],'');assert.equal(rows[0][1],'');assert.equal(rows[1][1],'');
  assert.ok((await createAlmExcel(r)).size>0);assert.deepEqual(r,before);
});

test('Un Paso 1 multilínea con esperado general se descarga con metadatos ALM vacíos',async()=>{
  const r=newReport(),c=r.cases[0];c.name='Consulta de cheque';c.steps='Paso 1: Abrir SoapUI\nIngresar el CMC7\nEjecutar Submit\nComparar con GUV';c.expected='HTTP 200 OK\n{\n  "codigo": "OK"\n}';
  const rows=almRows(r);assert.equal(rows.length,1);assert.equal(rows[0][13],c.expected);
  const zip=await JSZip.loadAsync(await(await createAlmExcel(r)).arrayBuffer()),sheet=await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.equal((sheet.match(/<row /g)||[]).length,2);assert.match(sheet,/Abrir SoapUI\nIngresar el CMC7\nEjecutar Submit\nComparar con GUV/);
});

test('Bloques explícitos multilínea se separan solo por nuevas marcas y alinean los esperados',()=>{
  const r=fixture(),c=r.cases[0];c.steps='Step 1: Abrir\nSeleccionar GET\nStep 2:\nIngresar CMC7\nEjecutar Submit';c.expected='Step 1: Servicio disponible\nStep 2: HTTP 200\n{\n  "codigo": "OK"\n}';
  const rows=almRows(r,{subject:'Pruebas'});assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row.slice(11)),[['Step 1','Abrir\nSeleccionar GET','Servicio disponible'],['Step 2','Ingresar CMC7\nEjecutar Submit','HTTP 200\n{\n  "codigo": "OK"\n}']]);
  c.steps='  pAsO 1:\r\nPrimero\r\nContinuación\r\nPASO 2: Segundo';assert.deepEqual(almRows(r,{subject:'A'}).map(row=>row[12]),['Primero\nContinuación','Segundo']);
});

test('Listas sin marca inicial conservan una fila por línea y los números de bloques deben ser consecutivos',()=>{
  const r=fixture(),c=r.cases[0];c.steps='1. Abrir\nSeleccionar GET\nPaso 2: Consultar';assert.deepEqual(almRows(r,{subject:'A'}).map(row=>row[12]),['Abrir','Seleccionar GET','Consultar']);
  for(const steps of ['Paso 0: Inválido','Step 2: Falta el primero','Paso 1: Primero\nPaso 1: Repetido','Paso 1: Primero\nPaso 3: Falta el segundo']){c.steps=steps;assert.throws(()=>almRows(r,{subject:'A'}),/consecutivos/);}
});

test('XLSX conserva un bloque de varias líneas en una única celda de descripción',async()=>{
  const r=fixture();r.cases[0].steps='Paso 1: Abrir\nConsultar\nVerificar';const zip=await JSZip.loadAsync(await(await createAlmExcel(r,{subject:'A'})).arrayBuffer());const sheet=await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.equal((sheet.match(/<row /g)||[]).length,2);assert.match(sheet,/<c r="M2"[^>]*><is><t[^>]*>Abrir\nConsultar\nVerificar<\/t>/);assert.match(sheet,/<c r="N2"[^>]*><is><t[^>]*>Se muestra la consulta<\/t>/);assert.doesNotMatch(sheet,/<c r="M3"/);
});

test('Resultados Step se vinculan por número, admiten huecos y conservan JSON multilínea',()=>{
  const r=fixture(),c=r.cases[0];c.steps='Abrir\nElegir GET\nIngresar CMC7\nEjecutar\nVerificar\nComparar';
  c.expected='Step 6: Los datos coinciden con GUV.\n\nStep 1: Se muestra el servicio.\nStep 4:\nHTTP 200 OK\n{\n  "codigo": "OK",\n  "mensaje": {\n    "cmc7": "00000123"\n  }\n}\n\nSe conservan los ceros.';
  const before=structuredClone(r),rows=almRows(r,{subject:'Pruebas'});
  assert.deepEqual(rows.map(row=>row[13]),['Se muestra el servicio.','','','HTTP 200 OK\n{\n  "codigo": "OK",\n  "mensaje": {\n    "cmc7": "00000123"\n  }\n}\n\nSe conservan los ceros.','','Los datos coinciden con GUV.']);
  assert.deepEqual(r,before);
});

test('Se aceptan Paso, mayúsculas, CRLF, bloques vacíos y resultados sin marcas',()=>{
  const r=fixture(),c=r.cases[0];c.steps='Uno\nDos\nTres';
  c.expected=' paso 1: Primero\r\nOtra línea\r\nSTEP 2\r\n  JSON o texto\r\nPaso 3: ';
  assert.deepEqual(almRows(r,{subject:'A'}).map(row=>row[13]),['Primero\nOtra línea','JSON o texto','']);
  c.expected='El usuario ejecuta Step 1 y Step 2.\r\n{\r\n  "resultado": "OK"\r\n}';
  assert.deepEqual(almRows(r,{subject:'A'}).map(row=>row[13]),['','',c.expected]);
  c.expected='';assert.deepEqual(almRows(r,{subject:'A'}).map(row=>row[13]),['','','']);
});

test('Resultados con pasos inexistentes, repetidos o texto sin asignar avisan antes de exportar',()=>{
  const r=fixture(),c=r.cases[0];
  for(const value of ['Step 0: Fuera de rango','Step 3: Fuera de rango','Step 9999999999999999999999: Fuera de rango']){
    c.expected=value;assert.throws(()=>almRows(r,{subject:'A'}),/CP-001:.*tiene 2 paso/);
  }
  c.expected='Step 1: Primero\nPaso 1: Repetido';assert.throws(()=>almRows(r,{subject:'A'}),/repetido/);
  c.expected='Texto sin asignar\nStep 2: Resultado';assert.throws(()=>almRows(r,{subject:'A'}),/antes del primer Step/);
});

test('XLSX ubica cada resultado en su celda y no incluye encabezados Step en el texto',async()=>{
  const r=fixture(),c=r.cases[0];c.expected='Step 1: Primero & válido\nContinuación\nStep 2: Segundo';
  const zip=await JSZip.loadAsync(await(await createAlmExcel(r,{subject:'A'})).arrayBuffer());
  const sheet=await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.match(sheet,/<c r="N2"[^>]*><is><t[^>]*>Primero &amp; válido\nContinuación<\/t>/);
  assert.match(sheet,/<c r="N3"[^>]*><is><t[^>]*>Segundo<\/t>/);
  assert.doesNotMatch(sheet,/Step 1:|Step 2:/);
});

test('La exportación detecta nombres, rutas y tamaños inválidos sin truncar contenido',()=>{
  const r=fixture();assert.equal(almRows(r)[0][0],'');assert.throws(()=>almRows(r,{subject:'A/B'}),/invertidas/);
  assert.throws(()=>almRows(r,{subject:'A\nB'}),/una sola línea/);
  r.cases[0].name='';assert.equal(almRows(r,{subject:'A'})[0][1],'');
  r.cases[0].name='Caso';r.cases[0].expected='x'.repeat(32768);assert.throws(()=>almRows(r,{subject:'A'}),/32.767/);
  r.cases[0].selected=false;assert.throws(()=>almRows(r,{subject:'A'}),/al menos un caso/);
});

test('XLSX real contiene columnas, validaciones y texto seguro; no incluye evidencias ni fórmulas',async()=>{
  const r=fixture();r.cases[0].name='=HYPERLINK("https://example.invalid")';r.cases[0].objective='Texto < & > " ñ';
  const before=structuredClone(r),blob=await createAlmExcel(r,{subject:'Pruebas\\Cheques'});assert.equal(blob.type,excelMime);
  const zip=await JSZip.loadAsync(await blob.arrayBuffer()),sheet=await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.equal(Object.keys(zip.files).filter(p=>/media|drawing|attachment/i.test(p)).length,0);
  for(const file of Object.values(zip.files).filter(f=>!f.dir)){const content=await file.async('string');assert.doesNotMatch(content,/PRIVATE_EVIDENCE|PRIVATE_CAPTION|data:image|base64,AAAA/);}
  assert.equal((sheet.match(/<row /g)||[]).length,3);assert.equal((sheet.match(/<c /g)||[]).length,42);
  for(const header of almHeaders)assert.ok(sheet.includes(header));
  assert.match(sheet,/t="inlineStr"/);assert.doesNotMatch(sheet,/<f[ >]/);assert.match(sheet,/=HYPERLINK/);
  assert.match(sheet,/Texto &lt; &amp; &gt; &quot; ñ/);assert.match(sheet,/MEDIA,BAJA,ALTA/);assert.match(sheet,/state="frozen"/);assert.match(sheet,/<autoFilter ref="A1:N3"/);
  assert.deepEqual(r,before);
});

test('Plantillas ALM son opcionales, reordenables y válidas; consultar valores iniciales no migra datos',()=>{
  const r=fixture(),before=structuredClone(r);assert.equal(almValue(r.cases[0],'almType'),'MANUAL');assert.equal(fieldValue(r.cases[0],almFields[2]),'IMPORTED');assert.deepEqual(r,before);
  assert.equal(addAlmTemplateFields(r.template),true);validateTemplate(r.template);assert.equal(addAlmTemplateFields(r.template),false);
  for(const field of almFields)assert.equal(templateFields(r).filter(f=>f.key===field.key).length,1);
  assert.deepEqual(r.cases,before.cases);validateBackup({format:'caso-qa-v1',reports:[r]});
  r.cases[0].almPriority={invalid:true};assert.throws(()=>validateBackup({format:'caso-qa-v1',reports:[r]}),/ALM/);
});

test('Guardar y recuperar conserva datos ALM y evidencias junto con informes anteriores sin ALM',async()=>{
  const root=await mkdtemp(join(tmpdir(),'caso-alm-store-'));
  try{const store=new ReportStore(root),r=fixture();const original=await store.write(r);assert.equal(original.cases[0].almType,undefined);
    original.cases[0].almSubject='Pruebas\\Cheques';original.cases[0].almPriority='MEDIA';original.cases[0].almRegression='SI';addAlmTemplateFields(original.template);
    const saved=await store.write(original,original._diskRevision),loaded=await store.get(r.uid);assert.deepEqual(loaded,saved);assert.deepEqual(loaded.cases[0].evidence,r.cases[0].evidence);
    const previous=await store.version(r.uid,original._diskRevision);assert.equal(previous.cases[0].almSubject,undefined);assert.deepEqual(previous.cases[0].evidence,r.cases[0].evidence);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('Descarga XLSX usa nombre y MIME correctos, sin romper los formatos anteriores',async()=>{
  const root=await mkdtemp(join(tmpdir(),'caso-alm-download-'));
  try{const api=downloadsAPI(root),blob=await createAlmExcel(fixture(),{subject:'Pruebas'}),name='Casos - ALM.xlsx';
    const response=await api(new Request('http://localhost/api/downloads',{method:'POST',headers:{origin:'http://localhost','x-download-filename':encodeURIComponent(name)},body:blob}));assert.equal(response.status,200);
    const data=await response.json();assert.equal(data.filename,name);const download=await api(new Request('http://localhost'+data.url));assert.equal(download.headers.get('content-type'),excelMime);assert.match(download.headers.get('content-disposition'),/\.xlsx/);assert.equal((await download.arrayBuffer()).byteLength,blob.size);
  }finally{await rm(root,{recursive:true,force:true});}
});
