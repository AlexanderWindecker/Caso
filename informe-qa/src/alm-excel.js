import JSZip from 'jszip';
import {almValue} from './alm-fields.js';

export const almHeaders=['Subject','Test Name','Type','Status','Description','Prioridad','Integración','Regresión','Tipo de Caso de Prueba','Complejidad','Precondiciones (Design Steps)','Step Name (Design Steps)','Description (Design Steps)','Expected Result (Design Steps)'];
export const excelMime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const text=value=>String(value??'').trim();
const xml=value=>String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const stepHeading=/^\s*(?:step|paso)\s+(\d+)(?:\s*[:.)-]\s*(.*)|\s*)$/i;

function designSteps(value,caseId){
  const lines=text(value).split(/\r?\n/);
  // Existing unmarked lists keep their original one-line-per-step behavior.
  // An explicit heading at the beginning opts into multiline step blocks.
  if(!stepHeading.test(lines[0])){
    const steps=lines.map(s=>s.trim()).filter(Boolean).map(s=>s.replace(/^(?:paso\s*)?\d+[.):\-]\s*/i,''));
    return steps.length?steps:[''];
  }
  const steps=[];let block=null;
  for(const line of lines){
    const match=line.match(stepHeading);
    if(match){
      if(block!==null)steps.push(block.join('\n').trim());
      const expected=steps.length+1;
      if(Number(match[1])!==expected)throw new Error(`${caseId}: los pasos marcados deben ser consecutivos desde Step 1. Se esperaba Step ${expected} y se encontró Step ${match[1]}.`);
      block=match[2]?[match[2]]:[];
    }else block.push(line);
  }
  steps.push(block.join('\n').trim());return steps;
}

function expectedByStep(value,count,caseId){
  const original=text(value),result=Array(count).fill('');
  const lines=original.split(/\r?\n/),heading=stepHeading;
  if(!lines.some(line=>heading.test(line))){result[count-1]=original;return result;}
  const used=new Set();let current=null,block=[];
  const finish=()=>{if(current!==null)result[current-1]=block.join('\n').trim();};
  for(const line of lines){
    const match=line.match(heading);
    if(match){
      finish();const step=Number(match[1]);
      if(!Number.isSafeInteger(step)||step<1||step>count)throw new Error(`${caseId}: el resultado esperado referencia Step ${match[1]}, pero el caso tiene ${count} paso(s).`);
      if(used.has(step))throw new Error(`${caseId}: Step ${step} está repetido en Resultado esperado. Unificá su contenido en un solo bloque.`);
      used.add(step);current=step;block=match[2]?[match[2]]:[];
    }else{
      if(current===null&&line.trim())throw new Error(`${caseId}: hay texto antes del primer Step en Resultado esperado. Incluí ese texto dentro del paso correspondiente o quitá las marcas Step para usar un resultado final único.`);
      if(current!==null)block.push(line);
    }
  }
  finish();return result;
}

export function almRows(report,{subject=''}={}){
  const cases=report.cases.filter(c=>c.selected);
  if(!cases.length)throw new Error('Seleccioná al menos un caso para exportar.');
  const names=new Set(),rows=[];
  for(const c of cases){
    const folder=text(almValue(c,'almSubject'))||text(subject),name=text(c.name);
    if(folder.includes('/')||/[\r\n]/.test(folder))throw new Error(`${c.id}: Subject debe ser una ruta en una sola línea, con barras invertidas (\\) entre carpetas.`);
    const identity=JSON.stringify([folder.toLocaleLowerCase('es'),name.toLocaleLowerCase('es')]);
    if(folder&&name&&names.has(identity))throw new Error(`Hay casos con el mismo Subject y Test Name (${name}). Cambiá el nombre o Subject para evitar que ALM los agrupe como un único caso.`);
    if(folder&&name)names.add(identity);
    const steps=designSteps(c.steps,c.id);
    const expected=expectedByStep(c.expected,steps.length,c.id);
    const description=[text(c.objective),text(c.testData)?'Datos de prueba:\n'+text(c.testData):''].filter(Boolean).join('\n\n');
    const preconditions=[text(c.preconditions),...['role','existingData','dependencies'].map((key,i)=>text(c[key])?['Usuario / Rol requerido','Datos existentes necesarios','Dependencias con otros sistemas'][i]+': '+text(c[key]):'')].filter(Boolean).join('\n');
    for(const [i,step] of steps.entries()){
      const row=[folder,name,almValue(c,'almType'),almValue(c,'almStatus'),description,almValue(c,'almPriority'),almValue(c,'almIntegration'),almValue(c,'almRegression'),text(c.type),almValue(c,'almComplexity'),preconditions,'Step '+(i+1),step,expected[i]];
      for(const [column,value] of row.entries())if(value.length>32767)throw new Error(`${c.id}: ${almHeaders[column]} supera los 32.767 caracteres que permite Excel.`);
      // This project's ALM template identifies a case on its first row only.
      if(i>0)for(const column of [0,1,2,5,6,7])row[column]='';
      rows.push(row);
      if(rows.length>1048575)throw new Error('La exportación supera el máximo de filas de una hoja Excel. Seleccioná menos casos.');
    }
  }
  return rows;
}

export function almExportProblems(rows){
  const errors=[],warnings=[];let group=[];
  function check(){
    if(!group.length)return;
    const name=group[0][1]||'Caso sin nombre';
    for(const column of [0,1,2,5,6,7])if(!text(group[0][column]))warnings.push(`${name}: falta ${almHeaders[column]}.`);
    const withoutExpected=[];
    for(const row of group){
      if(!text(row[11]))warnings.push(`${name}: falta Step Name.`);
      if(!text(row[12]))warnings.push(`${name} · ${row[11]}: falta Description (Design Steps).`);
      if(!text(row[13]))withoutExpected.push(row[11]);
    }
    if(withoutExpected.length===group.length)warnings.push(`${name}: falta Resultado esperado.`);
    else if(withoutExpected.length)warnings.push(`${name}: ${withoutExpected.join(', ')} sin resultado esperado propio. Se conserva el resultado general o los bloques que completaste.`);
  }
  for(const row of rows){if(row[11]==='Step 1'){check();group=[];}group.push(row);}
  check();return {errors,warnings};
}

export async function createAlmExcel(report,options={}){
  const rows=almRows(report,options),zip=new JSZip(),ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const last=rows.length+1;
  const rowXml=(row,index)=>`<row r="${index}">${row.map((value,col)=>`<c r="${String.fromCharCode(65+col)}${index}" s="${index===1?1:0}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`).join('')}</row>`;
  const widths=[35,55,14,16,65,15,15,15,24,20,60,20,70,70];
  const validations=[['F','MEDIA,BAJA,ALTA'],['G','SI,NO'],['H','SI,NO']].map(([column,values])=>`<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Valor no válido" error="Elegí un valor del desplegable." sqref="${column}2:${column}${Math.max(last,2)}"><formula1>"${values}"</formula1></dataValidation>`).join('');
  zip.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Casos ALM" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('xl/styles.xml',`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF183B39"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  zip.file('xl/worksheets/sheet1.xml',`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><dimension ref="A1:N${last}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${widths.map((width,i)=>`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join('')}</cols><sheetData>${rowXml(almHeaders,1)}${rows.map((r,i)=>rowXml(r,i+2)).join('')}</sheetData><autoFilter ref="A1:N${last}"/><dataValidations count="3">${validations}</dataValidations></worksheet>`);
  return zip.generateAsync({type:'blob',mimeType:excelMime,compression:'DEFLATE'});
}
