import { importMysql } from './importMysql'
import { layoutUml } from './layout'
self.onmessage=async(event:MessageEvent<string>)=>{
  let stage:'sql'|'layout'='sql'
  try {const result=importMysql(event.data);stage='layout';const layout=await layoutUml(result.schema);if(layout.obstructed)result.warnings.push('La distribución conserva algunos recorridos junto a tablas. Revisá las relaciones y ajustá sus lados o recorridos.');self.postMessage({result})}
  catch(error) {
    const e=error as Error & {diags?: {message:string}[]}
    const detail=e?.diags?.map(d=>d.message).join('\n')||e?.message||'Error interno sin detalle.'
    self.postMessage({error:`${stage==='layout'?'No se pudo distribuir el UML':'No se pudo leer la estructura MySQL'}. ${detail}`})
  }
}
