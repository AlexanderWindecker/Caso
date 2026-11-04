import http from 'node:http';
import worker from '../worker/index.js';
import {ReportStore,storageAPI} from './report-store.mjs';
import {fileURLToPath} from 'node:url';
import {downloadsAPI,MAX_DOWNLOAD_BYTES} from './downloads.mjs';
import {TemplateStore,templatesAPI} from './template-store.mjs';
import {JiraMcpClient} from './jira/mcp-client.mjs';
import {JiraPublications,jiraAPI} from './jira/publications.mjs';
const port=Number(process.env.PORT||4310);
const reportStore=new ReportStore(fileURLToPath(new URL('../data/',import.meta.url)));
const handleStorage=storageAPI(reportStore);
const jiraMcp=new JiraMcpClient();
const handleJira=jiraAPI(new JiraPublications({root:fileURLToPath(new URL('../data/jira-publications/',import.meta.url)),reports:reportStore,mcp:jiraMcp}));
const handleDownload=downloadsAPI(fileURLToPath(new URL('../data/exports/',import.meta.url)));
const handleTemplates=templatesAPI(new TemplateStore(fileURLToPath(new URL('../data/templates/',import.meta.url))));
const server=http.createServer(async(req,res)=>{
  try{
    if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)){res.writeHead(403);res.end('Host no permitido');return;}
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>(req.url==='/api/downloads'?MAX_DOWNLOAD_BYTES:26*1024*1024)){res.writeHead(413);res.end('Solicitud demasiado grande');return;}chunks.push(chunk);}
    const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
    const pathname=new URL(request.url).pathname;
    const response=pathname.startsWith('/api/jira/')?await handleJira(request):pathname==='/api/templates'?await handleTemplates(request):pathname.startsWith('/api/storage/')?await handleStorage(request):pathname==='/api/downloads'||pathname.startsWith('/api/downloads/')?await handleDownload(request):await worker.fetch(request,process.env,{});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
  }catch{res.writeHead(500);res.end('No se pudo procesar la solicitud.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Caso disponible en http://localhost:${port}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{jiraMcp.close();server.close(()=>process.exit(0));});
