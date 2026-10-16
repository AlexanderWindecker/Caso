import {fieldValue} from './templates.js';
export function renderTemplateField(entry,f,{escape,kind='case',omit=false}={}){
  const value=fieldValue(entry,f,kind),record=kind==='bug'&&f.key!=='steps'?entry.bug:entry,omitted=!f.required&&!!record.omittedFields?.[f.key],attr=kind==='bug'?'data-bug-field':'data-field',id=kind+'-field-'+f.key,disabled=omitted?'disabled':'',required=f.required?'aria-required="true"':'';
  let input;
  if(f.type==='select'){const options=[...f.options];if(value&&!options.includes(value))options.unshift(value);if(!options.includes(''))options.unshift('');input=`<select id="${id}" ${attr}="${f.key}" ${disabled} ${required}>${options.map(v=>`<option value="${escape(v)}" ${v===value?'selected':''}>${escape(v||'Seleccionar…')}</option>`).join('')}</select>`;}
  else if(f.type==='textarea')input=`<textarea id="${id}" ${attr}="${f.key}" rows="${f.key==='steps'?4:3}" ${disabled} ${required}>${escape(value)}</textarea>`;
  else if(f.type==='checkbox')input=`<label class="dynamic-checkbox"><input id="${id}" type="checkbox" ${attr}="${f.key}" ${value==='true'?'checked':''} ${disabled} ${required}>${escape(f.label)}</label>`;
  else input=`<input id="${id}" type="${f.type==='date'?'date':'text'}" ${attr}="${f.key}" value="${escape(value)}" ${disabled} ${required}>`;
  return `<div class="field ${['textarea','checkbox'].includes(f.type)||['name','title','automation'].includes(f.key)?'full':''} ${omitted?'field-omitted':''}"><div class="field-label-row"><label for="${id}">${escape(f.label)}${f.required?'<span class="required-mark"> *</span>':''}</label>${omit?`<label class="omit-toggle"><input type="checkbox" data-omit="${f.key}" aria-label="Omitir ${escape(f.label)}" ${omitted?'checked':''} ${f.required?'disabled':''}>${f.required?'Obligatorio':'Omitir'}</label>`:''}</div>${input}</div>`;
}
