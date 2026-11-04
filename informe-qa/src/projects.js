// Catálogo inicial. Las opciones de cada informe se editan en Plantillas → Encabezado.
export const projects=Object.freeze([
  Object.freeze({key:'CF',name:'Cobranza de facturas'}),
  Object.freeze({key:'GUV',name:'Gestor unificado de valores'}),
  Object.freeze({key:'DH',name:'Datos históricos nuevo'})
]);

export function projectOptions(currentValue=''){
  const options=[{value:'',label:'Seleccionar proyecto…'},...projects.map(project=>{
    const label=`${project.name} (${project.key})`;
    return {value:label,label};
  })];
  return options;
}

export function renderProjectSelect(select,currentValue=''){
  select.replaceChildren(...projectOptions(currentValue).map(({value,label})=>{
    const option=select.ownerDocument.createElement('option');
    option.value=value;option.textContent=label;return option;
  }));
  select.value=String(currentValue??'');
}
