import {newBug} from './model.js';
import {bugTicket} from './bug-ticket.js';
import {renderBugEvidence} from './bug-evidence.js';
import {templateFor,templateFields,setFieldValue} from './templates.js';
import {renderTemplateField} from './fields-ui.js';
export function renderBugPanel(c,options){
  const {root,onChange,onExport,escape,icon,icons,toast,standalone=false}=options,enabled=standalone||!!c.bug?.enabled;
  root.innerHTML=`${standalone?'':`<div class="bug-toggle-row"><label class="bug-toggle"><input id="case-has-bug" type="checkbox" ${enabled?'checked':''}>${icon('bug')} Bug</label><span>Registrá un defecto y descargalo en un Word separado.</span></div>`}${enabled?`<div class="bug-details"><div class="bug-panel-heading"><h3>${standalone?escape(c.id)+' · Bug independiente':'Reporte de bug'}</h3><div class="document-save-actions">${standalone?`<button class="button primary" data-save-current-bug>${icon('save')} Guardar bug</button>`:''}<button class="button secondary" data-export-current-bug>${icon('file-down')} Word de este bug</button></div></div>${standalone?`<div class="field full independent-ticket"><label for="independent-bug-ticket">Ticket relacionado</label><input id="independent-bug-ticket" data-independent-ticket list="independent-ticket-options" value="${escape(bugTicket(options.report||{},c))}" placeholder="Escribí o elegí un ticket, ej. CF-215" maxlength="1000"><datalist id="independent-ticket-options">${(options.ticketChoices||[]).map(t=>`<option value="${escape(t)}"></option>`).join('')}</datalist><div class="field-label-row"><small>Podés elegir un ticket utilizado o escribir uno nuevo. Se guarda únicamente en este bug.</small><button class="text-button" data-use-report-ticket>Usar ticket del informe</button></div></div>`:'<p class="field-note" data-bug-ticket hidden></p>'}${standalone?`<div class="field full independent-component"><label for="independent-bug-component">Componente</label><input id="independent-bug-component" data-independent-component value="${escape(c.bug.component||'')}" placeholder="Ej. ABM Empresas / Pagos" maxlength="2000"><small>Nombre del módulo o componente afectado. Texto libre.</small></div>`:''}<div class="form-grid">${templateFor(options.report||{}).bug.sections.map(section=>`<section class="bug-template-section full"><h4>${escape(section.title)}</h4><div class="form-grid">${section.fields.map(f=>renderTemplateField(c,f,{escape,kind:'bug'})+(f.key==='steps'&&!standalone?'<div class="full"><p class="field-note" data-bug-steps-note></p><button type="button" class="text-button" data-reset-bug-steps>Volver a usar los pasos del caso</button></div>':'')).join('')}</div></section>`).join('')}</div>${!standalone?`<div class="bug-inherited-note">${icon('images')} Las ${c.evidence.length} evidencia(s) del caso se incluyen automáticamente en el Word del bug.</div><div class="bug-inherited-images">${c.evidence.map(e=>`<img src="${e.data}" alt="${escape(e.caption||e.name)}" title="${escape(e.caption||e.name)}">`).join('')}</div>`:''}<div class="bug-evidence-uploader"></div><p class="field-note">${standalone?'Este bug tiene pasos y evidencias propios.':'Podés agregar capturas adicionales sin modificar las evidencias del caso. Desmarcar Bug conserva lo completado.'} Los campos vacíos se omiten.</p></div>`:''}`;
  if(!standalone)root.querySelector('#case-has-bug').onchange=e=>{c.bug||=newBug();c.bug.enabled=e.target.checked;onChange();renderBugPanel(c,options);};
  if(enabled){root.querySelectorAll('[data-bug-field]').forEach(el=>el.oninput=()=>{const f=templateFields(options.report||{},'bug').find(f=>f.key===el.dataset.bugField);if(!f)return;setFieldValue(c,f,el.type==='checkbox'?String(el.checked):el.value,'bug');if(f.key==='steps'&&!standalone)updateBugSteps(c,root);onChange();});const button=root.querySelector('[data-export-current-bug]');button.onclick=()=>onExport(c.uid,button);if(!standalone){updateBugSteps(c,root);const reset=root.querySelector('[data-reset-bug-steps]');if(reset)reset.onclick=()=>{delete c.bug.steps;updateBugSteps(c,root);onChange();};}const evidence=standalone?c.evidence:(c.bug.evidence||=[]);renderBugEvidence(root.querySelector('.bug-evidence-uploader'),evidence,{onChange,escape,icon,icons,toast});}
  if(standalone){
    root.querySelector('[data-independent-component]').oninput=e=>{c.bug.component=e.target.value;onChange();};
    root.querySelector('[data-independent-ticket]').oninput=e=>{c.bug.ticket=e.target.value;onChange();};
    root.querySelector('[data-use-report-ticket]').onclick=()=>{delete c.bug.ticket;root.querySelector('[data-independent-ticket]').value=bugTicket(options.report||{},c);onChange();};
    root.querySelector('[data-save-current-bug]').onclick=()=>options.onSave?.();
  }
  updateBugTicket(root,options.report||{});
  icons();
}
export function updateBugSteps(c,root){
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
