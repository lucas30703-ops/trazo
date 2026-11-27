import { useEffect, useRef, useState } from 'react'
import { Modal } from '../Dialogs'
import type { Project, UmlSchema } from '../model'
import { createDiagram, parseProject, uid } from '../model'
export default function ImportDialog({onImport,onClose}:{onImport:(project:Project,warnings:string[])=>Promise<void>;onClose:()=>void}) {
  const [sql,setSql]=useState(''),[name,setName]=useState('Base de datos'),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const worker=useRef<Worker|null>(null)
  useEffect(()=>()=>{worker.current?.terminate()},[])
  const generate=()=>{
    setError('');setBusy(true);const w=new Worker(new URL('./import.worker.ts',import.meta.url),{type:'module'});worker.current=w
    w.onerror=()=>{setError('No se pudo iniciar el importador. Reintentá la importación.');setBusy(false);w.terminate()}
    w.onmessage=async(e:MessageEvent<{error?:string;result?:{schema:UmlSchema;warnings:string[]}}>)=>{
      w.terminate();worker.current=null
      try {if(e.data.error) throw new Error(e.data.error);const result=e.data.result!;const diagram=createDiagram(name);diagram.name=name;diagram.heading={mode:'hidden'};delete diagram.rootLevel
        const p=parseProject({format:'trazo-dfd',version:3,mode:'uml',id:uid(),name:name.trim()||'Base de datos',updatedAt:new Date().toISOString(),activeDiagramId:diagram.id,diagrams:[diagram],uml:result.schema})
        await onImport(p,result.warnings)
      }catch(e){setError((e as Error).message)}finally{setBusy(false)}
    }
    w.postMessage(sql)
  }
  return <Modal title="Importar estructura MySQL" subtitle="Se creará un proyecto UML nuevo." onClose={()=>{worker.current?.terminate();onClose()}} wide>
    <div className="uml-import-form"><label>Nombre del proyecto<input value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></label>
    <label className="secondary-button uml-file-label">Cargar archivo .sql<input type="file" accept=".sql,text/plain,application/sql" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>2_000_000)throw new Error('El archivo supera 2 MB. Exportá solo estructura.');setSql(await file.text());setName(file.name.replace(/\.sql$/i,''));setError('')}catch(e){setError((e as Error).message)}}}/></label>
    <label>SQL de MySQL<textarea autoFocus rows={12} spellCheck={false} placeholder="Pegá aquí tus CREATE TABLE y las claves de la base…" value={sql} onChange={e=>setSql(e.target.value)} disabled={busy}/></label>
    <p className="field-help">Incluí CREATE TABLE y FOREIGN KEY … REFERENCES. Los tipos y tamaños no se muestran. El SQL se interpreta en esta PC; no se ejecuta.</p>
    <details><summary>SQL admitido y límites</summary><p className="field-help">Claves PRIMARY, UNIQUE y FOREIGN KEY, simples o compuestas, dentro de CREATE TABLE. ALTER TABLE ADD admite PRIMARY KEY y FOREIGN KEY; las UNIQUE deben estar en CREATE TABLE. Se conservan las tablas puente. Sin claves foráneas no se inventan conexiones. No se admiten índices por prefijo/expresión, expresiones anidadas, vistas, rutinas, migraciones de columnas ni comentarios ejecutables /*! … */. Recomendamos exportar solo estructura, sin registros. Máximo: 2 MB, 200 tablas, 500 columnas por tabla y 1000 relaciones.</p></details>
    {error&&<p className="error-message" role="alert">{error}</p>}</div>
    <footer className="modal-footer"><button className="secondary-button" onClick={()=>{worker.current?.terminate();onClose()}}>Cancelar</button><button className="primary-button" disabled={busy||!sql.trim()} onClick={generate}>{busy?'Generando…':'Generar diagrama'}</button></footer>
  </Modal>
}
