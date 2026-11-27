import { Disclosure, Presence } from './motion'
import { ArrowDownToLine, ArrowLeftRight, ArrowUpToLine, MoveHorizontal, Plus, RotateCcw } from 'lucide-react'
import type { DfdEdge } from './model'
import type { EditorStore } from './store'
import { defaultOrthogonal, orthogonalRadiusLimit } from './orthogonal'
import { NumberField } from './InspectorFields'
import { analyzeEditorFlowReadability } from './flowReadability'

export default function ArrowShapeControls({ store, edges, notify }: { store: EditorStore; edges: DfdEdge[]; notify: (text: string) => void }) {
  const edge = edges.length === 1 ? edges[0] : undefined
  const editable = edges.filter(flow => !flow.locked).length
  const update = (fn: (flow: DfdEdge) => void) => edge && store.updateEdge(edge.id, fn)
  const orthogonal = edges.filter(e=>e.mode==='orthogonal')
  const orthogonalEditable=orthogonal.some(e=>!e.locked)
  const radiusEdges=orthogonalEditable?orthogonal.filter(e=>!e.locked):orthogonal
  const radiusMax=Math.floor(Math.min(200,Math.max(0,...radiusEdges.map(e=>orthogonalRadiusLimit(e,store.diagram))))*10)/10
  const radiusValue=Math.min(radiusMax,radiusEdges[0]?.cornerRadius??12)
  const radiusMixed=radiusEdges.some(e=>Math.min(radiusMax,e.cornerRadius??12)!==radiusValue)
  const formatRadius=(value:number)=>value.toLocaleString('es-AR',{maximumFractionDigits:1})
  const ids=new Set(edges.map(e=>e.id))
  const marks = edges.map(e => e.endMark ?? 'none')
  const markValue = marks.every(mark => mark === marks[0]) ? marks[0] : 'mixed'
  const selectedOverlaps=ids.size > 1 ? analyzeEditorFlowReadability(store.diagram).overlaps.filter(overlap=>ids.has(overlap.firstId)&&ids.has(overlap.secondId)).length : 0
  const reverse = () => {
    store.endGesture()
    store.command((_p,d)=>{for(const flow of d.edges)if(ids.has(flow.id)&&!flow.locked){
      const source=flow.source;flow.source=flow.target;flow.target=source
      const control=flow.controls.source;flow.controls.source=flow.controls.target;flow.controls.target=control
      if(flow.orthogonal?.kind==='elbow')flow.orthogonal.axis=flow.orthogonal.axis==='x'?'y':'x'
      flow.generatedRoute=flow.generatedRoute?.reverse().map(p=>({...p,t:1-p.t,incoming:p.outgoing,outgoing:p.incoming}))
      flow.waypoints=flow.waypoints?.reverse().map(p=>({...p,t:1-p.t,incoming:p.outgoing,outgoing:p.incoming}))
      flow.label.t=1-flow.label.t
    }})
  }
  const reset = () => {
    store.endGesture(); const count = store.resetEdges(edges.map(flow => flow.id))
    notify(count === 1 ? 'Recorrido restablecido. Ctrl + Z para deshacer.' : count+' recorridos restablecidos. Ctrl + Z para deshacer.')
  }
  const reorder = (direction: 'front' | 'back') => {
    const count=store.reorderEdges(edges.map(flow=>flow.id),direction)
    if(count)notify(`${count===1?'Flujo colocado':'Flujos colocados'} ${direction==='front'?'por encima':'por debajo'} en los cruces. Ctrl + Z para deshacer.`)
  }
  const separate = () => {
    const count=store.separateEdges(edges.map(flow=>flow.id))
    if(count)notify(`${count} recorridos separados. Ctrl + Z para deshacer.`)
  }
  return <>
    <div className="route-types" role="group" aria-label="Tipo de recorrido">{([
      ['straight','Recta','M3 23 L53 7'],['curve','Curva','M3 23 C12 1 44 1 53 23'],['orthogonal','A 90°','M3 23 H22 Q27 23 27 18 V12 Q27 7 32 7 H53'],
    ] as const).map(([mode,label,path])=><button key={mode} disabled={!editable} aria-pressed={edges.every(e=>e.mode===mode)} onClick={()=>store.setEdgeMode(edges.map(e=>e.id),mode)}><svg viewBox="0 0 56 30" width="56" height="30" aria-hidden="true"><path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" /></svg><span>{label}</span></button>)}</div>
    {store.diagram.mode === 'design' && <label className="field">
      <span className="field-label">Marca antes de la punta</span>
      <select value={markValue} disabled={!editable} onChange={event => {
        const mark = event.target.value
        store.command((_p, d) => {
          for (const flow of d.edges) {
            if (!ids.has(flow.id) || flow.locked) continue
            if (mark === 'alta' || mark === 'baja') flow.endMark = mark
            else delete flow.endMark
          }
        })
      }}>
        {markValue === 'mixed' && <option value="mixed" disabled>Valores distintos</option>}
        <option value="none">Sin marca</option>
        <option value="alta">Alta (raya)</option>
        <option value="baja">Baja (X)</option>
      </select>
    </label>}
    <button className="secondary-button compact" disabled={!editable} onClick={reverse}><ArrowLeftRight size={14} />Invertir dirección{edges.length>1?' de la selección':''}</button>
    <div className="flow-order-actions" role="group" aria-label="Orden visual en los cruces">
      <button className="secondary-button compact" disabled={!editable} onClick={()=>reorder('front')}><ArrowUpToLine size={13} />Pasar por encima</button>
      <button className="secondary-button compact" disabled={!editable} onClick={()=>reorder('back')}><ArrowDownToLine size={13} />Pasar por debajo</button>
    </div>
    <p className="field-help">Define qué flecha queda continua cuando dos recorridos se cruzan. No modifica su forma.</p>
    {edges.length>1 && <>
      <button className="secondary-button compact" disabled={editable<2} onClick={separate}><MoveHorizontal size={13} />Separar recorridos</button>
      <p className={`field-help${selectedOverlaps?' flow-overlap-text':''}`}>{selectedOverlaps ? `${selectedOverlaps} ${selectedOverlaps===1?'superposición detectada':'superposiciones detectadas'} en la selección.` : 'Desplaza localmente las flechas seleccionadas; las rectas pasan a curvas.'}</p>
    </>}
    <Presence show={orthogonal.length>0} kind="vertical"><div className="motion-fields">
      <div className="segmented" role="group" aria-label="Dobleces">{([['elbow','Un codo'],['multi','Varios dobleces']] as const).map(([kind,label])=><button key={kind} disabled={!orthogonalEditable} aria-pressed={orthogonal.every(e=>(e.orthogonal?.kind??'multi')===kind)} className={orthogonal.every(e=>(e.orthogonal?.kind??'multi')===kind)?'active':''} onClick={()=>store.command((_p,d)=>{for(const e of d.edges)if(ids.has(e.id)&&e.mode==='orthogonal'&&!e.locked)e.orthogonal=defaultOrthogonal(e,d,kind)})}>{label}</button>)}</div>
      <label className="field"><span className="field-label range-label">Redondeo de esquinas <output>{radiusMixed?'Valores distintos':formatRadius(radiusValue)+' px'}</output></span><input aria-label="Redondeo de esquinas" type="range" min="0" max={radiusMax||1} step="0.1" value={radiusValue} disabled={!orthogonalEditable||radiusMax===0} onPointerDown={()=>store.beginGesture()} onPointerUp={()=>store.endGesture()} onPointerCancel={()=>store.endGesture()} onKeyDown={evt=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(evt.key))store.beginGesture()}} onKeyUp={()=>store.endGesture()} onBlur={()=>store.endGesture()} onChange={evt=>{const radius=Number(evt.target.value);store.command((_p,d)=>{for(const e of d.edges)if(ids.has(e.id)&&e.mode==='orthogonal'&&!e.locked)e.cornerRadius=radius})}} /></label>
      <p className="field-help">{radiusMax===0 ? 'Este recorrido no tiene espacio útil para redondear esquinas.' : <>0 deja esquinas rectas. Máximo útil: {formatRadius(radiusMax)} px.{radiusEdges.length>1 && ' Cada flecha limita sus esquinas según el espacio disponible.'}</>}</p>
      {edge?.mode==='orthogonal' && <>
        <label className="field"><span className="field-label">{edge.orthogonal?.kind==='elbow'?'Primer tramo':'Tramo central'}</span><select aria-label="Orientación del recorrido" value={(edge.orthogonal??defaultOrthogonal(edge,store.diagram)).axis} onChange={evt=>update(e=>{e.orthogonal={axis:evt.target.value as 'x'|'y',offset:0,kind:e.orthogonal?.kind??'multi'}})}><option value="x">{edge.orthogonal?.kind==='elbow'?'Horizontal, luego vertical':'Vertical'}</option><option value="y">{edge.orthogonal?.kind==='elbow'?'Vertical, luego horizontal':'Horizontal'}</option></select></label>
        {edge.orthogonal?.kind!=='elbow' ? <>
        <NumberField label="Desplazar tramo central" value={(edge.orthogonal??defaultOrthogonal(edge,store.diagram)).offset} min={-10000000} max={10000000} suffix="px" onChange={offset=>update(e=>{e.orthogonal={...(e.orthogonal??defaultOrthogonal(e,store.diagram)),offset}})} />
        <p className="field-help">Arrastrá el control cuadrado de la flecha para mover ese tramo.</p>
        </> : <p className="field-help">Usa solo una esquina. Si los extremos están alineados, queda un tramo recto. Cambiá el primer tramo para elegir el lado de la L.</p>}
      </>}
    </div></Presence>
    <button className="secondary-button compact" disabled={!editable} onClick={reset}><RotateCcw size={13} />Restablecer {edges.length>1 ? editable+' recorridos' : 'recorrido'}</button>
    <p className="field-help">Conserva el tipo de flecha, sus conexiones y el radio. Borra los ajustes del recorrido.</p>
    {edge?.mode==='curve' && <Disclosure className="inspector-details" title="Edición avanzada">
      <button className="text-button" disabled={!!edge.locked} onClick={() => store.addWaypoint(edge.id, .5)}><Plus size={13} />Agregar punto intermedio</button>
    </Disclosure>}
  </>
}
