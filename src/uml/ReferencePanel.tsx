import { useRef, useState, useSyncExternalStore } from 'react'
import { ImagePlus, Eye, Trash2 } from 'lucide-react'
import type { EditorStore } from '../store'
import { Modal } from '../Dialogs'
import { readUmlReference } from './reference'
export default function ReferencePanel({store}:{store:EditorStore}) {
  const {project}=useSyncExternalStore(store.subscribe,store.getSnapshot),reference=project.umlReference
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[zoom,setZoom]=useState(1),input=useRef<HTMLInputElement>(null)
  const generation=useRef(0)
  return <section className="uml-reference-panel"><h3>Referencia UML</h3>
    <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp,.dfd.json,.json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;const projectId=store.getSnapshot().project.id,token=++generation.current;setBusy(true);setError('');try{const ref=await readUmlReference(file);if(store.getSnapshot().project.id!==projectId||token!==generation.current)return;store.command(p=>{p.umlReference=ref})}catch(e){if(token===generation.current)setError((e as Error).message)}finally{if(token===generation.current)setBusy(false)}}}/>
    {reference&&<p title={reference.name}>{reference.name}</p>}
    <div className="uml-reference-actions">{reference&&<button className="secondary-button" onClick={()=>{setZoom(1);setOpen(true)}}><Eye size={13}/>Ver</button>}<button className="secondary-button" disabled={busy} onClick={()=>input.current?.click()}><ImagePlus size={13}/>{busy?'Cargando…':reference?'Reemplazar':'Cargar referencia'}</button>{reference&&<button className="icon-button" disabled={busy} aria-label="Quitar referencia UML" onClick={()=>{generation.current++;store.command(p=>{delete p.umlReference});setOpen(false)}}><Trash2 size={14}/></button>}</div>
    <p className="field-help">{reference?'Nivel 1: Tab · Todos los niveles: Mayús+Tab':'Imagen o proyecto UML. Tab permite consultarlo en nivel 1.'}</p>
    {error&&<p className="error-message" role="alert">{error}</p>}
    {open&&reference&&<Modal title="Referencia UML" subtitle={reference.name+' · Solo lectura'} wide onClose={()=>setOpen(false)}><div className="uml-reference-zoom"><button className="secondary-button" onClick={()=>setZoom(z=>Math.max(.25,z/1.25))}>−</button><button className="secondary-button" onClick={()=>setZoom(1)}>Ajustar</button><button className="secondary-button" onClick={()=>setZoom(z=>Math.min(5,z*1.25))}>+</button></div><div className="uml-reference-viewer"><img src={reference.data} alt={reference.name} style={{width:`${zoom*100}%`,maxWidth:'none'}}/></div></Modal>}
  </section>
}
