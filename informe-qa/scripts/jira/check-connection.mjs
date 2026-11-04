import {JiraMcpClient} from './mcp-client.mjs';
const mcp=new JiraMcpClient();
try{
  for(const projectKey of ['CF','GUV','DH']){
    const metadata=await mcp.call('qaJiraMetadata',{projectKey});
    console.log(JSON.stringify({project:projectKey,fields:metadata.fields.length,components:metadata.fields.find(f=>f.id==='components')?.allowedValues.length,versions:metadata.fields.find(f=>f.id==='versions')?.allowedValues.length,attachmentsEnabled:metadata.attachments.enabled}));
  }
}catch(error){console.error('No se pudo verificar Jira:',error.message);process.exitCode=1;}finally{mcp.close();}
