import type { PointerEvent } from 'react'
import type { UmlSchema } from '../model'
import { contrast, relationVisual, tableSize, umlDiagram } from './geometry'
import { HEADER_HEIGHT, COLUMN_TEXT_X, columnCenter } from './metrics'

function Cardinality({optional,many,x,y,angle,color}:{optional:boolean;many:boolean;x:number;y:number;angle:number;color:string}) {
  return <g transform={`translate(${x} ${y}) rotate(${angle})`} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round">
    <path d={many?'M 2 -6 L 14 0 L 2 6':'M 8 -6 V 6'} />
    {optional?<circle cx="23" cy="0" r="4" fill="#fafaf8"/>:<path d="M 20 -6 V 6"/>}
  </g>
}
function KeyBadge({kind,x,y}:{kind:'PK'|'FK';x:number;y:number}) {
  const primary=kind==='PK'
  return <g transform={`translate(${x} ${y})`}><title>{primary?'Clave primaria':'Clave foránea'}</title><rect x="0" y="-8.5" width="24" height="17" rx="3" fill={primary?'#fff1c4':'#e6eff7'} stroke={primary?'#bda052':'#9eb7cb'} strokeWidth=".8"/><text x="12" y=".5" dominantBaseline="central" textAnchor="middle" fontFamily="Arial" fontSize="11" fontWeight="700" fill={primary?'#624b0b':'#254a66'}>{kind}</text></g>
}
export default function UmlArt({schema,selectedIds=[],onTable,onRelation}:{schema:UmlSchema;selectedIds?:string[];onTable?:(id:string,e:PointerEvent<SVGGElement>)=>void;onRelation?:(id:string,e:PointerEvent<SVGGElement>)=>void}) {
  const d=umlDiagram(schema)
  const selected=new Set(selectedIds)
  return <g data-diagram-content="" textRendering="geometricPrecision">
    {schema.relations.map(r=>{const v=relationVisual(r,d);return <g key={r.id} onPointerDown={e=>{if(e.button===0){e.stopPropagation();onRelation?.(r.id,e)}}} style={{cursor:onRelation?'pointer':undefined}}>
      <title>{r.childColumns.map(id=>schema.tables.find(t=>t.id===r.childTable)!.columns.find(c=>c.id===id)!.name).join(', ')} → {r.parentColumns.map(id=>schema.tables.find(t=>t.id===r.parentTable)!.columns.find(c=>c.id===id)!.name).join(', ')}</title>
      <path d={v.path} fill="none" stroke="transparent" strokeWidth="16"/>
      {selected.has(r.id)&&<path d={v.path} fill="none" stroke="#df7748" opacity=".24" strokeWidth={r.strokeWidth+7} strokeLinecap="round"/>}
      <path d={v.path} fill="none" stroke={r.stroke} strokeWidth={r.strokeWidth} strokeLinecap="round"/>
    </g>})}
    {schema.tables.map(t=>{const size=tableSize(t);return <g key={t.id} transform={`translate(${t.x} ${t.y})`} onPointerDown={e=>onTable?.(t.id,e)} style={{cursor:onTable?'move':undefined}}>
      <rect width={size.width} height={size.height} rx="3" fill="#ffffff" stroke={selected.has(t.id)?'#df7748':t.borderColor} strokeWidth={selected.has(t.id)?2.5:1.5}/>
      <path d={`M 1 4 Q 1 1 4 1 H ${size.width-4} Q ${size.width-1} 1 ${size.width-1} 4 V ${HEADER_HEIGHT} H 1 Z`} fill={t.headerColor}/>
      <text x="16" y={HEADER_HEIGHT/2} dominantBaseline="central" fill={contrast(t.headerColor)} fontFamily="Arial" fontSize="15" fontWeight="700">{t.name}</text>
      <path d={`M 0 ${HEADER_HEIGHT} H ${size.width}`} stroke={t.borderColor}/>
      {t.columns.map((c,i)=><g key={c.id}>{c.primary&&<KeyBadge kind="PK" x={12} y={columnCenter(i)}/>} {c.foreign&&<KeyBadge kind="FK" x={c.primary?40:12} y={columnCenter(i)}/>}<text x={COLUMN_TEXT_X} y={columnCenter(i)} dominantBaseline="central" fontFamily="Arial" fontSize="14" fontWeight={c.primary?'700':'600'} fill="#263d49">{c.name}</text></g>)}
    </g>})}
    {schema.relations.map(r=>{const v=relationVisual(r,d);return <g key={r.id} pointerEvents="none"><Cardinality optional many={!r.childUnique} x={v.source.x} y={v.source.y} angle={v.sourceAngle} color={r.stroke}/><Cardinality optional={r.parentOptional} many={false} x={v.target.x} y={v.target.y} angle={v.targetAngle} color={r.stroke}/></g>})}
  </g>
}
