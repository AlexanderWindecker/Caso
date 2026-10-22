import JSZip from 'jszip';
import {createWord} from './document.js';
import {fieldVisible} from './model.js';
import {requiredMissing,templateFields} from './templates.js';

export async function createCaseArchive(report,{dimensions,onProgress=()=>{}}={}){
  const cases=report.cases.filter(c=>c.selected);
  if(!cases.length)throw new Error('Seleccioná al menos un caso para exportar.');
  const missing=requiredMissing(report,cases);
  if(missing.length)throw new Error('Completá los campos obligatorios: '+missing.join(', '));
  const zip=new JSZip(),includeName=templateFields(report).some(f=>f.key==='name'),usedNames=new Set();
  onProgress({completed:0,total:cases.length,phase:'documents'});
  for(const [i,c] of cases.entries()){
    const blob=await createWord({...report,cases:[c]},{dimensions});
    const caseName=includeName&&fieldVisible(c,'name')?c.name:c.id||'Caso';
    const label=[report.title?.trim()||'Informe QA',caseName].join(' - ').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'-').trim().replace(/[. ]+$/,'').slice(0,180).replace(/[. ]+$/,'');
    let name=label+'.docx',duplicate=2;
    while(usedNames.has(name.normalize('NFC').toLowerCase())){const suffix=' ('+duplicate+++')';name=label.slice(0,180-suffix.length).replace(/[. ]+$/,'')+suffix+'.docx';}
    usedNames.add(name.normalize('NFC').toLowerCase());
    zip.file(name,await blob.arrayBuffer());
    onProgress({completed:i+1,total:cases.length,phase:'documents'});
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  onProgress({completed:cases.length,total:cases.length,phase:'archive'});
  return zip.generateAsync({type:'blob',mimeType:'application/zip',compression:'STORE'});
}
