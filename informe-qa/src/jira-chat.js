// Conversation stays in this tab's memory. Ticket content is rendered as text.
export function setupJiraChat(){
  const panel=document.createElement('section');panel.className='jira-chat';panel.hidden=true;panel.setAttribute('aria-label','Chat Jira');
  panel.innerHTML=`<div class="chat-heading"><div><h2>Chat Jira</h2><p>Consultá tus tickets · Solo lectura</p></div><div class="chat-window-actions"><button type="button" class="button secondary" data-expand aria-label="Ampliar chat" aria-pressed="false">Ampliar</button><button type="button" class="button secondary" data-close>Cerrar</button></div></div><div class="chat-toolbar"><span data-status role="status">Comprobá la conexión para empezar.</span><button type="button" class="text-button" data-check>Comprobar conexión</button><button type="button" class="text-button" data-reset>Nueva conversación</button></div><div class="chat-messages" role="log" aria-label="Conversación" aria-live="polite"></div><details class="chat-suggestions" open><summary>Consultas sugeridas</summary><div><button type="button">Mostrame los tickets que tengo asignados</button><button type="button">Mostrame mis defectos en estado Resolved o Resuelta</button><button type="button">¿Qué tickets me asignaron hoy?</button></div></details><form class="chat-form"><label for="jira-chat-input">Tu consulta sobre Jira</label><textarea id="jira-chat-input" rows="2" maxlength="6000" placeholder="Ej.: ¿Qué tengo pendiente de probar?"></textarea><div><details class="chat-info"><summary>Solo consulta · Acerca del chat</summary><p>Solo consulta: no crea ni modifica tickets, estados, asignaciones, comentarios o adjuntos. Las consultas se procesan con tu sesión de Codex. La conversación se conserva mientras esta pestaña siga abierta.</p></details><button type="submit" class="button primary">Enviar</button></div></form>`;
  document.body.append(panel);
  const find=s=>panel.querySelector(s),log=find('.chat-messages'),input=find('textarea'),status=find('[data-status]');
  let sessionId,busy=false,checked=false;
  async function api(action,data={}){const response=await fetch('/api/chat/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});let value;try{value=await response.json();}catch{throw new Error('El chat necesita el servicio local actualizado. Reiniciá la aplicación.');}if(!response.ok)throw new Error(value.error||'No se pudo consultar Jira.');return value;}
  function append(role,text){const article=document.createElement('article');article.className='chat-message '+role;const label=document.createElement('strong');label.textContent=role==='user'?'Vos':role==='error'?'No se pudo completar':'Asistente Jira';const content=document.createElement('div');content.className='chat-text';content.textContent=text;article.append(label,content);log.append(article);article.scrollIntoView({block:'nearest'});return article;}
  function setBusy(value){busy=value;panel.setAttribute('aria-busy',String(value));for(const button of panel.querySelectorAll('button:not([data-close])'))button.disabled=value;input.disabled=value;}
  async function check(){setBusy(true);status.textContent='Comprobando Codex…';try{const s=await api('status');checked=s.connected;status.textContent=s.connected?'Codex conectado · '+(s.plan||'Cuenta ChatGPT'):'Iniciá sesión con tu cuenta de Tsoft en Codex y volvé a comprobar.';}catch(e){checked=false;status.textContent=e.message;}finally{setBusy(false);}}
  async function send(){
    const message=input.value.trim();if(!message||busy)return;
    if(!checked){await check();if(!checked)return;}
    find('.chat-suggestions').open=false;append('user',message);input.value='';resizeInput();setBusy(true);status.textContent='Consultando Jira…';
    try{
      const result=await api('message',{sessionId,message});sessionId=result.sessionId;const article=append('assistant',result.answer);
      if(result.issues?.length){const list=document.createElement('ul');list.className='chat-tickets';for(const issue of result.issues){
        const li=document.createElement('li'),link=document.createElement('a');
        try{const url=new URL(issue.url);if(url.protocol!=='https:')continue;link.href=url.href;}catch{continue;}
        link.target='_blank';link.rel='noopener noreferrer';link.textContent=issue.key+' · '+issue.summary;
        const detail=document.createElement('small');detail.textContent=[issue.status,issue.type,issue.assignee].filter(Boolean).join(' · ');li.append(link,detail);list.append(li);
      }article.append(list);}
      if(result.queries?.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Consultas realizadas';details.append(summary);for(const q of result.queries){const p=document.createElement('p');p.textContent=`${q.shown} de ${q.total} resultados · desde ${q.startAt}\n${q.jql}`;details.append(p);}article.append(details);}
      status.textContent='Consulta finalizada · '+new Date(result.queriedAt).toLocaleTimeString('es-AR');
    }catch(e){append('error',e.message+' Podés iniciar una nueva conversación y reintentar.');sessionId=undefined;status.textContent='Consulta interrumpida.';}
    finally{setBusy(false);input.focus({preventScroll:true});const last=log.lastElementChild;if(last)log.scrollTop+=last.getBoundingClientRect().top-log.getBoundingClientRect().top-12;}
  }
  function resizeInput(){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,Math.max(52,Math.min(120,window.innerHeight*.16)))+'px';}
  input.addEventListener('input',resizeInput);
  find('[data-expand]').onclick=()=>{const expanded=panel.classList.toggle('expanded');const button=find('[data-expand]');button.textContent=expanded?'Restaurar':'Ampliar';button.setAttribute('aria-label',expanded?'Restaurar tamaño del chat':'Ampliar chat');button.setAttribute('aria-pressed',String(expanded));};
  find('form').onsubmit=e=>{e.preventDefault();send();};
  input.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();send();}};
  find('[data-check]').onclick=check;
  find('[data-reset]').onclick=async()=>{if(busy)return;setBusy(true);try{await api('reset',{sessionId});sessionId=undefined;log.replaceChildren();status.textContent='Nueva conversación lista.';}catch(e){status.textContent=e.message;}finally{setBusy(false);}};
  for(const button of panel.querySelectorAll('.chat-suggestions button'))button.onclick=()=>{input.value=button.textContent;send();};
  const nav=document.querySelector('#jira-chat-nav');
  const close=()=>{panel.hidden=true;nav.setAttribute('aria-expanded','false');nav.focus();};
  find('[data-close]').onclick=close;
  panel.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  nav.setAttribute('aria-expanded','false');nav.onclick=()=>{panel.hidden=!panel.hidden;nav.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){if(!checked&&!busy)check();input.focus();}};
}
