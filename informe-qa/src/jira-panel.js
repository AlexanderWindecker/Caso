import {projects} from './projects.js';
import {projectKeyFor,jiraEvidence} from './jira.js';

const states={creating:'Creación en curso',unknown:'Resultado por confirmar',failed:'No se creó el ticket',created:'Ticket creado',attachments_pending:'Ticket creado, adjuntos pendientes',complete:'Publicado con sus evidencias'};
export async function openJiraBugDialog({report,entry,modal,closeModal,escape,persist,onPublication}){
  let preview=null,busy=false;
  const disabledStates=new WeakMap();
  const request=async(action,extra={})=>{
    const response=await fetch('/api/jira/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reportUid:report.uid,bugUid:entry.uid,...extra}),signal:AbortSignal.timeout(180000)});
    let data;try{data=await response.json();}catch{throw new Error('No se pudo consultar Jira. Reiniciá el servicio de la aplicación para cargar la integración.');}
    if(!response.ok)throw new Error(data.error||'No se pudo completar la operación con Jira.');return data;
  };
  const projectSelect=value=>`<label class="field">Proyecto *<select data-jira-project><option value="">Seleccionar proyecto…</option>${projects.map(p=>`<option value="${p.key}" ${p.key===value?'selected':''}>${escape(p.name)} (${p.key})</option>`).join('')}</select></label>`;
  const setError=message=>{const error=document.querySelector('[data-jira-error]');if(error){error.hidden=false;error.textContent=message;}};
  function controlsBusy(value){busy=value;document.querySelectorAll('.jira-review button,.jira-review select,.jira-review input').forEach(el=>{if(value){disabledStates.set(el,el.disabled);el.disabled=true;}else if(disabledStates.has(el)){el.disabled=disabledStates.get(el);disabledStates.delete(el);}});}
  async function prepare(){
    if(busy)return;
    const root=document.querySelector('.jira-review'),projectKey=root.querySelector('[data-jira-project]').value;
    if(!projectKey)return setError('Seleccioná un proyecto.');
    const previous=entry.bug.jiraDraft||{},draft={projectKey};
    if(preview?.projectKey===projectKey)for(const key of ['defectTypeId','componentId','severityId','versionId','environmentId'])draft[key]=root.querySelector(`[data-jira-choice="${key}"]`)?.value||'';
    else if(previous.projectKey===projectKey)Object.assign(draft,previous);
    draft.evidenceIds=preview?[...root.querySelectorAll('[data-jira-evidence]:checked')].map(el=>el.value):(previous.evidenceIds??jiraEvidence(entry).map(e=>e.uid));
    entry.bug.jiraDraft=draft;controlsBusy(true);
    try{await persist();const result=await request('prepare');if(result.alreadyCreated){await acceptPublication(result.publication);return;}preview=result;render();}catch(error){setError(error.message);}finally{controlsBusy(false);}
  }
  async function acceptPublication(publication){
    if(publication?.publicationId){entry.bug.jiraPublication=publication;if(preview)entry.bug.jiraDraft={...preview.selections};onPublication?.(publication);await persist();}
    showPublication(publication);
  }
  async function publish(){
    if(busy)return;controlsBusy(true);
    try{const result=await request('publish',{preparationId:preview?.preparationId});await acceptPublication(result.publication);}catch(error){setError(error.message);}finally{controlsBusy(false);}
  }
  function showPublication(publication){
    const complete=publication?.status==='complete';
    modal('Publicación en Jira',`<div class="jira-review"><p><strong>${escape(states[publication?.status]||'Estado de publicación')}</strong></p>${publication?.key?`<p><a href="${escape(publication.url)}" target="_blank" rel="noopener noreferrer">${escape(publication.key)} — Abrir en Jira</a></p><p>Evidencias confirmadas: ${Number(publication.uploaded||0)} de ${Number(publication.total||0)}.</p>`:''}${publication?.error?`<p class="notice">${escape(publication.error)}</p>`:''}<p data-jira-error class="notice" hidden></p><div class="modal-actions"><button class="button secondary" data-jira-close>Cerrar</button>${!complete?`<button class="button primary" data-jira-retry>${publication?.key?'Reintentar adjuntos':publication?.status==='failed'?'Preparar nuevamente':'Verificar publicación'}</button>`:''}</div></div>`);
    document.querySelector('[data-jira-close]').onclick=closeModal;
    const retry=document.querySelector('[data-jira-retry]');if(retry)retry.onclick=publication?.status==='failed'?()=>{preview=null;render();}:publish;
  }
  function render(){
    const selected=preview?.projectKey||entry.bug.jiraDraft?.projectKey||projectKeyFor(report.app);
    const choose=(key,label,items,value)=>`<label class="field">${label} *<select data-jira-choice="${key}"><option value="">Seleccionar…</option>${items.map(o=>`<option value="${escape(o.id)}" ${o.id===value?'selected':''}>${escape(o.name)}</option>`).join('')}</select></label>`;
    const catalogs=preview?.catalogs;
    modal('Crear ticket de bug en Jira',`<div class="jira-review"><p>Se publicará el bug <strong>${escape(entry.bug.title||'Sin título')}</strong>. Revisá el proyecto, los campos y las evidencias antes de crear el ticket.</p><div class="form-grid">${projectSelect(selected)}<label class="field">Tipo de incidencia<input value="Defecto" readonly></label>${catalogs?[
      choose('defectTypeId','Tipo de defecto',catalogs.defectType,preview.selections.defectTypeId),
      choose('componentId','Componente',catalogs.component,preview.selections.componentId),
      choose('severityId','Criticidad',catalogs.severity,preview.selections.severityId),
      choose('versionId','Versión afectada',catalogs.version,preview.selections.versionId),
      choose('environmentId','Ambiente',catalogs.environment,preview.selections.environmentId)
    ].join(''):''}</div>${catalogs?`<p>Versión del informe: <strong>${escape(report.version||'Sin completar')}</strong>. Elegí la versión correspondiente de Jira si no coincide exactamente.</p>${preview.environmentInDescriptionOnly?'<p class="field-note">Este proyecto no expone Ambiente al crear el defecto; se incluirá en la descripción.</p>':''}<fieldset class="jira-evidence"><legend>Evidencias a enviar *</legend>${preview.evidence.length?preview.evidence.map(e=>`<label><input type="checkbox" data-jira-evidence value="${escape(e.uid)}" ${e.selected?'checked':''}>${escape(e.caption||e.name)}</label>`).join(''):'<p>Agregá evidencias al bug o al caso antes de publicarlo.</p>'}</fieldset><div class="jira-preview"><h3>Resumen</h3><p>${escape(preview.summary)}</p><h3>Descripción</h3><pre>${escape(preview.description)}</pre></div>${preview.errors.length?`<div class="notice"><ul>${preview.errors.map(e=>`<li>${escape(e)}</li>`).join('')}</ul></div>`:''}`:''}<p data-jira-error class="notice" hidden></p><p data-jira-dirty class="field-note" hidden>Actualizá la vista previa para revisar los cambios.</p><div class="modal-actions"><button class="button secondary" data-jira-close>Cancelar</button><button class="button secondary" data-jira-prepare>${preview?'Actualizar vista previa':'Preparar ticket'}</button>${preview?`<button class="button primary" data-jira-publish ${preview.errors.length?'disabled':''}>Crear ticket en Jira</button>`:''}</div></div>`);
    const root=document.querySelector('.jira-review');
    root.querySelector('[data-jira-close]').onclick=closeModal;root.querySelector('[data-jira-prepare]').onclick=prepare;
    const publishButton=root.querySelector('[data-jira-publish]');if(publishButton)publishButton.onclick=publish;
    root.querySelectorAll('select,input[type="checkbox"]').forEach(el=>el.onchange=()=>{if(publishButton)publishButton.disabled=true;root.querySelector('[data-jira-dirty]').hidden=false;});
  }
  render();controlsBusy(true);
  try{await persist();const result=await request('status');if(result.publication){await acceptPublication(result.publication);return;}}catch(error){setError(error.message);return;}finally{controlsBusy(false);}
  if(entry.bug.jiraDraft?.projectKey||projectKeyFor(report.app))await prepare();
}
