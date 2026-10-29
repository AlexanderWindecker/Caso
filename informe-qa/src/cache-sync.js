// Compare JSON content without copying images or depending on property order.
// Disk revisions are metadata; a browser cache can have the previous revision
// while already containing exactly the data saved to disk.
function equal(left,right,root=false){
  if(left===right)return true;
  if(!left||!right||typeof left!=='object'||typeof right!=='object')return false;
  if(Array.isArray(left)!==Array.isArray(right))return false;
  const keys=value=>Object.keys(value).filter(key=>!root||key!=='_diskRevision');
  const a=keys(left),b=keys(right);
  if(a.length!==b.length)return false;
  return a.every(key=>Object.hasOwn(right,key)&&equal(left[key],right[key]));
}

export async function syncCachedReports(cached,disk,importOne){
  let current=disk;
  for(const report of cached){
    const saved=current.find(entry=>entry.uid===report.uid);
    if(saved&&equal(report,saved,true))continue;
    // Import one report per request, preserving the existing recovery rules.
    // Several valid reports together can exceed the HTTP request size limit.
    current=await importOne(report);
  }
  return current;
}
