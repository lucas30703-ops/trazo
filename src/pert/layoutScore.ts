import type { Diagram, PertNetwork, Point } from '../model'
import { bezierPoint, edgePoints, edgeSegments, labelLayout, labelPosition } from '../geometry'
import { pertDiagram } from './geometry'

type Box = { left: number; top: number; right: number; bottom: number }
type LabelBox = Box & { edge: number }
type Segment = Box & { a: Point; b: Point; edge: number }
export interface LayoutScore { nodes: number; labels: number; overlaps: number; crossings: number; cost: number; hotspots: string[] }
const box = (a: Point, b: Point, pad = 0): Box => ({ left: Math.min(a.x, b.x) - pad, top: Math.min(a.y, b.y) - pad, right: Math.max(a.x, b.x) + pad, bottom: Math.max(a.y, b.y) + pad })
const intersects = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
function pointSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
function hitsBox(a: Point, b: Point, rect: Box) {
  let low = 0, high = 1
  for (const [p, delta, min, max] of [[a.x, b.x - a.x, rect.left, rect.right], [a.y, b.y - a.y, rect.top, rect.bottom]]) {
    if (Math.abs(delta) < .00001) { if (p < min || p > max) return false }
    else { const t1 = (min - p) / delta, t2 = (max - p) / delta; low = Math.max(low, Math.min(t1, t2)); high = Math.min(high, Math.max(t1, t2)); if (low > high) return false }
  }
  return true
}
// Large queries/items fall back to a list: no enormous empty-cell allocations.
class Grid<T extends Box> {
  private cells = new Map<string, T[]>()
  private large: T[] = []
  private all: T[] = []
  private keys(b: Box) {
    const x = Math.floor(b.left / 160), y = Math.floor(b.top / 160), r = Math.floor(b.right / 160), d = Math.floor(b.bottom / 160)
    if ((r - x + 1) * (d - y + 1) > 128) return null
    const keys: string[] = []; for (let i = x; i <= r; i++) for (let j = y; j <= d; j++) keys.push(i + ':' + j)
    return keys
  }
  add(item: T) { this.all.push(item); const keys = this.keys(item); if (!keys) this.large.push(item); else for (const key of keys) { const list = this.cells.get(key) ?? []; list.push(item); this.cells.set(key, list) } }
  query(b: Box): Iterable<T> { const keys = this.keys(b); return keys ? new Set([...this.large, ...keys.flatMap(key => this.cells.get(key) ?? [])]) : this.all }
}
function segmentMeeting(s: Segment, q: Segment, shared: boolean) {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, ex = q.b.x - q.a.x, ey = q.b.y - q.a.y, length = Math.hypot(dx, dy), otherLength = Math.hypot(ex, ey), cross = dx * ey - dy * ex
  if (length < .001 || otherLength < .001) return 0
  if (Math.abs(cross) < length * otherLength * .0001) {
    if (Math.abs((q.a.x - s.a.x) * dy - (q.a.y - s.a.y) * dx) / length > 3) return 0
    const p = ((q.a.x - s.a.x) * dx + (q.a.y - s.a.y) * dy) / length, r = p + (ex * dx + ey * dy) / length
    return Math.min(length, Math.max(p, r)) - Math.max(0, Math.min(p, r)) > (shared ? 36 : 8) ? 2 : 0
  }
  if (shared) return 0
  const x = q.a.x - s.a.x, y = q.a.y - s.a.y, t = (x * ey - y * ex) / cross, u = (x * dy - y * dx) / cross
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? 1 : 0
}
export const betterLayout = (a: LayoutScore, b: LayoutScore) => a.nodes !== b.nodes ? a.nodes < b.nodes : a.labels !== b.labels ? a.labels < b.labels : a.overlaps !== b.overlaps ? a.overlaps < b.overlaps : a.crossings !== b.crossings ? a.crossings < b.crossings : a.cost < b.cost - .01

export function layoutEvaluator(network: PertNetwork, decimals: number) {
  const diagram: Diagram = pertDiagram(network, decimals), dimensions = new Map(diagram.edges.filter(e => e.label.text).map(e => { const l = labelLayout(e, diagram); return [e.id, { width: l.width, height: l.height }] })), eventById = new Map(diagram.nodes.map(n => [n.id, n]))
  const activityOrder = new Map(network.source.map((a, i) => [a.id, i]))
  const branches = network.events.map(n => network.arrows.filter(a => a.source === n.id && a.activityId).sort((a, b) => activityOrder.get(a.activityId!)! - activityOrder.get(b.activityId!)!)).filter(out => out.length > 1)
  return { dimensions, score(positions: Map<string, Point>): LayoutScore {
    const nodes = network.events.map(e => ({ id: e.id, ...positions.get(e.id)!, ...box(positions.get(e.id)!, positions.get(e.id)!, 31) }))
    for (const n of nodes) { const model = eventById.get(n.id)!; model.x = n.x - 27; model.y = n.y - 27 }
    for (const e of diagram.edges) { const a = positions.get(e.source.nodeId)!, b = positions.get(e.target.nodeId)!, angle = Math.atan2(b.y - a.y, b.x - a.x); e.source.anchor = { kind: 'angle', value: angle }; e.target.anchor = { kind: 'angle', value: angle + Math.PI } }
    const nodeGrid = new Grid<typeof nodes[number]>(), labelGrid = new Grid<LabelBox>(), pathGrid = new Grid<Segment>(), paths: Segment[][] = [], hotspots = new Set<string>()
    let nodeHits = 0, labelHits = 0, overlaps = 0, crossings = 0, length = 0, slope = 0, dummyWidth = 0, order = 0
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    const extend = (b: Box) => { left = Math.min(left, b.left); top = Math.min(top, b.top); right = Math.max(right, b.right); bottom = Math.max(bottom, b.bottom) }
    const hotEdge = (i: number) => { if (hotspots.size < 18) { hotspots.add(diagram.edges[i].source.nodeId); hotspots.add(diagram.edges[i].target.nodeId) } }
    for (const n of nodes) { for (const q of nodeGrid.query(n)) if (Math.hypot(n.x - q.x, n.y - q.y) < 62) { nodeHits++; hotspots.add(n.id); hotspots.add(q.id) }; nodeGrid.add(n); extend(n) }
    diagram.edges.forEach((e, i) => {
      if (e.label.text) {
        const l = labelPosition(e, diagram), size = dimensions.get(e.id)!, angle = l.angle * Math.PI / 180, w = Math.abs(Math.cos(angle)) * size.width + Math.abs(Math.sin(angle)) * size.height + 8, h = Math.abs(Math.sin(angle)) * size.width + Math.abs(Math.cos(angle)) * size.height + 8
        const b = { left: l.x - w / 2, top: l.y - h / 2, right: l.x + w / 2, bottom: l.y + h / 2, edge: i }
        for (const n of nodeGrid.query(b)) { const x = Math.max(b.left, Math.min(n.x, b.right)), y = Math.max(b.top, Math.min(n.y, b.bottom)); if (Math.hypot(x - n.x, y - n.y) < 30) { labelHits++; hotspots.add(n.id); hotEdge(i) } }
        for (const q of labelGrid.query(b)) if (intersects(b, q)) { labelHits++; hotEdge(i); hotEdge(q.edge) }
        labelGrid.add(b); extend(b)
      }
      const ends = edgePoints(e, diagram), points: Point[] = [ends.start]
      if (e.mode === 'straight') points.push(ends.end)
      else { const segments = edgeSegments(e, diagram), steps = Math.max(2, Math.floor(16 / segments.length)); for (const s of segments) for (let j = 1; j <= steps; j++) points.push(bezierPoint(s.start, s.c1, s.c2, s.end, j / steps)) }
      const path: Segment[] = []; for (let j = 1; j < points.length; j++) { const a = points[j - 1], b = points[j]; path.push({ a, b, edge: i, ...box(a, b, 3) }); length += Math.hypot(b.x - a.x, b.y - a.y); extend(box(a, b)) }
      paths.push(path)
      const a = positions.get(e.source.nodeId)!, b = positions.get(e.target.nodeId)!
      if (network.arrows[i].activityId) slope += Math.abs(b.y - a.y); else dummyWidth += Math.abs(b.x - a.x)
    })
    // All arrows against every nearby node/label. Crossings use a separate,
    // bounded budget so dense networks cannot monopolize the worker.
    const checkedPairs = new Map<string, number>(); let comparisons = 0
    for (let i = 0; i < paths.length; i++) {
      const e = diagram.edges[i], blockedNodes = new Set<string>(), blockedLabels = new Set<number>()
      for (let part = 0; part < paths[i].length; part++) {
        const s = paths[i][part]
        for (const n of nodeGrid.query(s)) {
          const own = n.id === e.source.nodeId || n.id === e.target.nodeId
          if (n.id === e.source.nodeId && part === 0 || n.id === e.target.nodeId && part === paths[i].length - 1) continue
          if (pointSegment(n, s.a, s.b) < (own ? 26.5 : 31)) blockedNodes.add(n.id)
        }
        for (const l of labelGrid.query(s)) if (l.edge !== i && intersects(s, l) && hitsBox(s.a, s.b, l)) blockedLabels.add(l.edge)
        if (comparisons < 80000) {
          for (const q of pathGrid.query(s)) {
            if (q.edge === i || !intersects(s, q)) continue
            const key = q.edge + ':' + i, previous = checkedPairs.get(key) ?? 0; if (previous === 2) continue
            if (++comparisons > 80000) break
            const other = diagram.edges[q.edge], shared = e.source.nodeId === other.source.nodeId || e.target.nodeId === other.target.nodeId || e.source.nodeId === other.target.nodeId || e.target.nodeId === other.source.nodeId
            const meeting = segmentMeeting(s, q, shared)
            if (meeting === 2) { checkedPairs.set(key, 2); if (previous === 1) crossings--; overlaps++; hotEdge(i); hotEdge(q.edge) }
            else if (meeting === 1 && !previous) { checkedPairs.set(key, 1); crossings++; hotEdge(i); hotEdge(q.edge) }
          }
          pathGrid.add(s)
        }
      }
      nodeHits += blockedNodes.size; labelHits += blockedLabels.size
      if (blockedNodes.size || blockedLabels.size) { hotEdge(i); for (const id of blockedNodes) if (hotspots.size < 18) hotspots.add(id) }
    }
    // Prefer the source table's branch order, never the critical path or time.
    for (const out of branches) for (let i = 1; i < out.length; i++) if (positions.get(out[i - 1].target)!.y > positions.get(out[i].target)!.y + 1) order++
    const width = Math.max(1, right - left), height = Math.max(1, bottom - top), frame = Math.max(width, height * 2.4) * Math.max(height, width / 2.4), count = Math.max(1, paths.length)
    return { nodes: nodeHits, labels: labelHits, overlaps, crossings, hotspots: [...hotspots], cost: Math.sqrt(frame) * 3 + length / count + slope / count * .5 + dummyWidth / count + order * 35 }
  } }
}
