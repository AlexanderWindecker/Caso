import {Paragraph,TextRun,HeadingLevel,ImageRun,Table,TableRow,TableCell,WidthType} from 'docx';
import JSZip from 'jszip';
import {packDocument,imageSize,bytes,line,paragraphs,heading} from './document.js';
import {retestExportEntries} from './retests.js';
const summaryCell=(value,header=false)=>new TableCell({shading:header?{fill:'E5EFE9'}:undefined,children:[new Paragraph({spacing:{after:80},children:[new TextRun({text:String(value||'—'),bold:header,size:18})]})]});
export async function createRetestWord(report,{uid,dimensions=imageSize}={}){
  const entries=retestExportEntries(report,{uid}),title='Informe de incidencia';
  const content=[heading(title,HeadingLevel.TITLE)];
  content.push(line('Registros seleccionados',entries.length),heading('Resumen de validaciones'),new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:[new TableRow({tableHeader:true,children:['Intento','Bug','Ticket','Versión','Fecha','Estado'].map(v=>summaryCell(v,true))}),...entries.map(r=>new TableRow({children:[String(r.attempt),r.bugTitle,r.ticket,r.version,r.date,r.status].map(v=>summaryCell(v))}))]}));
  for(const r of entries){
    content.push(new Paragraph({text:(r.ticket.trim()||'Validación')+' — '+r.bugTitle,heading:HeadingLevel.HEADING_1,pageBreakBefore:true}),line('Intento',r.attempt),line('Estado de la validación',r.status));
    for(const [key,label] of [['ticket','Ticket relacionado'],['version','Versión probada'],['environment','Ambiente'],['date','Fecha de validación'],['author','Responsable']])if(r[key]?.trim())content.push(line(label,r[key]));
    if(r.sourceKind==='external')content.push(line('Origen','Bug externo'));
    if(r.originalActual.trim())content.push(heading('Resultado original del bug (referencia)'),...paragraphs(r.originalActual));
    if(r.steps.trim()){content.push(heading('Pasos ejecutados'));for(const [i,step] of r.steps.split('\n').filter(s=>s.trim()).entries())content.push(line('Paso '+(i+1),step.replace(/^(?:paso\s*)?\d+[.):\-]\s*/i,'')));}
    for(const [key,label] of [['expected','Resultado esperado'],['actual','Resultado obtenido'],['observations','Observaciones']])if(r[key].trim())content.push(heading(label),...paragraphs(r[key]));
    if(r.evidence.length)content.push(heading('Evidencias de la validación'));
    for(const [i,e] of r.evidence.entries()){
      const d=await dimensions(e.data),scale=Math.min(550/d.width,650/d.height,1);
      content.push(new Paragraph({text:`Evidencia ${i+1}: ${e.caption||e.name}`,keepNext:true}),new Paragraph({children:[new ImageRun({data:bytes(e.data),type:e.data.startsWith('data:image/png')?'png':'jpg',transformation:{width:Math.round(d.width*scale),height:Math.round(d.height*scale)},altText:{title:e.name,description:e.caption||e.name,name:e.name}})]}));
    }
  }
  return packDocument(report,content,title,'Resumen y detalle de validaciones de bugs',{headerText:'Informe de incidencia',creator:'Caso'});
}
export async function createRetestArchive(report,{uid,dimensions,onProgress=()=>{}}={}){
  const entries=retestExportEntries(report,{uid}),zip=new JSZip(),used=new Set();
  for(const [i,r] of entries.entries()){
    onProgress(i,entries.length);
    const blob=await createRetestWord(report,{uid:r.uid,dimensions});
    const label=[r.ticket||'Validación',r.bugTitle,'Intento '+r.attempt].join(' - ').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'-').slice(0,180).trim().replace(/[. ]+$/,'');
    let name=label+'.docx',n=2;while(used.has(name.toLowerCase()))name=label+' ('+(n++)+').docx';used.add(name.toLowerCase());zip.file(name,await blob.arrayBuffer());
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  onProgress(entries.length,entries.length);return zip.generateAsync({type:'blob',mimeType:'application/zip',compression:'STORE'});
}
