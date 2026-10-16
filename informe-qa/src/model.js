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
export function newBug(){return {enabled:false,title:'',description:'',expected:'',actual:'',severity:'',priority:'',evidence:[]};}
export function newStandaloneBug(number=1){return {uid:crypto.randomUUID(),id:'BUG-'+String(number).padStart(3,'0'),steps:'',evidence:[],bug:{...newBug(),enabled:true}};}
export function bugEntries(report){return [...report.cases.filter(c=>c.bug?.enabled).map(c=>({...c,standalone:false})),...(report.bugs||[]).filter(b=>b.bug?.enabled).map(b=>({...b,standalone:true}))];}
export function bugEvidence(entry){const seen=new Set();return [...entry.evidence,...(entry.bug?.evidence||[])].filter(e=>{if(seen.has(e.uid))return false;seen.add(e.uid);return true;});}
export function reportEvidenceGroups(report){return [...report.cases,...(report.bugs||[])].flatMap(entry=>[entry.evidence,...(entry.bug?.evidence?[entry.bug.evidence]:[])]);}
export function fieldVisible(record,key){return !record.omittedFields?.[key]&&String(record[key]??'').trim()!=='';}
export function reportSections(report,c){
  return sections.map((section,i)=>{
    let fields=section.fields.map(([key,label])=>({key,label,value:c[key]})).filter(f=>fieldVisible(c,f.key));
    if(i===0){fields=[{key:'id',label:'ID del Caso',value:c.id},...fields];if(!fieldVisible(c,'id'))fields=fields.filter(f=>f.key!=='id');fields.push(...[['app','Aplicación / Sistema'],['environment','Ambiente'],['version','Versión / Release']].filter(([key])=>fieldVisible(report,key)).map(([key,label])=>({key,label,value:report[key]})));}
    if(i===7&&c.automation==='No Aplica')fields=fields.filter(f=>f.key==='automation');
    return {number:i+1,title:section.title,fields,evidence:i===6?c.evidence:[]};
  }).filter(s=>s.fields.length||s.evidence.length);
}
export function newCase(number=1) {
  return { uid:crypto.randomUUID(),id:'CP-'+String(number).padStart(3,'0'),...Object.fromEntries(textFields.map(k=>[k,''])),type:'Positivo',result:'Pendiente',automation:'Por evaluar',context:'',evidence:[],selected:true,reviewed:false,omittedFields:{},bug:newBug() };
}
export function newReport() {
  return { uid:crypto.randomUUID(),title:'Informe de pruebas',app:'',environment:'QA',version:'',author:'',created:new Date().toISOString(),updated:new Date().toISOString(),cases:[newCase()],omittedFields:{},favorite:false,bugs:[] };
}
export function completion(c) {
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
    if(r?.favorite!==undefined&&typeof r.favorite!=='boolean')throw new Error('El respaldo contiene una opción de favorito inválida.');
    for(const record of [r,...(Array.isArray(r?.cases)?r.cases:[])])if(record?.omittedFields!==undefined&&(!record.omittedFields||typeof record.omittedFields!=='object'||Array.isArray(record.omittedFields)||Object.values(record.omittedFields).some(v=>typeof v!=='boolean')))throw new Error('El respaldo contiene opciones de omisión inválidas.');
    if(!r||typeof r.uid!=='string'||typeof r.title!=='string'||typeof r.updated!=='string'||!Array.isArray(r.cases)||!r.cases.length||r.cases.length>500) throw new Error('El respaldo contiene un informe inválido.');
    if(r.bugs!==undefined&&(!Array.isArray(r.bugs)||r.bugs.length>500))throw new Error('El respaldo contiene una lista de bugs inválida.');
    for(const b of r.bugs||[]){if(!b||typeof b.uid!=='string'||typeof b.id!=='string'||typeof b.steps!=='string'||!b.bug)throw new Error('El respaldo contiene un bug independiente inválido.');validateBug(b.bug);validateEvidence(b.evidence);}
    for(const key of ['app','environment','version','author','created']) if(typeof r[key]!=='string') throw new Error('El respaldo contiene datos de informe inválidos.');
    for(const c of r.cases) {
      if(c?.bug!==undefined)validateBug(c.bug);
      if(!c||typeof c.uid!=='string'||typeof c.id!=='string'||typeof c.selected!=='boolean'||typeof c.reviewed!=='boolean'||!Array.isArray(c.evidence)||c.evidence.length>20) throw new Error('El respaldo contiene un caso inválido.');
      if(typeof c.context!=='string') throw new Error('El respaldo contiene una descripción inválida.');
      for(const k of textFields) if(typeof c[k]!=='string') throw new Error('El respaldo contiene campos inválidos.');
      if(!['Positivo','Negativo','Alternativo'].includes(c.type)||!['Pendiente','OK','KO'].includes(c.result)||!['Por evaluar','Aplica','No Aplica'].includes(c.automation)) throw new Error('El respaldo contiene estados inválidos.');
      for(const e of c.evidence) if(typeof e.uid!=='string'||typeof e.name!=='string'||typeof e.caption!=='string'||typeof e.data!=='string'||!/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(e.data)) throw new Error('El respaldo contiene una imagen inválida.');
    }
  }
  return data.reports;
}
function validateBug(bug){if(!bug||typeof bug!=='object'||typeof bug.enabled!=='boolean'||bugFields.some(([key])=>typeof bug[key]!=='string')||!['','Bloqueante','Crítica','Alta','Media','Baja'].includes(bug.severity)||!['','Urgente','Alta','Media','Baja'].includes(bug.priority))throw new Error('El respaldo contiene datos de bug inválidos.');if(bug.evidence!==undefined)validateEvidence(bug.evidence);}
function validateEvidence(list){if(!Array.isArray(list)||list.length>20)throw new Error('El respaldo contiene una lista de evidencias inválida.');for(const e of list)if(!e||typeof e.uid!=='string'||typeof e.name!=='string'||typeof e.caption!=='string'||typeof e.data!=='string'||!/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(e.data))throw new Error('El respaldo contiene una imagen inválida.');}
