import {fieldValue} from './templates.js';
import {almRequiredKeys} from './alm-fields.js';
export function renderTemplateField(entry,f,{escape,kind='case',omit=false,idPrefix=''}={}){
  const almRequired=kind==='case'&&almRequiredKeys.includes(f.key);
  const value=fieldValue(entry,f,kind),record=kind==='bug'?entry.bug:entry,omitted=!f.required&&!!record.omittedFields?.[f.key],attr=kind==='bug'?'data-bug-field':'data-field',id=(idPrefix?idPrefix+'-':'')+kind+'-field-'+f.key,disabled=omitted?'disabled':'',required=f.required||almRequired?'aria-required="true"':'';
  let input;
  if(f.type==='select'){const options=[...f.options];if(value&&!options.includes(value))options.unshift(value);if(!options.includes(''))options.unshift('');input=`<select id="${id}" ${attr}="${f.key}" ${disabled} ${required}>${options.map(v=>`<option value="${escape(v)}" ${v===value?'selected':''}>${escape(v||'Seleccionar…')}</option>`).join('')}</select>`;}
  else if(f.type==='textarea')input=`<textarea id="${id}" ${attr}="${f.key}" rows="${f.key==='steps'?4:3}" ${disabled} ${required}>${escape(value)}</textarea>`;
  else if(f.type==='checkbox')input=`<label class="dynamic-checkbox"><input id="${id}" type="checkbox" ${attr}="${f.key}" ${value==='true'?'checked':''} ${disabled} ${required}>${escape(f.label)}</label>`;
  else input=`<input id="${id}" type="${f.type==='date'?'date':'text'}" ${attr}="${f.key}" value="${escape(value)}" ${disabled} ${required}>`;
  if(kind==='case'&&f.key==='expected')input+='<p class="field-note" style="margin:6px 0 0">Para Excel ALM: escribí Step 1: resultado, Step 2: resultado, etc., iniciando cada bloque en una línea nueva. Podés incluir varias líneas por bloque. Sin marcas Step o Paso, se exporta todo al último paso.</p>';
  if(kind==='case'&&f.key==='steps')input+='<p class="field-note" style="margin:6px 0 0">Para Excel ALM: comenzá con Paso 1: o Step 1: para agrupar varias líneas en una fila. Cada nueva marca (Paso 2:, Paso 3:, etc.) inicia otra fila. Sin estas marcas al comienzo, cada línea es un paso.</p>';
  return `<div class="field ${['textarea','checkbox'].includes(f.type)||['name','title','automation'].includes(f.key)?'full':''} ${omitted?'field-omitted':''}"><div class="field-label-row"><label for="${id}">${escape(f.label)}${f.required||almRequired?`<span class="required-mark" title="${f.required?'Obligatorio según la plantilla':'Obligatorio para Excel ALM'}"> *</span>`:''}</label>${omit?`<label class="omit-toggle"><input type="checkbox" data-omit="${f.key}" aria-label="Omitir ${escape(f.label)}" ${omitted?'checked':''} ${f.required?'disabled':''}>${f.required?'Obligatorio':'Omitir'}</label>`:''}</div>${input}</div>`;
}
