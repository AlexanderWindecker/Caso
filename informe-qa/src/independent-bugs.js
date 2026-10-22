import {bugTicket} from './bug-ticket.js';
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('es');
export function filterIndependentBugs(report,{ticket='',component='',severity='',priority=''}={}){
  return (report.bugs||[]).filter(b=>(!ticket||normalize(bugTicket(report,b)).includes(normalize(ticket)))&&(!component||normalize(b.bug.component).includes(normalize(component)))&&(!severity||normalize(b.bug.severity)===normalize(severity))&&(!priority||normalize(b.bug.priority)===normalize(priority)));
}
