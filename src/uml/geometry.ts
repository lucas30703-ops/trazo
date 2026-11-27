import type { Diagram, DfdEdge, DfdNode, UmlSchema, UmlRelation, UmlTable, Point } from '../model'
import { defaultFont } from '../model'
import { contentBounds, edgePath, edgeSegments, edgePoints } from '../geometry'
import { tableSize, columnCenter } from './metrics'
import { automaticRouteEdge } from './route'
export { tableSize } from './metrics'

export function umlDiagram(schema:UmlSchema):Diagram {
  const nodes:DfdNode[]=schema.tables.map(t=>({id:t.id,kind:'entity',x:t.x,y:t.y,...tableSize(t),text:'',number:'',stroke:t.borderColor,strokeWidth:1.5,fill:'#ffffff',font:defaultFont}))
  const row=(t:UmlTable,ids:string[])=>{const indices=ids.map(id=>t.columns.findIndex(c=>c.id===id));return columnCenter(indices.reduce((a,b)=>a+b,0)/indices.length)/tableSize(t).height}
  const edges:DfdEdge[]=schema.relations.map(r=>{
    const c=schema.tables.find(t=>t.id===r.childTable)!,p=schema.tables.find(t=>t.id===r.parentTable)!, right=c.id===p.id||c.x+tableSize(c).width/2<p.x+tableSize(p).width/2
    return {id:r.id,source:{nodeId:c.id,anchor:{kind:'side',side:r.sourceSide??(right?'right':'left'),t:row(c,r.childColumns)}},target:{nodeId:p.id,anchor:{kind:'side',side:r.targetSide??(c.id===p.id||!right?'right':'left'),t:row(p,r.parentColumns)}},mode:r.mode,controls:r.controls,orthogonal:r.orthogonal,cornerRadius:r.cornerRadius,stroke:r.stroke,strokeWidth:r.strokeWidth,label:{text:'',t:.5,offset:{x:0,y:0},width:100,angle:0,orientation:'horizontal',background:false,font:defaultFont}}
  })
  for(let i=0;i<edges.length;i++) {const r=schema.relations[i];if(r.autoRoute) {const ends=edgePoints(edges[i],{nodes} as Diagram);edges[i]=automaticRouteEdge(edges[i],r,ends.start,ends.end)}}
  return {id:'uml-view',name:'UML',nodes,edges,background:'#fafaf8',grid:false,snap:false,heading:{mode:'hidden'}}
}
export function relationVisual(r:UmlRelation,d:Diagram) {
  const e=d.edges.find(e=>e.id===r.id)!,ends=edgePoints(e,d), path=edgePath(e,d),segments=edgeSegments(e,d)
  const source=segments.flatMap(s=>[s.c1,s.c2,s.end]).find(p=>Math.hypot(p.x-ends.start.x,p.y-ends.start.y)>.00001)??ends.end
  const target=[...segments].reverse().flatMap(s=>[s.c2,s.c1,s.start]).find(p=>Math.hypot(p.x-ends.end.x,p.y-ends.end.y)>.00001)??ends.start
  const direction=(at:Point,near:Point)=>Math.atan2(near.y-at.y,near.x-at.x)*180/Math.PI
  return {path,source:ends.start,target:ends.end,sourceAngle:direction(ends.start,source),targetAngle:direction(ends.end,target),e}
}
export function umlBounds(schema:UmlSchema) {const b=contentBounds(umlDiagram(schema));return {x:b.x-45,y:b.y-45,width:b.width+90,height:b.height+90}}
export const contrast=(color:string)=>{const c=color.replace('#','');return (.299*parseInt(c.slice(0,2),16)+.587*parseInt(c.slice(2,4),16)+.114*parseInt(c.slice(4,6),16))>150?'#263b43':'#ffffff'}
