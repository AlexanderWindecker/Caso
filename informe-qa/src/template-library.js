import {defaultTemplate,templateFor} from './templates.js';
import {openTemplateEditor} from './template-editor.js';

export async function openTemplateLibrary({getLibrary,changeLibrary,report,onApply,modal,toast,icons,escape}){
  let library=await getLibrary();
  const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll('#modal-body '+s)];
  const unique=name=>{let next=name,n=2;while(library.entries.some(e=>e.template.name.toLowerCase()===next.toLowerCase()))next=name+' ('+n+++')';return next;};
  async function change(data){library=await changeLibrary({...data,baseRevision:library.revision});return library;}
  function nameDialog(title,value,onConfirm){
    modal(title,`<label class="field">Nombre de la plantilla<input id="library-name" value="${escape(value)}" maxlength="160"></label><div class="modal-actions"><button class="button secondary" id="library-cancel">Cancelar</button><button class="button primary" id="library-confirm">Guardar</button></div>`);
    $('#library-cancel').onclick=show;$('#library-confirm').onclick=async()=>{const button=$('#library-confirm');button.disabled=true;try{await onConfirm($('#library-name').value.trim());show();}catch(e){toast(e.message,true);button.disabled=false;}};$('#library-name').focus();$('#library-name').select();
  }
  function edit(entry,{reportOnly=false}={}){
    let currentId=entry?.id||null;
    openTemplateEditor({report,defaults:library,libraryEntry:entry,libraryMode:!reportOnly,modal,toast,icons,escape,onBack:show,onApply,
      onLibrarySave:async(template,{asNew})=>{
        const create=asNew||!currentId||reportOnly;
        if(create&&library.entries.some(e=>e.template.name.trim().toLowerCase()===template.name.trim().toLowerCase()))template.name=unique(template.name+' (copia)');
        await change({action:create?'create':'update',id:currentId,template});
        const saved=library.entries.find(e=>e.template.name===template.name.trim());if(!reportOnly)currentId=saved.id;return saved;
      }
    });
  }
  function show(){
    modal('Mis plantillas',`<p>Guardá distintas estructuras y elegí cuál usar al crear cada informe. La predeterminada se propone automáticamente.</p><div class="template-library-current"><b>Plantilla de este informe: ${escape(templateFor(report).name)}</b><div class="template-library-actions"><button class="button secondary" id="library-edit-report">Editar para este informe</button><button class="button secondary" id="library-save-report">Guardar como nueva</button></div></div><div class="template-library-list">${library.entries.map(entry=>`<article class="template-library-card"><div><strong>${escape(entry.template.name)}</strong>${entry.id===library.defaultId?'<span class="template-default-badge">Predeterminada</span>':''}<p>${entry.template.case.sections.length} secciones de casos · ${entry.template.bug.sections.length} secciones de bugs</p></div><div class="template-library-actions"><button class="button secondary" data-library-edit="${escape(entry.id)}">Editar</button><button class="button secondary" data-library-copy="${escape(entry.id)}">Duplicar</button>${entry.id!==library.defaultId?`<button class="button secondary" data-library-default="${escape(entry.id)}">Hacer predeterminada</button>`:''}<button class="icon-button danger" data-library-delete="${escape(entry.id)}" aria-label="Eliminar ${escape(entry.template.name)}" ${library.entries.length===1?'disabled':''}>×</button></div></article>`).join('')}</div><div class="modal-actions"><button class="button primary" id="library-new">+ Nueva plantilla</button></div>`);
    $('#library-edit-report').onclick=()=>edit(null,{reportOnly:true});
    $('#library-save-report').onclick=()=>nameDialog('Guardar plantilla del informe',unique(templateFor(report).name),async name=>{await change({action:'create',template:{...structuredClone(templateFor(report)),name}});toast('Plantilla guardada en Mis plantillas.');});
    $('#library-new').onclick=()=>edit({id:null,template:{...defaultTemplate(),name:unique('Nueva plantilla')}});
    all('[data-library-edit]').forEach(el=>el.onclick=()=>edit(library.entries.find(e=>e.id===el.dataset.libraryEdit)));
    all('[data-library-copy]').forEach(el=>el.onclick=()=>{const entry=library.entries.find(e=>e.id===el.dataset.libraryCopy);nameDialog('Duplicar plantilla',unique(entry.template.name+' (copia)'),async name=>{await change({action:'create',template:{...structuredClone(entry.template),name}});toast('Plantilla duplicada.');});});
    all('[data-library-default]').forEach(el=>el.onclick=async()=>{el.disabled=true;try{await change({action:'default',id:el.dataset.libraryDefault});show();toast('Plantilla predeterminada actualizada.');}catch(e){el.disabled=false;toast(e.message,true);}});
    all('[data-library-delete]').forEach(el=>el.onclick=()=>{
      const entry=library.entries.find(e=>e.id===el.dataset.libraryDelete);
      modal('Eliminar plantilla',`<p>Se quitará <strong>${escape(entry.template.name)}</strong> de Mis plantillas. Los informes que ya la usan conservarán su estructura.${entry.id===library.defaultId?' La primera plantilla restante quedará como predeterminada.':''}</p><div class="modal-actions"><button class="button secondary" id="library-delete-cancel">Cancelar</button><button class="button danger-button" id="library-delete-confirm">Eliminar plantilla</button></div>`);
      $('#library-delete-cancel').onclick=show;$('#library-delete-confirm').onclick=async()=>{const button=$('#library-delete-confirm');button.disabled=true;try{await change({action:'delete',id:entry.id});show();toast('Plantilla eliminada de la biblioteca.');}catch(e){button.disabled=false;toast(e.message,true);}};
    });icons();
  }
  show();
}
