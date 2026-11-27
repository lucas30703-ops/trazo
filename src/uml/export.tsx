import { renderToStaticMarkup } from 'react-dom/server'
import type { UmlSchema } from '../model'
import UmlArt from './UmlArt'
import { umlBounds } from './geometry'
export function renderUmlSvg(schema:UmlSchema) {
  const b=umlBounds(schema),width=Math.ceil(b.width),height=Math.ceil(b.height)
  return {svg:renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`${b.x} ${b.y} ${width} ${height}`}><rect x={b.x} y={b.y} width={width} height={height} fill="#fafaf8"/><UmlArt schema={schema}/></svg>),width,height}
}
export async function umlBlob(schema:UmlSchema,format:'svg'|'png'|'jpg'='svg') {
  const art=renderUmlSvg(schema)
  if(format==='svg') return new Blob([art.svg],{type:'image/svg+xml'})
  if(art.width>16384||art.height>16384||art.width*art.height>64_000_000) throw new Error('El UML es demasiado grande para una imagen. Exportalo como SVG o importá un esquema más pequeño para usarlo como referencia.')
  const url=URL.createObjectURL(new Blob([art.svg],{type:'image/svg+xml'}))
  try {const image=new Image();image.src=url;await image.decode();const canvas=document.createElement('canvas');canvas.width=art.width;canvas.height=art.height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('No se pudo preparar la imagen.');ctx.drawImage(image,0,0);return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('No se pudo exportar.')),format==='png'?'image/png':'image/jpeg',.95))}finally{URL.revokeObjectURL(url)}
}
