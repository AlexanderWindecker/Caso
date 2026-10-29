export function bindCaseSorting(root,onMove){
  root._caseSortCleanup?.();
  let dragged=null,lastX=0,lastY=0,scrollFrame=0;
  const cards=()=>[...root.querySelectorAll('[data-case]')];
  const clearMarkers=()=>cards().forEach(c=>c.classList.remove('case-drop-before','case-drop-after'));
  const stop=()=>{dragged=null;cancelAnimationFrame(scrollFrame);scrollFrame=0;clearMarkers();cards().forEach(c=>c.classList.remove('case-dragging'));};
  function mark(target,y){clearMarkers();const card=target?.closest?.('[data-case]');if(!card||!root.contains(card)||card.dataset.case===dragged)return null;const rect=card.getBoundingClientRect(),position=y<rect.top+rect.height/2?'before':'after';card.classList.add('case-drop-'+position);return {uid:card.dataset.case,position};}
  function autoScroll(){
    if(!dragged)return;
    const rect=root.getBoundingClientRect(),zone=38;
    if(lastX>=rect.left&&lastX<=rect.right&&lastY>=rect.top-zone&&lastY<=rect.bottom+zone){
      const delta=lastY<rect.top+zone?-9:lastY>rect.bottom-zone?9:0;
      if(delta){root.scrollTop+=delta;const target=document.elementFromPoint(lastX,lastY);mark(target,lastY);}
    }
    scrollFrame=requestAnimationFrame(autoScroll);
  }
  root.querySelectorAll('[data-case-handle]').forEach(handle=>{
    handle.onclick=e=>e.stopPropagation();
    handle.ondragstart=e=>{dragged=handle.dataset.caseHandle;lastX=e.clientX;lastY=e.clientY;e.dataTransfer.setData('text/plain',dragged);e.dataTransfer.effectAllowed='move';handle.closest('[data-case]').classList.add('case-dragging');scrollFrame=requestAnimationFrame(autoScroll);};
    handle.ondragend=stop;
    handle.onkeydown=e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const list=cards(),index=list.findIndex(c=>c.dataset.case===handle.dataset.caseHandle),target=list[index+(e.key==='ArrowUp'?-1:1)];if(target){const uid=handle.dataset.caseHandle;onMove(uid,target.dataset.case,e.key==='ArrowUp'?'before':'after');root.querySelector(`[data-case-handle="${uid}"]`)?.focus({preventScroll:true});}};
  });
  root.ondragover=e=>{if(!dragged)return;e.preventDefault();lastX=e.clientX;lastY=e.clientY;e.dataTransfer.dropEffect='move';mark(e.target,e.clientY);};
  root.ondragleave=e=>{if(!root.contains(e.relatedTarget))clearMarkers();};
  root.ondrop=e=>{if(!dragged)return;e.preventDefault();e.stopPropagation();let target=mark(e.target,e.clientY);if(!target){const list=cards(),rect=list.at(-1)?.getBoundingClientRect();if(rect&&e.clientY>=rect.bottom)target={uid:list.at(-1).dataset.case,position:'after'};}const uid=dragged;stop();if(target)onMove(uid,target.uid,target.position);};
  root._caseSortCleanup=()=>{stop();root.ondragover=root.ondragleave=root.ondrop=null;};
}
