import type { DfdEdge, Point, UmlRelation } from '../model'
import { roundedPolylineSegments } from '../orthogonal'

const near=(a:Point,b:Point)=>Math.abs(a.x-b.x)<.001&&Math.abs(a.y-b.y)<.001
export function simplifyPolyline(points:Point[]) {
  const result:Point[]=[]
  for(const p of points) {
    if(result.length&&near(result.at(-1)!,p))continue
    while(result.length>1) {
      const a=result.at(-2)!,b=result.at(-1)!,cross=(b.x-a.x)*(p.y-b.y)-(b.y-a.y)*(p.x-b.x),dot=(b.x-a.x)*(p.x-b.x)+(b.y-a.y)*(p.y-b.y)
      if(Math.abs(cross)>.001||dot<0)break
      result.pop()
    }
    result.push({...p})
  }
  return result
}
// Retain the computed channels during manual moves. Only the terminal bridges
// follow moved tables; no collective routing is run while drawing or opening.
export function relationRoutePoints(r:UmlRelation,start:Point,end:Point):Point[] {
  const route=r.autoRoute!
  if(near(start,route.source)&&near(end,route.target))return route.points
  const ds={x:start.x-route.source.x,y:start.y-route.source.y},dt={x:end.x-route.target.x,y:end.y-route.target.y}
  if(near(ds,dt))return route.points.map(p=>({x:p.x+ds.x,y:p.y+ds.y}))
  const sx=start.x+(r.sourceSide==='left'?-32:32),tx=end.x+(r.targetSide==='left'?-32:32),inside=route.points.slice(1,-1)
  if(!inside.length) {const lane=(sx+tx)/2;return simplifyPolyline([start,{x:sx,y:start.y},{x:lane,y:start.y},{x:lane,y:end.y},{x:tx,y:end.y},end])}
  const first=inside[0],last=inside.at(-1)!
  return simplifyPolyline([start,...(near(start,route.source)?[]:[{x:sx,y:start.y},{x:sx,y:first.y}]),...inside,...(near(end,route.target)?[]:[{x:tx,y:last.y},{x:tx,y:end.y}]),end])
}
export function automaticRouteEdge(e:DfdEdge,r:UmlRelation,start:Point,end:Point):DfdEdge {
  const segments=roundedPolylineSegments(relationRoutePoints(r,start,end),r.cornerRadius??12),first=segments[0],last=segments.at(-1)!
  const sub=(a:Point,b:Point)=>({x:a.x-b.x,y:a.y-b.y})
  return {...e,mode:'curve',controls:{source:sub(first.c1,start),target:sub(last.c2,end)},generatedRoute:segments.slice(0,-1).map((s,i)=>{
    const t=(i+1)/segments.length,base={x:start.x+(end.x-start.x)*t,y:start.y+(end.y-start.y)*t}
    return {t,offset:sub(s.end,base),incoming:sub(s.c2,s.end),outgoing:sub(segments[i+1].c1,s.end)}
  })}
}
