import { orthogonalSegments } from './orthogonal'
import type { Anchor, DfdEdge, DfdNode, Diagram, Point, TextStyle } from './model'
import { defaultFont, diagramLevel, nodeForDiagram } from './model'

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))
export function anchorPoint(n: DfdNode, a: Anchor): Point {
  if (a.kind === 'angle') return { x: n.x + n.width / 2 + Math.cos(a.value) * n.width / 2, y: n.y + n.height / 2 + Math.sin(a.value) * n.height / 2 }
  return a.side === 'top' ? { x: n.x + n.width * a.t, y: n.y } : a.side === 'bottom' ? { x: n.x + n.width * a.t, y: n.y + n.height } : a.side === 'left' ? { x: n.x, y: n.y + n.height * a.t } : { x: n.x + n.width, y: n.y + n.height * a.t }
}
export function nearestAnchor(n: DfdNode, p: Point): Anchor {
  if (n.kind === 'process') return { kind: 'angle', value: Math.atan2(p.y - n.y - n.height / 2, p.x - n.x - n.width / 2) }
  const x = clamp((p.x - n.x) / n.width, 0, 1); const y = clamp((p.y - n.y) / n.height, 0, 1)
  const candidates: { side: 'top' | 'right' | 'bottom' | 'left'; t: number; point: Point }[] = [
    { side: 'top', t: x, point: { x: n.x + n.width * x, y: n.y } }, { side: 'bottom', t: x, point: { x: n.x + n.width * x, y: n.y + n.height } },
    { side: 'left', t: y, point: { x: n.x, y: n.y + n.height * y } }, { side: 'right', t: y, point: { x: n.x + n.width, y: n.y + n.height * y } },
  ]
  candidates.sort((a, b) => distance(a.point, p) - distance(b.point, p))
  return { kind: 'side', side: candidates[0].side, t: candidates[0].t }
}
export function hitNode(nodes: DfdNode[], p: Point, margin = 16) {
  return [...nodes].reverse().find(n => n.kind !== 'note' && (n.kind === 'process' ? Math.hypot((p.x - n.x - n.width / 2) / (n.width / 2 + margin), (p.y - n.y - n.height / 2) / (n.height / 2 + margin)) <= 1 : p.x >= n.x - margin && p.x <= n.x + n.width + margin && p.y >= n.y - margin && p.y <= n.y + n.height + margin))
}
export function edgePoints(e: DfdEdge, diagram: Diagram) {
  const source = diagram.nodes.find(n => n.id === e.source.nodeId)!; const target = diagram.nodes.find(n => n.id === e.target.nodeId)!
  const start = anchorPoint(source, e.source.anchor); const end = anchorPoint(target, e.target.anchor)
  return { start, end, c1: add(start, e.controls.source), c2: add(end, e.controls.target) }
}
// One deterministic cubic per edge. No scene search or dependence on selection.
export function resetSimpleCurve(e: DfdEdge, d: Diagram) {
  const { start, end } = edgePoints(e, d), delta = sub(end, start), length = distance(start, end)
  const bow = clamp(length * .16, 16, 64) * 4 / 3
  const normal = length > .001 ? { x: delta.y / length, y: -delta.x / length } : { x: 0, y: -1 }
  e.controls = {
    source: { x: delta.x / 3 + normal.x * bow, y: delta.y / 3 + normal.y * bow },
    target: { x: -delta.x / 3 + normal.x * bow, y: -delta.y / 3 + normal.y * bow },
  }
  if (length < .001) e.controls = { source: { x: -48, y: -80 }, target: { x: 48, y: -80 } }
  e.mode = 'curve'; e.routing = 'manual'; e.waypoints = []
  delete e.generatedRoute; delete e.routingIssue
}
export function bezierPoint(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const u = 1 - t
  return { x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x, y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y }
}
export const lerp = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export function routePoints(e: DfdEdge, d: Diagram) {
  const p = edgePoints(e, d)
  return (e.generatedRoute ?? e.waypoints ?? []).map(w => add(lerp(p.start, p.end, w.t), w.offset))
}
export function edgeSegments(e: DfdEdge, d: Diagram) {
  if (e.mode === 'orthogonal') return orthogonalSegments(e,d)
  const p = edgePoints(e, d), ws = e.generatedRoute ?? e.waypoints ?? [], knots = [p.start, ...routePoints(e, d), p.end]
  return knots.slice(0, -1).map((start, i) => ({ start, c1: i === 0 ? p.c1 : add(start, ws[i - 1].outgoing), c2: i === ws.length ? p.c2 : add(knots[i + 1], ws[i].incoming), end: knots[i + 1] }))
}
// Automatic routes use distance along the path, independent of how many joins
// the router needed. Legacy/manual curves retain their original parameterization.
type EdgeMetric = { samples: { i: number; u: number; length: number }[]; total: number }
function measureEdge(segments: ReturnType<typeof edgeSegments>): EdgeMetric {
  const samples: EdgeMetric['samples'] = []; let total = 0
  segments.forEach((s, i) => { let previous = s.start; for (let j = 1; j <= 24; j++) { const point = bezierPoint(s.start, s.c1, s.c2, s.end, j / 24); total += distance(previous, point); samples.push({ i, u: j / 24, length: total }); previous = point } })
  return { samples, total }
}
function edgeParameter(e: DfdEdge, segments: ReturnType<typeof edgeSegments>, t: number, prepared?: EdgeMetric) {
  if (e.mode !== 'orthogonal' && !e.generatedRoute?.length) { const value=clamp(t,0,1)*segments.length;const i=Math.min(segments.length-1,Math.floor(value));return {i,u:value-i} }
  const metric = prepared ?? measureEdge(segments)
  return parameterAtDistance(metric, clamp(t, 0, 1) * metric.total)
}
function parameterAtDistance({ samples, total }: EdgeMetric, length: number) {
  const wanted = clamp(length, 0, total)
  let lo=0,hi=samples.length-1
  while(lo<hi){const mid=(lo+hi)>>1;if(samples[mid].length<wanted)lo=mid+1;else hi=mid}
  const sample=samples[lo]
  if(sample){const before=lo?samples[lo-1].length:0;return {i:sample.i,u:sample.u-1/24+(wanted-before)/(sample.length-before||1)/24}}
  return { i: 0, u: 1 }
}
function prepareEdgeEvaluation(e: DfdEdge, d: Diagram) {
  const ends = edgePoints(e, d), segments = edgeSegments(e, d)
  const metric = e.mode === 'orthogonal' || e.generatedRoute?.length ? measureEdge(segments) : undefined
  const parameterAt = (t: number) => edgeParameter(e, segments, t, metric)
  const pointAt = (t: number) => {
    if (e.mode === 'straight') return lerp(ends.start, ends.end, t)
    const at = parameterAt(t), segment = segments[at.i]
    return bezierPoint(segment.start, segment.c1, segment.c2, segment.end, at.u)
  }
  return { ends, segments, parameterAt, pointAt }
}
// Split a cubic exactly: adding a waypoint does not change the visible curve.
export function labelTForGeneratedRoute(e: DfdEdge, d: Diagram) {
  if (e.generatedRoute?.length) return e.label.t
  const segments=edgeSegments(e,d), value=clamp(e.label.t,0,1)*segments.length
  let total=0, before=0
  segments.forEach((s,i)=>{let previous=s.start;for(let j=1;j<=24;j++){
    const p=bezierPoint(s.start,s.c1,s.c2,s.end,j/24),length=distance(previous,p)
    before+=length*clamp((value-i)*24-(j-1),0,1);total+=length;previous=p
  }})
  return total ? before/total : e.label.t
}
export function insertWaypoint(e: DfdEdge, d: Diagram, t: number) {
  if (e.generatedRoute) {
    const segments=edgeSegments(e,d),at=edgeParameter(e,segments,t),label=edgeParameter(e,segments,e.label.t)
    t=(at.i+at.u)/segments.length;e.label.t=(label.i+label.u)/segments.length
    e.waypoints = e.generatedRoute; delete e.generatedRoute
  }
  const segments = edgeSegments(e, d), value = clamp(t, .001, .999) * segments.length, i = Math.min(segments.length - 1, Math.floor(value)), u = clamp(value - i, .02, .98)
  const s = segments[i], a = lerp(s.start, s.c1, u), b = lerp(s.c1, s.c2, u), c = lerp(s.c2, s.end, u), ab = lerp(a, b, u), bc = lerp(b, c, u), knot = lerp(ab, bc, u)
  const ws = e.waypoints ??= [], refT = (i ? ws[i - 1].t : 0) + ((ws[i]?.t ?? 1) - (i ? ws[i - 1].t : 0)) * u
  const ends = edgePoints(e, d)
  if (i === 0) e.controls.source = sub(a, s.start); else ws[i - 1].outgoing = sub(a, s.start)
  if (i === ws.length) e.controls.target = sub(c, s.end); else ws[i].incoming = sub(c, s.end)
  ws.splice(i, 0, { t: refT, offset: sub(knot, lerp(ends.start, ends.end, refT)), incoming: sub(ab, knot), outgoing: sub(bc, knot) })
  const old = e.label.t * segments.length, fraction = old - i
  const next = old <= i ? old : old >= i + 1 ? old + 1 : fraction <= u ? i + fraction / u : i + 1 + (fraction - u) / (1 - u)
  e.label.t = next / (segments.length + 1)
  return i
}
// Least-squares control displacement makes the grabbed point follow the pointer.
export function bendEdge(e: DfdEdge, d: Diagram, t: number, delta: Point) {
  const segments = edgeSegments(e, d), at=edgeParameter(e,segments,clamp(t,.05,.95)),i=at.i,u=clamp(at.u,.05,.95)
  const a = 3 * (1 - u) ** 2 * u, b = 3 * (1 - u) * u ** 2, denom = a * a + b * b
  const c1 = i === 0 ? e.controls.source : (e.generatedRoute ?? e.waypoints)![i - 1].outgoing, c2 = i === segments.length - 1 ? e.controls.target : (e.generatedRoute ?? e.waypoints)![i].incoming
  c1.x += delta.x * a / denom; c1.y += delta.y * a / denom; c2.x += delta.x * b / denom; c2.y += delta.y * b / denom;
  if (e.generatedRoute) {
    const align = (edited: Point, other: Point) => { const k = Math.hypot(other.x, other.y) / (Math.hypot(edited.x, edited.y) || 1); other.x = -edited.x * k; other.y = -edited.y * k }
    if (i > 0) align(c1, e.generatedRoute[i - 1].incoming)
    if (i < e.generatedRoute.length) align(c2, e.generatedRoute[i].outgoing)
  }
}
export function pointOnEdge(e: DfdEdge, diagram: Diagram, t: number): Point {
  if (e.mode === 'straight') { const p = edgePoints(e, diagram); return lerp(p.start, p.end, t) }
  return prepareEdgeEvaluation(e, diagram).pointAt(t)
}
export function edgePath(e: DfdEdge, d: Diagram) {
  const p = edgePoints(e, d)
  return e.mode === 'straight' ? `M ${p.start.x} ${p.start.y} L ${p.end.x} ${p.end.y}` : `M ${p.start.x} ${p.start.y} ` + edgeSegments(e, d).map(s => `C ${s.c1.x} ${s.c1.y} ${s.c2.x} ${s.c2.y} ${s.end.x} ${s.end.y}`).join(' ')
}
type CubicSegment = ReturnType<typeof edgeSegments>[number]
function cubicPrefix(s: CubicSegment, t: number): CubicSegment {
  const a=lerp(s.start,s.c1,t),b=lerp(s.c1,s.c2,t),c=lerp(s.c2,s.end,t),ab=lerp(a,b,t),bc=lerp(b,c,t)
  return { start:s.start,c1:a,c2:ab,end:lerp(ab,bc,t) }
}
// The round shaft cap must fit inside the head, rather than extend past its tip.
// If a very tight/short tail offers no safe join, preserve the shaft and full head.
function shaftUnderHead(segments:CubicSegment[],head:Point[],strokeWidth:number) {
  const tip=head[0],base=lerp(head[1],head[2],.5),reach=distance(tip,base)*2,radius=strokeWidth/2+.2
  const fits=(p:Point)=>head.every((a,i)=>{
    const b=head[(i+1)%head.length],edge=sub(b,a),offset=sub(p,a)
    return edge.x*offset.y-edge.y*offset.x>=radius*Math.hypot(edge.x,edge.y)
  })
  for(let i=segments.length-1;i>=0;i--) {
    const s=segments[i]
    // Denser near the tip so long curves still offer a join inside the head.
    for(let step=0;step<=64;step++) {
      const t=1-(step/64)**3,p=bezierPoint(s.start,s.c1,s.c2,s.end,t)
      if(distance(p,tip)>reach)return segments
      if(fits(p))return [...segments.slice(0,i),cubicPrefix(s,t)]
    }
  }
  return segments
}
// Presentation only: saved anchors and control points stay on the chosen perimeter.
// Trim at the outer edge of the target stroke, then draw a full-size arrow above figures.
export function edgeVisual(e: DfdEdge, d: Diagram) {
  const target = d.nodes.find(n => n.id === e.target.nodeId)!, ends = edgePoints(e, d)
  const clearance = (target.kind === 'store' && e.target.anchor.kind === 'side' && ['left', 'right'].includes(e.target.anchor.side) ? 0 : target.strokeWidth / 2) + 1.5
  const inside = (p: Point) => target.kind === 'process'
    ? Math.hypot((p.x - target.x - target.width / 2) / (target.width / 2 + clearance), (p.y - target.y - target.height / 2) / (target.height / 2 + clearance)) <= 1
    : p.x >= target.x - clearance && p.x <= target.x + target.width + clearance && p.y >= target.y - clearance && p.y <= target.y + target.height + clearance
  const segments = e.mode === 'straight' ? [{ start: ends.start, c1: lerp(ends.start, ends.end, 1 / 3), c2: lerp(ends.start, ends.end, 2 / 3), end: ends.end }] : edgeSegments(e, d)
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i], point = (t: number) => bezierPoint(s.start, s.c1, s.c2, s.end, t)
    for (let step = 1; step <= 64; step++) {
      let outside = 1 - step / 64
      if (inside(point(outside))) continue
      let within = outside + 1 / 64
      for (let j = 0; j < 20; j++) { const mid = (outside + within) / 2; if (inside(point(mid))) within = mid; else outside = mid }
      const prefix=cubicPrefix(s,outside),tip=prefix.end
      const delta = sub(tip, point(Math.max(0, outside - .001))), magnitude = Math.hypot(delta.x, delta.y)
      if (magnitude < 1e-9) continue
      const direction = { x: delta.x / magnitude, y: delta.y / magnitude }
      const length = Math.max(13, 7 + e.strokeWidth * 2.6), half = Math.max(7, 3.5 + e.strokeWidth * 1.4)
      const base = sub(tip, { x: direction.x * length, y: direction.y * length })
      const head = [tip, { x: base.x - direction.y * half, y: base.y + direction.x * half }, { x: base.x + direction.y * half, y: base.y - direction.x * half }]
      const shaft=shaftUnderHead([...segments.slice(0,i),prefix],head,e.strokeWidth),shaftEnd=shaft[shaft.length-1].end
      const path = e.mode === 'straight' ? `M ${ends.start.x} ${ends.start.y} L ${shaftEnd.x} ${shaftEnd.y}` : `M ${ends.start.x} ${ends.start.y} ` + shaft.map(part => `C ${part.c1.x} ${part.c1.y} ${part.c2.x} ${part.c2.y} ${part.end.x} ${part.end.y}`).join(' ')
      return { path, head, tip, segments: shaft }
    }
  }
  return { path: edgePath(e, d), head: [] as Point[], tip: ends.end, segments }
}
export const polygonPoints = (points: Point[]) => points.map(p => `${p.x},${p.y}`).join(' ')
export function flowEndMark(e: DfdEdge, d: Diagram, visual: ReturnType<typeof edgeVisual>): [Point, Point][] {
  if (d.mode !== 'design' || !e.endMark || visual.head.length !== 3) return []

  const metric = measureEdge(visual.segments)
  const base = lerp(visual.head[1], visual.head[2], .5)
  const shaftEnd = visual.segments[visual.segments.length - 1].end
  const headOverlap = Math.max(0, distance(base, visual.tip) - distance(shaftEnd, visual.tip))
  const available = metric.total - headOverlap
  if (available <= e.strokeWidth + 2) return []

  const size = Math.min(Math.max(7, e.strokeWidth * 1.4), available / 3)
  const centerDistance = available - Math.min(size + e.strokeWidth + 4, available / 2)
  const pointAt = (length: number) => {
    const { i, u } = parameterAtDistance(metric, length)
    const s = visual.segments[i]
    return bezierPoint(s.start, s.c1, s.c2, s.end, u)
  }
  const center = pointAt(centerDistance)
  const delta = sub(pointAt(centerDistance + 1), pointAt(centerDistance - 1))
  const length = Math.hypot(delta.x, delta.y)
  if (length < 1e-6) return []

  const tangent = { x: size * delta.x / length, y: size * delta.y / length }
  const normal = { x: -tangent.y, y: tangent.x }
  const line = (offset: Point): [Point, Point] => [sub(center, offset), add(center, offset)]
  return e.endMark === 'alta' ? [line(normal)] : [line(add(tangent, normal)), line(sub(tangent, normal))]
}

export function flowEndMarkPath(lines: [Point, Point][]) {
  return lines.map(([a, b]) => `M ${a.x} ${a.y} L ${b.x} ${b.y}`).join(' ')
}

export function labelPosition(e: DfdEdge, d: Diagram) {
  const prepared = prepareEdgeEvaluation(e, d), center = add(prepared.pointAt(e.label.t), e.label.offset)
  let angle = e.label.orientation === 'manual' ? e.label.angle : 0
  if (e.label.orientation === 'tangent') {
    // Follow the span nearest the displayed text, including its saved offset.
    // Its original attachment parameter may be far away on a long curve.
    const nearest = closestEdgeTFrom(prepared.pointAt, center)
    const at = prepared.parameterAt(nearest), s = prepared.segments[at.i], u = at.u
    let direction = e.mode === 'straight' ? sub(prepared.ends.end, prepared.ends.start) : {
      x: 3 * (1-u)**2 * (s.c1.x-s.start.x) + 6*(1-u)*u*(s.c2.x-s.c1.x) + 3*u*u*(s.end.x-s.c2.x),
      y: 3 * (1-u)**2 * (s.c1.y-s.start.y) + 6*(1-u)*u*(s.c2.y-s.c1.y) + 3*u*u*(s.end.y-s.c2.y),
    }
    // Degenerate handles have no derivative: use a wider neighborhood.
    if (Math.hypot(direction.x, direction.y) < .001) direction = sub(prepared.pointAt(Math.min(1,nearest+.01)),prepared.pointAt(Math.max(0,nearest-.01)))
    angle = Math.atan2(direction.y, direction.x) * 180 / Math.PI
    angle = ((angle + 90) % 180 + 180) % 180 - 90
  }
  return { ...center, angle }
}
function closestEdgeTFrom(pointAt: (t: number) => Point, point: Point) {
  let best = 0, min = Infinity
  for (let i = 0; i <= 100; i++) { const t = i / 100, delta = distance(pointAt(t), point); if (delta < min) { min = delta; best = t } }
  // Refine the best sample so label dragging does not jump in 1% steps.
  let lo = Math.max(0, best - .01), hi = Math.min(1, best + .01)
  for (let i = 0; i < 14; i++) {
    const a = lo + (hi-lo)/3, b = hi - (hi-lo)/3
    if (distance(pointAt(a),point) < distance(pointAt(b),point)) hi=b; else lo=a
  }
  const refined = (lo+hi)/2
  if (distance(pointAt(refined),point) < min) best=refined
  return best
}
export function closestEdgeT(e: DfdEdge, d: Diagram, point: Point) { return closestEdgeTFrom(prepareEdgeEvaluation(e, d).pointAt, point) }

let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined
export function textWidth(text: string, f: TextStyle) {
  if (context === undefined) context = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1).getContext('2d') : null
  if (!context) return text.length * f.fontSize * .57
  context.font = `${f.italic ? 'italic' : 'normal'} ${f.bold ? 'bold' : 'normal'} ${f.fontSize}px "${f.fontFamily}"`
  return context.measureText(text).width
}
export function wrapText(text: string, width: number, font: TextStyle): string[] {
  const result: string[] = []
  for (const paragraph of text.split('\n')) {
    if (!paragraph) { result.push(''); continue }
    let line = ''
    for (const word of paragraph.split(/\s+/)) {
      if (line && textWidth(`${line} ${word}`, font) > width) { result.push(line.trimEnd()); line = '' }
      for (const char of word) {
        if (line && textWidth(line + char, font) > width && textWidth(word, font) > width) { result.push(line); line = '' }
        line += char
      }
      line += ' '
    }
    result.push(line.trimEnd())
  }
  return result.length ? result : ['']
}
export function labelLayout(e: DfdEdge, d: Diagram) {
  const lines = wrapText(e.label.text, e.label.width - 16, e.label.font)
  const width = Math.max(22, Math.min(e.label.width, Math.max(...lines.map(t => textWidth(t, e.label.font))) + 16))
  const layout = { ...labelPosition(e, d), lines, width, height: lines.length * e.label.font.fontSize * 1.35 + 10 }
  const curved = e.label.curved && e.label.orientation === 'tangent' ? curvedLabelGeometry(e,d,layout) : null
  const margin = e.label.borderWidth ?? 0
  const outline = curved?.outline ?? [
    {x:-(width+margin)/2,y:-(layout.height+margin)/2}, {x:(width+margin)/2,y:-(layout.height+margin)/2},
    {x:(width+margin)/2,y:(layout.height+margin)/2}, {x:-(width+margin)/2,y:(layout.height+margin)/2},
  ]
  return { ...layout, glyphs: curved?.glyphs ?? [], framePath: curved?.path ?? '', outline,
    width: curved ? Math.max(...outline.map(p=>2*Math.abs(p.x))) : width+margin,
    height: curved ? Math.max(...outline.map(p=>2*Math.abs(p.y))) : layout.height+margin }
}
// Shared glyph geometry for the editor and every export. Fall back as a whole
// rather than squeezing letters into short paths or folding text around bends.
function curvedLabelGeometry(e: DfdEdge, d: Diagram, layout: {x:number;y:number;angle:number;lines:string[]}) {
  type Glyph = { text:string;x:number;y:number;angle:number }
  if (e.mode === 'straight' || !e.label.text.trim()) return null
  const samples: {p:Point;length:number}[] = [], segments=edgeSegments(e,d)
  let length=0, previous=segments[0].start
  samples.push({p:previous,length})
  for(const s of segments) for(let i=1;i<=48;i++) {
    const p=bezierPoint(s.start,s.c1,s.c2,s.end,i/48)
    length+=distance(previous,p);samples.push({p,length});previous=p
  }
  const at=(s:number):Point=>{
    // Padding can extend a few pixels past a path end, along its tangent.
    if(s<0 || s>length) {
      const last=s>length, edge=last?samples[samples.length-1].p:samples[0].p
      const v=last?sub(edge,samples[samples.length-2].p):sub(samples[1].p,edge)
      const k=(s-(last?length:0))/(Math.hypot(v.x,v.y)||1)
      return {x:edge.x+v.x*k,y:edge.y+v.y*k}
    }
    let lo=1,hi=samples.length-1
    while(lo<hi){const mid=(lo+hi)>>1;if(samples[mid].length<s)lo=mid+1;else hi=mid}
    const a=samples[lo-1],b=samples[lo]
    return lerp(a.p,b.p,clamp((s-a.length)/(b.length-a.length||1),0,1))
  }
  const center={x:layout.x,y:layout.y}, nearest=pointOnEdge(e,d,closestEdgeT(e,d,center))
  let anchor=0,best=Infinity
  for(let i=1;i<samples.length;i++) {
    const a=samples[i-1],b=samples[i],v=sub(b.p,a.p),den=v.x*v.x+v.y*v.y
    const t=clamp(((nearest.x-a.p.x)*v.x+(nearest.y-a.p.y)*v.y)/(den||1),0,1),p=lerp(a.p,b.p,t),dist=distance(p,nearest)
    if(dist<best){best=dist;anchor=a.length+(b.length-a.length)*t}
  }
  const radians=layout.angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians)
  const direction=sub(at(Math.min(length,anchor+1)),at(Math.max(0,anchor-1)))
  const sign=direction.x*c+direction.y*s>=0?1:-1,offset=sub(center,at(anchor)),glyphs:Glyph[]=[]
  const maxWidth=Math.max(...layout.lines.map(t=>textWidth(t,e.label.font)))
  const halfHeight=(layout.lines.length-1)*e.label.font.fontSize*1.35/2+e.label.font.fontSize*.65+4
  const localAt=(q:number,dy:number)=>{
    const where=anchor+sign*q,p=at(where),v=sub(at(where+1),at(where-1)),m=Math.hypot(v.x,v.y)
    const angle=Math.atan2(v.y*sign,v.x*sign),relative=((angle*180/Math.PI-layout.angle+540)%360)-180
    const delta=sub(add(p,offset),center),localAngle=relative*Math.PI/180
    return {x:delta.x*c+delta.y*s-Math.sin(localAngle)*dy,y:-delta.x*s+delta.y*c+Math.cos(localAngle)*dy,angle:relative,valid:m>.001}
  }
  // Both edges of the ribbon and all rows share the same normal field.
  // Refuse an inner edge that would fold back on a tightly curved centerline.
  const top:Point[]=[],bottom:Point[]=[],from=-maxWidth/2-8,to=maxWidth/2+8
  const steps=Math.max(16,Math.min(256,Math.ceil((to-from)/4)))
  let prior:{q:number;p:ReturnType<typeof localAt>}|undefined
  for(let i=0;i<=steps;i++) {
    const q=from+(to-from)*i/steps,p=localAt(q,0)
    if(!p.valid || Math.abs(p.angle)>35)return null
    if(prior && Math.abs(p.angle-prior.p.angle)*Math.PI/180*halfHeight/(q-prior.q)>.5)return null
    top.push(localAt(q,-halfHeight));bottom.push(localAt(q,halfHeight));prior={q,p}
  }
  for(let row=0;row<layout.lines.length;row++) {
    const line=layout.lines[row],lineWidth=textWidth(line,e.label.font)
    const start=e.label.font.align==='left'?-maxWidth/2:e.label.font.align==='right'?maxWidth/2-lineWidth:-lineWidth/2
    if(anchor+sign*start<0||anchor+sign*start>length||anchor+sign*(start+lineWidth)<0||anchor+sign*(start+lineWidth)>length)return null
    let advance=0,previousAngle:number|undefined,prefix=''
    for(const char of Array.from(line)) {
      const next=textWidth(prefix+char,e.label.font),w=next-advance
      const p=localAt(start+advance+w/2,(row-(layout.lines.length-1)/2)*e.label.font.fontSize*1.35)
      if(!p.valid || Math.abs(p.angle)>35 || previousAngle!==undefined && Math.abs(p.angle-previousAngle)>10)return null
      glyphs.push({text:char,x:p.x,y:p.y,angle:p.angle})
      previousAngle=p.angle;advance=next;prefix+=char
    }
  }
  const outline=[...top,...bottom.reverse()]
  const path=`M ${outline.map(p=>`${p.x} ${p.y}`).join(' L ')} Z`
  return {glyphs,outline,path}
}
export const screenInset = (width: number) => Math.min(20, width / 8)
export const screenLines = (width: number, height: number) => `M ${screenInset(width)} 0 V ${height} M ${width - screenInset(width)} 0 V ${height}`
export function nodeTextLayout(n: DfdNode, mode: 'analysis' | 'design' = 'analysis') {
  const inset = screenInset(n.width)
  const padding = mode === 'design' && n.kind === 'entity' ? inset + Math.min(10, (n.width - inset * 2) / 4) : 10
  const lines = wrapText(n.text, n.width * (n.kind === 'process' ? .75 : 1) - padding * 2, n.font)
  const centerY = n.height * (n.kind === 'process' && n.number ? .58 : .5)
  return { lines, centerY, x: n.font.align === 'center' ? n.width / 2 : n.font.align === 'left' ? padding : n.width - padding }
}
export const processNumberStyle = (n: DfdNode): TextStyle => ({ ...n.font, align: 'center' })
export type Bounds = { x: number; y: number; width: number; height: number }
const defaultGeometry = { visual: edgeVisual, label: labelLayout, segments: edgeSegments }
type EdgeLayout = {
  source: DfdNode; target: DfdNode
  visual?: ReturnType<typeof edgeVisual>; label?: ReturnType<typeof labelLayout>; segments?: ReturnType<typeof edgeSegments>
}
const nodeIndexes = new WeakMap<Diagram['nodes'], Map<string, DfdNode>>()
const edgeLayouts = new WeakMap<DfdEdge, EdgeLayout>()

// EditorStore preserves the objects of unchanged figures and flows across local edits.
function editorEdgeLayout(e: DfdEdge, d: Diagram) {
  let nodes = nodeIndexes.get(d.nodes)
  if (!nodes) { nodes = new Map(d.nodes.map(n => [n.id, n])); nodeIndexes.set(d.nodes, nodes) }
  const source = nodes.get(e.source.nodeId)!, target = nodes.get(e.target.nodeId)!
  let layout = edgeLayouts.get(e)
  if (!layout || layout.source !== source || layout.target !== target) {
    layout = { source, target }
    edgeLayouts.set(e, layout)
  }
  return layout
}

export const editorGeometry: typeof defaultGeometry = {
  visual: (e, d) => editorEdgeLayout(e, d).visual ??= edgeVisual(e, d),
  label: (e, d) => editorEdgeLayout(e, d).label ??= labelLayout(e, d),
  segments: (e, d) => editorEdgeLayout(e, d).segments ??= edgeSegments(e, d),
}

export function contentBounds(d: Diagram, selected?: string[], geometry = defaultGeometry): Bounds {
  const points: Point[] = []; const ids = selected ? new Set(selected) : null
  const includeNode = (n: DfdNode) => !ids || ids.has(n.id)
  for (const raw of d.nodes.filter(includeNode)) {
    const n = nodeForDiagram(raw, d)
    const extra = n.strokeWidth / 2 + 2; const text = nodeTextLayout(n, d.mode)
    const textHalfHeight = text.lines.length * n.font.fontSize * 1.35 / 2
    points.push({ x: n.x - extra, y: Math.min(n.y - extra, n.y + text.centerY - textHalfHeight - 2) }, { x: n.x + n.width + extra, y: Math.max(n.y + n.height + extra, n.y + text.centerY + textHalfHeight + 2) })
    if (n.kind === 'process' && n.number) {
      const half = textWidth(n.number, processNumberStyle(n)) / 2, halfHeight = n.font.fontSize * 1.35 / 2
      points.push({ x: n.x + n.width / 2 - half - 2, y: n.y + n.height * .28 - halfHeight - 2 }, { x: n.x + n.width / 2 + half + 2, y: n.y + n.height * .28 + halfHeight + 2 })
    }
  }
  for (const e of d.edges.filter(e => !ids || ids.has(e.id) || (ids.has(e.source.nodeId) && ids.has(e.target.nodeId)))) {
    // The control polygon encloses a cubic, including all extrema. Conservative bounds avoid clipping.
    const route = e.mode === 'straight' ? edgePoints(e, d) : undefined
    for (const q of route ? [route.start, route.end] : geometry.segments(e, d).flatMap(s => [s.start, s.c1, s.c2, s.end])) points.push({ x: q.x - 12, y: q.y - 12 }, { x: q.x + 12, y: q.y + 12 })
    const visual = geometry.visual(e, d)
    for (const q of visual.head) points.push({ x: q.x - 2, y: q.y - 2 }, { x: q.x + 2, y: q.y + 2 })
    const markPadding = e.strokeWidth / 2
    for (const q of flowEndMark(e, d, visual).flat()) {
      points.push({ x: q.x - markPadding, y: q.y - markPadding }, { x: q.x + markPadding, y: q.y + markPadding })
    }
    if (e.label.text) {
      const l = geometry.label(e, d), r = l.angle * Math.PI / 180
      const pad=(e.label.borderWidth??0)/2
      let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity
      for(const p of l.outline) {
        const x=l.x+p.x*Math.cos(r)-p.y*Math.sin(r),y=l.y+p.x*Math.sin(r)+p.y*Math.cos(r)
        left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)
      }
      points.push({x:left-pad,y:top-pad},{x:right+pad,y:bottom+pad})
    }
  }
  if (!points.length) return { x: 0, y: 0, width: 800, height: 600 }
  const minX = Math.min(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y))
  return { x: minX, y: minY, width: Math.max(1, Math.max(...points.map(p => p.x)) - minX), height: Math.max(1, Math.max(...points.map(p => p.y)) - minY) }
}
const editorBounds = new WeakMap<Diagram, Bounds>()
export function editorContentBounds(d: Diagram, selected?: string[]) {
  if (selected) return contentBounds(d, selected, editorGeometry)
  const cached = editorBounds.get(d)
  if (cached) return cached
  const bounds = contentBounds(d, undefined, editorGeometry)
  editorBounds.set(d, bounds)
  return bounds
}

export function headingLayout(d: Diagram, getBounds = contentBounds) {
  if (d.heading?.mode === 'hidden') return null
  if (!d.heading) {
    const top = Math.min(...d.nodes.filter(n => n.kind !== 'note').map(n => n.y))
    if (Number.isFinite(top) && d.nodes.some(n => n.kind === 'note' && n.font.fontSize >= 20 && n.y + n.height <= top - 12)) return null
  }
  const font = { ...defaultFont, fontFamily: 'Georgia', fontSize: 28, bold: true, color: '#263641' }
  const text = d.heading?.text ?? (diagramLevel(d) === 0 ? 'Diagrama de contexto' : `DFD nivel ${diagramLevel(d)}`)
  if (!text.trim()) return null
  const lines = [text.replace(/\s+/g, ' ').trim()], width = textWidth(lines[0], font) + 20, height = font.fontSize * 1.35 + 8
  let position = d.heading?.position
  if (!position) { const bounds = getBounds(d); position = { x: bounds.x + bounds.width / 2, y: bounds.y - 36 - height / 2 } }
  return { x: position.x - width / 2, y: position.y - height / 2, width, height, lines, font }
}
export function diagramBounds(d: Diagram, selected?: string[], includeHeading = true, getBounds = contentBounds): Bounds {
  const content = getBounds(d, selected), heading = selected || !includeHeading ? null : headingLayout(d, () => content)
  if (!heading) return content
  const x = Math.min(content.x, heading.x), y = Math.min(content.y, heading.y)
  return { x, y, width: Math.max(content.x + content.width, heading.x + heading.width) - x, height: Math.max(content.y + content.height, heading.y + heading.height) - y }
}
