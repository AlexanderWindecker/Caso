import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
export const MAX_DOWNLOAD_BYTES=256*1024*1024;
const docxType='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export function downloadsAPI(root){return async request=>{
  const url=new URL(request.url);
  if(request.headers.get('origin')&&request.headers.get('origin')!==url.origin||request.headers.get('sec-fetch-site')==='cross-site')return json({error:'Origen no permitido.'},403);
  try{
    if(request.method==='POST'&&url.pathname==='/api/downloads'){
      if(request.headers.get('origin')!==url.origin)return json({error:'La descarga debe generarse desde la aplicación local.'},403);
      let filename;try{filename=decodeURIComponent(request.headers.get('x-download-filename')||'');}catch{return json({error:'Nombre de archivo inválido.'},400);}
      filename=filename.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'-').trim().replace(/[. ]+$/,'');
      if(filename.length>180){const ext=filename.match(/\.(docx|json|zip)$/i)?.[0]||'.json';filename=filename.slice(0,170)+ext;}
      if(!filename||!(/\.(docx|json|zip)$/i.test(filename)))return json({error:'Formato de archivo no permitido.'},400);
      const archive=filename.toLowerCase().endsWith('.zip');const data=Buffer.from(await request.arrayBuffer());if(!data.length||data.length>(archive?MAX_DOWNLOAD_BYTES:26*1024*1024))return json({error:'El archivo está vacío o supera el tamaño permitido.'},413);
      const word=filename.toLowerCase().endsWith('.docx');if((word||archive)&&(data[0]!==0x50||data[1]!==0x4b||data[2]!==3||data[3]!==4))return json({error:'El documento o ZIP generado no es válido.'},400);
      if(!word&&!archive){try{JSON.parse(data.toString('utf8'));}catch{return json({error:'El respaldo generado no es válido.'},400);}}
      const id=randomUUID(),directory=join(root,id);await mkdir(directory,{recursive:true});await writeFile(join(directory,'document'),data,{flag:'wx'});await writeFile(join(directory,'metadata.json'),JSON.stringify({filename,type:word?docxType:archive?'application/zip':'application/json',size:data.length}),{flag:'wx'});
      return json({url:'/api/downloads/'+id+'/'+encodeURIComponent(filename),filename});
    }
    const match=url.pathname.match(/^\/api\/downloads\/([a-f0-9-]{36})\/([^/]+)$/i);
    if(!match||!['GET','HEAD'].includes(request.method))return json({error:'Descarga no encontrada.'},404);
    const dir=join(root,match[1]),meta=JSON.parse(await readFile(join(dir,'metadata.json'),'utf8'));if(decodeURIComponent(match[2])!==meta.filename)return json({error:'Descarga no encontrada.'},404);
    const fallback=meta.filename.replace(/[^\x20-\x7e]/g,'_').replace(/["\\]/g,'-'),encoded=encodeURIComponent(meta.filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
    return new Response(request.method==='HEAD'?null:await readFile(join(dir,'document')),{headers:{'Content-Type':meta.type,'Content-Length':String(meta.size),'Content-Disposition':`attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){return json({error:error.code==='ENOENT'?'La descarga no está disponible. Volvé a generar el archivo.':'No se pudo preparar la descarga.'},error.code==='ENOENT'?404:500);}
};}
