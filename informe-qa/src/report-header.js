import {projects} from './projects.js';
export const headerBuiltinKeys=['app','environment','version','author','ticket'];
export function defaultHeaderTemplate(){
  const field=(key,label,type='text',options=[],extra={})=>({key,label,type,options,required:false,enabled:true,...extra});
  return {sections:[{id:'report-meta',title:'Encabezado del informe',fields:[
    field('app','Proyecto','select',projects.map(p=>`${p.name} (${p.key})`)),
    field('environment','Ambiente','select',['QA','Testing','Desarrollo','Staging','Producción','UAT'],{defaultValue:'QA'}),
    field('version','Versión / Release'),field('author','Responsable'),field('ticket','Ticket')
  ]}]};
}
export function headerFields(source={}){return ((source.template||source).header||defaultHeaderTemplate()).sections.flatMap(s=>s.fields);}
export function headerValue(report,field){return String((field.key.startsWith('custom_')?report.headerValues?.[field.key]:report[field.key])??'');}
export function setHeaderValue(report,field,value){if(field.key.startsWith('custom_')){report.headerValues||={};report.headerValues[field.key]=String(value);}else report[field.key]=String(value);}
export function headerVisible(report,field){return field.enabled!==false&&(field.required||!report.omittedFields?.[field.key])&&headerValue(report,field).trim()!=='';}
export function headerEntries(report){return headerFields(report).filter(f=>headerVisible(report,f)).map(f=>{let value=headerValue(report,f);if(f.type==='checkbox')value=value==='true'?'Sí':value==='false'?'No':value;return {...f,value};});}
export function applyHeaderDefaults(report,template){for(const field of headerFields(template))if(typeof field.defaultValue==='string')setHeaderValue(report,field,field.defaultValue);return report;}

export function renderReportHeader(root,report,{onChange,onOmit,escape}){
  root.innerHTML=headerFields(report).filter(f=>f.enabled!==false).map(f=>{
    const value=headerValue(report,f),id=f.key.startsWith('custom_')?'report-'+f.key:'report-'+f.key,disabled=!f.required&&!!report.omittedFields?.[f.key];
    const attrs=`id="${id}" data-report="${f.key}" ${disabled?'disabled':''} ${f.required?'aria-required="true"':''}`;
    let control;
    if(f.type==='select')control=`<select ${attrs}><option value="">Seleccionar${f.key==='app'?' proyecto':''}…</option>${f.options.filter(Boolean).map(option=>`<option value="${escape(option)}" ${option===value?'selected':''}>${escape(option)}</option>`).join('')}</select>`;
    else if(f.type==='textarea')control=`<textarea ${attrs} rows="2">${escape(value)}</textarea>`;
    else if(f.type==='checkbox')control=`<input ${attrs} type="checkbox" ${value==='true'?'checked':''}>`;
    else control=`<input ${attrs} type="${f.type==='date'?'date':'text'}" value="${escape(value)}">`;
    const previous=f.type==='select'&&value&&!f.options.includes(value)?`<small class="header-previous">Valor guardado: ${escape(value)}. Elegí una opción de la lista.</small>`:'';
    return `<div class="report-header-field"><div class="field-label-row"><label for="${id}">${escape(f.label)}${f.required?' *':''}</label><label class="omit-toggle"><input type="checkbox" data-report-omit="${f.key}" aria-label="Omitir ${escape(f.label)}" ${disabled?'checked':''} ${f.required?'disabled':''}>${f.required?'Obligatorio':'Omitir'}</label></div>${control}${previous}</div>`;
  }).join('')+'<div class="meta-hint"><span>Se aplica a todos<br>los casos del informe</span></div>';
  const fields=headerFields(report);
  root.querySelectorAll('[data-report]').forEach(el=>el.oninput=()=>{const f=fields.find(f=>f.key===el.dataset.report);setHeaderValue(report,f,el.type==='checkbox'?String(el.checked):el.value);const note=el.parentElement.querySelector('.header-previous');if(note)note.remove();onChange();});
  root.querySelectorAll('[data-report-omit]').forEach(el=>el.onchange=()=>{report.omittedFields||={};report.omittedFields[el.dataset.reportOmit]=el.checked;root.querySelector(`[data-report="${el.dataset.reportOmit}"]`).disabled=el.checked;onOmit();});
}
