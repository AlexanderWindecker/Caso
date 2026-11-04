import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {jiraOnlyBundle} from '../scripts/jira-only-mcp.mjs';
import {parseSettings,jiraEnvironment} from '../scripts/codex-jira-mcp.mjs';

test('Codex lee JSONC de VS Code sin confundir comentarios con URLs o tokens',()=>{
  const settings=parseSettings(`{
    // Configuración local
    "atlassianPrivateMcp.jiraBaseUrl": "https://jira.example.test",
    "atlassianPrivateMcp.jiraPat": "offline/*not-a-comment*/,}token//",
    /* comentario */ "other": [1,2,],
  }`);
  const env=jiraEnvironment(settings);
  assert.equal(env.JIRA_BASE_URL,'https://jira.example.test');
  assert.equal(env.JIRA_AUTH_TYPE,'pat');
  assert.equal(env.JIRA_PAT,'offline/*not-a-comment*/,}token//');
  assert.equal(jiraEnvironment(settings,{JIRA_PAT:'override'}).JIRA_PAT,'override');
  assert.throws(()=>jiraEnvironment({...settings,'atlassianPrivateMcp.jiraPat':''}),/Jira Pat/);
  assert.throws(()=>jiraEnvironment({...settings,'atlassianPrivateMcp.jiraAuthType':'basic'}),/autenticación pat/);
});

test('Adaptador rechaza versiones con una estructura distinta',()=>{
  assert.throws(()=>jiraOnlyBundle('function main() {}'),/configuración esperada/);
});

test('MCP instalado inicia solo con Jira y publica sus herramientas sin exigir Confluence',async t=>{
  const bundlePath=join(homedir(),'.vscode/extensions/bhayanak.atlassian-vscode-extension-0.2.0/dist/server/index.js');
  let original;
  try{original=await readFile(bundlePath,'utf8');}catch(error){if(error.code==='ENOENT'){t.skip('La extensión opcional no está instalada en este equipo.');return;}throw error;}
  const adapted=jiraOnlyBundle(original),mainStart=adapted.indexOf('\nmain().catch(');
  assert.ok(mainStart>0);
  const compiled=adapted.slice(0,mainStart)+'\nmodule.exports = {loadConfig, createServer};';
  const module={exports:{}},env={JIRA_BASE_URL:'https://jira.example.test',JIRA_AUTH_TYPE:'pat',JIRA_PAT:'offline-test-token'};
  runInNewContext(compiled,{module,exports:module.exports,require:createRequire(bundlePath),process:{env},console,URL,Buffer,AbortSignal,TextDecoder,TextEncoder,setTimeout,clearTimeout,fetch:()=>{throw new Error('La verificación no debe acceder a la red.');}});
  const {loadConfig,createServer}=module.exports;
  const config=loadConfig();assert.equal(config.jira.baseUrl,env.JIRA_BASE_URL);assert.equal(config.confluence,undefined);
  const server=createServer(config),names=Object.keys(server._registeredTools);
  for(const expected of ['createJiraIssue','getJiraIssue','getVisibleJiraProjects','getJiraIssueTypeMetaWithFields','atlassianUserInfo'])assert.ok(names.includes(expected),expected);
  assert.ok(!names.some(name=>/confluence/i.test(name)));assert.ok(!names.includes('fetch'));
  assert.equal(names.length,16);
  delete env.JIRA_PAT;assert.throws(()=>loadConfig(),/JIRA_PAT/);
  await server.close();
});
