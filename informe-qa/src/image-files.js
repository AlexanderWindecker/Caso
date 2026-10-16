export async function processImage(file){
  if(!['image/png','image/jpeg'].includes(file.type))throw new Error(`${file.name}: usá PNG o JPG.`);
  if(file.size>10*1024*1024)throw new Error(`${file.name}: supera los 10 MB.`);
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('No se pudo leer la imagen.'));reader.readAsDataURL(file);});
  const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('La imagen no es válida.'));img.src=data;});
  let normalized=data;
  if(Math.max(image.naturalWidth,image.naturalHeight)>2400){const scale=2400/Math.max(image.naturalWidth,image.naturalHeight),canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);normalized=canvas.toDataURL(file.type,.9);}
  return {uid:crypto.randomUUID(),name:file.name||'Captura.png',caption:'',data:normalized};
}
