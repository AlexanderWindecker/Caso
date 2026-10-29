export const almFields=[
  {key:'almSubject',label:'Subject',type:'text',options:[]},
  {key:'almType',label:'Type (ALM)',type:'text',options:[]},
  {key:'almStatus',label:'Status (ALM)',type:'text',options:[]},
  {key:'almPriority',label:'Prioridad (ALM)',type:'select',options:['MEDIA','BAJA','ALTA']},
  {key:'almIntegration',label:'Integración',type:'select',options:['SI','NO']},
  {key:'almRegression',label:'Regresión',type:'select',options:['SI','NO']},
  {key:'almComplexity',label:'Complejidad',type:'text',options:[]}
].map(f=>({...f,required:false}));
export const almDefaults={almType:'MANUAL',almStatus:'IMPORTED'};
// These requirements apply to Excel ALM, independently of the Word template.
export const almRequiredKeys=['almSubject','name','almType','almIntegration','almPriority','almRegression','steps','expected'];
export const almValue=(entry,key)=>String(entry[key]??almDefaults[key]??'');
export function validateAlmFields(entry){
  for(const {key} of almFields)if(entry[key]!==undefined&&(typeof entry[key]!=='string'||entry[key].length>2000))throw new Error('Los datos de ALM del caso no son válidos.');
}
// Explicit template action; existing templates and reports are never migrated on load.
export function addAlmTemplateFields(template){
  const existing=new Set(template.case.sections.flatMap(s=>s.fields.map(f=>f.key)));
  const missing=almFields.filter(f=>!existing.has(f.key));
  if(!missing.length)return false;
  let section=template.case.sections.find(s=>s.id==='alm-export');
  if(!section){section={id:'alm-export',title:'Datos para ALM',fields:[]};template.case.sections.push(section);}
  section.fields.push(...structuredClone(missing));
  return true;
}
