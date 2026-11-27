import type { Anchor, DfdEdge, DfdNode, Diagram, Point, Project } from './model'
import { anchorPoint, clamp, distance, edgeSegments, edgeVisual, headingLayout, labelTForGeneratedRoute, lerp, nodeTextLayout, pointOnEdge, processNumberStyle, sub, textWidth } from './geometry'
import { curveBoxesOverlap, curvePairMetrics, roundCandidates } from './round-curves'
import { footprintsOverlap, labelFootprint, pathTouchesFootprint, rectangleFootprint, type Footprint } from './route-footprints'

type Rect = { left: number; top: number; right: number; bottom: number }
type Segment = { start: Point; c1: Point; c2: Point; end: Point }
type PathObstacle = { points: Point[]; box: Rect }
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x
const unit = (a: Point) => { const length = Math.hypot(a.x, a.y) || 1; return { x: a.x / length, y: a.y / length } }
const along = (p: Point, v: Point, amount: number): Point => ({ x: p.x + v.x * amount, y: p.y + v.y * amount })
const inflate = (r: Rect, pad: number): Rect => ({ left: r.left - pad, top: r.top - pad, right: r.right + pad, bottom: r.bottom + pad })
const inside = (p: Point, r: Rect) => p.x > r.left + .01 && p.x < r.right - .01 && p.y > r.top + .01 && p.y < r.bottom - .01
function nodeRect(node: DfdNode): Rect {
  const text = nodeTextLayout(node), half = text.lines.length * node.font.fontSize * 1.35 / 2
  const numberHalf = node.kind === 'process' && node.number ? textWidth(node.number, processNumberStyle(node)) / 2 : 0
  return { left: Math.min(node.x, node.x + node.width / 2 - numberHalf), top: Math.min(node.y, node.y + text.centerY - half), right: Math.max(node.x + node.width, node.x + node.width / 2 + numberHalf), bottom: Math.max(node.y + node.height, node.y + text.centerY + half) }
}
function intersects(a: Point, b: Point, r: Rect) {
  let low = 0, high = 1
  for (const [origin, delta, min, max] of [[a.x, b.x - a.x, r.left + .01, r.right - .01], [a.y, b.y - a.y, r.top + .01, r.bottom - .01]]) {
    if (Math.abs(delta) < 1e-9) { if (origin <= min || origin >= max) return false }
    else { let t1 = (min - origin) / delta, t2 = (max - origin) / delta; if (t1 > t2) [t1, t2] = [t2, t1]; low = Math.max(low, t1); high = Math.min(high, t2); if (low >= high) return false }
  }
  return high > 0 && low < 1
}
function crosses(a: Point, b: Point, c: Point, d: Point) {
  const ab = sub(b, a), cd = sub(d, c), denominator = cross(ab, cd)
  if (Math.abs(denominator) < 1e-6) return false
  const t = cross(sub(c, a), cd) / denominator, u = cross(sub(c, a), ab) / denominator
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}
function nearParallel(a: Point, b: Point, c: Point, d: Point) {
  const ab = unit(sub(b, a)), cd = unit(sub(d, c))
  if (Math.abs(ab.x * cd.x + ab.y * cd.y) < .85) return false
  const point = lerp(a, b, .5), line = sub(d, c), lengthSquared = line.x ** 2 + line.y ** 2
  const t = clamp(((point.x - c.x) * line.x + (point.y - c.y) * line.y) / (lengthSquared || 1), 0, 1)
  return distance(point, lerp(c, d, t)) < 8
}
function normal(node: DfdNode, anchor: Anchor): Point {
  if (anchor.kind === 'angle') return unit({ x: Math.cos(anchor.value) / node.width, y: Math.sin(anchor.value) / node.height })
  return anchor.side === 'top' ? { x: 0, y: -1 } : anchor.side === 'bottom' ? { x: 0, y: 1 } : anchor.side === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 }
}
function anchorNormals(node: DfdNode, anchor: Anchor): Point[] {
  const result = [normal(node, anchor)]
  if (anchor.kind === 'side') {
    const horizontal = anchor.side === 'top' || anchor.side === 'bottom', length = horizontal ? node.width : node.height
    // At a corner either adjoining exterior half-plane is valid; collision checks still apply.
    if (anchor.t * length <= .5) result.push(horizontal ? { x: -1, y: 0 } : { x: 0, y: -1 })
    if ((1 - anchor.t) * length <= .5) result.push(horizontal ? { x: 1, y: 0 } : { x: 0, y: 1 })
  }
  return result
}
function exitPoint(p: Point, direction: Point, r: Rect) {
  const xs = direction.x > 1e-8 ? (r.right - p.x) / direction.x : direction.x < -1e-8 ? (r.left - p.x) / direction.x : Infinity
  const ys = direction.y > 1e-8 ? (r.bottom - p.y) / direction.y : direction.y < -1e-8 ? (r.top - p.y) / direction.y : Infinity
  return along(p, direction, Math.max(0, Math.min(xs, ys)) + 2)
}
function terminalHit(a: Point, b: Point, node: DfdNode) {
  if (node.kind !== 'process') return intersects(a, b, inflate({ left: node.x, top: node.y, right: node.x + node.width, bottom: node.y + node.height }, -.05))
  const x = (a.x - node.x - node.width / 2) / (node.width / 2), y = (a.y - node.y - node.height / 2) / (node.height / 2)
  const dx = (b.x - a.x) / (node.width / 2), dy = (b.y - a.y) / (node.height / 2)
  const t = clamp(-(x * dx + y * dy) / (dx * dx + dy * dy || 1), 0, 1)
  return (x + dx * t) ** 2 + (y + dy * t) ** 2 < .9999
}
function flatten(segments: Segment[]) {
  const points: Point[] = [segments[0].start]
  const split = (s: Segment, depth: number) => {
    const line = sub(s.end, s.start), length = Math.hypot(line.x, line.y)
    const flatness = length ? Math.max(Math.abs(cross(sub(s.c1, s.start), line)), Math.abs(cross(sub(s.c2, s.start), line))) / length : Math.max(distance(s.start, s.c1), distance(s.start, s.c2))
    const netLength = distance(s.start, s.c1) + distance(s.c1, s.c2) + distance(s.c2, s.end)
    if ((flatness <= .25 && netLength <= length + .25) || depth >= 12) { points.push(s.end); return }
    const a = lerp(s.start, s.c1, .5), b = lerp(s.c1, s.c2, .5), c = lerp(s.c2, s.end, .5), ab = lerp(a, b, .5), bc = lerp(b, c, .5), middle = lerp(ab, bc, .5)
    split({ start: s.start, c1: a, c2: ab, end: middle }, depth + 1); split({ start: middle, c1: bc, c2: c, end: s.end }, depth + 1)
  }
  segments.forEach(segment => split(segment, 0)); return points
}
function storeSegments(edge: DfdEdge, segments: Segment[]) {
  const start = segments[0].start, end = segments.at(-1)!.end
  edge.controls = { source: sub(segments[0].c1, start), target: sub(segments.at(-1)!.c2, end) }
  edge.waypoints = [];
  edge.generatedRoute = segments.slice(0, -1).map((segment, index) => {
    const t = (index + 1) / segments.length, point = segment.end
    return { t, offset: sub(point, lerp(start, end, t)), incoming: sub(segment.c2, point), outgoing: sub(segments[index + 1].c1, point) }
  })
}
class Scene {
  source: DfdNode; target: DfdNode
  boxes: Rect[]; labels: Rect[]; labelShapes: Footprint[]; nodeShapes: Footprint[]; paths: PathObstacle[]; start: Point; end: Point
  constructor(readonly edge: DfdEdge, readonly diagram: Diagram, readonly clearance: number) {
    this.source = diagram.nodes.find(node => node.id === edge.source.nodeId)!; this.target = diagram.nodes.find(node => node.id === edge.target.nodeId)!
    this.start = anchorPoint(this.source, edge.source.anchor); this.end = anchorPoint(this.target, edge.target.anchor)
    this.boxes = diagram.nodes.filter(node => node.id !== this.source.id && node.id !== this.target.id).map(node => inflate(nodeRect(node), clearance + .5 + (node.strokeWidth + edge.strokeWidth) / 2))
    this.nodeShapes = diagram.nodes.map(node => rectangleFootprint(inflate(nodeRect(node), 3 + node.strokeWidth / 2)))
    if (diagram.heading?.position && diagram.heading.mode !== 'hidden') { const h = headingLayout(diagram); if (h) { const box = { left: h.x, top: h.y, right: h.x + h.width, bottom: h.y + h.height }; this.boxes.push(inflate(box, clearance)); this.nodeShapes.push(rectangleFootprint(inflate(box, 3))) } }
    const others = diagram.edges.filter(other => other.id !== edge.id)
    this.labelShapes = others.map(other => labelFootprint(other, diagram, 5)).filter((shape): shape is Footprint => !!shape)
    this.labels = this.labelShapes.map(shape => shape.box)
    this.paths = others.map(other => {
      const points = other.mode === 'curve' ? flatten(edgeSegments(other, diagram)) : [pointOnEdge(other, diagram, 0), pointOnEdge(other, diagram, 1)]
      return { points, box: inflate({ left: Math.min(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), right: Math.max(...points.map(p => p.x)), bottom: Math.max(...points.map(p => p.y)) }, 8) }
    })
  }
  blocked(a: Point, b: Point) {
    const others=this.diagram.nodes.filter(n=>n.id!==this.source.id&&n.id!==this.target.id)
    return this.boxes.some((box,i)=>{
      if(!intersects(a,b,box))return false
      const node=others[i]
      if(!node||node.kind!=='process')return true
      const bounds=nodeRect(node)
      if(bounds.left<node.x||bounds.right>node.x+node.width||bounds.top<node.y||bounds.bottom>node.y+node.height)return true
      const pad=this.clearance+.5+(node.strokeWidth+this.edge.strokeWidth)/2
      const rx=node.width/2+pad,ry=node.height/2+pad
      const x=(a.x-node.x-node.width/2)/rx,y=(a.y-node.y-node.height/2)/ry,dx=(b.x-a.x)/rx,dy=(b.y-a.y)/ry
      const t=clamp(-(x*dx+y*dy)/(dx*dx+dy*dy||1),0,1)
      return (x+dx*t)**2+(y+dy*t)**2<=1
    })||terminalHit(a,b,this.source)||terminalHit(a,b,this.target)
  }
  overlaps(a: Point, b: Point, path: PathObstacle) {
    if (Math.max(a.x, b.x) < path.box.left || Math.min(a.x, b.x) > path.box.right || Math.max(a.y, b.y) < path.box.top || Math.min(a.y, b.y) > path.box.bottom) return false
    const middle = lerp(a, b, .5)
    if ([this.start, this.end].some(p => distance(middle, p) < 8 && (distance(p, path.points[0]) < .5 || distance(p, path.points.at(-1)!) < .5))) return false
    for (let i = 1; i < path.points.length; i++) if (crosses(a, b, path.points[i - 1], path.points[i]) || nearParallel(a, b, path.points[i - 1], path.points[i])) return true
    return false
  }
  softCost(a: Point, b: Point) {
    return this.labels.filter(box => intersects(a, b, box)).length * 180 + this.paths.filter(path => this.overlaps(a, b, path)).length * 90
  }
  assess(segments: Segment[]) {
    const points = flatten(segments); let length = 0, hits = 0
    const labels = new Set<number>(), paths = new Set<number>()
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i]; length += distance(a, b); if (this.blocked(a, b)) hits++
      this.paths.forEach((path, index) => { if (this.overlaps(a, b, path)) paths.add(index) })
    }
    this.labelShapes.forEach((shape, index) => { if (pathTouchesFootprint(points, shape)) labels.add(index) })
    const soft = labels.size * 180 + paths.size * 90
    return { score: length + soft + segments.length * 2 + hits * 100000, hits, soft, length, labelHits: labels.size, pathHits: paths.size }
  }
}
// Search states include the incoming vertex: turn costs depend on arrival direction.
function findRoute(scene: Scene, start: Point, end: Point, budget: { left: number }, bias = 0) {
  const pad = scene.clearance + 16
  const boxes = scene.diagram.nodes.map(node => inflate(nodeRect(node), pad + (node.strokeWidth + scene.edge.strokeWidth) / 2))
  if (scene.diagram.heading?.position && scene.diagram.heading.mode !== 'hidden') { const h = headingLayout(scene.diagram); if (h) boxes.push(inflate({ left: h.x, top: h.y, right: h.x+h.width, bottom: h.y+h.height }, pad)) }
  const rotate = (p: Point) => ({ x: p.x*Math.cos(bias*.5)-p.y*Math.sin(bias*.5), y: p.x*Math.sin(bias*.5)+p.y*Math.cos(bias*.5) })
  const a = exitPoint(start, rotate(normal(scene.source, scene.edge.source.anchor)), boxes[scene.diagram.nodes.indexOf(scene.source)])
  const b = exitPoint(end, rotate(normal(scene.target, scene.edge.target.anchor)), boxes[scene.diagram.nodes.indexOf(scene.target)])
  if (boxes.some(box => inside(a,box)||inside(b,box)) || scene.blocked(start,a) || scene.blocked(b,end)) return null
  const corners = (r: Rect) => [{x:r.left-1,y:r.top-1},{x:r.right+1,y:r.top-1},{x:r.right+1,y:r.bottom+1},{x:r.left-1,y:r.bottom+1}]
  const frame = inflate({left:Math.min(a.x,b.x,...boxes.map(r=>r.left)),right:Math.max(a.x,b.x,...boxes.map(r=>r.right)),top:Math.min(a.y,b.y,...boxes.map(r=>r.top)),bottom:Math.max(a.y,b.y,...boxes.map(r=>r.bottom))},80)
  // Other routes contribute offset portals as well as costs, so shared corridors have alternatives.
  const portals = scene.paths.flatMap(path => path.points.filter((_p,i)=>i%Math.max(1,Math.ceil(path.points.length/8))===0).flatMap((p,i,ps)=>{
    const v=unit(sub(ps[Math.min(i+1,ps.length-1)],ps[Math.max(0,i-1)])), n={x:-v.y,y:v.x}
    return [along(p,n,24),along(p,n,-24)]
  }))
  const points=[a,b,...[...boxes,...scene.labels.map(r=>inflate(r,10))].flatMap(corners),...portals,...corners(frame)].filter((p,i)=>i<2||!boxes.some(r=>inside(p,r)))
  type State={prev:number;at:number;cost:number;parent?:State}
  const initial:State={prev:-1,at:0,cost:0}, open:State[]=[initial], costs=new Map<string,number>([['-1:0',0]]), visible=new Map<string,boolean>(), penalties=new Map<string,number>()
  const priority=(state:State)=>state.cost+distance(points[state.at],b)
  const push=(state:State)=>{open.push(state);let i=open.length-1;while(i){const parent=(i-1)>>1;if(priority(open[parent])<=priority(open[i]))break;[open[parent],open[i]]=[open[i],open[parent]];i=parent}}
  const pop=()=>{const first=open[0],last=open.pop()!;if(open.length){open[0]=last;let i=0;while(i*2+1<open.length){let child=i*2+1;if(child+1<open.length&&priority(open[child+1])<priority(open[child]))child++;if(priority(open[i])<=priority(open[child]))break;[open[i],open[child]]=[open[child],open[i]];i=child}}return first}
  const chord=unit(sub(end,start))
  while(open.length && budget.left>0){
    const current=pop(), key=current.prev+':'+current.at
    if(current.cost!==(costs.get(key)??Infinity))continue
    if(current.at===1){ const route:Point[]=[end];let state:State|undefined=current;while(state){route.push(points[state.at]);state=state.parent}route.push(start);return route.reverse() }
    for(let next=1;next<points.length && budget.left>0;next++){
      if(next===current.at || next===current.prev)continue
      budget.left--
      const k=Math.min(current.at,next)+':'+Math.max(current.at,next)
      let clear=visible.get(k); if(clear===undefined){clear=!boxes.some(r=>intersects(points[current.at],points[next],r));visible.set(k,clear)}
      if(!clear)continue
      const u=points[current.at],v=points[next], incoming=unit(sub(u,current.prev<0?start:points[current.prev])), outgoing=unit(sub(v,u))
      const turn=30*(1-incoming.x*outgoing.x-incoming.y*outgoing.y), len=distance(u,v)
      const side=cross(chord,sub(lerp(u,v,.5),start))
      let penalty=penalties.get(k);if(penalty===undefined){penalty=scene.softCost(u,v)*4;penalties.set(k,penalty)}
      const cost=current.cost+len+turn+penalty+(bias && side*bias<0?len*.4:0)
      const nextKey=current.at+':'+next
      if(cost<(costs.get(nextKey)??Infinity)){costs.set(nextKey,cost);push({prev:current.at,at:next,cost,parent:current})}
    }
  }
  return null
}

// Hermite spans share tangent directions. Wider handles are tried first and all
// resulting cubics are checked again, since a free polyline can smooth into a node.
function smoothRoute(points: Point[], tension: number): Segment[] {
  const directions=points.map((p,i)=>i===0?unit(sub(points[1],p)):i===points.length-1?unit(sub(p,points[i-1])):unit({x:unit(sub(p,points[i-1])).x+unit(sub(points[i+1],p)).x,y:unit(sub(p,points[i-1])).y+unit(sub(points[i+1],p)).y}))
  const handles=points.map((p,i)=>Math.min(i?distance(p,points[i-1]):Infinity,i<points.length-1?distance(p,points[i+1]):Infinity)*tension)
  return points.slice(0,-1).map((start,i)=>({start,end:points[i+1],c1:along(start,directions[i],handles[i]),c2:along(points[i+1],directions[i+1],-handles[i+1])}))
}
// Remove redundant visibility vertices before fitting. Keep terminal exits and
// never introduce a new obstacle, label or background-route conflict by shortcutting.
function simplifyRoute(scene: Scene, route: Point[]) {
  const points=[...route]
  for(let i=2;i<points.length-2;){
    const a=points[i-1],b=points[i],c=points[i+1]
    const newPathHit=scene.paths.some(path=>scene.overlaps(a,c,path)&&!scene.overlaps(a,b,path)&&!scene.overlaps(b,c,path))
    const newLabelHit=scene.labelShapes.some(shape=>pathTouchesFootprint([a,c],shape)&&!pathTouchesFootprint([a,b,c],shape))
    if(!scene.blocked(a,c)&&!newPathHit&&!newLabelHit)points.splice(i,1);else i++
  }
  return points
}
// Tangent continuity alone permits arbitrarily tight, almost polygonal corners.
// Evaluate physical curvature for every new route, including its joins.
function curveQuality(segments: Segment[], strokeWidth: number) {
  let maxCurvature=0, variation=0, previous: number|undefined, weight=0
  for(const s of segments)for(let j=0;j<=24;j++){
    const t=j/24,u=1-t
    const v={x:3*(u*u*(s.c1.x-s.start.x)+2*u*t*(s.c2.x-s.c1.x)+t*t*(s.end.x-s.c2.x)),y:3*(u*u*(s.c1.y-s.start.y)+2*u*t*(s.c2.y-s.c1.y)+t*t*(s.end.y-s.c2.y))}
    const a={x:6*(u*(s.c2.x-2*s.c1.x+s.start.x)+t*(s.end.x-2*s.c2.x+s.c1.x)),y:6*(u*(s.c2.y-2*s.c1.y+s.start.y)+t*(s.end.y-2*s.c2.y+s.c1.y))}
    const speed=Math.hypot(v.x,v.y)
    if(speed<.001)return {acceptable:false,cost:1e9}
    const k=cross(v,a)/speed**3
    maxCurvature=Math.max(maxCurvature,Math.abs(k))
    if(previous!==undefined)variation+=Math.abs(k-previous)
    previous=k;weight+=speed/24
  }
  const minimumRadius=Math.max(16,strokeWidth*5)
  return {acceptable:maxCurvature*minimumRadius<=1,cost:variation*Math.max(40,weight)*12+maxCurvature*minimumRadius*50}
}
function corridorCandidates(scene: Scene) {
  const result:Segment[][]=[]
  for(const bias of [0,-1,1]){
    const route=findRoute(scene,scene.start,scene.end,{left:24000},bias)
    if(!route)continue
    const simplified=simplifyRoute(scene,route)
    for(const tension of [.5,.4,.3])result.push(smoothRoute(simplified,tension))
  }
  return result
}

function bowPreference(scene: Scene) {
  const chord = unit(sub(scene.end, scene.start)), side = { x: -chord.y, y: chord.x }
  const a = normal(scene.source, scene.edge.source.anchor), b = normal(scene.target, scene.edge.target.anchor)
  return (side.x * (a.x + b.x) + side.y * (a.y + b.y) < -.1 ? -1 : 1) * .18
}
function detourBows(scene: Scene) {
  const span = distance(scene.start, scene.end); if (span < 1) return []
  const axis = unit(sub(scene.end, scene.start)), side = { x: -axis.y, y: axis.x }, proposals: number[] = []
  for (const box of scene.boxes) {
    const corners = rectangleFootprint(box).points.map(p => ({ along: ((p.x - scene.start.x) * axis.x + (p.y - scene.start.y) * axis.y) / span, across: ((p.x - scene.start.x) * side.x + (p.y - scene.start.y) * side.y) / span }))
    if (Math.max(...corners.map(p => p.along)) < .05 || Math.min(...corners.map(p => p.along)) > .95 || Math.min(...corners.map(p => Math.abs(p.across))) > .5) continue
    const t = clamp(corners.reduce((sum, p) => sum + p.along, 0) / 4, .15, .85), profile = 4 * t * (1 - t)
    proposals.push((Math.min(...corners.map(p => p.across)) - .06) / profile, (Math.max(...corners.map(p => p.across)) + .06) / profile)
  }
  return [...proposals.sort((a, b) => Math.abs(a) - Math.abs(b)).slice(0, 4), -.58, .58, -.7, .7]
}
function roundOptions(scene: Scene, bow: number, extra: Segment[][] = []) {
  const rawCurves=roundCandidates(scene.start,scene.end,anchorNormals(scene.source,scene.edge.source.anchor),anchorNormals(scene.target,scene.edge.target.anchor),bow,detourBows(scene))
  const candidates=[...rawCurves.map(raw=>({segments:[raw.segment],cost:raw.cost,bow:raw.bow,prior:false})),...extra.map(segments=>({segments,cost:35+segments.length*8,bow:0,prior:false}))]
  candidates.unshift({segments:edgeSegments(scene.edge,scene.diagram),cost:0,bow:0,prior:true})
  const options=candidates.map(raw=>{
    const assessment=scene.assess(raw.segments),points=flatten(raw.segments)
    const quality=curveQuality(raw.segments,scene.edge.strokeWidth)
    const curve={segment:raw.segments[0],segments:raw.segments,points,bow:raw.bow,length:assessment.length,cost:raw.cost+(raw.prior?0:quality.cost),
      box:inflate({left:Math.min(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))},.5)}
    const edge:DfdEdge={...scene.edge,label:{...scene.edge.label},mode:'curve'}; storeSegments(edge,raw.segments)
    if(raw.prior && raw.segments.length>1)edge.label.t=labelTForGeneratedRoute(scene.edge,scene.diagram)
    const label=labelFootprint(edge,scene.diagram,5+edge.strokeWidth/2), headPoints=edgeVisual(edge,scene.diagram).head
    const head:Footprint|null=headPoints.length?{points:headPoints,box:{left:Math.min(...headPoints.map(p=>p.x)),right:Math.max(...headPoints.map(p=>p.x)),top:Math.min(...headPoints.map(p=>p.y)),bottom:Math.max(...headPoints.map(p=>p.y))}}:null
    const labelNodeHits=label?scene.nodeShapes.filter(shape=>footprintsOverlap(label,shape)).length:0
    const labelConflicts=label?scene.labelShapes.filter(shape=>footprintsOverlap(label,shape)).length+scene.paths.filter(path=>pathTouchesFootprint(path.points,label)).length:0
    const headConflicts=head?scene.labelShapes.filter(shape=>footprintsOverlap(head,shape)).length+scene.paths.filter(path=>pathTouchesFootprint(path.points,head)).length+scene.boxes.filter(box=>footprintsOverlap(head,rectangleFootprint(box))).length:0
    return {curve,label,head,assessment,labelNodeHits,acceptable:quality.acceptable,prior:raw.prior,labelT:edge.label.t,readability:labelNodeHits+labelConflicts+assessment.labelHits,staticConflicts:assessment.labelHits+assessment.pathHits+labelConflicts+headConflicts+labelNodeHits,
      cost:curve.cost+assessment.length*.04+labelConflicts*1800+assessment.pathHits*650}
  })
  const smooth=options.filter(o=>o.acceptable)
  const acceptable=smooth.length?smooth:options.filter(o=>o.prior)
  const minHits=Math.min(...acceptable.map(o=>o.assessment.hits))
  return acceptable.filter(o=>o.assessment.hits===minHits).sort((a,b)=>a.readability-b.readability||a.staticConflicts-b.staticConflicts||a.cost-b.cost)
}

type RoundOption = ReturnType<typeof roundOptions>[number]
type LayoutScore = { readability: number; conflicts: number; cost: number }
const addScore = (a: LayoutScore, b: LayoutScore): LayoutScore => ({ readability:a.readability+b.readability, conflicts: a.conflicts + b.conflicts, cost: a.cost + b.cost })
const betterScore = (a: LayoutScore, b: LayoutScore) => a.readability < b.readability || a.readability === b.readability && (a.conflicts < b.conflicts || a.conflicts === b.conflicts && a.cost < b.cost - .01)
const optionScore = (option: RoundOption): LayoutScore => ({ readability:option.readability, conflicts: option.staticConflicts, cost: option.cost })
function optionPairCost(a: RoundOption, b: RoundOption, gap: number): LayoutScore {
  const forward = curvePairMetrics(a.curve, b.curve, gap), backward = curvePairMetrics(b.curve, a.curve, gap)
  const labels = a.label && b.label && footprintsOverlap(a.label, b.label) ? 1 : 0
  const first = a.label && pathTouchesFootprint(b.curve.points, a.label) ? 1 : 0, second = b.label && pathTouchesFootprint(a.curve.points, b.label) ? 1 : 0
  const heads=Number(!!a.head&&pathTouchesFootprint(b.curve.points,a.head))+Number(!!b.head&&pathTouchesFootprint(a.curve.points,b.head))+Number(!!a.head&&!!b.head&&footprintsOverlap(a.head,b.head))
  return { readability:labels+first+second, conflicts: Math.max(forward.conflicts, backward.conflicts) + labels + first + second + heads, cost: (forward.cost + backward.cost) * 2 + labels * 2400 + (first + second) * 1800 }
}
function diverseOptions(options: RoundOption[]) {
  const minHits=Math.min(...options.map(option=>option.assessment.hits))
  options=options.filter(option=>option.assessment.hits===minHits)
  const seen=new Set<string>()
  options=options.filter(option=>{const key=JSON.stringify([option.curve.segments,option.labelT,option.prior]);if(seen.has(key))return false;seen.add(key);return true})
  const pool: RoundOption[] = [], add = (option?: RoundOption) => { if (option && !pool.includes(option) && pool.length < 24) pool.push(option) }
  add(options.find(option=>option.prior)); add(options[0])
  const corridors=new Set<string>()
  for(const option of options.filter(o=>o.curve.segments.length>1)){
    const key=JSON.stringify(option.curve.segments.map(s=>s.end))
    if(!corridors.has(key)){corridors.add(key);add(option)}
    if(corridors.size>=10)break
  }
  for (const sign of [-1, 1]) {
    const side = options.filter(option => Math.sign(option.curve.bow) === sign)
    add(side[0]); add([...side].sort((a, b) => Math.abs(b.curve.bow) - Math.abs(a.curve.bow))[0])
  }
  const bins = new Set<number>()
  for (const option of options) { const bin = Math.round(option.curve.bow / .07); if (!bins.has(bin)) { bins.add(bin); add(option) } }
  for (const option of options) add(option)
  return pool
}

// Build every candidate against the same frozen scene; commit only after group planning.
export function routeRoundedEdges(edges: DfdEdge[], diagram: Diagram) {
  const editable = edges.filter(edge => !edge.locked), selected = new Set(editable.map(edge => edge.id))
  const background = { ...diagram, edges: diagram.edges.filter(edge => !selected.has(edge.id)) }
  const key = (edge: DfdEdge) => JSON.stringify([edge.source.nodeId, edge.target.nodeId, edge.source.anchor, edge.target.anchor, edge.label.text, edge.id])
  const sorted = [...editable].sort((a, b) => {
    const ends=(edge:DfdEdge)=>[anchorPoint(diagram.nodes.find(n=>n.id===edge.source.nodeId)!,edge.source.anchor),anchorPoint(diagram.nodes.find(n=>n.id===edge.target.nodeId)!,edge.target.anchor)].sort((u,v)=>u.x-v.x||u.y-v.y)
    const x=ends(a),y=ends(b)
    return x[0].x-y[0].x||x[0].y-y[0].y||x[1].x-y[1].x||x[1].y-y[1].y||key(a).localeCompare(key(b))
  })
  const pairs = new Map<string, DfdEdge[]>()
  for (const edge of sorted) {
    const pair = JSON.stringify([edge.source.nodeId, edge.target.nodeId].sort())
    pairs.set(pair, [...(pairs.get(pair) ?? []), edge])
  }
  const plans = sorted.map(edge => {
    const scene = new Scene(edge, background, 12), siblings = pairs.get(JSON.stringify([edge.source.nodeId, edge.target.nodeId].sort()))!
    let bow = bowPreference(scene)
    if (siblings.length > 1) {
      const forward = siblings.filter(other => other.source.nodeId === edge.source.nodeId), index = forward.indexOf(edge)
      const opposing = forward.length !== siblings.length
      // Local positive bows put opposite directions on opposite physical sides.
      const sign = opposing ? 1 : index % 2 ? -1 : 1, lane = opposing ? index : Math.floor(index / 2)
      bow = sign * (.14 + .24 * lane / Math.max(2, opposing ? forward.length - 1 : Math.ceil(forward.length / 2) - 1))
    }
    const pool = diverseOptions(roundOptions(scene, bow, corridorCandidates(scene))), footprints = pool.flatMap(p => p.label ? [p.curve.box, p.label.box] : [p.curve.box])
    const bounds = { left: Math.min(...footprints.map(p => p.left)), top: Math.min(...footprints.map(p => p.top)), right: Math.max(...footprints.map(p => p.right)), bottom: Math.max(...footprints.map(p => p.bottom)) }
    return { edge, pool, bounds, scene, bow }
  })
  for (let pass=0;pass<2;pass++) {
    const provisional={...background,edges:[...background.edges,...plans.map((plan,i)=>{const e={...plan.edge};const option=plan.pool[pass ? i%Math.min(3,plan.pool.length) : 0];storeSegments(e,option.curve.segments);e.label={...e.label,t:option.labelT};return e})]}
    for(const plan of plans){
      const context=new Scene(plan.edge,provisional,12)
      plan.pool=diverseOptions([...plan.pool,...roundOptions(plan.scene,plan.bow,corridorCandidates(context))].sort((a,b)=>a.readability-b.readability||a.staticConflicts-b.staticConflicts||a.cost-b.cost))
      const boxes=plan.pool.flatMap(o=>o.label?[o.curve.box,o.label.box]:[o.curve.box])
      plan.bounds={left:Math.min(...boxes.map(r=>r.left)),right:Math.max(...boxes.map(r=>r.right)),top:Math.min(...boxes.map(r=>r.top)),bottom:Math.max(...boxes.map(r=>r.bottom))}
    }
  }
  const neighbors = plans.map((plan, i) => plans.map((other, j) => i !== j && curveBoxesOverlap(plan.bounds, other.bounds, 12 + (plan.edge.strokeWidth + other.edge.strokeWidth) / 2) ? j : -1).filter(j => j >= 0))
  const pairCache = new WeakMap<RoundOption, WeakMap<RoundOption, LayoutScore>>()
  const separation = (a: RoundOption, b: RoundOption, gap: number) => {
    const cached = pairCache.get(a)?.get(b); if (cached !== undefined) return cached
    const cost = optionPairCost(a, b, gap)
    if (!pairCache.has(a)) pairCache.set(a, new WeakMap())
    if (!pairCache.has(b)) pairCache.set(b, new WeakMap())
    pairCache.get(a)!.set(b, cost); pairCache.get(b)!.set(a, cost)
    return cost
  }
  const pair = (i: number, k: number, j: number, l: number) => separation(plans[i].pool[k], plans[j].pool[l], 12 + (plans[i].edge.strokeWidth + plans[j].edge.strokeWidth) / 2)
  const optimize = (initial: number[]) => {
    const choices = [...initial]
    const energy = (i: number, k: number, excluded = -1) => neighbors[i].reduce((sum, j) => j === excluded ? sum : addScore(sum, pair(i, k, j, choices[j])), optionScore(plans[i].pool[k]))
    for (let pass = 0; pass < 4; pass++) {
      let changed = false
      const order = pass % 2 ? [...plans.keys()].reverse() : [...plans.keys()]
      for (const i of order) {
        let best = choices[i], cost = energy(i, best)
        plans[i].pool.forEach((_option, k) => { if (k === choices[i]) return; const next = energy(i, k); if (betterScore(next, cost)) { best = k; cost = next } })
        if (best !== choices[i]) { choices[i] = best; changed = true }
      }
      if (!changed) break
    }
    // Move conflicting pairs together to escape an impasse where either move alone is worse.
    const conflicts = plans.flatMap((_plan, i) => neighbors[i].filter(j => j > i).map(j => ({ i, j, score: pair(i, choices[i], j, choices[j]) }))).filter(item => item.score.conflicts > 0).sort((a, b) => b.score.conflicts - a.score.conflicts || b.score.cost - a.score.cost).slice(0, 6)
    for (const { i, j } of conflicts) {
      const joint = (k: number, l: number) => addScore(addScore(energy(i, k, j), energy(j, l, i)), pair(i, k, j, l))
      let bestI = choices[i], bestJ = choices[j], cost = joint(bestI, bestJ)
      const candidates = (index: number) => [...new Set([choices[index], ...plans[index].pool.slice(0, 10).map((_p, k) => k)])]
      for (const k of candidates(i)) for (const l of candidates(j)) { const next = joint(k, l); if (betterScore(next, cost)) { bestI = k; bestJ = l; cost = next } }
      choices[i] = bestI; choices[j] = bestJ
    }
    const cost = plans.reduce((sum, _plan, i) => addScore(sum, neighbors[i].filter(j => j > i).reduce((total, j) => addScore(total, pair(i, choices[i], j, choices[j])), optionScore(plans[i].pool[choices[i]]))), { readability:0, conflicts: 0, cost: 0 })
    return { choices, cost }
  }
  const first = optimize(plans.map(() => 0))
  const second = optimize(plans.map((plan, i) => i % 2 ? Math.max(0, plan.pool.findIndex(option => Math.sign(option.curve.bow) !== Math.sign(plan.pool[0].curve.bow))) : 0))
  const previous = optimize(plans.map(plan=>Math.max(0,plan.pool.findIndex(option=>option.prior))))
  const best = betterScore(second.cost,first.cost)?second:first
  const choices = (betterScore(previous.cost,best.cost)?previous:best).choices
  plans.forEach((plan, i) => {
    const option = plan.pool[choices[i]]; storeSegments(plan.edge, option.curve.segments); plan.edge.label.t=option.labelT
    const crowded = option.staticConflicts || neighbors[i].some(j => pair(i, choices[i], j, choices[j]).conflicts > 0)
    if (!option.acceptable || option.assessment.hits || option.labelNodeHits || crowded) plan.edge.routingIssue = 'blocked'; else delete plan.edge.routingIssue
  })
}

export function routeEdge(edge: DfdEdge, diagram: Diagram, _force = false) {
  if(edge.mode==='curve'&&!edge.locked) routeRoundedEdges([edge],diagram)
}

function sceneKey(d: Diagram) {
  return JSON.stringify({ nodes: d.nodes.map(n => [n.id, n.kind, n.x, n.y, n.width, n.height, n.strokeWidth, n.text, n.number, n.font.fontSize, n.font.fontFamily, n.font.bold, n.font.italic]), heading: d.heading?.position ? d.heading : undefined,
    edges: d.edges.map(e => [e.id, e.source, e.target, e.mode, e.routing, e.strokeWidth, e.label, e.routing === 'auto' ? undefined : [e.controls, e.waypoints, e.generatedRoute]]) })
}
export function rerouteChangedDiagrams(project: Project, previous: Project) {
  for (const diagram of project.diagrams) {
    if (!diagram.edges.some(edge => edge.routing === 'auto' && edge.mode === 'curve' && !edge.locked)) continue
    const before = previous.diagrams.find(d => d.id === diagram.id)
    if (before && sceneKey(before) === sceneKey(diagram)) continue
    routeRoundedEdges(diagram.edges.filter(edge => edge.routing === 'auto' && edge.mode === 'curve' && !edge.locked), diagram)
  }
}
