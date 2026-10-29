import JSZip from 'jszip';
import {createBugWord} from './document.js';
import {bugEntries} from './model.js';
import {requiredMissing,templateFields,visibleField} from './templates.js';

export async function createBugArchive(report,{dimensions,onProgress=()=>{}}={}){
  const entries=bugEntries(report);
  if(!entries.length)throw new Error('No hay bugs activos para exportar.');
  const missing=requiredMissing(report,entries,'bug');
  if(missing.length)throw new Error('Completá los campos obligatorios: '+missing.join(', '));
  const zip=new JSZip(),used=new Set(),titleField=templateFields(report,'bug').find(f=>f.key==='title');
  onProgress({completed:0,total:entries.length,phase:'documents'});
  for(const [i,entry] of entries.entries()){
    const blob=await createBugWord(report,{caseUid:entry.uid,dimensions});
    const title=titleField&&visibleField(entry,titleField,'bug')?entry.bug.title:entry.id;
    const label=[report.title?.trim()||'Informe QA',title||'Bug'].join(' - ').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'-').trim().replace(/[. ]+$/,'').slice(0,180).replace(/[. ]+$/,'');
    let name=label+'.docx',number=2;
    while(used.has(name.normalize('NFC').toLowerCase())){const suffix=' ('+number+++')';name=label.slice(0,180-suffix.length).replace(/[. ]+$/,'')+suffix+'.docx';}
    used.add(name.normalize('NFC').toLowerCase());zip.file(name,await blob.arrayBuffer());
    onProgress({completed:i+1,total:entries.length,phase:'documents'});
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  onProgress({completed:entries.length,total:entries.length,phase:'archive'});
  return zip.generateAsync({type:'blob',mimeType:'application/zip',compression:'STORE'});
}
