import {defaultTemplate,templateFor,templateFields,caseFieldActive,visibleField,displayField,validateTemplate,validateCustomValues,applyTemplateDefaults} from './templates.js';
import {caseBugEntries} from './case-bugs.js';
import {validateRetests} from './retests.js';
import {validateAlmFields} from './alm-fields.js';
export const sections = [
  { title: 'Identificación del caso', fields: [['name','Nombre del caso'],['module','Módulo / Funcionalidad'],['type','Tipo de caso','select','Positivo|Negativo|Alternativo']] },
  { title: 'Objetivo del caso', fields: [['objective','Objetivo funcional','area']] },
  { title: 'Precondiciones', fields: [['preconditions','Estado previo del sistema','area'],['role','Usuario / Rol requerido'],['existingData','Datos existentes necesarios','area'],['dependencies','Dependencias con otros sistemas','area']] },
  { title: 'Datos de prueba', fields: [['testData','Datos utilizados: fijos y variables','area']] },
  { title: 'Flujo del caso', fields: [['steps','Pasos de ejecución','area']] },
  { title: 'Resultado esperado', fields: [['expected','¿Qué debería ocurrir?','area']] },
  { title: 'Resultado obtenido', fields: [['result','Resultado','select','Pendiente|OK|KO'],['actual','¿Qué ocurrió durante la prueba?','area']] },
  { title: 'Observaciones para automatización', fields: [['automation','¿Aplica para automatizar?','select','Por evaluar|Aplica|No Aplica'],['rules','Reglas de negocio','area'],['validations','Validaciones críticas','area'],['edgeCases','Casos borde / consideraciones','area']] }
];
export const textFields = ['name','module','objective','preconditions','role','existingData','dependencies','testData','steps','expected','actual','rules','validations','edgeCases'];
export const bugFields=[['title','Título'],['description','Descripción','area'],['expected','Resultado esperado','area'],['actual','Resultado obtenido','area'],['severity','Severidad','select','|Bloqueante|Crítica|Alta|Media|Baja'],['priority','Prioridad','select','|Urgente|Alta|Media|Baja']];
export function newBug(template=defaultTemplate()){const bug={enabled:false,title:'',description:'',expected:'',actual:'',severity:'',priority:'',evidence:[]};applyTemplateDefaults({bug},template,'bug');return bug;}
export function newStandaloneBug(number=1,template=defaultTemplate()){return {uid:crypto.randomUUID(),id:'BUG-'+String(number).padStart(3,'0'),steps:'',evidence:[],bug:{...newBug(template),component:'',enabled:true}};}
export function bugEntries(report){return [...report.cases.flatMap(c=>caseBugEntries(c)),...(report.bugs||[]).filter(b=>b.bug?.enabled).map(b=>({...b,standalone:true}))];}
export function bugEvidence(entry){const seen=new Set();return [...(entry.standalone?entry.evidence||[]:[]),...(entry.bug?.evidence||[])].filter(e=>{if(seen.has(e.uid))return false;seen.add(e.uid);return true;});}
export function reportEvidenceGroups(report){return [...report.cases,...(report.bugs||[])].flatMap(entry=>[entry.evidence,...(entry.bug?.evidence?[entry.bug.evidence]:[]),...(entry.additionalBugs||[]).flatMap(b=>b.evidence?[b.evidence]:[])]).concat((report.retests||[]).map(r=>r.evidence));}
export function fieldVisible(record,key){return !record.omittedFields?.[key]&&String(record[key]??'').trim()!=='';}
export function reportSections(report,c){
  return templateFor(report).case.sections.map((section,i)=>{
    let fields=section.fields.filter(f=>visibleField(c,f)&&caseFieldActive(report,c,f)).map(f=>({...f,value:displayField(c,f)}));
    if(section.id==='identification')fields.push(...[['app','Aplicación / Sistema'],['environment','Ambiente'],['version','Versión / Release']].filter(([key])=>fieldVisible(report,key)).map(([key,label])=>({key,label,value:report[key]})));
    return {number:i+1,title:section.title,fields,evidence:section.evidence?c.evidence:[]};
  }).filter(s=>s.fields.length||s.evidence.length);
}
export function bugReportSections(report,c){return templateFor(report).bug.sections.map((s,i)=>({number:i+1,title:s.title,fields:s.fields.filter(f=>visibleField(c,f,'bug')).map(f=>({...f,value:displayField(c,f,'bug')})),evidence:s.evidence?bugEvidence(c):[]})).filter(s=>s.fields.length||s.evidence.length);}
export function newCase(number=1,template=defaultTemplate()) {
  return applyTemplateDefaults({ uid:crypto.randomUUID(),id:'CP-'+String(number).padStart(3,'0'),...Object.fromEntries(textFields.map(k=>[k,''])),type:'Positivo',result:'Pendiente',automation:'Por evaluar',context:'',evidence:[],selected:true,reviewed:false,omittedFields:{},bug:newBug(template) },template);
}
export function newReport(template=defaultTemplate()) {
  return { uid:crypto.randomUUID(),title:'Informe de pruebas',app:'',environment:'QA',version:'',author:'',ticket:'',created:new Date().toISOString(),updated:new Date().toISOString(),cases:[newCase(1,template)],omittedFields:{},favorite:false,bugs:[],retests:[],template:structuredClone(template) };
}
export function completion(c,report) {
  if(report){const fields=templateFields(report),mandatory=fields.filter(f=>f.required&&caseFieldActive(report,c,f)),tracked=mandatory.length?mandatory:fields.filter(f=>caseFieldActive(report,c,f)&&(['name','objective','preconditions','testData','steps','expected','actual','result'].includes(f.key)||f.key.startsWith('custom_'))&&!c.omittedFields?.[f.key]);return tracked.length?Math.round(tracked.filter(f=>visibleField(c,f)&&(f.key!=='result'||c.result!=='Pendiente')).length*100/tracked.length):100;}
  const required=['name','objective','preconditions','testData','steps','expected','actual','result'].filter(k=>!c.omittedFields?.[k]);
  return required.length?Math.round(required.filter(k=>fieldVisible(c,k)&&(k!=='result'||c.result!=='Pendiente')).length*100/required.length):100;
}
export function cleanAnalysis(raw) {
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) throw new Error('La IA devolvió un formato inválido. Volvé a intentar.');
  const fields={};
  for(const key of textFields) if(typeof raw[key]==='string') fields[key]=raw[key].slice(0,12000);
  return {fields,notes:typeof raw.notes==='string'?raw.notes.slice(0,8000):'Revisá el borrador antes de incorporarlo al informe.'};
}
export function validateBackup(data) {
  if(data?.format!=='caso-qa-v1'||!Array.isArray(data.reports)||data.reports.length>100) throw new Error('El archivo no es un respaldo válido de Caso.');
  for(const r of data.reports) {
    if(r?.template!==undefined)validateTemplate(r.template);
    if(r?.favorite!==undefined&&typeof r.favorite!=='boolean')throw new Error('El respaldo contiene una opción de favorito inválida.');
    for(const record of [r,...(Array.isArray(r?.cases)?r.cases:[])])if(record?.omittedFields!==undefined&&(!record.omittedFields||typeof record.omittedFields!=='object'||Array.isArray(record.omittedFields)||Object.values(record.omittedFields).some(v=>typeof v!=='boolean')))throw new Error('El respaldo contiene opciones de omisión inválidas.');
    if(!r||typeof r.uid!=='string'||typeof r.title!=='string'||typeof r.updated!=='string'||!Array.isArray(r.cases)||!r.cases.length||r.cases.length>500) throw new Error('El respaldo contiene un informe inválido.');
    if(r.bugs!==undefined&&(!Array.isArray(r.bugs)||r.bugs.length>500))throw new Error('El respaldo contiene una lista de bugs inválida.');
    validateRetests(r.retests);
    for(const b of r.bugs||[]){if(!b||typeof b.uid!=='string'||typeof b.id!=='string'||typeof b.steps!=='string'||!b.bug)throw new Error('El respaldo contiene un bug independiente inválido.');validateBug(b.bug);validateEvidence(b.evidence);}
    if(r.ticket!==undefined&&typeof r.ticket!=='string')throw new Error('El respaldo contiene un ticket inválido.');
    for(const key of ['app','environment','version','author','created']) if(typeof r[key]!=='string') throw new Error('El respaldo contiene datos de informe inválidos.');
    const caseBugIds=new Set([...r.cases.map(c=>c?.uid),...(r.bugs||[]).map(b=>b.uid)]);
    for(const c of r.cases) {
      if(c?.bug!==undefined)validateBug(c.bug);validateCustomValues(c);validateAlmFields(c);
      if(c?.primaryBugRemoved!==undefined&&typeof c.primaryBugRemoved!=='boolean')throw new Error('El estado del bug original no es válido.');
      if(c?.additionalBugs!==undefined){
        if(!Array.isArray(c.additionalBugs)||c.additionalBugs.length>49)throw new Error('Máximo 50 bugs por caso de prueba.');
        for(const bug of c.additionalBugs){if(!bug||typeof bug.uid!=='string'||!/^[a-f0-9-]{36}$/i.test(bug.uid)||caseBugIds.has(bug.uid))throw new Error('Identificador de bug de caso inválido.');caseBugIds.add(bug.uid);validateBug(bug);}
      }
      if(!c||typeof c.uid!=='string'||typeof c.id!=='string'||typeof c.selected!=='boolean'||typeof c.reviewed!=='boolean'||!Array.isArray(c.evidence)||c.evidence.length>20) throw new Error('El respaldo contiene un caso inválido.');
      if(typeof c.context!=='string') throw new Error('El respaldo contiene una descripción inválida.');
      for(const k of textFields) if(typeof c[k]!=='string') throw new Error('El respaldo contiene campos inválidos.');
      if([c.type,c.result,c.automation].some(v=>typeof v!=='string')||!r.template&&(!['Positivo','Negativo','Alternativo'].includes(c.type)||!['Pendiente','OK','KO'].includes(c.result)||!['Por evaluar','Aplica','No Aplica'].includes(c.automation)))throw new Error('El respaldo contiene estados inválidos.');
      for(const e of c.evidence) if(typeof e.uid!=='string'||typeof e.name!=='string'||typeof e.caption!=='string'||typeof e.data!=='string'||!/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(e.data)) throw new Error('El respaldo contiene una imagen inválida.');
    }
  }
  return data.reports;
}
function validateBug(bug){if(!bug||typeof bug!=='object'||typeof bug.enabled!=='boolean'||bugFields.some(([key])=>typeof bug[key]!=='string'))throw new Error('El respaldo contiene datos de bug inválidos.');if(bug.steps!==undefined&&(typeof bug.steps!=='string'||bug.steps.length>50000))throw new Error('El respaldo contiene pasos de bug inválidos.');if(bug.ticket!==undefined&&(typeof bug.ticket!=='string'||bug.ticket.length>1000))throw new Error('El respaldo contiene un ticket de bug inválido.');if(bug.component!==undefined&&(typeof bug.component!=='string'||bug.component.length>2000))throw new Error('El respaldo contiene un componente de bug inválido.');validateCustomValues(bug);if(bug.evidence!==undefined)validateEvidence(bug.evidence);}
function validateEvidence(list){if(!Array.isArray(list)||list.length>20)throw new Error('El respaldo contiene una lista de evidencias inválida.');for(const e of list)if(!e||typeof e.uid!=='string'||typeof e.name!=='string'||typeof e.caption!=='string'||typeof e.data!=='string'||!/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(e.data))throw new Error('El respaldo contiene una imagen inválida.');}
