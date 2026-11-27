import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
import { Download, FolderOpen, LayoutGrid, Maximize, Plus, Redo2, Save, Undo2, Upload, Database } from 'lucide-react'
import Brand from '../Brand'
import { EditorStore } from '../store'
import { AutosaveQueue, recoveryJournal, type SaveState } from '../autosave'
import { diskStorage } from '../diskStorage'
import { downloadBlob, downloadProject, getStartupMessage, loadLastProject, saveLocalProject, saveRevision, saveProjectFile, safeFilename } from '../persistence'
import { ProjectsDialog } from '../Dialogs'
import { HistoryDialog } from '../ProjectDialogs'
import { isEditingTarget } from '../keyboard'
import { parseProject, clone, type Project, type UmlRelation, type UmlSchema, type Point } from '../model'
import ImportDialog from './ImportDialog'
import UmlArt from './UmlArt'
import { relationVisual, umlBounds, umlDiagram } from './geometry'
import { umlBlob } from './export'
import RelationControls from './RelationControls'
import { orthogonalRoute } from '../orthogonal'
import { randomizeTableColors } from './colors'

export default function UmlWorkspace({active,onChooseMode,onReady}:{active:boolean;onChooseMode:()=>void;onReady:()=>void}) {
  const [store]=useState(()=>new EditorStore()),state=useSyncExternalStore(store.subscribe,store.getSnapshot),schema=state.project.uml
  const [ready,setReady]=useState(false),[modal,setModal]=useState<'import'|'projects'|'history'|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const [saveState,setSaveState]=useState<SaveState>({phase:'saving'}),queue=useRef<AutosaveQueue|null>(null)
  const routingTask=useRef<{worker:Worker;cancel:()=>void}|null>(null)
  useEffect(()=>()=>routingTask.current?.cancel(),[])
  useEffect(()=>{if(!active)routingTask.current?.cancel()},[active])
  const retired=useRef(new Map<string,Project>())
  const [camera,setCamera]=useState({x:0,y:0,width:1000,height:700}),svg=useRef<SVGSVGElement>(null),host=useRef<HTMLDivElement>(null)
  const fileInput=useRef<HTMLInputElement>(null)
  const manual=useRef(false),fittedId=useRef(''),[viewport,setViewport]=useState({w:1000,h:700})
  const drag=useRef<null|{pointer:number;kind:'table'|'pan'|'source'|'target'|'lane';id:string;start:Point;client:Point;position:Point}>(null)
  const selected=state.selectedIds[0],table=schema?.tables.find(t=>t.id===selected)
  const selectedRelations=schema?.relations.filter(r=>state.selectedIds.includes(r.id))??[],relation=selectedRelations.length===1?selectedRelations[0]:undefined
  const fit=()=>{const current=store.getSnapshot().project.uml;if(!current)return;const b=umlBounds(current),ratio=viewport.w/viewport.h,width=Math.max(b.width,b.height*ratio);setCamera({x:b.x-(width-b.width)/2,y:b.y-(width/ratio-b.height)/2,width,height:width/ratio});manual.current=false}
  useEffect(()=>{let live=true;loadLastProject('uml').then(p=>{if(live){if(p)store.replaceProject(p);setReady(true);onReady();setNotice(getStartupMessage('uml'))}}).catch(e=>{if(live)setNotice((e as Error).message)});return()=>{live=false}},[store,onReady])
  useEffect(()=>{const element=host.current;if(!element)return;const observer=new ResizeObserver(([entry])=>{if(entry.contentRect.width&&entry.contentRect.height)setViewport({w:entry.contentRect.width,h:entry.contentRect.height})});observer.observe(element);return()=>observer.disconnect()},[])
  useEffect(()=>{if(!schema)return;if(fittedId.current!==state.project.id){fittedId.current=state.project.id;manual.current=false}if(!manual.current)fit();else setCamera(c=>{const height=c.width*viewport.h/viewport.w;return {...c,y:c.y+(c.height-height)/2,height}})},[state.project.id,!!schema,viewport.w,viewport.h,active])
  useEffect(()=>{
    if(!ready)return
    const q=new AutosaveQueue(saveLocalProject,setSaveState,p=>recoveryJournal.write(p,diskStorage.expectedTag(p.id)),p=>{recoveryJournal.confirm(p);const previous=retired.current.get(p.id);if(previous){recoveryJournal.confirm(previous);retired.current.delete(p.id)}});queue.current=q
    const submit=()=>{const p=store.getSnapshot().project;if(p.mode==='uml'&&p.uml)q.submit(p)};submit();const unsubscribe=store.subscribe(submit)
    const flush=()=>{void q.flush().catch(()=>{})},unload=(e:BeforeUnloadEvent)=>{const p=store.getSnapshot().project;if(p.uml&&q.isPending(p)){e.preventDefault();e.returnValue=''}}
    const hidden=()=>{if(document.visibilityState==='hidden')flush()}
    window.addEventListener('beforeunload',unload);window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',hidden)
    return()=>{unsubscribe();q.stop();queue.current=null;window.removeEventListener('beforeunload',unload);window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',hidden)}
  },[store,ready])
  const choose=async(p:Project)=>{if(p.mode!=='uml'){setNotice('Abrí este archivo desde su modo DFD.');return}await queue.current?.flush();const previous=store.getSnapshot().project;if(previous.uml)await saveRevision(previous,'Antes de abrir otro proyecto UML');store.replaceProject(p);setModal(null)}
  const fileSave=async(saveAs=false)=>{setBusy(true);try{await queue.current?.flush();const result=await saveProjectFile(store.getSnapshot().project,saveAs);setNotice(result.downloaded?'Se descargó una copia del proyecto.':'Copia del proyecto guardada.')}catch(e){if((e as Error).name!=='AbortError')setNotice((e as Error).message)}finally{setBusy(false)}}
  useEffect(()=>{
    if(!active)return
    const key=(e:KeyboardEvent)=>{if(modal||isEditingTarget(e.target))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(schema&&!busy)void fileSave(e.shiftKey)}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?store.redo():store.undo()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();store.redo()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();store.select(schema?.relations.map(r=>r.id)??[])}else if(e.key==='Escape'){if(drag.current){drag.current=null;store.cancelGesture()}store.select([])}else if(e.key.toLowerCase()==='f'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();fit()}}
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)
  },[active,modal,schema,camera,busy])
  useEffect(()=>{if(!active&&drag.current){drag.current=null;store.endGesture()}},[active,store])
  const point=(e:{clientX:number;clientY:number})=>{const matrix=svg.current?.getScreenCTM();if(!matrix)return{x:0,y:0};const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());return{x:p.x,y:p.y}}
  const capture=(e:PointerEvent,kind:'table'|'pan'|'source'|'target'|'lane',id:string,position:Point)=>{e.preventDefault();e.stopPropagation();if(!svg.current)return;svg.current.focus();svg.current.setPointerCapture(e.pointerId);drag.current={pointer:e.pointerId,kind,id,start:point(e),client:{x:e.clientX,y:e.clientY},position};if(kind!=='pan')store.beginGesture();manual.current=true}
  const changeRelation=(fn:(r:UmlRelation)=>void)=>{const ids=new Set(store.getSnapshot().selectedIds),geometry=(r:UmlRelation)=>JSON.stringify([r.mode,r.controls,r.orthogonal,r.sourceSide,r.targetSide]);store.command(p=>{p.uml?.relations.filter(r=>ids.has(r.id)).forEach(r=>{const before=geometry(r);fn(r);if(geometry(r)!==before)delete r.autoRoute})})}
  const move=(e:PointerEvent<SVGSVGElement>)=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return
    if(d.kind==='pan'){const rect=svg.current!.getBoundingClientRect();setCamera(c=>({...c,x:d.position.x-(e.clientX-d.client.x)*c.width/rect.width,y:d.position.y-(e.clientY-d.client.y)*c.height/rect.height}));return}
    const pos=point(e),delta={x:pos.x-d.start.x,y:pos.y-d.start.y}
    store.command(p=>{if(d.kind==='table'){const t=p.uml!.tables.find(t=>t.id===d.id)!;t.x=d.position.x+delta.x;t.y=d.position.y+delta.y}else if(d.kind==='lane'){const r=p.uml!.relations.find(r=>r.id===d.id)!;const axis=r.orthogonal?.axis??'x';r.orthogonal={axis,kind:'multi',offset:d.position.x+delta[axis]}}else{const r=p.uml!.relations.find(r=>r.id===d.id)!;r.controls[d.kind as 'source'|'target']={x:d.position.x+delta.x,y:d.position.y+delta.y}}})
  }
  const finish=()=>{drag.current=null;store.endGesture()}
  const exportImage=async(format:'svg'|'png'|'jpg')=>{if(!schema)return;setBusy(true);try{downloadBlob(await umlBlob(schema,format),safeFilename(state.project.name)+'.'+format)}catch(e){setNotice((e as Error).message)}finally{setBusy(false)}}
  const arrange=async(ids?:string[],layout=false)=>{
    if(routingTask.current)return
    const previous=store.getSnapshot().project;if(!previous.uml)return;setBusy(true)
    let running:Worker|undefined
    try {
      const worker=new Worker(new URL('./routing.worker.ts',import.meta.url),{type:'module'});running=worker
      const result=await new Promise<{schema:UmlSchema;obstructed:number}>((resolve,reject)=>{
        routingTask.current={worker,cancel:()=>{worker.terminate();reject(new Error('Se canceló la búsqueda de recorridos.'))}}
        worker.onerror=()=>reject(new Error('No se pudo iniciar la búsqueda de recorridos.'))
        worker.onmessage=(e:MessageEvent<{schema:UmlSchema;obstructed:number;error?:string}>)=>{if(e.data.error)reject(new Error(e.data.error));else resolve(e.data)}
        worker.postMessage({schema:previous.uml,ids,layout})
      })
      if(store.getSnapshot().project!==previous){setNotice('El proyecto cambió durante la búsqueda. Se conservaron tus cambios; podés reintentarlo.');return}
      const checked=parseProject({...previous,uml:result.schema})
      store.endGesture();store.command(p=>{p.uml=checked.uml})
      if(layout){manual.current=false;requestAnimationFrame(fit)}
      setNotice(result.obstructed?'Se ajustó la distribución, pero quedan recorridos junto a tablas. Revisá sus lados o acomodá las tablas.':layout?'Tablas y relaciones reorganizadas. Podés deshacer el cambio con Ctrl+Z.':'Recorridos ajustados a 90°. Podés deshacer el cambio con Ctrl+Z.')
    }catch(e){setNotice((e as Error).message)}finally{running?.terminate();routingTask.current=null;setBusy(false)}
  }
  const rv=relation&&schema?relationVisual(relation,umlDiagram(schema)):null
  const lane=relation?.mode==='orthogonal'&&!relation.autoRoute&&rv&&relation.orthogonal?.kind!=='elbow'?orthogonalRoute(rv.e,umlDiagram(schema!)):null
  const lanePoint=lane?{x:(lane.spine.start.x+lane.spine.end.x)/2,y:(lane.spine.start.y+lane.spine.end.y)/2}:null
  return <div className="app simplified-app uml-app" hidden={!active} inert={!active} aria-hidden={!active||undefined}>
    <input ref={fileInput} type="file" hidden accept=".json,.dfd.json" onChange={async e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;try{if(file.size>24_000_000)throw new Error('El proyecto supera 24 MB.');await choose(parseProject(JSON.parse(await file.text())))}catch(e){setNotice((e as Error).message)}}}/>
    <header className="topbar"><Brand/><div className="project-heading"><strong>{schema?state.project.name:'UML de base de datos'}</strong></div><div className="mode-control"><span className="current-mode"><Database size={17}/><strong>UML de base de datos</strong></span><button className="secondary-button" onClick={onChooseMode}><LayoutGrid size={15}/>Cambiar modo</button></div></header>
    <div className="uml-toolbar"><button className="secondary-button" disabled={!ready||busy} onClick={()=>setModal('import')}><Plus size={15}/>Importar MySQL</button><button className="secondary-button" disabled={!ready||busy} onClick={()=>setModal('projects')}><FolderOpen size={15}/>Mis proyectos</button><button className="secondary-button" disabled={!ready||busy} onClick={()=>fileInput.current?.click()}><Upload size={15}/>Abrir archivo</button><button className="icon-button" aria-label="Deshacer" disabled={!state.canUndo} onClick={()=>store.undo()}><Undo2 size={16}/></button><button className="icon-button" aria-label="Rehacer" disabled={!state.canRedo} onClick={()=>store.redo()}><Redo2 size={16}/></button>
      {schema&&<><button className="secondary-button" disabled={busy} title="Reubica todas las tablas y calcula sus lados y recorridos en conjunto. Conserva colores y grosores. Se puede deshacer." onClick={()=>void arrange(undefined,true)}>Reorganizar tablas</button><button className="secondary-button" disabled={busy} title="Recalcula las relaciones a 90° sin mover tablas. Se puede deshacer." onClick={()=>void arrange()}>Recalcular carriles</button><span className={`uml-save-state ${saveState.phase==='error'?'error-message':''}`}>{saveState.phase==='saved'?'Guardado en esta PC':saveState.phase==='saving'?'Guardando…':saveState.phase==='browser'?'Solo en navegador':'Guardado pendiente'}</span><button className="secondary-button" disabled={busy} onClick={()=>void fileSave()}><Save size={15}/>Guardar</button><button className="secondary-button" disabled={busy} onClick={()=>setModal('history')}>Versiones</button><button className="secondary-button" onClick={()=>downloadProject(state.project)}>Descargar proyecto</button></>}
    </div>
    {notice&&<div className="uml-notice" role="status">{notice}<button onClick={()=>setNotice('')} aria-label="Cerrar aviso">×</button></div>}
    {schema&&(saveState.phase==='error'||saveState.phase==='browser')&&<div className="uml-notice error-message" role="alert">{saveState.message}<button onClick={()=>void queue.current?.retry().catch(e=>setNotice(e.message))}>Reintentar</button><button onClick={()=>downloadProject(state.project)}>Descargar copia</button>{saveState.conflict&&<button onClick={()=>{const old=state.project,p=clone(old);p.id=crypto.randomUUID();p.name+=' (copia recuperada)';queue.current?.discard(old.id);retired.current.set(p.id,old);store.replaceProject(p)}}>Conservar como otro proyecto</button>}</div>}
    <div className="uml-body"><div className="uml-canvas-host" ref={host}>
      {!schema?<div className="uml-empty"><Database size={36}/><h1>Tu base de datos, a la vista</h1><p>Cargá la estructura MySQL para generar tablas y relaciones.</p><button className="primary-button" disabled={!ready} onClick={()=>setModal('import')}>Pegar SQL o cargar archivo</button></div>:<>
      <svg ref={svg} className="uml-canvas" tabIndex={0} role="application" aria-label="Diagrama UML. Arrastrá tablas; clic derecho para mover el lienzo; rueda para zoom." viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`} onContextMenu={e=>e.preventDefault()} onPointerDown={e=>{if(e.button===2||e.button===1)capture(e,'pan','',{x:camera.x,y:camera.y});else store.select([])}} onPointerMove={move} onPointerUp={finish} onPointerCancel={()=>{drag.current=null;store.cancelGesture()}} onLostPointerCapture={finish} onWheel={e=>{if(!active)return;const p=point(e),factor=e.deltaY>0?1.1:1/1.1;manual.current=true;setCamera(c=>{const width=Math.min(100000,Math.max(150,c.width*factor)),scale=width/c.width;return {x:p.x-(p.x-c.x)*scale,y:p.y-(p.y-c.y)*scale,width,height:c.height*scale}})}}>
        <UmlArt schema={schema} selectedIds={state.selectedIds} onTable={(id,e)=>{if(e.button!==0)return;store.select([id]);const t=schema.tables.find(t=>t.id===id)!;capture(e,'table',id,{x:t.x,y:t.y})}} onRelation={(id,e)=>{svg.current?.focus({preventScroll:true});const current=store.getSnapshot().selectedIds.filter(id=>schema.relations.some(r=>r.id===id));store.select(e.shiftKey||e.ctrlKey||e.metaKey?(current.includes(id)?current.filter(key=>key!==id):[...current,id]):[id])}}/>
        {relation?.mode==='curve'&&rv&&(['source','target'] as const).map(end=>{const origin=end==='source'?rv.source:rv.target,c=relation.controls[end];return <g key={end}><path d={`M ${origin.x} ${origin.y} L ${origin.x+c.x} ${origin.y+c.y}`} stroke="#df7748" strokeDasharray="5 4"/><circle cx={origin.x+c.x} cy={origin.y+c.y} r="6" fill="white" stroke="#df7748" style={{cursor:'move'}} onPointerDown={e=>capture(e,end,relation.id,c)}/></g>})}
        {lanePoint&&relation&&<g><path d={lane!.axis==='x'?`M ${lanePoint.x-18} ${lanePoint.y} h36`:`M ${lanePoint.x} ${lanePoint.y-18} v36`} stroke="#df7748" strokeWidth="1"/><rect x={lanePoint.x-7} y={lanePoint.y-7} width="14" height="14" rx="2" fill="white" stroke="#df7748" strokeWidth="2" style={{cursor:lane!.axis==='x'?'ew-resize':'ns-resize'}} onPointerDown={e=>{if(e.button===0)capture(e,'lane',relation.id,{x:relation.orthogonal?.offset??0,y:0})}}><title>Arrastrar carril de la relación</title></rect></g>}
      </svg><div className="uml-canvas-controls"><button className="secondary-button" onClick={fit}><Maximize size={15}/>Ajustar</button><span>Rueda: zoom · Arrastre derecho: mover</span></div></>}
    </div>{schema&&<aside className="uml-properties"><h2>{table?'Tabla':selectedRelations.length?selectedRelations.length===1?'Relación':selectedRelations.length+' relaciones':'Presentación'}</h2>{table?<><p>{table.name}</p><label>Color del encabezado<input type="color" value={table.headerColor} onPointerDown={()=>store.beginGesture()} onBlur={()=>store.endGesture()} onChange={e=>store.command(p=>{p.uml!.tables.find(t=>t.id===selected)!.headerColor=e.target.value})}/></label><label>Color del borde<input type="color" value={table.borderColor} onPointerDown={()=>store.beginGesture()} onBlur={()=>store.endGesture()} onChange={e=>store.command(p=>{p.uml!.tables.find(t=>t.id===selected)!.borderColor=e.target.value})}/></label><p className="field-help">Arrastrá la tabla para acomodarla. Sus columnas y claves provienen del SQL.</p></>:selectedRelations.length>0?<><RelationControls key={selectedRelations.map(r=>r.id).join(',')} relations={selectedRelations} schema={schema} change={changeRelation} beginGesture={()=>store.beginGesture()} endGesture={()=>store.endGesture()} arrange={()=>void arrange(selectedRelations.map(r=>r.id))} busy={busy}/></>:<p className="field-help">Seleccioná una tabla para cambiar sus colores o una relación para ajustar el recorrido.</p>}
      <section className="uml-presentation-actions"><h3>Tablas y relaciones</h3><button className="secondary-button" disabled={busy} onClick={()=>{try{store.endGesture();store.command(p=>{if(p.uml)randomizeTableColors(p.uml)})}catch(e){setNotice((e as Error).message)}}}>Colores aleatorios para las tablas</button><p className="field-help">Colores sin repetir. Podés deshacer con Ctrl+Z.</p>{schema.relations.length>0&&<button className="secondary-button" disabled={busy} onClick={()=>store.select(schema.relations.map(r=>r.id))}>Seleccionar todas las relaciones</button>}<p className="field-help">Shift/Ctrl + clic: sumar o quitar relaciones. Ctrl+A: seleccionarlas todas.</p></section>
      <div className="uml-export"><h3>Exportar diagrama</h3>{(['svg','png','jpg'] as const).map(format=><button className="secondary-button" disabled={busy} key={format} onClick={()=>void exportImage(format)}><Download size={14}/>{format.toUpperCase()}</button>)}</div><p className="field-help">○ opcional · | uno · pata de cuervo: muchos.<br/>PK: clave primaria · FK: clave foránea.</p></aside>}</div>
    {active&&modal==='import'&&<ImportDialog onClose={()=>setModal(null)} onImport={async(p,w)=>{await choose(p);setNotice(w.join(' '))}}/>}
    {active&&modal==='projects'&&<ProjectsDialog mode="uml" currentId={state.project.id} onClose={()=>setModal(null)} onChoose={p=>void choose(p).catch(e=>setNotice(e.message))} notify={setNotice}/>}
    {active&&modal==='history'&&<HistoryDialog store={store} onClose={()=>setModal(null)} notify={setNotice}/>}
  </div>
}
