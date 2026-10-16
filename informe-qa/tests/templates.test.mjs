import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import JSZip from 'jszip';
import {newReport,newBug,newStandaloneBug,reportSections,validateBackup} from '../src/model.js';
import {defaultTemplate,templateFields,setFieldValue,fieldValue,validateTemplate,moveTemplateField,moveTemplateSection} from '../src/templates.js';
import {createWord,createBugWord} from '../src/document.js';
import {TemplateStore,templatesAPI} from '../scripts/template-store.mjs';
import {ReportStore} from '../scripts/report-store.mjs';
import {renderTemplateField} from '../src/fields-ui.js';
const custom=(label,type='text')=>({key:'custom_'+crypto.randomUUID(),label,type,options:type==='select'?['Uno','Dos']:[],required:false});
async function xml(blob){const zip=await JSZip.loadAsync(await blob.arrayBuffer());return zip.file('word/document.xml').async('string');}
test('Arrastrar mueve campos entre secciones y mantiene orden sin duplicarlos',()=>{
  const t=defaultTemplate();moveTemplateField(t,'case','name','objective',1);assert.deepEqual(t.case.sections[1].fields.map(f=>f.key),['objective','name']);assert.equal(templateFields({template:t}).filter(f=>f.key==='name').length,1);
  moveTemplateField(t,'case','objective','objective',2);assert.deepEqual(t.case.sections[1].fields.map(f=>f.key),['name','objective']);
  moveTemplateSection(t,'case','objective',0);assert.equal(t.case.sections[0].id,'objective');assert.equal(validateTemplate(t),t);
});
test('Campos nuevos, etiquetas y orden se exportan; quitar campos preserva valores',async()=>{
  const r=newReport(),c=r.cases[0],text=custom('Referencia propia'),check=custom('Validado','checkbox'),date=custom('Fecha de ejecución','date'),choice=custom('Canal','select');
  r.template.case.sections[1].fields.push(text,check,date,choice);setFieldValue(c,text,'REFERENCIA GUARDADA');setFieldValue(c,check,'false');setFieldValue(c,date,'2026-10-16');setFieldValue(c,choice,'Dos');
  moveTemplateField(r.template,'case',choice.key,'objective',0);const output=await xml(await createWord(r));for(const v of ['Referencia propia','REFERENCIA GUARDADA','Validado','No','2026-10-16','Canal','Dos'])assert.ok(output.includes(v),v);assert.ok(output.indexOf('Canal')<output.indexOf('Referencia propia'));
  r.template.case.sections[1].fields=r.template.case.sections[1].fields.filter(f=>f.key!==text.key);assert.ok(!(await xml(await createWord(r))).includes('REFERENCIA GUARDADA'));assert.equal(fieldValue(c,text),'REFERENCIA GUARDADA');
});
test('Plantillas de bugs usan campos propios y mantienen los pasos copiados',async()=>{
  const r=newReport(),c=r.cases[0],f=custom('Ticket externo');c.bug={...newBug(),enabled:true,title:'Defecto'};c.steps='PASO COMPARTIDO';c.omittedFields.steps=true;r.template.bug.sections[0].fields.push(f);setFieldValue(c,f,'INC-742','bug');
  const independent=newStandaloneBug();setFieldValue(independent,f,'INC-743','bug');r.bugs.push(independent);const output=await xml(await createBugWord(r));for(const value of ['Ticket externo','INC-742','INC-743','PASO COMPARTIDO'])assert.ok(output.includes(value),value);assert.ok(!(await xml(await createWord(r))).includes('INC-742'));
});
test('Obligatorios bloquean la exportación y valores omitidos anteriores quedan editables',async()=>{
  const r=newReport(),c=r.cases[0],f=custom('Dato obligatorio');f.required=true;r.template.case.sections[0].fields.push(f);await assert.rejects(()=>createWord(r),/Dato obligatorio/);c.omittedFields[f.key]=true;setFieldValue(c,f,'COMPLETADO');assert.ok(!(renderTemplateField(c,f,{escape:String,omit:true}).match(/data-field="[^"]+" disabled/)));assert.ok((await xml(await createWord(r))).includes('COMPLETADO'));
  r.template.bug.sections[0].fields.push(f);c.bug.enabled=true;await assert.rejects(()=>createBugWord(r),/Dato obligatorio/);setFieldValue(c,f,'BUG COMPLETADO','bug');assert.ok((await xml(await createBugWord(r))).includes('BUG COMPLETADO'));
});
test('Nuevas plantillas no alteran informes anteriores y restaurar conserva valores personalizados',async()=>{
  const t=defaultTemplate(),old=newReport(t);delete old.template;const r=newReport(t),f=custom('Dato persistente');t.case.sections[0].fields=[];assert.ok(r.template.case.sections[0].fields.length);assert.ok(reportSections(old,old.cases[0]).length);
  r.template.case.sections[0].fields.push(f);setFieldValue(r.cases[0],f,'VALOR PERSISTENTE');const root=await mkdtemp(join(tmpdir(),'caso-template-report-'));try{const store=new ReportStore(root);await store.write(r);const reopened=await new ReportStore(root).get(r.uid);assert.deepEqual(reopened.template,r.template);assert.equal(fieldValue(reopened.cases[0],f),'VALOR PERSISTENTE');assert.equal(validateBackup({format:'caso-qa-v1',reports:[old,reopened]}).length,2);}finally{await rm(root,{recursive:true,force:true});}
});
test('Plantilla global se guarda en disco y rechaza escrituras simultáneas sin perder la anterior',async()=>{
  const root=await mkdtemp(join(tmpdir(),'caso-template-default-'));try{const store=new TemplateStore(root),initial=await store.get();assert.equal(initial.revision,null);const t=initial.template;t.name='Mi plantilla';const saved=await store.save(t,null);assert.deepEqual(await new TemplateStore(root).get(),saved);await assert.rejects(()=>store.save(defaultTemplate(),null),/otra ventana/);assert.equal((await store.get()).template.name,'Mi plantilla');const next=await store.save(defaultTemplate(),saved.revision);assert.notEqual(next.revision,saved.revision);}finally{await rm(root,{recursive:true,force:true});}
});
test('API protege plantilla global de otros orígenes y valida los campos',async()=>{
  const root=await mkdtemp(join(tmpdir(),'caso-template-api-'));try{const api=templatesAPI(new TemplateStore(root));assert.equal((await api(new Request('http://localhost/api/templates'))).status,200);assert.equal((await api(new Request('http://localhost/api/templates',{method:'POST',headers:{origin:'https://otro.example','content-type':'application/json'},body:JSON.stringify({template:defaultTemplate()})}))).status,403);const t=defaultTemplate();t.case.sections[0].fields[0].key='__proto__';assert.throws(()=>validateTemplate(t),/campos/);t.case.sections[0].fields[0].key='id';t.case.sections[1].fields.push(t.case.sections[0].fields[0]);assert.throws(()=>validateTemplate(t),/campos/);}finally{await rm(root,{recursive:true,force:true});}
});
test('No Aplica no bloquea por reglas ocultas; quitar aplicabilidad permite editarlas y exportarlas',async()=>{
  const r=newReport(),c=r.cases[0],f=templateFields(r).find(f=>f.key==='rules');f.required=true;c.automation='No Aplica';await createWord(r);r.template.case.sections.at(-1).fields=r.template.case.sections.at(-1).fields.filter(f=>f.key!=='automation');await assert.rejects(()=>createWord(r),/Reglas de negocio/);c.rules='REGLA VISIBLE';assert.ok((await xml(await createWord(r))).includes('REGLA VISIBLE'));
});
