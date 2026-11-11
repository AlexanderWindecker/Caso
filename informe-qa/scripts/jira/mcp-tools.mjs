import {createHash} from 'node:crypto';
import {readChatTool,chatToolNames} from './chat-tools.mjs';

const allowedProject=key=>['CF','GUV','DH'].includes(key);
const keyPattern=/^(CF|GUV|DH)-\d+$/;
export class JiraRequestError extends Error{
  constructor(message,status=0,uncertain=false){super(message);this.status=status;this.uncertain=uncertain;}
}
export class JiraGateway{
  constructor({baseUrl,authorization,fetcher=fetch}){this.baseUrl=baseUrl.replace(/\/+$/,'');this.authorization=authorization;this.fetcher=fetcher;}
  async request(path,{method='GET',body,form}={}){
    const headers={Authorization:this.authorization,Accept:'application/json'};
    if(body){headers['Content-Type']='application/json';body=JSON.stringify(body);}
    if(form){headers['X-Atlassian-Token']='no-check';body=form;}
    let response;
    try{response=await this.fetcher(this.baseUrl+path,{method,headers,body,redirect:'error',signal:AbortSignal.timeout(45000)});}catch{throw new JiraRequestError('No se pudo confirmar la respuesta de Jira. Revisá la red y volvé a consultar el estado.',0,method!=='GET');}
    if(!response.ok){
      let detail='';try{const data=await response.json();detail=[...(data.errorMessages||[]),...Object.values(data.errors||{})].map(String).join(' ').slice(0,1600);}catch{}
      throw new JiraRequestError(`Jira respondió ${response.status}.${detail?' '+detail:''}`,response.status,response.status>=500&&method!=='GET');
    }
    try{return await response.json();}catch{throw new JiraRequestError('Jira devolvió una respuesta no reconocida.',0,method!=='GET');}
  }
  async metadata(projectKey){
    if(!allowedProject(projectKey))throw new Error('Proyecto no habilitado.');
    const fields=[];let start=0;
    for(let page=0;page<20;page++){
      const data=await this.request(`/rest/api/2/issue/createmeta/${projectKey}/issuetypes/1?startAt=${start}&maxResults=100`);
      if(!Array.isArray(data.values))throw new Error('No se pudieron interpretar los campos de creación de Jira.');
      fields.push(...data.values);
      if(data.isLast===true||data.last===true||data.values.length===0||fields.length>=data.total)break;
      start+=data.values.length;
      if(page===19)throw new Error('La lista de campos de Jira quedó incompleta.');
    }
    const [user,attachments]=await Promise.all([this.request('/rest/api/2/myself'),this.request('/rest/api/2/attachment/meta')]);
    return {projectKey,baseUrl:this.baseUrl,user:{name:user.name,displayName:user.displayName},attachments,fields:fields.map(f=>({id:f.fieldId||f.key,name:f.name,required:!!f.required,schema:f.schema||{},hasDefaultValue:!!f.hasDefaultValue,defaultValue:f.defaultValue,allowedValues:(f.allowedValues||[]).filter(v=>!v.disabled&&!v.archived).map(v=>({id:String(v.id??''),name:v.name??v.value??'',value:v.value}))}))};
  }
  async find(projectKey,marker){
    if(!allowedProject(projectKey)||!/^qaexport[a-f0-9]{32}$/.test(marker))throw new Error('Referencia de publicación inválida.');
    const jql=`project = ${projectKey} AND description ~ "${marker}"`;
    const data=await this.request('/rest/api/2/search?'+new URLSearchParams({jql,fields:'description',maxResults:'100'}));
    const issues=(data.issues||[]).filter(i=>String(i.fields?.description||'').includes(marker));
    if(issues.length>1)throw new Error('Hay más de un ticket con la referencia de publicación. Revisá Jira antes de continuar.');
    return issues[0]?{key:issues[0].key,url:this.baseUrl+'/browse/'+issues[0].key}:null;
  }
  async create(fields){
    if(!allowedProject(fields.project?.key)||String(fields.issuetype?.id)!=='1')throw new Error('Solo se permite crear defectos en CF, GUV y DH.');
    const data=await this.request('/rest/api/2/issue',{method:'POST',body:{fields}});
    if(!keyPattern.test(data.key)||!data.key.startsWith(fields.project.key+'-'))throw new JiraRequestError('Jira no confirmó el identificador del ticket creado.',0,true);
    return {key:data.key,url:this.baseUrl+'/browse/'+data.key};
  }
  async attach({issueKey,name,data}){
    if(!keyPattern.test(issueKey)||!/^[a-zA-Z0-9._-]{1,150}$/.test(name)||!/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/=]+$/.test(data))throw new Error('Adjunto inválido.');
    const existing=await this.request(`/rest/api/2/issue/${issueKey}?fields=attachment`);
    const match=(existing.fields?.attachment||[]).find(a=>a.filename===name);
    if(match)return {id:String(match.id),name};
    const [,mime,encoded]=data.match(/^data:(image\/(?:png|jpeg));base64,(.*)$/);
    const buffer=Buffer.from(encoded,'base64');if(buffer.length>10*1024*1024)throw new Error('La evidencia supera los 10 MB.');
    // Names include a content digest, so a retry can recognize an upload whose response was lost.
    const digest=createHash('sha256').update(buffer).digest('hex').slice(0,20);
    if(!name.includes(digest))throw new Error('La referencia de la evidencia no coincide con su contenido.');
    const form=new FormData();form.append('file',new Blob([buffer],{type:mime}),name);
    const uploaded=await this.request(`/rest/api/2/issue/${issueKey}/attachments`,{method:'POST',form});
    if(!uploaded[0]?.id)throw new JiraRequestError('No se confirmó la carga del adjunto.',0,true);
    return {id:String(uploaded[0].id),name};
  }
}

export function registerQATools(server,z,client,baseUrl){
  const gateway=new JiraGateway({baseUrl,authorization:client.authHeader});
  const register=(name,description,schema,action)=>server.tool(name,description,schema,async args=>{
    try{return {content:[{type:'text',text:JSON.stringify({ok:true,data:await action(args)})}]};}
    catch(error){return {isError:true,content:[{type:'text',text:JSON.stringify({ok:false,error:error.message,status:error.status||0,uncertain:!!error.uncertain})}]};}
  });
  register('qaJiraMetadata','Read all create fields, current reporter and attachment limits for a QA project.',{projectKey:z.enum(['CF','GUV','DH'])},a=>gateway.metadata(a.projectKey));
  register('qaJiraChatRead','Read-only Jira queries for the in-app chat. GET requests only.',{name:z.enum(chatToolNames),args:z.record(z.unknown())},a=>readChatTool(gateway,a.name,a.args));
  register('qaJiraFindPublication','Find a defect by its exact QA publication reference. Read only.',{projectKey:z.enum(['CF','GUV','DH']),marker:z.string()},a=>gateway.find(a.projectKey,a.marker));
  register('qaJiraCreateDefect','Create one reviewed QA defect. Requires explicit publication from the QA application.',{fields:z.record(z.unknown())},a=>gateway.create(a.fields));
  register('qaJiraAttachEvidence','Upload a PNG/JPEG QA evidence, recognizing previous uploads on retry.',{issueKey:z.string(),name:z.string(),data:z.string()},a=>gateway.attach(a));
}
