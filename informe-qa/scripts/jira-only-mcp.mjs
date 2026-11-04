import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import Module from 'node:module';
import {registerQATools} from './jira/mcp-tools.mjs';

// Adapt the installed 0.2.0 bundle in memory; never modify the extension or its credentials.
export function jiraOnlyBundle(source){
  let adapted=source.replace(/\r\n/g,'\n');
  const replaceOnce=(before,after)=>{
    if(adapted.split(before).length!==2)throw new Error('La extensión cambió: revisar el adaptador Jira antes de iniciarlo.');
    adapted=adapted.replace(before,after);
  };
  const start=adapted.indexOf('function loadConfig() {');
  const end=adapted.indexOf('\n// ../../node_modules/',start);
  if(start<0||end<0)throw new Error('No se encontró la configuración esperada de la extensión.');
  replaceOnce(adapted.slice(start,end),`function loadConfig() {
  return {jira: {
    baseUrl: validateBaseUrl(getEnvOrThrow("JIRA_BASE_URL"), "JIRA_BASE_URL"),
    auth: loadAuthConfig("JIRA"),
    maxResults: parseInt(getEnvOrDefault("JIRA_MAX_RESULTS", "50"), 10),
    requestTimeoutMs: parseInt(getEnvOrDefault("JIRA_REQUEST_TIMEOUT_MS", "30000"), 10)
  }};
}
`);
  replaceOnce('  const confluenceClient = new ConfluenceClient(config2.confluence);\n','');
  replaceOnce('  const confluenceBaseUrl = config2.confluence.baseUrl;','  const confluenceBaseUrl = "No configurado";');
  const confluenceStart=adapted.indexOf('  server.tool(\n    "getConfluencePage",');
  const confluenceEnd=adapted.indexOf('  server.tool(\n    "atlassianUserInfo",',confluenceStart);
  if(confluenceStart<0||confluenceEnd<0)throw new Error('No se encontraron las herramientas de Confluence esperadas.');
  replaceOnce(adapted.slice(confluenceStart,confluenceEnd),'');
  // The generic fetch assumes both clients exist. Keep the dedicated Jira tools only.
  const fetchStart=adapted.indexOf('  server.tool(\n    "fetch",');
  const fetchEnd=adapted.indexOf('  return server;',fetchStart);
  if(fetchStart<0||fetchEnd<0)throw new Error('No se encontró la herramienta fetch esperada.');
  replaceOnce(adapted.slice(fetchStart,fetchEnd),'');
  return adapted;
}

export async function startJiraOnlyMcp(extensionDir=join(homedir(),'.vscode','extensions','bhayanak.atlassian-vscode-extension-0.2.0')){
  const metadata=JSON.parse(await readFile(join(extensionDir,'package.json'),'utf8'));
  if(metadata.name!=='atlassian-vscode-extension'||metadata.publisher!=='bhayanak'||metadata.version!=='0.2.0')throw new Error('Este adaptador requiere Atlassian Private MCP Server 0.2.0 de bhayanak.');
  const bundlePath=join(extensionDir,'dist','server','index.js');
  const adapted=jiraOnlyBundle(await readFile(bundlePath,'utf8'));
  const serverModule=new Module(bundlePath);
  serverModule.filename=bundlePath;
  serverModule.paths=Module._nodeModulePaths(dirname(bundlePath));
  serverModule.qaRegister=registerQATools;
  serverModule._compile(adapted.replace('  return server;','  module.qaRegister(server, external_exports, jiraClient, jiraBaseUrl);\n  return server;'),bundlePath);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  startJiraOnlyMcp(process.argv[2]).catch(error=>{console.error('No se pudo iniciar el MCP Jira:',error.message);process.exitCode=1;});
}
