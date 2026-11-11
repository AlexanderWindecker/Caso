import {randomUUID} from 'node:crypto';
import {chatToolNames} from './chat-tools.mjs';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export class JiraChatService{
  constructor({codex,mcp,now=()=>Date.now()}={}){this.codex=codex;this.mcp=mcp;this.now=now;this.sessions=new Map();this.busy=false;}
  async status(){return this.codex.status();}
  prune(){for(const [id,s] of this.sessions)if(this.now()-s.updated>3600000){this.sessions.delete(id);this.codex.forget(s.threadId).catch(()=>{});}}
  async message({sessionId,message}){
    if(typeof message!=='string'||!message.trim()||message.length>6000)throw new Error('Escribí una consulta de hasta 6000 caracteres.');
    if(sessionId!==undefined&&(typeof sessionId!=='string'||!/^[a-f0-9-]{36}$/.test(sessionId)))throw new Error('Conversación inválida.');
    if(this.busy)throw new Error('Hay una consulta en curso. Esperá la respuesta.');
    this.prune();let session=this.sessions.get(sessionId);
    if(sessionId&&!session)throw new Error('La conversación venció o se reinició el servicio. Elegí Nueva conversación.');
    this.busy=true;
    try{
      if(!session){if(this.sessions.size>=8)throw new Error('Cerrá una conversación antes de iniciar otra.');sessionId=randomUUID();session={threadId:await this.codex.newThread(),updated:this.now(),count:0};this.sessions.set(sessionId,session);}
      if(session.count>=40)throw new Error('Esta conversación alcanzó 40 consultas. Iniciá una nueva.');
      const issues=new Map(),queries=[];
      const answer=await this.codex.ask(session.threadId,message.trim(),async(name,args)=>{
        if(!chatToolNames.includes(name))throw new Error('El chat solo permite consultar Jira.');
        const data=await this.mcp.call('qaJiraChatRead',{name,args:args||{}});
        const search=name==='jira_search'||name==='jira_assigned';
        const found=search?data.issues:name==='jira_issue'?[data]:[];
        for(const i of found||[])if(i.key)issues.set(i.key,i);
        if(search)queries.push({jql:data.jql,total:data.total,startAt:data.startAt,shown:data.issues?.length||0});
        return data;
      });
      session.updated=this.now();session.count++;
      return {sessionId,answer,issues:[...issues.values()].map(({key,url,summary,status,type,assignee})=>({key,url,summary,status,type,assignee})),queries,queriedAt:new Date(this.now()).toISOString()};
    }catch(error){
      // Failed turns can leave partial context; require a fresh thread on retry.
      if(session){this.sessions.delete(sessionId);await this.codex.forget(session.threadId);}
      throw error;
    }finally{this.busy=false;}
  }
  async reset(id){if(this.busy)throw new Error('Esperá a que termine la consulta.');const s=this.sessions.get(id);this.sessions.delete(id);if(s)await this.codex.forget(s.threadId);return {ok:true};}
}
export function chatAPI(service){return async request=>{
  const url=new URL(request.url);
  if(request.method!=='POST'||request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site'||!request.headers.get('content-type')?.includes('application/json'))return json({error:'Se requiere una solicitud desde la aplicación.'},403);
  try{
    const raw=await request.text();if(raw.length>12000)return json({error:'Solicitud demasiado grande.'},413);
    const body=JSON.parse(raw);
    if(url.pathname==='/api/chat/status')return json(await service.status());
    if(url.pathname==='/api/chat/message')return json(await service.message(body));
    if(url.pathname==='/api/chat/reset')return json(await service.reset(body.sessionId));
    return json({error:'Ruta no encontrada.'},404);
  }catch(error){return json({error:error.message||'No se pudo completar la consulta.'},400);}
};}
