import {coverageSummary,coverageStatus,filterCoverage} from './coverage.js';
import {hasCaseBug} from './case-bugs.js';

export function openCoverage({report,modal,escape,icon,icons,onOpen}){
  const $=s=>document.querySelector(s),summary=coverageSummary(report.cases);
  const metric=(label,value,style='')=>`<div class="coverage-metric ${style}"><strong>${value}</strong><span>${label}</span></div>`;
  modal('Cobertura de casos de prueba',`
    <p class="coverage-report">${escape(report.title)}</p>
    <div class="coverage-metrics">
      ${metric('Casos totales',summary.total)}${metric('OK sin bug',summary.passed,'passed')}
      ${metric('KO / Bug',summary.failed,'failed')}${metric('Pendientes / otros',summary.pending,'pending')}
      ${metric('Con evidencias',summary.withEvidence)}
    </div>
    <div class="coverage-progress"><label for="coverage-review-progress">Revisión: <strong>${summary.reviewed} de ${summary.total} casos (${summary.reviewPercent}%)</strong></label><progress id="coverage-review-progress" max="100" value="${summary.reviewPercent}"></progress></div>
    <p class="field-note">El resultado y la revisión se muestran por separado. Un caso con OK puede seguir en borrador. Este resumen muestra los casos registrados, sin medir requisitos que aún no tengan casos.</p>
    <div class="coverage-filters">
      <label>Buscar<input id="coverage-search" placeholder="ID, nombre, módulo o tipo" type="search"></label>
      <label>Resultado<select id="coverage-status"><option value="">Todos</option><option value="passed">OK sin bug</option><option value="failed">KO / Bug</option><option value="pending">Pendientes / otros</option></select></label>
      <label>Revisión<select id="coverage-review"><option value="">Todas</option><option value="draft">Sin revisar</option><option value="reviewed">Revisados</option></select></label>
    </div>
    <div class="coverage-list-summary"><span id="coverage-count" role="status" aria-live="polite"></span><button class="text-button" id="coverage-clear">Limpiar filtros</button></div>
    <div class="coverage-table-scroll"><table class="coverage-table"><caption class="coverage-caption">Listado de casos de prueba del informe</caption><thead><tr><th scope="col">Caso</th><th scope="col">Nombre</th><th scope="col">Módulo / Tipo</th><th scope="col">Resultado</th><th scope="col">Revisión</th><th scope="col">Evidencias</th><th scope="col">Acción</th></tr></thead><tbody id="coverage-rows"></tbody></table></div>
  `);
  $('#modal').classList.add('coverage-dialog');
  function render(){
    const rows=filterCoverage(report.cases,{query:$('#coverage-search').value,status:$('#coverage-status').value,review:$('#coverage-review').value});
    $('#coverage-count').textContent=`${rows.length} de ${summary.total} casos · ${summary.evidence} evidencia(s) en total`;
    $('#coverage-rows').innerHTML=rows.map(c=>{
      const status=coverageStatus(c),result=hasCaseBug(c)?(c.result==='KO'?'KO · Bug':'Bug'):c.result||'Pendiente';
      return `<tr class="coverage-row ${status} ${c.reviewed?'reviewed':'draft'}"><td>${escape(c.id)}</td><td class="coverage-case-name">${escape(c.name||'Sin nombre')}</td><td>${escape(c.module||'Sin módulo')}<small>${escape(c.type||'Sin tipo')}</small></td><td><span class="coverage-status ${status}">${escape(result)}</span></td><td>${c.reviewed?'Revisado':'Borrador'}</td><td>${c.evidence?.length||0}</td><td><button class="button secondary" data-coverage-open="${escape(c.uid)}" aria-label="Abrir ${escape(c.id)}">${icon('arrow-up-right')} Abrir</button></td></tr>`;
    }).join('')||'<tr><td colspan="7" class="empty">No hay casos con estos filtros.</td></tr>';
    $('#coverage-rows').querySelectorAll('[data-coverage-open]').forEach(button=>button.onclick=()=>onOpen(button.dataset.coverageOpen));
    icons();
  }
  $('#coverage-search').oninput=render;
  $('#coverage-status').onchange=render;
  $('#coverage-review').onchange=render;
  $('#coverage-clear').onclick=()=>{for(const id of ['coverage-search','coverage-status','coverage-review'])$('#'+id).value='';render();};
  render();
}
