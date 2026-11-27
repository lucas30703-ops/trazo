import type { Anchor, DfdEdge, DfdNode, Diagram, Point } from './model'

export interface CubicSegment { start:Point;c1:Point;c2:Point;end:Point }
const add=(a:Point,b:Point):Point=>({x:a.x+b.x,y:a.y+b.y})
const sub=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y})
const scale=(p:Point,k:number):Point=>({x:p.x*k,y:p.y*k})
const dist=(a:Point,b:Point)=>Math.hypot(a.x-b.x,a.y-b.y)
const mix=(a:Point,b:Point,t:number)=>add(a,scale(sub(b,a),t))
function port(n:DfdNode,a:Anchor) {
  const p=a.kind==='angle' ? {x:n.x+n.width/2+Math.cos(a.value)*n.width/2,y:n.y+n.height/2+Math.sin(a.value)*n.height/2}
    : a.side==='top'||a.side==='bottom' ? {x:n.x+n.width*a.t,y:n.y+(a.side==='bottom'?n.height:0)} : {x:n.x+(a.side==='right'?n.width:0),y:n.y+n.height*a.t}
  const normal=a.kind==='angle' ? (Math.abs(Math.cos(a.value))>=Math.abs(Math.sin(a.value)) ? {x:Math.sign(Math.cos(a.value)),y:0}:{x:0,y:Math.sign(Math.sin(a.value))})
    : {x:a.side==='left'?-1:a.side==='right'?1:0,y:a.side==='top'?-1:a.side==='bottom'?1:0}
  return {p,normal,exit:add(p,scale(normal,32))}
}
function simplify(points:Point[]) {
  const result:Point[]=[]
  for(const p of points) {
    if(result.length && dist(result[result.length-1],p)<.001)continue
    while(result.length>1) {
      const a=sub(result[result.length-1],result[result.length-2]),b=sub(p,result[result.length-1])
      if(Math.abs(a.x*b.y-a.y*b.x)>.001 || a.x*b.x+a.y*b.y<0)break
      result.pop()
    }
    result.push(p)
  }
  return result
}
function route(e:DfdEdge,d:Diagram,config:NonNullable<DfdEdge['orthogonal']>) {
  const source=d.nodes.find(n=>n.id===e.source.nodeId)!,target=d.nodes.find(n=>n.id===e.target.nodeId)!
  const a=port(source,e.source.anchor),b=port(target,e.target.anchor),axis=config.axis
  if(config.kind==='elbow') {
    const corner=axis==='x'?{x:b.p.x,y:a.p.y}:{x:a.p.x,y:b.p.y}
    return {points:simplify([a.p,corner,b.p]),spine:{start:corner,end:corner},axis,source,target}
  }
  const lane=(a.exit[axis]+b.exit[axis])/2+config.offset
  let first=axis==='x'?{x:lane,y:a.exit.y}:{x:a.exit.x,y:lane}
  let last=axis==='x'?{x:lane,y:b.exit.y}:{x:b.exit.x,y:lane}
  let middle=[first,last]
  if(dist(a.exit,b.exit)<.001) {
    // Coincident ports need a loop instead of a zero-length out-and-back path.
    const sideways={x:-a.normal.y,y:a.normal.x},width=Math.max(48,Math.abs(config.offset))
    first=add(a.exit,scale(sideways,width));last=add(first,scale(a.normal,48))
    middle=[first,last,add(a.exit,scale(a.normal,48))]
  }
  return {points:simplify([a.p,a.exit,...middle,b.exit,b.p]),spine:{start:first,end:last},axis,source,target}
}
function crosses(a:Point,b:Point,n:DfdNode) {
  const x=Math.max(Math.min(a.x,b.x),Math.min(n.x+n.width/2,Math.max(a.x,b.x)))
  const y=Math.max(Math.min(a.y,b.y),Math.min(n.y+n.height/2,Math.max(a.y,b.y)))
  return n.kind==='process' ? ((x-n.x-n.width/2)/(n.width/2))**2+((y-n.y-n.height/2)/(n.height/2))**2<.999
    : Math.max(a.x,b.x)>n.x+.01 && Math.min(a.x,b.x)<n.x+n.width-.01 && Math.max(a.y,b.y)>n.y+.01 && Math.min(a.y,b.y)<n.y+n.height-.01
}
export function defaultOrthogonal(e:DfdEdge,d:Diagram,kind:'elbow'|'multi'='multi'):NonNullable<DfdEdge['orthogonal']> {
  const s=d.nodes.find(n=>n.id===e.source.nodeId)!,t=d.nodes.find(n=>n.id===e.target.nodeId)!
  const source=port(s,e.source.anchor),target=port(t,e.target.anchor),a=source.exit,b=target.exit
  if(kind==='elbow') {
    return (['x','y'] as const).map(axis=>{
      const config={axis,offset:0,kind},points=route(e,d,config).points
      let hits=0
      for(let i=1;i<points.length;i++) {
        if(crosses(points[i-1],points[i],s))hits++
        if(crosses(points[i-1],points[i],t))hits++
      }
      const departure=sub(points[1]??source.p,source.p),arrival=sub(points.at(-2)??target.p,target.p)
      const alignment=(departure.x*source.normal.x+departure.y*source.normal.y)/(Math.hypot(departure.x,departure.y)||1)+(arrival.x*target.normal.x+arrival.y*target.normal.y)/(Math.hypot(arrival.x,arrival.y)||1)
      return {config,hits,alignment}
    }).sort((a,b)=>a.hits-b.hits||b.alignment-a.alignment)[0].config
  }
  const configs:NonNullable<DfdEdge['orthogonal']>[]=[]
  for(const axis of (Math.abs(a.y-b.y)<.001 ? ['y','x'] : ['x','y']) as ('x'|'y')[]) {
    const size=axis==='x'?'width':'height',mid=(a[axis]+b[axis])/2
    for(const lane of [mid,Math.min(s[axis],t[axis],a[axis],b[axis])-48,Math.max(s[axis]+s[size],t[axis]+t[size],a[axis],b[axis])+48]) configs.push({axis,offset:lane-mid,kind})
  }
  return configs.map(config=>{
    const {points}=route(e,d,config)
    let hits=0,length=0
    for(let i=1;i<points.length;i++) {
      length+=dist(points[i-1],points[i])
      if(i>1&&crosses(points[i-1],points[i],s))hits++
      if(i<points.length-1&&crosses(points[i-1],points[i],t))hits++
      if(i>1) {const u=sub(points[i-1],points[i-2]),v=sub(points[i],points[i-1]);if(u.x*v.x+u.y*v.y<0)hits++}
    }
    return {config,hits,cost:length+points.length*24}
  }).sort((a,b)=>a.hits-b.hits||a.cost-b.cost)[0].config
}
export function orthogonalRoute(e:DfdEdge,d:Diagram) { return route(e,d,e.orthogonal??defaultOrthogonal(e,d)) }
function cornerCapacity(points:Point[],i:number) {
  const a=points[i-1],p=points[i],b=points[i+1],incoming=sub(p,a),outgoing=sub(b,p)
  return Math.abs(incoming.x*outgoing.y-incoming.y*outgoing.x)<.001?0:Math.min(dist(a,p)/(i>1?2:1),dist(p,b)/(i<points.length-2?2:1))
}
// The last corner to saturate defines the end of the useful radius range.
export function orthogonalRadiusLimit(e:DfdEdge,d:Diagram) {
  const {points}=orthogonalRoute(e,d)
  let limit=0
  for(let i=1;i<points.length-1;i++)limit=Math.max(limit,cornerCapacity(points,i))
  return limit
}
export function orthogonalSegments(e:DfdEdge,d:Diagram):CubicSegment[] {
  return roundedPolylineSegments(orthogonalRoute(e,d).points,e.cornerRadius??12)
}
export function roundedPolylineSegments(points:Point[],radius=12):CubicSegment[] {
  const result:CubicSegment[]=[]
  const line=(start:Point,end:Point)=>{if(dist(start,end)>.00001)result.push({start,c1:mix(start,end,1/3),c2:mix(start,end,2/3),end})}
  let cursor=points[0]
  for(let i=1;i<points.length-1;i++) {
    const a=points[i-1],p=points[i],b=points[i+1],incoming=sub(p,a),outgoing=sub(b,p)
    const r=Math.min(radius,cornerCapacity(points,i))
    if(!r){line(cursor,p);cursor=p;continue}
    const u=scale(incoming,1/dist(a,p)),v=scale(outgoing,1/dist(p,b)),start=add(p,scale(u,-r)),end=add(p,scale(v,r))
    line(cursor,start)
    result.push({start,c1:add(start,scale(u,r*.5522847498)),c2:add(end,scale(v,-r*.5522847498)),end});cursor=end
  }
  line(cursor,points[points.length-1])
  return result.length?result:[{start:cursor,c1:cursor,c2:cursor,end:cursor}]
}
