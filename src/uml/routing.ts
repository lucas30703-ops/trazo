import type { DfdEdge, DfdNode, Point, UmlSchema, UmlRelation } from '../model'
import { edgePoints } from '../geometry'
import { orthogonalRoute } from '../orthogonal'
import { umlDiagram } from './geometry'
import { relationRoutePoints } from './route'

type Side = 'left' | 'right'
const distance=(a:Point,b:Point)=>Math.abs(b.x-a.x)+Math.abs(b.y-a.y)
function intersectsTable(a:Point,b:Point,n:DfdNode) {
  const gap=14
  return Math.max(a.x,b.x)>n.x-gap+.01 && Math.min(a.x,b.x)<n.x+n.width+gap-.01
    && Math.max(a.y,b.y)>n.y-gap+.01 && Math.min(a.y,b.y)<n.y+n.height+gap-.01
}
function interference(a:Point,b:Point,c:Point,d:Point) {
  const h=Math.abs(a.y-b.y)<.01, otherH=Math.abs(c.y-d.y)<.01
  if(h===otherH) {
    const axis=h?'x':'y',normal=h?'y':'x'
    if(Math.abs(a[normal]-c[normal])>4)return 0
    const overlap=Math.min(Math.max(a[axis],b[axis]),Math.max(c[axis],d[axis]))-Math.max(Math.min(a[axis],b[axis]),Math.min(c[axis],d[axis]))
    const sharedEnd=Math.min(distance(a,c),distance(a,d),distance(b,c),distance(b,d))<.01
    const avoidable=overlap-(sharedEnd?36:0)
    return avoidable>8?100+avoidable*1.5:0
  }
  const x=h?c.x:a.x,y=h?a.y:c.y
  const inside=(v:number,p:number,q:number)=>v>Math.min(p,q)+3 && v<Math.max(p,q)-3
  return (h?inside(x,a.x,b.x)&&inside(y,c.y,d.y):inside(x,c.x,d.x)&&inside(y,a.y,b.y))?200:0
}

// Bounded search within the existing two-lane orthogonal representation.
// Only explicit actions/import call this function; drawing never rewrites routes.
export function arrangeRelations(schema:UmlSchema, ids?:string[]) {
  let obstructed=0
  const wanted=ids?new Set(ids):null
  for(const r of schema.relations)if(!wanted||wanted.has(r.id))delete r.autoRoute
  const relations=new Map(schema.relations.map(r=>[r.id,r]))
  const d=umlDiagram(schema),indices=new Map(d.edges.map((e,i)=>[e.id,i]))
  const centers=new Map(d.edges.map(e=>{const ends=edgePoints(e,d);return [e.id,{x:(ends.start.x+ends.end.x)/2,y:(ends.start.y+ends.end.y)/2}] as const}))
  for(const relation of schema.relations) {
    if(wanted&&!wanted.has(relation.id))continue
    const index=indices.get(relation.id)!,original=d.edges[index],center=centers.get(relation.id)!
    const peerPaths=d.edges.filter(e=>e.id!==relation.id&&(e.mode!=='curve'||relations.get(e.id)?.autoRoute))
      .sort((a,b)=>distance(centers.get(a.id)!,center)-distance(centers.get(b.id)!,center))
      .slice(0,32).map(e=>{const ends=edgePoints(e,d),r=relations.get(e.id)!;if(r.autoRoute)return relationRoutePoints(r,ends.start,ends.end);if(e.mode==='orthogonal')return orthogonalRoute(e,d).points;return [ends.start,ends.end]})
    const sourceSides:Side[]=relation.sourceSide?[relation.sourceSide]:['left','right']
    const targetSides:Side[]=relation.targetSide?[relation.targetSide]:['left','right']
    let best:{hits:number;cost:number;sourceSide:Side;targetSide:Side;config:NonNullable<UmlRelation['orthogonal']>}|undefined
    const evaluate=(e:DfdEdge,sourceSide:Side,targetSide:Side,config:NonNullable<UmlRelation['orthogonal']>)=>{
      const points=orthogonalRoute({...e,orthogonal:config},d).points,blocked=new Set<string>()
      let cost=points.length*16
      for(let i=1;i<points.length;i++) {
        const a=points[i-1],b=points[i];cost+=distance(a,b)
        for(const n of d.nodes) {
          if((i===1&&n.id===e.source.nodeId)||(i===points.length-1&&n.id===e.target.nodeId))continue
          if(intersectsTable(a,b,n))blocked.add(n.id)
        }
        if(i>1) {const prev=points[i-2];if((a.x-prev.x)*(b.x-a.x)+(a.y-prev.y)*(b.y-a.y)<0)cost+=500}
        for(const peer of peerPaths)for(let j=1;j<peer.length;j++)cost+=interference(a,b,peer[j-1],peer[j])
      }
      const hits=blocked.size
      if(!best||hits<best.hits||(hits===best.hits&&cost<best.cost-.01))best={hits,cost,sourceSide,targetSide,config}
    }
    for(const sourceSide of sourceSides)for(const targetSide of targetSides) {
      const e:DfdEdge={...original,mode:'orthogonal',source:{...original.source,anchor:{...original.source.anchor,kind:'side',side:sourceSide,t:original.source.anchor.kind==='side'?original.source.anchor.t:.5}},target:{...original.target,anchor:{...original.target.anchor,kind:'side',side:targetSide,t:original.target.anchor.kind==='side'?original.target.anchor.t:.5}}}
      if(relation.mode==='orthogonal'&&original.source.anchor.kind==='side'&&original.target.anchor.kind==='side'&&sourceSide===original.source.anchor.side&&targetSide===original.target.anchor.side&&relation.orthogonal)evaluate(e,sourceSide,targetSide,relation.orthogonal)
      const ends=edgePoints(e,d)
      for(const axis of ['x','y'] as const) {
        const sourceExit={x:ends.start.x+(sourceSide==='left'?-32:32),y:ends.start.y},targetExit={x:ends.end.x+(targetSide==='left'?-32:32),y:ends.end.y}
        const middle=(sourceExit[axis]+targetExit[axis])/2,size=axis==='x'?'width':'height',gap=48+(schema.relations.indexOf(relation)%6)*10
        const boundaries=d.nodes.flatMap(n=>[n[axis]-gap,n[axis]+n[size]+gap])
        const lanes=[middle,...boundaries.sort((a,b)=>Math.abs(a-middle)-Math.abs(b-middle)).slice(0,14),Math.min(...boundaries),Math.max(...boundaries)]
        for(const lane of new Set(lanes))evaluate(e,sourceSide,targetSide,{axis,offset:lane-middle,kind:'multi'})
      }
    }
    if(best) {
      const choice=best as {hits:number;sourceSide:Side;targetSide:Side;config:NonNullable<UmlRelation['orthogonal']>}
      relation.mode='orthogonal';relation.sourceSide=choice.sourceSide;relation.targetSide=choice.targetSide;relation.orthogonal=choice.config
      d.edges[index]={...original,mode:'orthogonal',orthogonal:choice.config,source:{...original.source,anchor:{kind:'side',side:choice.sourceSide,t:original.source.anchor.kind==='side'?original.source.anchor.t:.5}},target:{...original.target,anchor:{kind:'side',side:choice.targetSide,t:original.target.anchor.kind==='side'?original.target.anchor.t:.5}}}
      if(choice.hits)obstructed++
    }
  }
  return {obstructed}
}
