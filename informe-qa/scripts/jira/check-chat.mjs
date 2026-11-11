// Read-only integration check; --smoke also consumes one Codex turn and reads Jira.
import {CodexChat} from './codex-chat.mjs';
import {JiraMcpClient} from './mcp-client.mjs';
import {JiraChatService} from './chat-service.mjs';
const codex=new CodexChat(),mcp=new JiraMcpClient();
try{
  console.log(await codex.status());
  if(process.argv.includes('--smoke')){
    const service=new JiraChatService({codex,mcp});
    const result=await service.message({message:'Consultá jira_myself y decime únicamente mi nombre de usuario de Jira. No consultes tickets.'});
    console.log({answer:result.answer,tickets:result.issues.length});
  }
}catch(error){console.error(error.message);process.exitCode=1;}
finally{codex.close();mcp.close();}
