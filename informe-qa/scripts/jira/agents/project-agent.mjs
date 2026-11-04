import {jiraEvidence,projectKeyFor} from '../../../src/jira.js';
import {bugTicket} from '../../../src/bug-ticket.js';

const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const severityAliases={critica:'critico',critico:'critico',medio:'media',bajo:'baja'};
const equivalent=(a,b)=>{const x=normalized(a),y=normalized(b);return (severityAliases[x]||x)===(severityAliases[y]||y);};
const choose=(values,id,guess)=>values.find(v=>v.id===id)?.id||(!id&&values.filter(v=>equivalent(v.name,guess)).length===1?values.find(v=>equivalent(v.name,guess)).id:'');
export function makeProjectAgent(profile){
  return {
    ...profile,
    prepare(report,entry,metadata){
      const saved=entry.bug.jiraDraft||{};
      const sameProject=saved.projectKey===profile.key;
      const draft=sameProject?saved:{};
      const fields=metadata.fields;
      const find=name=>fields.find(f=>normalized(f.name)===normalized(name));
      const ids={defectType:find('Tipo de defecto')?.id,severity:find('Criticidad')?.id,environment:find('Ambiente')?.id};
      const options=id=>fields.find(f=>f.id===id)?.allowedValues||[];
      const catalogs={defectType:options(ids.defectType),component:options('components'),severity:options(ids.severity),version:options('versions'),environment:ids.environment?options(ids.environment):[{id:'description-testing',name:'Testing'},{id:'description-preproduction',name:'Preproduccion'},{id:'description-production',name:'Produccion'}]};
      const reportEnvironment=report.omittedFields?.environment?'':report.environment;
      const environmentGuess=!reportEnvironment||normalized(reportEnvironment)==='qa'?'Testing':reportEnvironment;
      const selections={projectKey:profile.key,
        defectTypeId:choose(catalogs.defectType,draft.defectTypeId,'Defecto'),
        componentId:choose(catalogs.component,draft.componentId,entry.bug.component||entry.module),
        severityId:choose(catalogs.severity,draft.severityId,entry.bug.severity),
        versionId:choose(catalogs.version,draft.versionId,report.omittedFields?.version?'':report.version),
        environmentId:choose(catalogs.environment,draft.environmentId,environmentGuess)};
      const allEvidence=jiraEvidence(entry);
      const evidenceIds=saved.evidenceIds===undefined?allEvidence.map(e=>e.uid):saved.evidenceIds.filter(id=>allEvidence.some(e=>e.uid===id));
      selections.evidenceIds=evidenceIds;
      const evidence=allEvidence.filter(e=>evidenceIds.includes(e.uid));
      const steps=entry.bug.steps??entry.steps??'';
      const environment=catalogs.environment.find(o=>o.id===selections.environmentId)?.name||'';
      const related=bugTicket(report,entry).trim();
      const description=[['Descripción',entry.bug.description],['Pasos para reproducir',steps],['Resultado esperado',entry.bug.expected],['Resultado obtenido',entry.bug.actual],['Ambiente',environment],['Ticket relacionado',related],['Evidencias',evidence.map((e,i)=>`${i+1}. ${e.caption||e.name}`).join('\n')]].filter(([,value])=>String(value||'').trim()).map(([label,value])=>`${label}\n${value}`).join('\n\n');
      const errors=[];
      for(const [key,label] of [['title','Resumen'],['description','Descripción'],['expected','Resultado esperado'],['actual','Resultado obtenido']])if(!String(entry.bug[key]||'').trim())errors.push('Completá '+label+'.');
      if(entry.bug.title.length>255)errors.push('El resumen no puede superar los 255 caracteres.');
      for(const [key,label] of [['defectTypeId','Tipo de defecto'],['componentId','Componente'],['severityId','Criticidad'],['versionId','Versión afectada'],['environmentId','Ambiente']])if(!selections[key])errors.push('Seleccioná '+label+'.');
      if(!metadata.attachments?.enabled)errors.push('Jira no tiene habilitada la carga de adjuntos.');
      if(!evidence.length)errors.push('Seleccioná al menos una evidencia.');
      for(const e of evidence){const bytes=Math.floor((e.data?.split(',')[1]?.length||0)*3/4);if(bytes>(metadata.attachments?.uploadLimit||10*1024*1024)||bytes>10*1024*1024)errors.push(`La evidencia ${e.name} supera el límite de tamaño.`);}
      const known=new Set(['summary','description','project','issuetype','components','versions','reporter','attachment','assignee',...Object.values(ids).filter(Boolean)]);
      for(const f of fields)if(f.required&&!f.hasDefaultValue&&!known.has(f.id))errors.push(`Jira exige ${f.name}; falta configurar ese campo en el perfil ${profile.key}.`);
      if(!ids.defectType||!ids.severity)errors.push('Faltan los campos de tipo de defecto o criticidad en Jira.');
      if(!metadata.user?.name)errors.push('No se pudo identificar al informador de Jira.');
      const payload={project:{key:profile.key},issuetype:{id:'1'},summary:entry.bug.title.trim(),description,reporter:{name:metadata.user?.name},components:[{id:selections.componentId}],versions:[{id:selections.versionId}]};
      for(const [id,value] of [[ids.defectType,selections.defectTypeId],[ids.severity,selections.severityId],[ids.environment,selections.environmentId]])if(id)payload[id]={id:value};
      return {agent:profile.name,projectKey:profile.key,summary:payload.summary,description,selections,catalogs,errors,evidence:allEvidence.map(e=>({uid:e.uid,name:e.name,caption:e.caption,selected:evidenceIds.includes(e.uid)})),environmentInDescriptionOnly:!ids.environment,payload,selectedEvidence:evidence,reportProjectKey:projectKeyFor(report.app)};
    }
  };
}
