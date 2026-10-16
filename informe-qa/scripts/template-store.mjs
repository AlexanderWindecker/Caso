import {mkdir,readFile,open,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {defaultTemplate,validateTemplate} from '../src/templates.js';
export class TemplateStore{
  constructor(root){this.root=root;this.queue=Promise.resolve();}
  async get(){try{return JSON.parse(await readFile(join(this.root,'current.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return {template:defaultTemplate(),revision:null};throw e;}}
  async save(template,baseRevision){
    const next=this.queue.catch(()=>{}).then(async()=>{
      validateTemplate(template);const current=await this.get();
      if(current.revision!==(baseRevision||null)){const e=new Error('La plantilla cambió en otra ventana. Cerrá y volvé a abrir el editor antes de guardar.');e.status=409;throw e;}
      const revision=randomUUID(),data={revision,template:{...structuredClone(template),version:revision},savedAt:new Date().toISOString()};
      await mkdir(this.root,{recursive:true});
      const snapshot=join(this.root,revision+'.json'),temporary=join(this.root,'current-'+revision+'.pending');
      for(const path of [snapshot,temporary]){const file=await open(path,'wx');try{await file.writeFile(JSON.stringify(data));await file.sync();}finally{await file.close();}}
      await rename(temporary,join(this.root,'current.json'));return data;
    });
    this.queue=next;return next;
  }
}
export function templatesAPI(store){return async request=>{const u=new URL(request.url),json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});if(request.headers.get('origin')&&request.headers.get('origin')!==u.origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Origen no permitido.'},403);try{if(request.method==='GET')return json(await store.get());if(request.method==='POST'&&request.headers.get('origin')===u.origin&&request.headers.get('content-type')?.includes('application/json')){const data=await request.json();return json(await store.save(data.template,data.baseRevision));}return json({error:'Solicitud no permitida.'},403);}catch(e){return json({error:e.message},e.status||400);}};}
