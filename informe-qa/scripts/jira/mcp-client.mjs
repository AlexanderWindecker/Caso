import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';

export class JiraMcpClient{
  constructor({spawnProcess=spawn,timeout=60000}={}){this.spawnProcess=spawnProcess;this.timeout=timeout;this.sequence=0;this.pending=new Map();}
  async start(){
    if(this.ready)return this.ready;
    this.ready=(async()=>{
      this.child=this.spawnProcess(process.execPath,[fileURLToPath(new URL('../codex-jira-mcp.mjs',import.meta.url))],{stdio:['pipe','pipe','pipe'],windowsHide:true});
      // Never forward stderr: upstream errors can include response bodies or configuration.
      this.child.stderr.on('data',()=>{});
      const fail=()=>{for(const {reject,timer} of this.pending.values()){clearTimeout(timer);reject(new Error('Se cerró la conexión con el MCP de Jira. Revisá la configuración de Jira en VS Code.'));}this.pending.clear();this.ready=null;this.child=null;};
      this.child.on('error',fail);this.child.on('exit',fail);
      createInterface({input:this.child.stdout}).on('line',line=>{
        let message;try{message=JSON.parse(line);}catch{return;}
        const request=this.pending.get(message.id);if(!request)return;
        clearTimeout(request.timer);this.pending.delete(message.id);
        if(message.error)request.reject(new Error('El MCP rechazó la solicitud de Jira.'));else request.resolve(message.result);
      });
      await this.rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'caso-qa',version:'1.0.0'}});
      this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    })().catch(error=>{this.close();throw error;});
    return this.ready;
  }
  rpc(method,params){return new Promise((resolve,reject)=>{
    const id=++this.sequence;
    const timer=setTimeout(()=>{this.pending.delete(id);const error=new Error('No se confirmó la respuesta del MCP. Consultá el estado antes de reintentar.');error.uncertain=true;reject(error);},this.timeout);
    this.pending.set(id,{resolve,reject,timer});
    this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n',error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(new Error('No se pudo enviar la solicitud al MCP de Jira.'));}});
  });}
  async call(name,args){
    await this.start();const response=await this.rpc('tools/call',{name,arguments:args});
    let result;try{result=JSON.parse(response.content?.find(c=>c.type==='text')?.text);}catch{throw new Error('Respuesta no reconocida del MCP Jira.');}
    if(!result.ok){const error=new Error(result.error||'Jira rechazó la operación.');error.status=result.status;error.uncertain=result.uncertain;throw error;}
    return result.data;
  }
  close(){const child=this.child;this.ready=null;this.child=null;child?.kill();}
}
