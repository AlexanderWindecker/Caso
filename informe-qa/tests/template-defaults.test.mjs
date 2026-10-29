import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultTemplate,validateTemplate,templateFields} from '../src/templates.js';
import {newReport,newCase,newBug,newStandaloneBug,validateBackup} from '../src/model.js';
import {almRows} from '../src/alm-excel.js';
import {addAlmTemplateFields} from '../src/alm-fields.js';

test('Predeterminados se aplican a casos y bugs nuevos, incluidos campos personalizados y ALM',()=>{
  const t=defaultTemplate(),type=t.case.sections[0].fields.find(f=>f.key==='type');type.defaultValue='Negativo';
  const custom={key:'custom_'+crypto.randomUUID(),label:'Canal',type:'select',options:['Web','App'],required:false,defaultValue:'App'};t.case.sections[0].fields.push(custom);
  t.bug.sections[0].fields.find(f=>f.key==='priority').defaultValue='Alta';addAlmTemplateFields(t);templateFields({template:t}).find(f=>f.key==='almIntegration').defaultValue='SI';validateTemplate(t);
  const r=newReport(t);assert.equal(r.cases[0].type,'Negativo');assert.equal(r.cases[0].customFields[custom.key],'App');assert.equal(r.cases[0].almIntegration,'SI');assert.equal(newCase(2,t).type,'Negativo');assert.equal(newBug(t).priority,'Alta');assert.equal(newStandaloneBug(1,t).bug.priority,'Alta');
  r.cases[0].name='Caso';assert.equal(almRows(r,{subject:'Pruebas'})[0][6],'SI');validateBackup({format:'caso-qa-v1',reports:[r]});
});

test('Aplicar o editar plantilla no sustituye valores de casos existentes ni vacíos explícitos',()=>{
  const r=newReport(),before=structuredClone(r.cases);r.template.case.sections[0].fields.find(f=>f.key==='type').defaultValue='Negativo';
  assert.equal(r.cases[0].type,'Positivo');assert.deepEqual(r.cases,before);
  r.cases[0].type='';validateBackup({format:'caso-qa-v1',reports:[r]});assert.equal(r.cases[0].type,'');assert.equal(newCase(2,r.template).type,'Negativo');
});

test('Plantillas anteriores sin predeterminados siguen válidas; valores fuera de opciones se rechazan',()=>{
  const t=defaultTemplate();validateTemplate(t);assert.equal(newCase().type,'Positivo');
  const f=t.case.sections[0].fields.find(f=>f.key==='type');f.defaultValue='No existe';assert.throws(()=>validateTemplate(t),/predeterminado/);
  f.defaultValue=42;assert.throws(()=>validateTemplate(t),/predeterminado/);f.defaultValue='Negativo';f.type='text';assert.throws(()=>validateTemplate(t),/predeterminado/);
});
