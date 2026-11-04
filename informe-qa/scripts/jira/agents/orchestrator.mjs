import cf from './cf.mjs';
import guv from './guv.mjs';
import dh from './dh.mjs';
import {projectKeyFor} from '../../../src/jira.js';
const agents={CF:cf,GUV:guv,DH:dh};
export async function prepareWithAgent(report,entry,mcp){
  const projectKey=entry.bug.jiraDraft?.projectKey||projectKeyFor(report.app);
  if(!agents[projectKey])throw new Error('Seleccioná CF, GUV o DH como proyecto antes de preparar el ticket.');
  const metadata=await mcp.call('qaJiraMetadata',{projectKey});
  return agents[projectKey].prepare(report,entry,metadata);
}
