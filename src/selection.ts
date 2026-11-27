import type { Diagram, Point } from './model'
import { distance, edgePoints, edgeSegments, edgeVisual, flowEndMark, labelLayout, lerp } from './geometry'

export interface SelectionRect { x: number; y: number; width: number; height: number }
export function selectionRect(a: Point, b: Point): SelectionRect { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) } }
const contains = (r: SelectionRect, p: Point) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
const overlap = (a: SelectionRect, b: SelectionRect) => a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
const padded = (r: SelectionRect, pad: number): SelectionRect => ({ x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 })
function lineHits(a: Point, b: Point, r: SelectionRect) {
  let low = 0, high = 1
  for (const [origin, delta, min, max] of [[a.x, b.x - a.x, r.x, r.x + r.width], [a.y, b.y - a.y, r.y, r.y + r.height]]) {
    if (Math.abs(delta) < 1e-9) { if (origin < min || origin > max) return false }
    else { let t1 = (min - origin) / delta, t2 = (max - origin) / delta; if (t1 > t2) [t1, t2] = [t2, t1]; low = Math.max(low, t1); high = Math.min(high, t2); if (low > high) return false }
  }
  return high >= 0 && low <= 1
}
function polygonHits(points: Point[], r: SelectionRect) {
  if (points.some(p => contains(r, p)) || points.some((p, i) => lineHits(p, points[(i + 1) % points.length], r))) return true
  // The selection may sit entirely inside a label or arrowhead.
  const corner = { x: r.x, y: r.y }; let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j]
    if ((a.y > corner.y) !== (b.y > corner.y) && corner.x < (b.x - a.x) * (corner.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
function curveHits(s: ReturnType<typeof edgeSegments>[number], r: SelectionRect, depth = 0): boolean {
  if (contains(r, s.start) || contains(r, s.end)) return true
  const points = [s.start, s.c1, s.c2, s.end], minX = Math.min(...points.map(p => p.x)), minY = Math.min(...points.map(p => p.y))
  if (!overlap(r, { x: minX, y: minY, width: Math.max(...points.map(p => p.x)) - minX, height: Math.max(...points.map(p => p.y)) - minY })) return false
  const chord = distance(s.start, s.end), net = distance(s.start, s.c1) + distance(s.c1, s.c2) + distance(s.c2, s.end)
  const dx = s.end.x - s.start.x, dy = s.end.y - s.start.y
  const flatness = chord ? Math.max(Math.abs((s.c1.x - s.start.x) * dy - (s.c1.y - s.start.y) * dx), Math.abs((s.c2.x - s.start.x) * dy - (s.c2.y - s.start.y) * dx)) / chord : net
  if (depth >= 12 || (net - chord <= .2 && flatness <= .5)) return lineHits(s.start, s.end, padded(r, .5))
  const a = lerp(s.start, s.c1, .5), b = lerp(s.c1, s.c2, .5), c = lerp(s.c2, s.end, .5), ab = lerp(a, b, .5), bc = lerp(b, c, .5), middle = lerp(ab, bc, .5)
  return curveHits({ start: s.start, c1: a, c2: ab, end: middle }, r, depth + 1) || curveHits({ start: middle, c1: bc, c2: c, end: s.end }, r, depth + 1)
}
export function selectedInRect(diagram: Diagram, r: SelectionRect, scale: number): string[] {
  const ids = diagram.nodes.filter(n => overlap(r, padded({ x: n.x, y: n.y, width: n.width, height: n.height }, n.strokeWidth / 2))).map(n => n.id)
  for (const edge of diagram.edges) {
    const hitArea = padded(r, edge.strokeWidth / 2 + 1 / scale), p = edgePoints(edge, diagram)
    let hit = edge.mode === 'straight' ? lineHits(p.start, p.end, hitArea) : edgeSegments(edge, diagram).some(segment => curveHits(segment, hitArea))
    if (!hit) {
      const visual = edgeVisual(edge, diagram)
      hit = polygonHits(visual.head, hitArea) || flowEndMark(edge, diagram, visual).some(([a, b]) => lineHits(a, b, hitArea))
    }
    if (!hit && edge.label.text) {
      const label = labelLayout(edge, diagram), radians = label.angle * Math.PI / 180
      hit = polygonHits(label.outline.map(({x,y}) => ({ x: label.x + x*Math.cos(radians)-y*Math.sin(radians), y: label.y+x*Math.sin(radians)+y*Math.cos(radians) })), padded(r,(edge.label.borderWidth??0)/2))
    }
    if (hit) ids.push(edge.id)
  }
  return ids
}
