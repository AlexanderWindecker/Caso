import {almRows,createAlmExcel} from './alm-excel.js';
import {almValue} from './alm-fields.js';

export function openAlmExport({report,modal,closeModal,escape,download,toast}){
  const cases=report.cases.filter(c=>c.selected);
  if(!cases.length)return toast('Seleccioná al menos un caso para exportar.',true);
  const $=s=>document.querySelector(s),missing=cases.filter(c=>!almValue(c,'almSubject').trim()).length;
  // Only the data used in the sheet is captured. Images and bug evidence are never copied.
  const keys=['id','name','selected','objective','testData','preconditions','role','existingData','dependencies','steps','expected','type','almSubject','almType','almStatus','almPriority','almIntegration','almRegression','almComplexity'];
  const snapshot={title:report.title,cases:cases.map(c=>Object.fromEntries(keys.filter(key=>c[key]!==undefined).map(key=>[key,c[key]])))};
  modal('Exportar Excel para ALM',`
    <p>Se exportarán <strong>${cases.length} caso(s) seleccionado(s)</strong> con las 14 columnas de la plantilla ALM, sin imágenes ni adjuntos.</p>
    <label class="field full">Subject común para casos sin Subject${missing?'<span class="required-mark"> *</span>':''}<input id="alm-export-subject" placeholder="Ej.: Imported\\BI-4059" autocomplete="off" ${missing?'aria-required="true"':''}></label>
    <p class="field-note">${missing} caso(s) necesitan Subject. El valor común se utiliza solo en esta descarga; cada caso con Subject propio lo conserva.</p>
    <div class="notice">Cada caso ocupa tantas filas como pasos tenga. Subject, Test Name, Type, Integración, Prioridad y Regresión se completan solo en la primera fila; las filas siguientes los dejan en blanco. Para agrupar varias líneas de ejecución en una fila, comenzá con Paso 1: o Step 1:. El texto continúa en ese paso hasta la siguiente marca. Sin marcas al comienzo, cada línea se exporta como un paso. En Resultado esperado podés escribir bloques como “Step 1: texto” y “Step 3: texto”, cada uno en una línea nueva. También se acepta “Paso”. Cada bloque puede incluir varias líneas o JSON, y los pasos sin bloque quedan vacíos. Sin esas marcas, todo el resultado esperado se ubica en el último paso. Objetivo y datos de prueba se incluyen en Description; usuario, datos previos y dependencias se agregan a Precondiciones. El * identifica los campos obligatorios para ALM. Status y Description son opcionales. Los nombres de las columnas del Excel se conservan sin asteriscos.</div>
    <p class="field-note">Type inicial: MANUAL. Status inicial: IMPORTED. Se pueden cambiar en cada caso. Las opciones y campos obligatorios deben coincidir con la configuración de tu proyecto ALM.</p>
    <p id="alm-export-summary" role="status" aria-live="polite"></p>
    <div class="modal-actions"><button class="button secondary" id="alm-export-cancel">Cancelar</button><button class="button primary" id="alm-export-download">Descargar Excel (.xlsx)</button></div>
  `);
  const options=()=>({subject:$('#alm-export-subject').value});
  function summary(){try{
    const rows=almRows(snapshot,options());
    $('#alm-export-summary').textContent=`${cases.length} caso(s) · ${rows.length} fila(s) de pasos · Sin evidencias`;
    $('#alm-export-download').disabled=false;
  }catch(error){$('#alm-export-summary').textContent=error.message;$('#alm-export-download').disabled=true;}}
  $('#alm-export-subject').oninput=summary;
  $('#alm-export-cancel').onclick=closeModal;
  $('#alm-export-download').onclick=async()=>{
    const button=$('#alm-export-download'),cancel=$('#alm-export-cancel'),subject=$('#alm-export-subject');button.disabled=true;cancel.disabled=true;subject.disabled=true;button.textContent='Generando Excel…';
    try{const blob=await createAlmExcel(snapshot,options());const name=(snapshot.title||'Casos de prueba').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'-').slice(0,140)+' - ALM.xlsx';await download(blob,name);closeModal();toast('Excel ALM generado sin evidencias.');}
    catch(error){toast('No se pudo exportar: '+error.message,true);}
    finally{if(button.isConnected){button.textContent='Descargar Excel (.xlsx)';cancel.disabled=false;subject.disabled=false;summary();}}
  };
  summary();
}
