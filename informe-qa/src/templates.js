import {almFields,almValue} from './alm-fields.js';
export const fieldTypes={text:'Texto corto',textarea:'Texto largo',select:'Desplegable',checkbox:'Checkbox',date:'Fecha'};
const caseBuiltins=[...almFields.map(f=>f.key),'id','name','module','type','objective','preconditions','role','existingData','dependencies','testData','steps','expected','result','actual','automation','rules','validations','edgeCases'];
const bugBuiltins=['title','description','expected','actual','severity','priority','steps'];
const field=(key,label,type='text',options=[])=>({key,label,type,options,required:false});
export function defaultTemplate(){return {version:'builtin-v1',name:'Plantilla funcional',case:{sections:[
  {id:'identification',title:'Identificación del caso',fields:[field('id','ID del Caso'),field('name','Nombre del caso'),field('module','Módulo / Funcionalidad'),field('type','Tipo de caso','select',['Positivo','Negativo','Alternativo'])]},
  {id:'objective',title:'Objetivo del caso',fields:[field('objective','Objetivo funcional','textarea')]},
  {id:'preconditions',title:'Precondiciones',fields:[field('preconditions','Estado previo del sistema','textarea'),field('role','Usuario / Rol requerido'),field('existingData','Datos existentes necesarios','textarea'),field('dependencies','Dependencias con otros sistemas','textarea')]},
  {id:'test-data',title:'Datos de prueba',fields:[field('testData','Datos utilizados: fijos y variables','textarea')]},
  {id:'steps',title:'Flujo del caso',fields:[field('steps','Pasos de ejecución','textarea')]},
  {id:'expected',title:'Resultado esperado',fields:[field('expected','¿Qué debería ocurrir?','textarea')]},
  {id:'actual',title:'Resultado obtenido',evidence:true,fields:[field('result','Resultado','select',['Pendiente','OK','KO']),field('actual','¿Qué ocurrió durante la prueba?','textarea')]},
  {id:'automation',title:'Observaciones para automatización',fields:[field('automation','¿Aplica para automatizar?','select',['Por evaluar','Aplica','No Aplica']),field('rules','Reglas de negocio','textarea'),field('validations','Validaciones críticas','textarea'),field('edgeCases','Casos borde / consideraciones','textarea')]}
]},bug:{sections:[{id:'bug-details',title:'Detalle del bug',fields:[field('title','Título'),field('description','Descripción','textarea'),field('expected','Resultado esperado','textarea'),field('actual','Resultado obtenido','textarea'),field('severity','Severidad','select',['','Bloqueante','Crítica','Alta','Media','Baja']),field('priority','Prioridad','select',['','Urgente','Alta','Media','Baja'])]},{id:'bug-steps',title:'Pasos para reproducir',fields:[field('steps','Pasos para reproducir','textarea')]},{id:'bug-evidence',title:'Evidencias',evidence:true,fields:[]}]}};}
export function templateFor(report){return report.template||defaultTemplate();}
export function templateFields(report,kind='case'){return templateFor(report)[kind].sections.flatMap(s=>s.fields);}
export function fieldValue(entry,f,kind='case'){const record=kind==='bug'?entry.bug:entry;if(kind==='bug'&&f.key==='steps')return String(record.steps??entry.steps??'');if(kind==='case'&&almFields.some(field=>field.key===f.key))return almValue(record,f.key);return String((f.key.startsWith('custom_')?record.customFields?.[f.key]:record[f.key])??'');}
export function setFieldValue(entry,f,value,kind='case'){const record=kind==='bug'?entry.bug:entry;if(f.key.startsWith('custom_')){record.customFields||={};record.customFields[f.key]=String(value);}else record[f.key]=String(value);}
export function applyTemplateDefaults(entry,template,kind='case'){
  for(const f of template[kind].sections.flatMap(s=>s.fields))if(f.type==='select'&&typeof f.defaultValue==='string'&&f.defaultValue!==''&&f.options.includes(f.defaultValue))setFieldValue(entry,f,f.defaultValue,kind);
  return entry;
}
export function visibleField(entry,f,kind='case'){const record=kind==='bug'?entry.bug:entry;return (f.required||!record.omittedFields?.[f.key])&&fieldValue(entry,f,kind).trim()!=='';}
export function displayField(entry,f,kind='case'){const value=fieldValue(entry,f,kind);return f.type==='checkbox'?(value==='true'?'Sí':value==='false'?'No':value):value;}
export function caseFieldActive(report,entry,f){return !(entry.automation==='No Aplica'&&['rules','validations','edgeCases'].includes(f.key)&&templateFields(report).some(field=>field.key==='automation'));}
export function requiredMissing(report,entries,kind='case'){const fields=templateFields(report,kind).filter(f=>f.required);return entries.flatMap(c=>fields.filter(f=>(kind!=='case'||caseFieldActive(report,c,f))&&!visibleField(c,f,kind)).map(f=>`${c.id}: ${f.label}`));}
export function validateCustomValues(record){if(!record||record.customFields===undefined)return;if(!record.customFields||typeof record.customFields!=='object'||Array.isArray(record.customFields)||Object.keys(record.customFields).length>200||Object.entries(record.customFields).some(([key,value])=>!/^custom_[a-f0-9-]{36}$/i.test(key)||typeof value!=='string'||value.length>50000))throw new Error('Los campos personalizados no son válidos.');}
export function validateTemplate(t){
  if(!t||typeof t!=='object'||typeof t.version!=='string'||t.version.length>80||typeof t.name!=='string'||!t.name.trim()||t.name.length>160)throw new Error('La plantilla no es válida.');
  for(const kind of ['case','bug']){
    const sections=t[kind]?.sections;
    if(!Array.isArray(sections)||!sections.length||sections.length>30)throw new Error('La plantilla necesita entre 1 y 30 secciones.');
    const ids=new Set(),keys=new Set();let count=0,evidence=0;
    for(const s of sections){
      if(!s||typeof s.id!=='string'||!/^[a-z0-9-]{1,80}$/i.test(s.id)||ids.has(s.id)||typeof s.title!=='string'||!s.title.trim()||s.title.length>160||!Array.isArray(s.fields)||(s.evidence!==undefined&&typeof s.evidence!=='boolean'))throw new Error('Revisá los nombres e identificadores de las secciones.');
      ids.add(s.id);if(s.evidence)evidence++;
      for(const f of s.fields){
        count++;
        if(!f||typeof f.key!=='string'||keys.has(f.key)||!((kind==='case'?caseBuiltins:bugBuiltins).includes(f.key)||/^custom_[a-f0-9-]{36}$/i.test(f.key))||typeof f.label!=='string'||!f.label.trim()||f.label.length>160||!Object.hasOwn(fieldTypes,f.type)||typeof f.required!=='boolean'||!Array.isArray(f.options)||f.options.length>100||f.options.some(o=>typeof o!=='string'||o.length>160))throw new Error('Revisá los nombres, tipos y opciones de los campos.');
        if(f.type==='select'&&!f.options.some(v=>v.trim()))throw new Error(`Agregá opciones al desplegable «${f.label}».`);
        if(f.defaultValue!==undefined&&(typeof f.defaultValue!=='string'||f.defaultValue.length>160||f.type!=='select'||f.defaultValue!==''&&!f.options.includes(f.defaultValue)))throw new Error(`Revisá el valor predeterminado de «${f.label}».`);
        keys.add(f.key);
      }
    }
    if(count>150||evidence>1)throw new Error('Máximo 150 campos y una sección con evidencias por plantilla.');
  }
  return t;
}
export function moveTemplateField(t,kind,key,sectionId,index){const sections=t[kind].sections,target=sections.find(s=>s.id===sectionId),source=sections.find(s=>s.fields.some(f=>f.key===key));if(!target||!source)return false;const old=source.fields.findIndex(f=>f.key===key);if(source===target&&index>old)index--;const [f]=source.fields.splice(old,1);target.fields.splice(Math.max(0,Math.min(index,target.fields.length)),0,f);return true;}
export function moveTemplateSection(t,kind,id,index){const list=t[kind].sections,old=list.findIndex(s=>s.id===id);if(old<0)return false;if(index>old)index--;const [s]=list.splice(old,1);list.splice(Math.max(0,Math.min(index,list.length)),0,s);return true;}
