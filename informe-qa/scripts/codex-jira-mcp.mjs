import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startJiraOnlyMcp} from './jira-only-mcp.mjs';

// Read VS Code's JSON-with-comments without executing it or logging credentials.
export function parseSettings(text){
  const withoutComments=text.replace(/"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,part=>part.startsWith('"')?part:' ');
  return JSON.parse(withoutComments.replace(/("(?:\\.|[^"\\])*")|,(\s*[}\]])/g,(match,string,closing)=>string??closing));
}

export function jiraEnvironment(settings,environment={}){
  const setting=key=>settings['atlassianPrivateMcp.'+key];
  const baseUrl=environment.JIRA_BASE_URL||setting('jiraBaseUrl');
  const authType=environment.JIRA_AUTH_TYPE||setting('jiraAuthType')||'pat';
  const pat=environment.JIRA_PAT||setting('jiraPat');
  if(typeof baseUrl!=='string'||!baseUrl.startsWith('https://'))throw new Error('Configurá Jira Base Url en los ajustes de usuario de Atlassian Private MCP en VS Code.');
  if(authType!=='pat')throw new Error('El acceso de Codex a Jira requiere autenticación pat.');
  if(typeof pat!=='string'||!pat.trim())throw new Error('Configurá Jira Pat en los ajustes de usuario de Atlassian Private MCP en VS Code. No pegues el token en el chat.');
  return {JIRA_BASE_URL:baseUrl,JIRA_AUTH_TYPE:'pat',JIRA_PAT:pat};
}

async function main(){
  const userDir=join(process.env.APPDATA||join(homedir(),'AppData','Roaming'),'Code','User');
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
  let settings={};
  for(const file of [join(userDir,'settings.json'),join(root,'.vscode','settings.json')]){
    let text;
    try{text=await readFile(file,'utf8');}catch(error){if(error.code==='ENOENT')continue;throw new Error('No se pudieron leer los ajustes de VS Code.');}
    try{settings={...settings,...parseSettings(text)};}catch{throw new Error('Los ajustes de VS Code no tienen un formato JSONC válido.');}
  }
  Object.assign(process.env,jiraEnvironment(settings,process.env));
  await startJiraOnlyMcp();
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{console.error('No se pudo iniciar Jira en Codex:',error.message);process.exitCode=1;});
}
