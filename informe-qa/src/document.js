import {Document,Packer,Paragraph,TextRun,HeadingLevel,ImageRun,Header,Footer,AlignmentType,PageNumber} from 'docx';
import {fieldVisible,reportSections,bugFields,bugEntries,bugEvidence} from './model.js';
const value=v=>String(v??'');
const line=(label,v)=>new Paragraph({spacing:{after:110},children:[new TextRun({text:label+': ',bold:true}),new TextRun(value(v))]});
const paragraphs=v=>value(v).split('\n').map(text=>new Paragraph({text,spacing:{after:100}}));
const heading=(text,level=HeadingLevel.HEADING_2)=>new Paragraph({text,heading:level,spacing:{before:260,after:150},keepNext:true});
function bytes(data){const b=atob(data.split(',')[1]);return Uint8Array.from(b,c=>c.charCodeAt(0));}
function imageSize(data){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});img.onerror=()=>reject(new Error('No se pudo leer una de las evidencias.'));img.src=data;});}
export async function createWord(report,{dimensions=imageSize}={}) {
  const cases=report.cases.filter(c=>c.selected);
  if(!cases.length) throw new Error('Seleccioná al menos un caso para exportar.');
  const content=[heading(report.title,HeadingLevel.TITLE),new Paragraph({text:'INFORME DE PRUEBAS FUNCIONALES',spacing:{after:300}}),...[['app','Aplicación / Sistema'],['environment','Ambiente'],['version','Versión / Release'],['author','Responsable']].filter(([key])=>fieldVisible(report,key)).map(([key,label])=>line(label,report[key])),line('Fecha',new Date(report.updated).toLocaleDateString('es-AR')),new Paragraph({text:`${cases.length} caso(s) de prueba`,spacing:{after:300}})];
  for(const [i,c] of cases.entries()) {
    const n=i+1;
    content.push(new Paragraph({text:`${n}  ${fieldVisible(c,'name')?c.name:'CASO '+n}`,heading:HeadingLevel.HEADING_1,pageBreakBefore:true}));
    for(const section of reportSections(report,c)){
      content.push(heading(`${n}.${section.number}  ${section.title}`));
      for(const field of section.fields){
        if(field.key==='steps'){for(const [j,step] of value(field.value).split('\n').filter(s=>s.trim()).entries())content.push(line(`Paso ${j+1}`,step.replace(/^(?:paso\s*)?\d+[.):\-]\s*/i,'')));}
        else if(['objective','preconditions','testData','expected','actual'].includes(field.key)||field.key==='automation'&&field.value==='No Aplica')content.push(...paragraphs(field.value));
        else content.push(line(field.key==='automation'?'Aplicabilidad':field.label,field.value));
      }
      if(section.number===7)content.push(line('Revisión',c.reviewed?'Revisado por el usuario':'Pendiente de revisión'));
    for(const [j,e] of section.evidence.entries()) {
      const d=await dimensions(e.data);const scale=Math.min(550/d.width,650/d.height,1);
      content.push(new Paragraph({text:`Evidencia ${j+1}: ${e.caption||e.name}`,keepNext:true,spacing:{before:180,after:100}}),new Paragraph({children:[new ImageRun({data:bytes(e.data),type:e.data.startsWith('data:image/png')?'png':'jpg',transformation:{width:Math.round(d.width*scale),height:Math.round(d.height*scale)},altText:{title:e.name,description:e.caption||e.name,name:e.name}})]}));
    }
    }
  }
  return packDocument(report,content,report.title,'Informe de pruebas funcionales');
}
export async function createBugWord(report,{caseUid,dimensions=imageSize}={}){
  const cases=bugEntries(report).filter(c=>!caseUid||c.uid===caseUid);
  if(!cases.length)throw new Error('Marcá un caso como Bug o creá un bug independiente para exportar.');
  const title='Reporte de bugs — '+report.title,content=[heading(title,HeadingLevel.TITLE),new Paragraph({text:'REPORTE DE BUGS',spacing:{after:300}}),...[['app','Aplicación / Sistema'],['environment','Ambiente'],['version','Versión / Release'],['author','Responsable']].filter(([key])=>fieldVisible(report,key)).map(([key,label])=>line(label,report[key])),line('Fecha',new Date(report.updated).toLocaleDateString('es-AR')),new Paragraph({text:`${cases.length} bug(s) reportado(s)`,spacing:{after:300}})];
  for(const [i,c] of cases.entries()){
    const bug=c.bug;content.push(new Paragraph({text:`${i+1}  ${bug.title.trim()||'BUG — '+c.id}`,heading:HeadingLevel.HEADING_1,pageBreakBefore:true}),line(c.standalone?'ID del Bug':'Caso de origen',c.id));
    for(const [key,label] of bugFields){if(!String(bug[key]||'').trim())continue;if(['severity','priority'].includes(key))content.push(line(label,bug[key]));else content.push(heading(label),...paragraphs(bug[key]));}
    if(c.steps?.trim()){content.push(heading('Pasos para reproducir'));for(const [j,step] of c.steps.split('\n').filter(s=>s.trim()).entries())content.push(line(`Paso ${j+1}`,step.replace(/^(?:paso\s*)?\d+[.):\-]\s*/i,'')));}
    const evidence=bugEvidence(c);if(evidence.length){content.push(heading('Evidencias'));for(const [j,e] of evidence.entries()){const d=await dimensions(e.data),scale=Math.min(550/d.width,650/d.height,1);content.push(new Paragraph({text:`Evidencia ${j+1}: ${e.caption||e.name}`,keepNext:true}),new Paragraph({children:[new ImageRun({data:bytes(e.data),type:e.data.startsWith('data:image/png')?'png':'jpg',transformation:{width:Math.round(d.width*scale),height:Math.round(d.height*scale)},altText:{title:e.name,description:e.caption||e.name,name:e.name}})]}));}}
  }
  return packDocument(report,content,title,'Reporte independiente de bugs');
}
function packDocument(report,content,title,description){
  const doc=new Document({creator:fieldVisible(report,'author')?report.author:'Caso',title,description,styles:{default:{document:{run:{font:'Calibri',size:22},paragraph:{spacing:{after:120}}}},paragraphStyles:[{id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,run:{size:32,bold:true,color:'162F35'}},{id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',quickFormat:true,run:{size:25,bold:true,color:'246D64'}}]},sections:[{properties:{page:{margin:{top:1000,bottom:1000,left:1100,right:1100}}},headers:{default:new Header({children:[new Paragraph({text:['app','version'].filter(key=>fieldVisible(report,key)).map(key=>report[key]).join('  ·  ')||'Informe QA',style:'Caption'})]})},footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[new TextRun('Página '),new TextRun({children:[PageNumber.CURRENT]})]})]})},children:content}]});
  return Packer.toBlob(doc);
}
