// Keep answers as plain text; ticket cards provide the actual clickable links.
export function chatDisplayText(value){
  return String(value??'')
    .replace(/\[([^\]\n]+)\]\(https?:\/\/[^\s)]+\)/gi,'$1')
    .replace(/https?:\/\/[^\s<>]+/gi,url=>(url.match(/\/browse\/([A-Z][A-Z0-9_]*-\d+)/i)?.[1]||'(enlace)')+(url.match(/[.,;:!?]+$/)?.[0]||''))
    .replace(/\\([*`\[\]])/g,'$1')
    .replace(/\*\*([^*]+)\*\*/g,'$1')
    .replace(/`([^`]+)`/g,'$1');
}
