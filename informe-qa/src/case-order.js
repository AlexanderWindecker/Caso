export function moveCase(report,sourceUid,targetUid,position='before'){
  const cases=report.cases,source=cases.findIndex(c=>c.uid===sourceUid),target=cases.findIndex(c=>c.uid===targetUid);
  if(source<0||target<0||source===target||!['before','after'].includes(position))return false;
  const remaining=cases.filter(c=>c.uid!==sourceUid),insert=remaining.findIndex(c=>c.uid===targetUid)+(position==='after'?1:0);
  if(insert===source)return false;
  const [moved]=cases.splice(source,1);cases.splice(insert,0,moved);
  const ids=new Map();cases.forEach((c,i)=>{c.id='CP-'+String(i+1).padStart(3,'0');ids.set(c.uid,c.id);});
  for(const c of cases)for(const bug of c.additionalBugs||[])ids.set(bug.uid,c.id);
  for(const validation of report.retests||[])if(validation.sourceKind==='case'&&ids.has(validation.sourceUid))validation.sourceId=ids.get(validation.sourceUid);
  return true;
}
