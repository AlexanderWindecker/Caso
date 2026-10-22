import {bugTicket} from './bug-ticket.js';
export const retestStatuses=['Pendiente','Corregido','Persiste','Corregido parcialmente','Bloqueado'];
export const retestFields=[['bugTitle','Título del bug'],['ticket','Ticket relacionado'],['version','Versión probada'],['environment','Ambiente'],['date','Fecha de validación'],['author','Responsable'],['steps','Pasos ejecutados'],['expected','Resultado esperado'],['actual','Resultado obtenido'],['observations','Observaciones']];
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/i.test(v);
export function retestSources(report){return [...report.cases.filter(c=>c.bug?.enabled).map(c=>({...c,kind:'case'})),...(report.bugs||[]).filter(b=>b.bug?.enabled).map(b=>({...b,kind:'standalone'}))].map(c=>({sourceUid:c.uid,sourceKind:c.kind,sourceId:c.id,bugTitle:c.bug.title||c.name||c.id,ticket:bugTicket(report,c),steps:c.bug.steps??c.steps??'',expected:c.bug.expected||'',originalActual:c.bug.actual||'',originalEvidenceCount:(c.evidence||[]).length+(c.bug.evidence||[]).length}));}
export function todayForRetest(){const parts=new Intl.DateTimeFormat('en',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=t=>parts.find(p=>p.type===t).value;return `${part('year')}-${part('month')}-${part('day')}`;}
export function newRetest(report,source=null,previous=null){
  const baseline=previous||source||{},groupUid=previous?.groupUid||source?.sourceUid||crypto.randomUUID(),entries=report.retests||[];
  const number=Math.max(0,...entries.map(e=>Number(e.id.match(/^RT-(\d+)$/)?.[1]||0)))+1,now=new Date().toISOString();
  return {uid:crypto.randomUUID(),id:'RT-'+String(number).padStart(3,'0'),groupUid,sourceUid:baseline.sourceUid||'',sourceKind:baseline.sourceKind||'external',sourceId:baseline.sourceId||'',bugTitle:baseline.bugTitle||'',ticket:baseline.ticket??(report.omittedFields?.ticket?'':report.ticket||''),steps:baseline.steps||'',expected:baseline.expected||'',originalActual:baseline.originalActual||'',originalEvidenceCount:baseline.originalEvidenceCount||0,version:report.omittedFields?.version?'':report.version||'',environment:report.omittedFields?.environment?'':report.environment||'',author:report.omittedFields?.author?'':report.author||'',date:todayForRetest(),actual:'',observations:'',status:'Pendiente',attempt:Math.max(0,...entries.filter(e=>e.groupUid===groupUid).map(e=>e.attempt))+1,selected:true,evidence:[],created:now,updated:now};
}
export function filterRetests(report,{query='',status='',version=''}={}){const q=query.trim().toLocaleLowerCase('es');return (report.retests||[]).filter(r=>(!status||r.status===status)&&(!version||r.version===version)&&(!q||[r.id,r.bugTitle,r.ticket,r.sourceId,r.author,r.version].join(' ').toLocaleLowerCase('es').includes(q)));}
export function remapRetestSources(original,copy){
  if(!original.retests)return copy;
  const ids=new Map(original.cases.map((c,i)=>[c.uid,copy.cases[i].uid]));
  copy.retests=original.retests.map(r=>({...structuredClone(r),sourceUid:ids.get(r.sourceUid)||r.sourceUid,groupUid:ids.get(r.groupUid)||r.groupUid}));return copy;
}
export function retestExportEntries(report,{uid}={}){
  const entries=(report.retests||[]).filter(r=>uid?r.uid===uid:r.selected);
  if(!entries.length)throw new Error('Seleccioná al menos una validación para exportar.');
  const missing=entries.filter(r=>!r.bugTitle.trim()||(r.sourceKind==='external'&&!r.ticket.trim()));
  if(missing.length)throw new Error('Completá el título del bug y el ticket de los bugs externos: '+missing.map(r=>r.id).join(', '));
  return entries;
}
export function validateRetests(entries){
  if(entries===undefined)return;
  if(!Array.isArray(entries)||entries.length>500)throw new Error('La lista de validaciones no es válida (máximo 500).');
  const ids=new Set();
  for(const r of entries){
    if(!r||!uuid(r.uid)||ids.has(r.uid)||!uuid(r.groupUid)||typeof r.id!=='string'||!/^RT-\d+$/.test(r.id)||!['case','standalone','external'].includes(r.sourceKind)||typeof r.sourceUid!=='string'||r.sourceKind!=='external'&&!uuid(r.sourceUid)||typeof r.sourceId!=='string'||r.sourceId.length>160||!Number.isInteger(r.attempt)||r.attempt<1||typeof r.selected!=='boolean'||!retestStatuses.includes(r.status)||!Number.isInteger(r.originalEvidenceCount)||r.originalEvidenceCount<0)throw new Error('El respaldo contiene un registro de validación inválido.');
    ids.add(r.uid);
    for(const key of [...retestFields.map(f=>f[0]),'originalActual','created','updated'])if(typeof r[key]!=='string'||r[key].length>50000)throw new Error('El respaldo contiene campos de validación inválidos.');
    if(r.date&&(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||!Number.isFinite(Date.parse(r.date))||new Date(r.date).toISOString().slice(0,10)!==r.date))throw new Error('La fecha de validación no es válida.');
    if(!Array.isArray(r.evidence)||r.evidence.length>20||r.evidence.some(e=>!e||typeof e.uid!=='string'||typeof e.name!=='string'||typeof e.caption!=='string'||typeof e.data!=='string'||!/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(e.data)))throw new Error('El respaldo contiene evidencias de validación inválidas.');
  }
}
