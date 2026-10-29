import {newBug} from './model.js';
import {bugTicket} from './bug-ticket.js';
import {renderBugEvidence} from './bug-evidence.js';
import {templateFor,templateFields,setFieldValue} from './templates.js';
import {renderTemplateField} from './fields-ui.js';
import {caseBugEntries,hasCaseBug,removeCaseBug} from './case-bugs.js';
const expanded=new Map();
const hasContent=bug=>bug&&(['title','description','expected','actual','steps'].some(key=>String(bug[key]||'').trim())||(bug.evidence||[]).length||Object.values(bug.customFields||{}).some(Boolean));
function preparePrimaryBug(c,template){
  if(c.primaryBugRemoved){
    let bug=(c.additionalBugs||[])[0];
    if(!bug){bug={...newBug(template),uid:crypto.randomUUID()};(c.additionalBugs||=[]).push(bug);}
    bug.enabled=true;return bug.uid;
  }
  if(!c.bug)c.bug=newBug(template);
  else if(!hasContent(c.bug))for(const [key,value] of Object.entries(newBug(template)))if(c.bug[key]===undefined||c.bug[key]==='')c.bug[key]=value;
  c.bug.enabled=true;
  return c.uid;
}
export function renderBugPanel(c,options){
  if(options.standalone)return renderSingleBugPanel(c,options);
  const {root,escape,icon,onChange,toast}=options,enabled=hasCaseBug(c),entries=caseBugEntries(c,true);
  root.innerHTML=`<div class="bug-toggle-row"><label class="bug-toggle"><input id="case-has-bug" type="checkbox" ${enabled?'checked':''}>${icon('bug')} Bugs (${entries.filter(e=>e.bug.enabled).length})</label><span>Registrá uno o más defectos. Podés plegarlos sin perder lo completado.</span><button class="button secondary" data-add-case-bug>${icon('plus')} Agregar bug</button></div>${enabled||c.additionalBugs?.length||entries.some(entry=>hasContent(entry.bug))?entries.map((entry,i)=>`<details class="case-bug-accordion" data-case-bug="${escape(entry.uid)}" ${expanded.get(entry.uid)?'open':''}><summary><span class="case-bug-title">Bug ${i+1}: ${escape(entry.bug.title||'Sin título')}</span><label class="case-bug-enabled"><input type="checkbox" data-enable-case-bug="${escape(entry.uid)}" ${entry.bug.enabled?'checked':''}> Activo</label><button class="icon-button danger case-bug-delete" data-remove-case-bug aria-label="Eliminar Bug ${i+1}" title="Eliminar bug">${icon('trash-2')}</button></summary><div class="case-bug-delete-confirm" data-case-bug-confirm hidden><p>¿Eliminar este bug y sus evidencias propias? Se conservan el caso, sus evidencias, los otros bugs y las validaciones ya registradas. Las versiones anteriores siguen en Historial.</p><div class="document-save-actions"><button class="button secondary" data-cancel-case-bug-delete>Cancelar</button><button class="button danger-button" data-confirm-case-bug-delete>Eliminar bug</button></div></div><div data-case-bug-editor="${escape(entry.uid)}"></div>${!entry.bug.enabled?'<p class="field-note">Bug desactivado. Sus datos y evidencias se conservan.</p>':''}</details>`).join(''):''}`;
  const changed=()=>{onChange();renderBugPanel(c,options);};
  root.querySelector('#case-has-bug').onchange=e=>{
    if(e.target.checked){const uid=preparePrimaryBug(c,templateFor(options.report||{}));expanded.set(uid,true);}
    else for(const entry of caseBugEntries(c,true))entry.bug.enabled=false;
    changed();
  };
  root.querySelector('[data-add-case-bug]').onclick=()=>{
    let uid=c.uid;
    if(!c.primaryBugRemoved&&(!c.bug||!hasCaseBug(c)&&!(c.additionalBugs||[]).length)){preparePrimaryBug(c,templateFor(options.report||{}));}
    else{if((c.additionalBugs||[]).length>=49)return toast('Máximo 50 bugs por caso.',true);const bug={...newBug(templateFor(options.report||{})),uid:crypto.randomUUID(),enabled:true};(c.additionalBugs||=[]).push(bug);uid=bug.uid;}
    expanded.set(uid,true);changed();root.querySelector(`[data-case-bug="${uid}"]`)?.scrollIntoView({block:'nearest'});
  };
  for(const entry of entries){
    const accordion=root.querySelector(`[data-case-bug="${entry.uid}"]`);if(!accordion)continue;
    accordion.ontoggle=()=>expanded.set(entry.uid,accordion.open);
    const toggle=accordion.querySelector('[data-enable-case-bug]');toggle.onclick=e=>e.stopPropagation();toggle.onchange=e=>{entry.bug.enabled=e.target.checked;changed();};
    const confirmation=accordion.querySelector('[data-case-bug-confirm]');
    accordion.querySelector('[data-remove-case-bug]').onclick=e=>{e.preventDefault();e.stopPropagation();confirmation.hidden=false;accordion.open=true;confirmation.querySelector('[data-cancel-case-bug-delete]').focus();};
    confirmation.querySelector('[data-cancel-case-bug-delete]').onclick=()=>{confirmation.hidden=true;accordion.querySelector('[data-remove-case-bug]').focus();};
    confirmation.querySelector('[data-confirm-case-bug-delete]').onclick=()=>{if(!removeCaseBug(c,entry.uid))return;expanded.delete(entry.uid);changed();toast('Bug eliminado. El caso y los demás bugs se conservaron.');};
    if(entry.bug.enabled)renderSingleBugPanel(entry,{...options,root:accordion.querySelector('[data-case-bug-editor]'),embedded:true,fieldIdPrefix:entry.uid===c.uid?'':entry.uid,onChange:()=>{accordion.querySelector('.case-bug-title').textContent='Bug '+(entries.indexOf(entry)+1)+': '+(entry.bug.title||'Sin título');onChange();}});
  }
  options.icons();
}
function renderSingleBugPanel(c,options){
  const {root,onChange,onExport,escape,icon,icons,toast,standalone=false}=options,enabled=standalone||!!c.bug?.enabled;
  root.innerHTML=`${standalone||options.embedded?'':`<div class="bug-toggle-row"><label class="bug-toggle"><input id="case-has-bug" type="checkbox" ${enabled?'checked':''}>${icon('bug')} Bug</label><span>Registrá un defecto y descargalo en un Word separado.</span></div>`}${enabled?`<div class="bug-details"><div class="bug-panel-heading"><h3>${standalone?escape(c.id)+' · Bug independiente':'Reporte de bug'}</h3><div class="document-save-actions">${standalone?`<button class="button primary" data-save-current-bug>${icon('save')} Guardar bug</button>`:''}<button class="button secondary" data-export-current-bug>${icon('file-down')} Word de este bug</button></div></div>${standalone?`<div class="field full independent-ticket"><label for="independent-bug-ticket">Ticket relacionado</label><input id="independent-bug-ticket" data-independent-ticket list="independent-ticket-options" value="${escape(bugTicket(options.report||{},c))}" placeholder="Escribí o elegí un ticket, ej. CF-215" maxlength="1000"><datalist id="independent-ticket-options">${(options.ticketChoices||[]).map(t=>`<option value="${escape(t)}"></option>`).join('')}</datalist><div class="field-label-row"><small>Podés elegir un ticket utilizado o escribir uno nuevo. Se guarda únicamente en este bug.</small><button class="text-button" data-use-report-ticket>Usar ticket del informe</button></div></div>`:'<p class="field-note" data-bug-ticket hidden></p>'}${standalone?`<div class="field full independent-component"><label for="independent-bug-component">Componente</label><input id="independent-bug-component" data-independent-component value="${escape(c.bug.component||'')}" placeholder="Ej. ABM Empresas / Pagos" maxlength="2000"><small>Nombre del módulo o componente afectado. Texto libre.</small></div>`:''}<div class="form-grid">${templateFor(options.report||{}).bug.sections.map(section=>`<section class="bug-template-section full"><h4>${escape(section.title)}</h4><div class="form-grid">${section.fields.map(f=>renderTemplateField(c,f,{escape,kind:'bug',idPrefix:options.fieldIdPrefix||''})+(f.key==='steps'&&!standalone?'<div class="full"><p class="field-note" data-bug-steps-note></p><button type="button" class="text-button" data-reset-bug-steps>Volver a usar los pasos del caso</button></div>':'')).join('')}</div></section>`).join('')}</div>${!standalone?'<p class="field-note">El Word incluye solo las evidencias cargadas en este bug.</p>':''}<div class="bug-evidence-uploader"></div><p class="field-note">${standalone?'Este bug tiene pasos y evidencias propios.':'Las capturas que subas aquí son propias de este bug. Desmarcar Bug conserva lo completado.'} Los campos vacíos se omiten.</p></div>`:''}`;
  if(!standalone&&!options.embedded)root.querySelector('#case-has-bug').onchange=e=>{c.bug||=newBug();c.bug.enabled=e.target.checked;onChange();renderBugPanel(c,options);};
  if(enabled){root.querySelectorAll('[data-bug-field]').forEach(el=>el.oninput=()=>{const f=templateFields(options.report||{},'bug').find(f=>f.key===el.dataset.bugField);if(!f)return;setFieldValue(c,f,el.type==='checkbox'?String(el.checked):el.value,'bug');if(f.key==='steps'&&!standalone)updateSingleBugSteps(c,root);onChange();});const button=root.querySelector('[data-export-current-bug]');button.onclick=()=>onExport(c.uid,button);if(!standalone){updateSingleBugSteps(c,root);const reset=root.querySelector('[data-reset-bug-steps]');if(reset)reset.onclick=()=>{delete c.bug.steps;updateSingleBugSteps(c,root);onChange();};}const evidence=standalone?c.evidence:(c.bug.evidence||=[]);renderBugEvidence(root.querySelector('.bug-evidence-uploader'),evidence,{onChange,escape,icon,icons,toast});}
  if(standalone){
    root.querySelector('[data-independent-component]').oninput=e=>{c.bug.component=e.target.value;onChange();};
    root.querySelector('[data-independent-ticket]').oninput=e=>{c.bug.ticket=e.target.value;onChange();};
    root.querySelector('[data-use-report-ticket]').onclick=()=>{delete c.bug.ticket;root.querySelector('[data-independent-ticket]').value=bugTicket(options.report||{},c);onChange();};
    root.querySelector('[data-save-current-bug]').onclick=()=>options.onSave?.();
  }
  updateBugTicket(root,options.report||{});
  icons();
}
function updateSingleBugSteps(c,root){
  const input=root.querySelector('[data-bug-field="steps"]');if(!input)return;
  const inherited=c.bug?.steps===undefined;
  if(inherited){input.value=c.steps||'';if(input.type==='checkbox')input.checked=c.steps==='true';}
  const note=root.querySelector('[data-bug-steps-note]'),reset=root.querySelector('[data-reset-bug-steps]');
  if(note)note.textContent=inherited?'Se toman del caso de prueba. Podés editarlos para este bug.':'Pasos propios del bug. Los cambios del caso no los reemplazan.';
  if(reset)reset.disabled=inherited;
}

export function updateBugTicket(root,report){
  root.querySelectorAll('[data-bug-ticket]').forEach(el=>{el.hidden=!bugTicket(report,{}).trim();el.textContent=el.hidden?'':'Ticket relacionado: '+bugTicket(report,{});});
}

export function updateBugSteps(c,root){
  const editors=[...root.querySelectorAll('[data-case-bug-editor]')];
  if(!editors.length)return updateSingleBugSteps(c,root);
  for(const entry of caseBugEntries(c,true)){const editor=editors.find(el=>el.dataset.caseBugEditor===entry.uid);if(editor)updateSingleBugSteps(entry,editor);}
}
