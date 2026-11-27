import { parseProject, type UmlReference } from '../model'
async function encoded(blob:Blob) {return await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('No se pudo leer la imagen.'));reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(blob)})}
export async function readUmlReference(file:File):Promise<UmlReference> {
  if(file.size>8_000_000) throw new Error('La referencia supera 8 MB. Usá una imagen más pequeña.')
  if(file.name.toLowerCase().endsWith('.json')) {
    const {umlBlob,renderUmlSvg}=await import('./export')
    const p=parseProject(JSON.parse(await file.text()))
    if(p.mode!=='uml'||!p.uml) throw new Error('Elegí un proyecto UML de base de datos o una imagen PNG, JPEG o WebP. Los archivos SQL se importan desde el modo UML.')
    const art=renderUmlSvg(p.uml),blob=await umlBlob(p.uml,'png')
    if(blob.size>8_000_000) throw new Error('El UML genera una imagen de más de 8 MB. Reducí el esquema para usarlo de referencia.')
    return {name:file.name,mime:'image/png',data:await encoded(blob),width:art.width,height:art.height}
  }
  const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer()),ascii=(a:number,b:number)=>String.fromCharCode(...bytes.slice(a,b))
  const mime=bytes[0]===137&&ascii(1,4)==='PNG'?'image/png':bytes[0]===255&&bytes[1]===216&&bytes[2]===255?'image/jpeg':ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'?'image/webp':null
  if(!mime) throw new Error('Formato no admitido. Cargá PNG, JPEG, WebP o un proyecto UML .dfd.json.')
  const blob=new Blob([await file.arrayBuffer()],{type:mime}),bitmap=await createImageBitmap(blob)
  try {if(bitmap.width>16384||bitmap.height>16384||bitmap.width*bitmap.height>64_000_000)throw new Error('La imagen es demasiado grande: máximo 16384 px por lado y 64 millones de píxeles.');return {name:file.name,mime,data:await encoded(blob),width:bitmap.width,height:bitmap.height}}finally{bitmap.close()}
}
