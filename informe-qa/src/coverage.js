import {hasCaseBug} from './case-bugs.js';
// Read-only projections: never normalize or write the report being consulted.
export function coverageStatus(c){
  if(c.result==='KO'||hasCaseBug(c))return 'failed';
  return c.result==='OK'?'passed':'pending';
}

export function coverageSummary(cases){
  const summary={total:cases.length,passed:0,failed:0,pending:0,reviewed:0,withEvidence:0,evidence:0};
  for(const c of cases){
    summary[coverageStatus(c)]++;
    if(c.reviewed)summary.reviewed++;
    const count=c.evidence?.length||0;
    if(count)summary.withEvidence++;
    summary.evidence+=count;
  }
  summary.reviewPercent=summary.total?Math.round(summary.reviewed/summary.total*100):0;
  return summary;
}

export function filterCoverage(cases,{query='',status='',review=''}={}){
  const normalized=String(query).trim().toLocaleLowerCase('es');
  return cases.filter(c=>(!status||coverageStatus(c)===status)&&
    (!review||(review==='reviewed'?!!c.reviewed:!c.reviewed))&&
    (!normalized||[c.id,c.name,c.module,c.type].join(' ').toLocaleLowerCase('es').includes(normalized)));
}
