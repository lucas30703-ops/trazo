import type { UmlRelation, UmlSchema } from '../model'
import { umlDiagram } from './geometry'
import { useEffect, useRef, useState } from 'react'

interface Props {
  relations: UmlRelation[]; schema: UmlSchema
  change: (fn:(r:UmlRelation)=>void)=>void
  beginGesture:()=>void; endGesture:()=>void; arrange:()=>void; busy:boolean
}
function common<T>(relations:UmlRelation[],read:(r:UmlRelation)=>T):T|undefined {
  const first=read(relations[0]);return relations.every(r=>read(r)===first)?first:undefined
}
const adjustmentKeys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown']
function Slider({label,value,min,max,step=1,disabled=false,begin,end,change,mixed=false}:{label:string;value:number;min:number;max:number;step?:number;disabled?:boolean;begin:()=>void;end:()=>void;change:(n:number)=>void;mixed?:boolean}) {
  return <input type="range" aria-label={label} aria-valuetext={mixed?'Varios valores':undefined} min={min} max={max} step={step} value={value} disabled={disabled}
    onPointerDown={begin} onPointerUp={end} onPointerCancel={end} onBlur={end}
    onKeyDown={e=>{if(adjustmentKeys.includes(e.key))begin()}} onKeyUp={e=>{if(adjustmentKeys.includes(e.key))end()}}
    onChange={e=>change(+e.target.value)}/>
}
function LaneSlider({relations,change,begin,end,busy}: {relations:UmlRelation[];change:(n:number)=>void;begin:()=>void;end:()=>void;busy:boolean}) {
  const value=common(relations,r=>r.orthogonal?.offset??0),bound=Math.ceil(Math.max(1000,...relations.map(r=>Math.abs(r.orthogonal?.offset??0)))/100)*100
  const [range,setRange]=useState(bound),editing=useRef(false)
  useEffect(()=>{if(!editing.current)setRange(bound)},[bound])
  const start=()=>{editing.current=true;begin()},finish=()=>{editing.current=false;setRange(bound);end()}
  return <div className="uml-slider-field"><div className="uml-control-heading"><span>Desplazamiento del carril</span><output>{value===undefined?'Varios':Math.round(value)+' px'}</output></div>
    <Slider label="Desplazamiento del carril" min={-range} max={range} value={value??relations[0].orthogonal?.offset??0} mixed={value===undefined} begin={start} end={finish} change={change} disabled={busy}/>
    <div className="uml-slider-scale"><span>−{range} px</span><span>+{range} px</span></div>
  </div>
}
export default function RelationControls({relations:rs,schema,change,beginGesture,endGesture,arrange,busy}:Props) {
  const r=rs[0],multiple=rs.length>1,mode=common(rs,r=>r.mode),axis=common(rs,r=>r.orthogonal?.axis??'x'),radius=common(rs,r=>r.cornerRadius??0),color=common(rs,r=>r.stroke),thickness=common(rs,r=>r.strokeWidth)
  const diagram=umlDiagram(schema)
  const names=(end:'source'|'target')=>{const table=schema.tables.find(t=>t.id===(end==='source'?r.childTable:r.parentTable))!,ids=end==='source'?r.childColumns:r.parentColumns;return table.name+' · '+ids.map(id=>table.columns.find(c=>c.id===id)!.name).join(', ')}
  const resolved=(current:UmlRelation,end:'source'|'target')=>{const anchor=diagram.edges.find(e=>e.id===current.id)![end].anchor;return anchor.kind==='side'&&anchor.side==='left'?'left':'right'}
  const sides=(end:'source'|'target',value:'left'|'right'|'auto'|'freeze')=>change(current=>{
    const field=end==='source'?'sourceSide':'targetSide'
    if(value==='auto')delete current[field];else current[field]=value==='freeze'?resolved(current,end):value
    if(current.mode==='curve') {
      const view={...schema,relations:schema.relations.map(candidate=>candidate.id===current.id?current:candidate)}
      const anchor=umlDiagram(view).edges.find(e=>e.id===current.id)![end].anchor
      current.controls[end].x=(anchor.kind==='side'&&anchor.side==='left'?-1:1)*Math.max(60,Math.abs(current.controls[end].x))
    }
  })
  const sideControl=(end:'source'|'target')=>{
    const field=end==='source'?'sourceSide':'targetSide',automatic=rs.every(r=>!r[field]),mixedAuto=rs.some(r=>!r[field])&&!automatic,side=common(rs,r=>resolved(r,end))
    const label=end==='source'?'Salida':'Llegada',name=multiple?label:label+' · '+schema.tables.find(t=>t.id===(end==='source'?r.childTable:r.parentTable))!.name
    return <div className="uml-side-control" key={end}>
      <div className="uml-control-heading"><span>{name}</span></div>
      <div className="uml-side-inputs"><div className="uml-side-slider"><Slider label={'Lado de '+label.toLowerCase()} min={0} max={1} value={side==='right'?1:0} mixed={side===undefined} disabled={automatic||busy} begin={beginGesture} end={endGesture} change={n=>sides(end,n===0?'left':'right')}/><div className="uml-slider-scale"><span>Izquierda</span><span>Derecha</span></div></div>
      <label className="uml-auto-checkbox"><input type="checkbox" checked={automatic} aria-checked={mixedAuto?'mixed':automatic} ref={el=>{if(el)el.indeterminate=mixedAuto}} disabled={busy} onChange={e=>sides(end,e.target.checked?'auto':'freeze')}/>Automático</label></div>
      {side===undefined&&<span className="field-help">Varios lados</span>}
    </div>
  }
  return <>
    <p className="field-help">{multiple?'Los cambios se aplican a las '+rs.length+' relaciones seleccionadas.':names('source')+' → '+names('target')}</p>
    <fieldset className="uml-endpoints"><legend>Conexión a las tablas</legend>{sideControl('source')}{sideControl('target')}<p className="field-help">Desmarcá Automático para elegir el lado. Los extremos siguen unidos a sus columnas.</p></fieldset>
    <label>Recorrido<select disabled={busy} value={mode??''} onChange={e=>change(current=>{
      current.mode=e.target.value as UmlRelation['mode'];current.orthogonal??={axis:'x',offset:0,kind:'multi'}
      if(current.mode==='curve')for(const end of ['source','target'] as const) current.controls[end]={x:resolved(current,end)==='left'?-120:120,y:current.childTable===current.parentTable?(end==='source'?-80:80):0}
    })}>{mode===undefined&&<option value="" disabled>Varios recorridos</option>}<option value="straight">Recta</option><option value="curve">Curva</option><option value="orthogonal">A 90°</option></select></label>
    {mode==='orthogonal'&&<>
      {rs.some(r=>r.autoRoute)?<><p className="field-help">Recorrido calculado junto con las tablas. Cambiar un lado pasa esa relación a carril manual.</p><button className="secondary-button" disabled={busy} onClick={()=>change(current=>{delete current.autoRoute})}>Usar carril manual</button></>:<>
      <label>Carril<select disabled={busy} value={axis??''} onChange={e=>change(current=>{current.orthogonal={axis:e.target.value as 'x'|'y',offset:0,kind:'multi'}})}>{axis===undefined&&<option value="" disabled>Varias orientaciones</option>}<option value="x">Vertical · izquierda / derecha</option><option value="y">Horizontal · arriba / abajo</option></select></label>
      <LaneSlider relations={rs} change={n=>change(current=>{current.orthogonal={...current.orthogonal!,kind:'multi',offset:n}})} begin={beginGesture} end={endGesture} busy={busy}/>
      <p className="field-help">{multiple?'El slider asigna el mismo desplazamiento al grupo.':'También podés arrastrar el cuadrado naranja del lienzo.'}</p>
      </>}
      <div className="uml-slider-field"><div className="uml-control-heading"><span>Redondeo</span><output>{radius===undefined?'Varios':radius+' px'}</output></div><Slider label="Redondeo" min={0} max={100} value={radius??0} mixed={radius===undefined} begin={beginGesture} end={endGesture} disabled={busy} change={n=>change(current=>{current.cornerRadius=n})}/></div>
    </>}
    {mode==='curve'&&<p className="field-help">{multiple?'Seleccioná una sola relación para arrastrar sus controles.':'Arrastrá los controles redondos para ajustar la curva.'}</p>}
    <button className="secondary-button" disabled={busy} onClick={arrange}>{multiple?'Buscar carriles manuales':'Buscar carril manual'}</button>
    <label>Color{color===undefined&&<span className="field-help">Varios colores</span>}<input type="color" disabled={busy} value={color??r.stroke} onPointerDown={beginGesture} onBlur={endGesture} onChange={e=>change(current=>{current.stroke=e.target.value})}/></label>
    <label>Grosor{thickness===undefined&&<span className="field-help">Varios grosores</span>}<input type="number" disabled={busy} min=".5" max="16" step=".5" placeholder="Varios" value={thickness??''} onFocus={beginGesture} onBlur={endGesture} onChange={e=>{if(!e.target.value)return;const n=+e.target.value;if(n>=.5&&n<=16)change(current=>{current.strokeWidth=n})}}/></label>
  </>
}
