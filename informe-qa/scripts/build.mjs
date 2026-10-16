import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
const html=await readFile('src/index.html','utf8'),css=await readFile('src/style.css','utf8');
const client=await build({entryPoints:['src/app.js'],bundle:true,write:false,minify:true,platform:'browser',format:'iife',target:'es2022'});
const page=html.replace('/*APP_CSS*/',()=>css).replace('/*APP_JS*/',()=>client.outputFiles[0].text.replace(/<\/script/gi,'<\\/script'));
const handler=await build({entryPoints:['src/server.js'],bundle:true,write:false,minify:true,platform:'browser',format:'esm',target:'es2022'});
await mkdir('worker',{recursive:true});await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
const worker=handler.outputFiles[0].text+`\nconst page=${JSON.stringify(page)};\nexport default { async fetch(request,env={}) {const u=new URL(request.url);if(u.pathname.startsWith('/api/'))return api(request,env);if(u.pathname!=='/')return new Response('No encontrado',{status:404});if(!['GET','HEAD'].includes(request.method))return new Response('Método no permitido',{status:405});return new Response(request.method==='HEAD'?null:page,{headers:{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-cache'}});}};`;
// esbuild exports the minified api function under a stable alias; import the bundle through its export.
const apiExport=worker.match(/export\{(\w+) as api\}/)?.[1]||'api';
await writeFile('worker/index.js',worker.replace('return api(request,env)','return '+apiExport+'(request,env)'));
await copyFile('worker/index.js','dist/server/index.js');await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Aplicación compilada en dist/server/index.js');
