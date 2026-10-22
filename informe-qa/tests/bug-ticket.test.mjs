import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import JSZip from 'jszip';
import {newReport,newStandaloneBug,validateBackup} from '../src/model.js';
import {bugTicket,knownTickets} from '../src/bug-ticket.js';
import {createBugWord,createWord} from '../src/document.js';
import {retestSources,newRetest} from '../src/retests.js';
import {ReportStore} from '../scripts/report-store.mjs';
async function xml(blob){const zip=await JSZip.loadAsync(await blob.arrayBuffer());return zip.file('word/document.xml').async('string');}
test('Bug independiente usa ticket propio en Word y retesteo sin modificar el ticket del informe',async()=>{
  const r=newReport();r.ticket='CF-215';const b=newStandaloneBug();b.bug.title='Bug con ticket propio';b.bug.ticket='INC-987';r.bugs.push(b);
  const output=await xml(await createBugWord(r,{caseUid:b.uid}));assert.ok(output.includes('INC-987'));assert.ok(!output.includes('CF-215'));assert.equal(r.ticket,'CF-215');assert.ok((await xml(await createWord(r))).includes('CF-215'));
  const source=retestSources(r)[0];assert.equal(source.ticket,'INC-987');assert.equal(newRetest(r,source).ticket,'INC-987');
  r.cases[0].bug.enabled=true;const combined=await xml(await createBugWord(r));assert.ok(combined.includes('INC-987'));assert.ok(combined.includes('CF-215'));
});
test('Ticket vacío, heredado y sugerencias respetan la elección del usuario',async()=>{
  const r=newReport();r.ticket='CF-215';const b=newStandaloneBug();r.bugs.push(b);assert.equal(bugTicket(r,b),'CF-215');
  b.bug.ticket='';assert.equal(bugTicket(r,b),'');assert.ok(!(await xml(await createBugWord(r))).includes('CF-215'));assert.equal(newRetest(r,retestSources(r)[0]).ticket,'');
  b.bug.ticket='INC-987';r.omittedFields.ticket=true;assert.equal(bugTicket(r,b),'INC-987');assert.ok((await xml(await createBugWord(r))).includes('INC-987'));delete b.bug.ticket;assert.equal(bugTicket(r,b),'');r.omittedFields.ticket=false;assert.equal(bugTicket(r,b),'CF-215');
  b.bug.ticket='CF-215';const other=newReport();other.ticket='JIRA-100';assert.deepEqual(knownTickets([r,other]),['CF-215','JIRA-100']);
});
test('Ticket propio persiste, se respalda y admite bugs antiguos sin ticket',async()=>{
  const r=newReport(),b=newStandaloneBug();b.bug.ticket='INC-987';r.bugs.push(b);const root=await mkdtemp(join(tmpdir(),'caso-own-ticket-'));
  try{const store=new ReportStore(root);await store.write(r);const recovered=await new ReportStore(root).get(r.uid);assert.equal(recovered.bugs[0].bug.ticket,'INC-987');assert.equal(validateBackup({format:'caso-qa-v1',reports:[recovered]}).length,1);delete recovered.bugs[0].bug.ticket;assert.equal(validateBackup({format:'caso-qa-v1',reports:[recovered]}).length,1);recovered.bugs[0].bug.ticket=123;assert.throws(()=>validateBackup({format:'caso-qa-v1',reports:[recovered]}),/ticket de bug/);}finally{await rm(root,{recursive:true,force:true});}
});
