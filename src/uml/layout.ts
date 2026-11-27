import ELK from 'elkjs/lib/elk-api.js'
import ElkWorker from 'elkjs/lib/elk-worker.min.js?worker'
import type { ElkNode } from 'elkjs/lib/elk-api.js'
import type { Point, UmlSchema, UmlTable, UmlRelation } from '../model'
import { tableSize, columnCenter } from './metrics'
import { simplifyPolyline } from './route'

const ratio=1.6, gap=90
const row=(t:UmlTable,cols:string[])=>columnCenter(cols.reduce((n,id)=>n+t.columns.findIndex(c=>c.id===id),0)/cols.length)
const distance=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)
function bounds(schema:UmlSchema) {
  const ps=schema.tables.flatMap(t=>{const s=tableSize(t);return [{x:t.x,y:t.y},{x:t.x+s.width,y:t.y+s.height}]}).concat(schema.relations.flatMap(r=>r.autoRoute?.points??[]))
  let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity
  for(const p of ps){x=Math.min(x,p.x);y=Math.min(y,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y)}
  return {x,y,width:right-x,height:bottom-y}
}
function score(schema:UmlSchema) {
  const b=bounds(schema),nodes=schema.tables.map(t=>({...t,...tableSize(t)}));let hits=0,length=0,bends=0
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j];if(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y)hits+=100}
  for(const r of schema.relations) {
    const ps=r.autoRoute!.points;bends+=Math.max(0,ps.length-2)
    for(let i=1;i<ps.length;i++){const a=ps[i-1],b=ps[i];length+=distance(a,b)
      for(const n of nodes){if(i===1&&n.id===r.childTable||i===ps.length-1&&n.id===r.parentTable)continue
        if(Math.max(a.x,b.x)>n.x+1&&Math.min(a.x,b.x)<n.x+n.width-1&&Math.max(a.y,b.y)>n.y+1&&Math.min(a.y,b.y)<n.y+n.height-1)hits++
      }
    }
  }
  const frame=Math.max(b.width,b.height*ratio)*Math.max(b.height,b.width/ratio)
  return {hits,cost:Math.sqrt(frame)*8+length/Math.max(1,schema.relations.length)*2+bends/Math.max(1,schema.relations.length)*28}
}
function components(schema:UmlSchema):UmlSchema[] {
  const adjacent=new Map(schema.tables.map(t=>[t.id,new Set<string>()]))
  for(const r of schema.relations){adjacent.get(r.parentTable)!.add(r.childTable);adjacent.get(r.childTable)!.add(r.parentTable)}
  const seen=new Set<string>(),result:UmlSchema[]=[]
  for(const t of schema.tables){
    if(seen.has(t.id))continue
    const ids=[t.id];seen.add(t.id)
    for(let i=0;i<ids.length;i++)for(const id of adjacent.get(ids[i])!)if(!seen.has(id)){seen.add(id);ids.push(id)}
    const set=new Set(ids);result.push({tables:schema.tables.filter(t=>set.has(t.id)),relations:schema.relations.filter(r=>set.has(r.childTable))})
  }
  return result
}
type Sides=Map<string,{child:'left'|'right';parent:'left'|'right'}>
function graphOf(schema:UmlSchema,direction:'RIGHT'|'DOWN',sides?:Sides):ElkNode {
  const tables=new Map(schema.tables.map(t=>[t.id,t])),sizes=new Map(schema.tables.map(t=>[t.id,tableSize(t)])),reserved=new Set([...tables.keys(),...schema.relations.map(r=>r.id)]),portIds=new Map<string,string>()
  let root='uml';while(reserved.has(root))root+=':';reserved.add(root)
  // Relations attached to the same column/side share one port, rather than
  // introducing several overlapping fixed ports. Edges remain independent.
  const port=(r:UmlRelation,end:'parent'|'child')=>{const t=tables.get(end==='parent'?r.parentTable:r.childTable)!,side=sides!.get(r.id)![end],y=row(t,end==='parent'?r.parentColumns:r.childColumns),key=JSON.stringify(['port',t.id,side,y]);let id=portIds.get(key);if(!id){id=key;while(reserved.has(id))id='port:'+id;reserved.add(id);portIds.set(key,id)}return {id,x:side==='left'?0:sizes.get(t.id)!.width,y,width:0,height:0,layoutOptions:{'elk.port.side':side==='left'?'WEST':'EAST'}}}
  return {id:root,layoutOptions:{'elk.algorithm':'layered','elk.direction':direction,'elk.edgeRouting':'ORTHOGONAL','elk.spacing.nodeNode':'85','elk.spacing.edgeNode':'35','elk.spacing.edgeEdge':'18','elk.layered.spacing.nodeNodeBetweenLayers':'140','elk.layered.spacing.edgeNodeBetweenLayers':'38','elk.layered.spacing.edgeEdgeBetweenLayers':'18','elk.layered.nodePlacement.strategy':'BRANDES_KOEPF','elk.layered.nodePlacement.bk.fixedAlignment':'BALANCED','elk.layered.mergeEdges':'false'},
    children:schema.tables.map(t=>{const size=sizes.get(t.id)!;return {id:t.id,...size,...(sides?{layoutOptions:{'elk.portConstraints':'FIXED_POS'},ports:[...new Map(schema.relations.flatMap(r=>(['parent','child'] as const).flatMap(end=>{
      if((end==='parent'?r.parentTable:r.childTable)!==t.id)return []
      const p=port(r,end);return [[p.id,p] as const]
    }))).values()]}: {})}}),edges:schema.relations.map(r=>({id:r.id,sources:[sides?port(r,'parent').id:r.parentTable],targets:[sides?port(r,'child').id:r.childTable]}))}
}
async function layoutComponent(elk:InstanceType<typeof ELK>,source:UmlSchema,direction:'RIGHT'|'DOWN') {
  // Choose sides from a provisional layout, then solve tables and column
  // routes together. Keep the second pass's bends instead of routing again.
  const coarse=await elk.layout(graphOf(source,direction)),positions=new Map(coarse.children!.map(n=>[n.id,n])),sides:Sides=new Map()
  source.relations.forEach((r,i)=>{const a=positions.get(r.childTable)!,b=positions.get(r.parentTable)!,delta=(a.x!+a.width!/2)-(b.x!+b.width!/2)
    sides.set(r.id,r.childTable===r.parentTable?{child:'right',parent:'right'}:Math.abs(delta)<Math.min(a.width!,b.width!)*.6?{child:i%2?'right':'left',parent:i%2?'right':'left'}:delta>0?{child:'left',parent:'right'}:{child:'right',parent:'left'})
  })
  const result=await elk.layout(graphOf(source,direction,sides)),schema=structuredClone(source),tables=new Map(schema.tables.map(t=>[t.id,t])),sizes=new Map(schema.tables.map(t=>[t.id,tableSize(t)]))
  for(const t of schema.tables){const n=result.children?.find(n=>n.id===t.id);if(!n||!Number.isFinite(n.x)||!Number.isFinite(n.y))throw new Error('Falta una tabla en la distribución.');t.x=n.x!;t.y=n.y!}
  for(const r of schema.relations){
    const edge=result.edges?.find(e=>e.id===r.id),section=edge?.sections?.[0]
    if(!section||edge!.sections!.length!==1)throw new Error('No se obtuvo un recorrido completo entre columnas.')
    const raw=[section.startPoint,...section.bendPoints??[],section.endPoint].reverse(),side=sides.get(r.id)!,child=tables.get(r.childTable)!,parent=tables.get(r.parentTable)!
    const start={x:child.x+(side.child==='left'?0:sizes.get(child.id)!.width),y:child.y+row(child,r.childColumns)},end={x:parent.x+(side.parent==='left'?0:sizes.get(parent.id)!.width),y:parent.y+row(parent,r.parentColumns)}
    if(distance(raw[0],start)>.1||distance(raw.at(-1)!,end)>.1)throw new Error('Los extremos calculados no coinciden con sus columnas.')
    const points=simplifyPolyline([start,...raw.slice(1,-1),end])
    if(points.length<2||points.some((p,i)=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||i>0&&Math.abs(p.x-points[i-1].x)>.01&&Math.abs(p.y-points[i-1].y)>.01))throw new Error('El recorrido calculado no es ortogonal.')
    r.mode='orthogonal';r.sourceSide=side.child;r.targetSide=side.parent;r.controls={source:{x:0,y:0},target:{x:0,y:0}};r.orthogonal={axis:'x',offset:0,kind:'multi'};r.autoRoute={source:start,target:end,points}
  }
  return schema
}
function pack(groups:UmlSchema[]) {
  const blocks=groups.map(schema=>({schema,box:bounds(schema)})).sort((a,b)=>b.box.width*b.box.height-a.box.width*a.box.height)
  const area=blocks.reduce((a,b)=>a+(b.box.width+gap)*(b.box.height+gap),0),minWidth=Math.max(...blocks.map(b=>b.box.width)),base=Math.max(minWidth,Math.sqrt(area*ratio))
  let best:{cost:number;positions:{x:number;y:number}[]}|undefined
  for(const limit of [minWidth,base,base*1.3]){
    let x=0,y=0,rowHeight=0,width=0;const positions:{x:number;y:number}[]=[]
    for(const block of blocks){if(x&&x+block.box.width>limit){y+=rowHeight+gap;x=0;rowHeight=0}positions.push({x,y});width=Math.max(width,x+block.box.width);rowHeight=Math.max(rowHeight,block.box.height);x+=block.box.width+gap}
    const height=y+rowHeight,cost=Math.max(width,height*ratio)*Math.max(height,width/ratio)
    if(!best||cost<best.cost)best={cost,positions}
  }
  blocks.forEach((block,i)=>{const dx=best!.positions[i].x-block.box.x+35,dy=best!.positions[i].y-block.box.y+35
    for(const t of block.schema.tables){t.x+=dx;t.y+=dy}
    for(const r of block.schema.relations)if(r.autoRoute)r.autoRoute={source:{x:r.autoRoute.source.x+dx,y:r.autoRoute.source.y+dy},target:{x:r.autoRoute.target.x+dx,y:r.autoRoute.target.y+dy},points:r.autoRoute.points.map(p=>({x:p.x+dx,y:p.y+dy}))}
  })
}
export async function layoutUml(schema:UmlSchema) {
  const elk=new ELK({workerFactory:()=>new ElkWorker()})
  try {
    const arranged:UmlSchema[]=[]
    for(const group of components(schema)){
      if(!group.relations.length){const copy=structuredClone(group);copy.tables.forEach(t=>{t.x=0;t.y=0});arranged.push(copy);continue}
      let best:UmlSchema|undefined,bestScore:{hits:number;cost:number}|undefined,lastError:unknown
      for(const direction of group.tables.length<4?['RIGHT'] as const:['RIGHT','DOWN'] as const){
        try{const candidate=await layoutComponent(elk,group,direction),value=score(candidate);if(!bestScore||value.hits<bestScore.hits||value.hits===bestScore.hits&&value.cost<bestScore.cost){best=candidate;bestScore=value}}
        catch(error){lastError=error}
      }
      if(!best)throw lastError??new Error('No se pudo distribuir un grupo de tablas.')
      arranged.push(best)
    }
    pack(arranged)
    const tables=new Map(arranged.flatMap(g=>g.tables).map(t=>[t.id,t])),relations=new Map(arranged.flatMap(g=>g.relations).map(r=>[r.id,r]))
    schema.tables=schema.tables.map(t=>tables.get(t.id)!);schema.relations=schema.relations.map(r=>relations.get(r.id)!)
    return {obstructed:score(schema).hits}
  } finally {elk.terminateWorker()}
}
