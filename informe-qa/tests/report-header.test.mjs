import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {defaultTemplate,validateTemplate} from '../src/templates.js';
import {headerFields,headerEntries,setHeaderValue} from '../src/report-header.js';
import {projectOptions} from '../src/projects.js';
import {newReport,validateBackup,reportSections} from '../src/model.js';
import {createWord} from '../src/document.js';
import {TemplateStore} from '../scripts/template-store.mjs';
import {projectKeyFor} from '../src/jira.js';

test('Los valores anteriores no se convierten en una cuarta opción de Proyecto',()=>{
  const r=newReport();r.app='CU125 - Reporte Auditoria';
  assert.equal(headerFields(r).find(f=>f.key==='app').options.length,3);
  assert.equal(projectOptions(r.app).length,4);assert.ok(!projectOptions(r.app).some(o=>o.value===r.app));assert.equal(r.app,'CU125 - Reporte Auditoria');
  assert.equal(projectKeyFor('Nombre personalizado (CF)'),'CF');
});
test('Plantillas anteriores mantienen los datos y usan el encabezado por defecto sin migrarlo',()=>{
  const t=defaultTemplate();delete t.header;validateTemplate(t);const r=newReport(t);r.app='Anterior';
  assert.equal(headerFields(r).length,5);assert.equal(r.template.header,undefined);assert.equal(r.app,'Anterior');
});
test('La biblioteca guarda opciones, etiquetas, tipos, orden y campos personalizados del encabezado',async t=>{
  const root=await mkdtemp(join(tmpdir(),'qa-header-'));t.after(()=>rm(root,{recursive:true,force:true}));const store=new TemplateStore(root),initial=await store.get();
  const template=structuredClone(initial.template),fields=template.header.sections[0].fields;
  fields[0].options.push('Nuevo proyecto (NP)');fields[0].defaultValue='Nuevo proyecto (NP)';
  fields.find(f=>f.key==='version').label='Versión probada';fields.find(f=>f.key==='version').type='select';fields.find(f=>f.key==='version').options=['1.0','2.0'];
  const custom={key:'custom_'+crypto.randomUUID(),label:'Equipo QA',type:'text',options:[],required:true,enabled:true};fields.unshift(custom);validateTemplate(template);
  await store.change({action:'update',id:initial.defaultId,template,baseRevision:initial.revision});
  const saved=(await new TemplateStore(root).get()).template,r=newReport(saved);assert.equal(r.app,'Nuevo proyecto (NP)');assert.equal(headerFields(r)[0].key,custom.key);
  setHeaderValue(r,custom,'Equipo A');assert.equal(validateBackup({format:'caso-qa-v1',reports:[r]})[0].headerValues[custom.key],'Equipo A');
  assert.ok(headerEntries(r).some(f=>f.label==='Equipo QA'&&f.value==='Equipo A'));
});
test('Encabezado personalizado y campos ocultos se reflejan en Word y vista previa',async()=>{
  const r=newReport(),fields=r.template.header.sections[0].fields;fields.find(f=>f.key==='version').label='Release probado';r.version='2.0';r.author='AUTOR OCULTO';fields.find(f=>f.key==='author').enabled=false;
  const custom={key:'custom_'+crypto.randomUUID(),label:'Equipo QA',type:'text',options:[],required:false,enabled:true};fields.push(custom);setHeaderValue(r,custom,'Equipo de pruebas');
  const sections=reportSections(r,r.cases[0]);assert.ok(sections[0].fields.some(f=>f.label==='Equipo QA'));
  const zip=await JSZip.loadAsync(await(await createWord(r)).arrayBuffer()),xml=await zip.file('word/document.xml').async('string');
  for(const text of ['Release probado','Equipo QA','Equipo de pruebas'])assert.ok(xml.includes(text));assert.ok(!xml.includes('AUTOR OCULTO'));
});
test('Campos obligatorios del encabezado se validan al exportar, incluido Proyecto fuera de opciones',async()=>{
  const r=newReport();r.template.header.sections[0].fields.find(f=>f.key==='app').required=true;r.app='Proyecto anterior';
  await assert.rejects(()=>createWord(r),/Encabezado: Proyecto/);r.app='Cobranza de facturas (CF)';await createWord(r);
});
test('Encabezado rechaza opciones duplicadas, claves reservadas y campos personalizados inválidos',()=>{
  const t=defaultTemplate(),project=t.header.sections[0].fields[0];project.options.push(project.options[0]);assert.throws(()=>validateTemplate(t),/repetidas/);project.options.pop();project.type='text';assert.throws(()=>validateTemplate(t),/desplegable/);
  const r=newReport();r.headerValues={author:'No permitido'};assert.throws(()=>validateBackup({format:'caso-qa-v1',reports:[r]}),/personalizados/);
});
