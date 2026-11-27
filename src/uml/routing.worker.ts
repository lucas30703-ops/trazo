import type { UmlSchema } from '../model'
import { arrangeRelations } from './routing'
import { layoutUml } from './layout'
self.onmessage=async(event:MessageEvent<{schema:UmlSchema;ids?:string[];layout?:boolean}>)=>{
  try {const {schema,ids,layout}=event.data;const result=layout?await layoutUml(schema):arrangeRelations(schema,ids);self.postMessage({schema,...result})}
  catch(error){self.postMessage({error:(error as Error).message||'No se pudieron acomodar las relaciones.'})}
}
