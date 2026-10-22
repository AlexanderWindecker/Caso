import {filterIndependentBugs} from './independent-bugs.js';
import {retestSources} from './retests.js';
export const incidentKey=(owner,entry)=>owner.uid+'/'+entry.uid;
export function allIndependentBugs(reports,filters={}){return reports.flatMap(owner=>filterIndependentBugs(owner,filters).map(bug=>({owner,bug,key:incidentKey(owner,bug)})));}
export function allRetests(reports){return reports.flatMap(owner=>(owner.retests||[]).map(record=>({owner,record,key:incidentKey(owner,record)})));}
export function allRetestSources(reports){return reports.flatMap(owner=>retestSources(owner).map(source=>({...source,ownerUid:owner.uid,key:owner.uid+'/'+source.sourceUid})));}
export function globalRetestReport(reports){return {title:'Informe de incidencia',app:'',version:'',author:'',omittedFields:{},retests:allRetests(reports).map(({owner,record,key})=>({...structuredClone(record),uid:key,ownerUid:owner.uid}))};}
