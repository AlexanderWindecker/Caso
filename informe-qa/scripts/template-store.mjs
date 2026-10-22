import {mkdir,readFile,readdir,open,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {defaultTemplate,validateTemplate} from '../src/templates.js';
function view(catalog){return {...catalog,template:catalog.entries.find(e=>e.id===catalog.defaultId).template};}
export class TemplateStore{
  constructor(root){this.root=root;this.queue=Promise.resolve();}
  async get(){
    try{return view(JSON.parse(await readFile(join(this.root,'catalog.json'),'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;}
    let legacy=null,names=[];
    try{legacy=JSON.parse(await readFile(join(this.root,'current.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    try{names=await readdir(this.root);}catch(e){if(e.code!=='ENOENT')throw e;}
    const versions=[];
    for(const name of names.filter(n=>/^[a-f0-9-]{36}\.json$/i.test(n))){const data=JSON.parse(await readFile(join(this.root,name),'utf8'));validateTemplate(data.template);versions.push(data);}
    if(legacy){validateTemplate(legacy.template);versions.push(legacy);}
    versions.sort((a,b)=>(a.savedAt||'').localeCompare(b.savedAt||''));
    const recovered=new Map();for(const data of versions)recovered.set(data.template.name.trim().toLowerCase(),data);
    if(legacy)recovered.set(legacy.template.name.trim().toLowerCase(),legacy);
    const entries=[...recovered.values()].map(data=>({id:data.revision,template:data.template,updated:data.savedAt||''}));
    if(!entries.length)entries.push({id:'builtin',template:defaultTemplate(),updated:''});
    return view({entries,defaultId:legacy?.revision||entries[0].id,revision:legacy?.revision||null});
  }
  save(template,baseRevision){return this.change({action:'update',template,baseRevision});}
  change(data){
    const next=this.queue.catch(()=>{}).then(async()=>{
      const current=await this.get();
      if(current.revision!==(data.baseRevision||null)){const e=new Error('Las plantillas cambiaron en otra ventana. Volvé a abrir Mis plantillas antes de guardar.');e.status=409;throw e;}
      const catalog={entries:structuredClone(current.entries),defaultId:current.defaultId,revision:randomUUID()},now=new Date().toISOString();
      const id=data.id||catalog.defaultId,index=catalog.entries.findIndex(e=>e.id===id);
      if(!['create','update','delete','default'].includes(data.action))throw new Error('Acción de plantilla inválida.');
      if(data.action!=='create'&&index<0)throw new Error('La plantilla ya no está disponible.');
      if(['create','update'].includes(data.action)){
        validateTemplate(data.template);
        if(catalog.entries.some(e=>(data.action==='create'||e.id!==id)&&e.template.name.trim().toLowerCase()===data.template.name.trim().toLowerCase()))throw new Error('Ya existe una plantilla con ese nombre. Elegí otro nombre.');
        const entry={id:data.action==='create'?randomUUID():id,template:{...structuredClone(data.template),name:data.template.name.trim(),version:randomUUID()},updated:now};
        if(data.action==='create'){if(catalog.entries.length>=100)throw new Error('Máximo 100 plantillas guardadas.');catalog.entries.push(entry);}else catalog.entries[index]=entry;
        if(data.makeDefault)catalog.defaultId=entry.id;
      }else if(data.action==='default')catalog.defaultId=id;
      else {if(catalog.entries.length===1)throw new Error('Conservá al menos una plantilla.');catalog.entries.splice(index,1);if(catalog.defaultId===id)catalog.defaultId=catalog.entries[0].id;}
      await mkdir(this.root,{recursive:true});
      const temporary=join(this.root,'catalog-'+catalog.revision+'.pending');
      for(const path of [join(this.root,'library-'+catalog.revision+'.json'),temporary]){const file=await open(path,'wx');try{await file.writeFile(JSON.stringify(catalog));await file.sync();}finally{await file.close();}}
      await rename(temporary,join(this.root,'catalog.json'));return view(catalog);
    });this.queue=next;return next;
  }
}
export function templatesAPI(store){return async request=>{
  const u=new URL(request.url),json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(request.headers.get('origin')&&request.headers.get('origin')!==u.origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Origen no permitido.'},403);
  try{if(request.method==='GET')return json(await store.get());if(request.method==='POST'&&request.headers.get('origin')===u.origin&&request.headers.get('content-type')?.includes('application/json')){const data=await request.json();return json(data.action?await store.change(data):await store.save(data.template,data.baseRevision));}return json({error:'Solicitud no permitida.'},403);}catch(e){return json({error:e.message},e.status||400);}
};}
