export function setupSidebarResize(){
  const handle=document.querySelector('#sidebar-resizer'),sidebar=document.querySelector('.sidebar'),root=document.documentElement;
  const storageKey='caso-sidebar-width';let dragging=false;
  const maxWidth=()=>Math.max(210,Math.min(640,innerWidth-640));
  function width(){return Math.round(sidebar.getBoundingClientRect().width);}
  function updateAria(){handle.setAttribute('aria-valuenow',String(width()));handle.setAttribute('aria-valuemax',String(maxWidth()));}
  function apply(value,persist=false){const next=Math.round(Math.max(210,Math.min(maxWidth(),value)));root.style.setProperty('--sidebar-user-width',next+'px');updateAria();if(persist)try{localStorage.setItem(storageKey,String(next));}catch{}}
  try{const stored=Number(localStorage.getItem(storageKey));if(stored>=210&&innerWidth>900)apply(stored);}catch{}
  updateAria();
  handle.addEventListener('pointerdown',e=>{if(e.button!==0||innerWidth<=900)return;e.preventDefault();dragging=true;handle.setPointerCapture(e.pointerId);document.body.classList.add('sidebar-resizing');});
  handle.addEventListener('pointermove',e=>{if(dragging)apply(e.clientX);});
  function end(e){if(!dragging)return;dragging=false;if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);document.body.classList.remove('sidebar-resizing');apply(width(),true);}
  handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);
  handle.addEventListener('keydown',e=>{if(innerWidth<=900)return;let next;if(e.key==='ArrowRight')next=width()+16;else if(e.key==='ArrowLeft')next=width()-16;else if(e.key==='Home')next=210;else if(e.key==='End')next=maxWidth();else return;e.preventDefault();apply(next,true);});
  handle.addEventListener('dblclick',()=>{root.style.removeProperty('--sidebar-user-width');try{localStorage.removeItem(storageKey);}catch{}updateAria();});
  window.addEventListener('resize',()=>{if(innerWidth>900&&root.style.getPropertyValue('--sidebar-user-width'))apply(width());else updateAria();});
}
