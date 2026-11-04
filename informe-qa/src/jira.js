import {projects} from './projects.js';
export const jiraDraftKeys=['projectKey','defectTypeId','componentId','severityId','versionId','environmentId'];
export function projectKeyFor(value){const text=String(value||'').trim().toLowerCase(),suffix=text.match(/\(([a-z0-9_]+)\)$/)?.[1].toUpperCase();return projects.find(p=>p.key===suffix||[p.key,p.name,`${p.name} (${p.key})`].some(v=>v.toLowerCase()===text))?.key||'';}
export function jiraEvidence(entry){const seen=new Set();return [...(entry.evidence||[]),...(entry.bug?.evidence||[])].filter(e=>{if(seen.has(e.uid))return false;seen.add(e.uid);return true;});}
export function validateJiraData(bug){
  if(bug.jiraDraft!==undefined){
    const draft=bug.jiraDraft;if(!draft||typeof draft!=='object'||Array.isArray(draft))throw new Error('Configuración Jira inválida.');
    for(const [key,value] of Object.entries(draft)){
      if(jiraDraftKeys.includes(key)){if(typeof value!=='string'||value.length>100)throw new Error('Campo Jira inválido.');}
      else if(key==='evidenceIds'){if(!Array.isArray(value)||value.length>40||value.some(id=>typeof id!=='string'||id.length>100))throw new Error('Selección de evidencias Jira inválida.');}
      else throw new Error('Campo Jira desconocido.');
    }
  }
  if(bug.jiraPublication!==undefined){
    const p=bug.jiraPublication;
    if(!p||typeof p!=='object'||Array.isArray(p)||!['CF','GUV','DH'].includes(p.projectKey)||!(/^[a-f0-9-]{36}$/i.test(p.publicationId||''))||!['creating','failed','created','attachments_pending','complete','unknown'].includes(p.status))throw new Error('Vínculo con Jira inválido.');
    if(p.key){if(!new RegExp('^'+p.projectKey+'-\\d+$').test(p.key)||typeof p.url!=='string'||!/^https:\/\//.test(p.url)||p.url.length>2000)throw new Error('Enlace de publicación Jira inválido.');}
    else if(!['creating','failed','unknown'].includes(p.status))throw new Error('Falta el identificador del ticket Jira.');
  }
}
