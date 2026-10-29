// Keep the original c.bug and its case UID intact for existing reports/validations.
export function caseBugEntries(c,includeDisabled=false){
  const entries=[];
  if(c.bug)entries.push({...c,caseUid:c.uid,caseId:c.id,standalone:false});
  for(const [i,bug] of (c.additionalBugs||[]).entries())entries.push({...c,uid:bug.uid,caseUid:c.uid,caseId:c.id,id:c.id+' · Bug '+(i+(c.bug?2:1)),bug,standalone:false});
  return includeDisabled?entries:entries.filter(entry=>entry.bug.enabled);
}
export const hasCaseBug=c=>!!c.bug?.enabled||(c.additionalBugs||[]).some(b=>b.enabled);
export function removeCaseBug(c,uid){
  if(uid===c.uid&&c.bug){delete c.bug;c.primaryBugRemoved=true;return true;}
  const index=(c.additionalBugs||[]).findIndex(bug=>bug.uid===uid);
  if(index<0)return false;
  c.additionalBugs.splice(index,1);return true;
}
export function resetClonedCaseBugs(c){
  if(c.bug)c.bug.evidence=[];
  for(const bug of c.additionalBugs||[]){bug.uid=crypto.randomUUID();bug.evidence=[];}
  return c;
}
