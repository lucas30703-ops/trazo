import { bezierPoint, clamp, distance, edgePoints, edgeVisual, editorGeometry, lerp } from './geometry'
import type { DfdEdge, Diagram, Point } from './model'

type Cubic = ReturnType<typeof edgeVisual>['segments'][number]
type Box = { left: number; top: number; right: number; bottom: number }
type SampleLine = {
  a: Point
  b: Point
  segment: number
  u0: number
  u1: number
  length: number
  fromStart: number
  bounds: Box
}
type SampledEdge = {
  edge: DfdEdge
  lines: SampleLine[]
  segments: Cubic[]
  segmentLengths: number[]
  total: number
  bounds: Box
}
type Gap = { segment: number; start: number; end: number }

export interface FlowOverlap {
  firstId: string
  secondId: string
  length: number
}

export interface FlowReadability {
  paths: Map<string, string>
  gaps: Map<string, Gap[]>
  crossings: number
  crossingIds: Set<string>
  overlaps: FlowOverlap[]
  overlapIds: Set<string>
}

const cache = new Map<string, { fingerprint: string; result: FlowReadability }>()
const editorResults = new WeakMap<Diagram, FlowReadability>()
const editorSamples = new WeakMap<ReturnType<typeof edgeVisual>, SampledEdge>()
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x
const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y })
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y
const boundsOverlap = (a: Box, b: Box, margin: number) => a.left <= b.right + margin && a.right >= b.left - margin && a.top <= b.bottom + margin && a.bottom >= b.top - margin

function fingerprint(d: Diagram) {
  return JSON.stringify([
    d.flowCrossings !== false,
    d.nodes.map(n => [n.id, n.x, n.y, n.width, n.height, n.kind, n.strokeWidth]),
    d.edges.map(e => [e.id, e.source, e.target, e.mode, e.controls, e.orthogonal, e.cornerRadius, e.generatedRoute, e.waypoints, e.strokeWidth]),
  ])
}

function sampleEdge(edge: DfdEdge, visual: ReturnType<typeof edgeVisual>): SampledEdge {
  const lines: SampleLine[] = [], segmentLengths: number[] = []
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  let fromStart = 0
  visual.segments.forEach((segment, index) => {
    const controlLength = distance(segment.start, segment.c1) + distance(segment.c1, segment.c2) + distance(segment.c2, segment.end)
    const steps = Math.max(6, Math.min(48, Math.ceil(controlLength / 10)))
    let previous = segment.start, segmentLength = 0
    for (let step = 1; step <= steps; step++) {
      const u1 = step / steps, point = bezierPoint(segment.start, segment.c1, segment.c2, segment.end, u1), length = distance(previous, point)
      if (length > .0001) {
        const bounds = { left: Math.min(previous.x, point.x), top: Math.min(previous.y, point.y), right: Math.max(previous.x, point.x), bottom: Math.max(previous.y, point.y) }
        lines.push({ a: previous, b: point, segment: index, u0: (step - 1) / steps, u1, length, fromStart, bounds })
        left = Math.min(left, bounds.left); top = Math.min(top, bounds.top)
        right = Math.max(right, bounds.right); bottom = Math.max(bottom, bounds.bottom)
        fromStart += length; segmentLength += length
      }
      previous = point
    }
    segmentLengths.push(segmentLength)
  })
  return {
    edge, lines, segments: visual.segments, segmentLengths, total: fromStart,
    bounds: lines.length ? { left, top, right, bottom } : { left: 0, top: 0, right: 0, bottom: 0 },
  }
}

const intersectionTolerance = .0001
function properIntersection(a: SampleLine, b: SampleLine) {
  const r = subtract(a.b, a.a), s = subtract(b.b, b.a), denominator = cross(r, s)
  if (Math.abs(denominator) < .00001) return undefined
  const delta = subtract(b.a, a.a), t = cross(delta, s) / denominator, u = cross(delta, r) / denominator
  if (t < -intersectionTolerance || t > 1 + intersectionTolerance || u < -intersectionTolerance || u > 1 + intersectionTolerance) return undefined
  return { point: { x: a.a.x + r.x * t, y: a.a.y + r.y * t }, t: clamp(t, 0, 1), u: clamp(u, 0, 1), sin: Math.abs(denominator) / (a.length * b.length || 1) }
}

function pointSegmentParameter(point: Point, line: SampleLine) {
  const delta = subtract(line.b, line.a), length2 = dot(delta, delta)
  return length2 ? clamp(dot(subtract(point, line.a), delta) / length2, 0, 1) : 0
}

function pointSegmentDistance(point: Point, line: SampleLine) {
  const t = pointSegmentParameter(point, line)
  return distance(point, { x: line.a.x + (line.b.x - line.a.x) * t, y: line.a.y + (line.b.y - line.a.y) * t })
}

function interior(sample: SampledEdge, line: SampleLine, t: number, margin = 18) {
  const at = line.fromStart + line.length * t
  return at > margin && sample.total - at > margin
}

function insideFigure(point: Point, d: Diagram, margin = 4) {
  return d.nodes.some(n => n.kind !== 'note' && (n.kind === 'process'
    ? Math.hypot((point.x - n.x - n.width / 2) / (n.width / 2 + margin), (point.y - n.y - n.height / 2) / (n.height / 2 + margin)) <= 1
    : point.x >= n.x - margin && point.x <= n.x + n.width + margin && point.y >= n.y - margin && point.y <= n.y + n.height + margin))
}

function parallelOverlap(a: SampleLine, b: SampleLine) {
  const av = subtract(a.b, a.a), bv = subtract(b.b, b.a), cosine = Math.abs(dot(av, bv) / (a.length * b.length || 1))
  if (cosine < .985) return undefined
  const unit = { x: av.x / a.length, y: av.y / a.length }
  const p0 = dot(subtract(b.a, a.a), unit), p1 = dot(subtract(b.b, a.a), unit)
  const start = Math.max(0, Math.min(p0, p1)), end = Math.min(a.length, Math.max(p0, p1))
  if (end - start < 1) return undefined
  const center = { x: a.a.x + unit.x * (start + end) / 2, y: a.a.y + unit.y * (start + end) / 2 }
  const bt = pointSegmentParameter(center, b)
  return { length: end - start, at: (start + end) / (2 * a.length), bt, distance: pointSegmentDistance(center, b), center }
}

function splitCubic(segment: Cubic, t: number): [Cubic, Cubic] {
  const a = lerp(segment.start, segment.c1, t), b = lerp(segment.c1, segment.c2, t), c = lerp(segment.c2, segment.end, t)
  const ab = lerp(a, b, t), bc = lerp(b, c, t), middle = lerp(ab, bc, t)
  return [
    { start: segment.start, c1: a, c2: ab, end: middle },
    { start: middle, c1: bc, c2: c, end: segment.end },
  ]
}

function cubicSlice(segment: Cubic, start: number, end: number) {
  let prefix = end < 1 ? splitCubic(segment, end)[0] : segment
  if (start <= 0) return prefix
  return splitCubic(prefix, start / end)[1]
}

function pathWithGaps(sample: SampledEdge, gaps: Gap[]) {
  const grouped = new Map<number, Gap[]>()
  for (const gap of gaps) grouped.set(gap.segment, [...(grouped.get(gap.segment) ?? []), gap])
  const parts: Cubic[] = []
  sample.segments.forEach((segment, index) => {
    const intervals = (grouped.get(index) ?? []).sort((a, b) => a.start - b.start).reduce<Gap[]>((merged, gap) => {
      const last = merged.at(-1)
      if (last && gap.start <= last.end) last.end = Math.max(last.end, gap.end)
      else merged.push({ ...gap })
      return merged
    }, [])
    let cursor = 0
    for (const interval of intervals) {
      if (interval.start - cursor > .0001) parts.push(cubicSlice(segment, cursor, interval.start))
      cursor = Math.max(cursor, interval.end)
    }
    if (1 - cursor > .0001) parts.push(cubicSlice(segment, cursor, 1))
  })
  return parts.map(part => `M ${part.start.x} ${part.start.y} C ${part.c1.x} ${part.c1.y} ${part.c2.x} ${part.c2.y} ${part.end.x} ${part.end.y}`).join(' ')
}

export function analyzeEditorFlowReadability(d: Diagram) {
  const cached = editorResults.get(d)
  if (cached) return cached
  const result = analyzeFlowReadability(d, true)
  editorResults.set(d, result)
  return result
}

export function analyzeFlowReadability(d: Diagram, useEditorCache = false): FlowReadability {
  const key = fingerprint(d), saved = cache.get(d.id)
  if (saved?.fingerprint === key) return saved.result
  const samples = d.edges.map(edge => {
    if (!useEditorCache) return sampleEdge(edge, edgeVisual(edge, d))
    const visual = editorGeometry.visual(edge, d), cached = editorSamples.get(visual)
    if (cached) return cached
    const sample = sampleEdge(edge, visual)
    editorSamples.set(visual, sample)
    return sample
  }), gaps = new Map<string, Gap[]>(), crossingIds = new Set<string>(), overlapIds = new Set<string>(), overlaps: FlowOverlap[] = []
  let crossings = 0
  for (let i = 0; i < samples.length; i++) for (let j = i + 1; j < samples.length; j++) {
    const lower = samples[i], upper = samples[j]
    if (!boundsOverlap(lower.bounds, upper.bounds, 8)) continue
    const pairCrossings: Point[] = []
    for (const a of lower.lines) for (const b of upper.lines) {
      // Intersections can extend slightly past a sampled segment's endpoints.
      if (!boundsOverlap(a.bounds, b.bounds, (a.length + b.length) * intersectionTolerance + 1e-8)) continue
      const hit = properIntersection(a, b)
      if (!hit || hit.sin < .16 || !interior(lower, a, hit.t) || !interior(upper, b, hit.u) || insideFigure(hit.point, d) || pairCrossings.some(point => distance(point, hit.point) < 6)) continue
      pairCrossings.push(hit.point); crossings++; crossingIds.add(lower.edge.id); crossingIds.add(upper.edge.id)
      if (d.flowCrossings === false) continue
      const speed = a.length / Math.max(.0001, a.u1 - a.u0), half = Math.max(6, (lower.edge.strokeWidth + upper.edge.strokeWidth) / 2 + 4), center = a.u0 + (a.u1 - a.u0) * hit.t, radius = half / speed
      const gap = { segment: a.segment, start: clamp(center - radius, 0, 1), end: clamp(center + radius, 0, 1) }, edgeGaps = gaps.get(lower.edge.id)
      if (edgeGaps) edgeGaps.push(gap); else gaps.set(lower.edge.id, [gap])
    }
    let overlapLength = 0
    const threshold = (lower.edge.strokeWidth + upper.edge.strokeWidth) / 2 + 3
    for (const a of lower.lines) {
      let best = 0
      for (const b of upper.lines) {
        if (!boundsOverlap(a.bounds, b.bounds, threshold + 1e-8)) continue
        const overlap = parallelOverlap(a, b)
        if (!overlap || overlap.distance > threshold || !interior(lower, a, overlap.at) || !interior(upper, b, overlap.bt) || insideFigure(overlap.center, d)) continue
        best = Math.max(best, overlap.length)
      }
      overlapLength += best
    }
    if (overlapLength >= 28) {
      overlaps.push({ firstId: lower.edge.id, secondId: upper.edge.id, length: overlapLength })
      overlapIds.add(lower.edge.id); overlapIds.add(upper.edge.id)
    }
  }
  const paths = new Map<string, string>()
  for (const sample of samples) {
    const edgeGaps = gaps.get(sample.edge.id)
    if (edgeGaps?.length) paths.set(sample.edge.id, pathWithGaps(sample, edgeGaps))
  }
  const result = { paths, gaps, crossings, crossingIds, overlaps, overlapIds }
  cache.set(d.id, { fingerprint: key, result })
  if (cache.size > 24) cache.delete(cache.keys().next().value!)
  return result
}

export function connectedFlowIds(d: Diagram, selectedIds: string[]) {
  if (!selectedIds.length) return undefined
  const result = new Set(selectedIds), selectedNodes = new Set(selectedIds.filter(id => d.nodes.some(n => n.id === id)))
  for (const id of selectedIds) {
    const edge = d.edges.find(e => e.id === id)
    if (edge) { result.add(edge.source.nodeId); result.add(edge.target.nodeId) }
  }
  for (const edge of d.edges) if (selectedNodes.has(edge.source.nodeId) || selectedNodes.has(edge.target.nodeId)) {
    result.add(edge.id); result.add(edge.source.nodeId); result.add(edge.target.nodeId)
  }
  return result
}

export function separateFlowPaths(d: Diagram, ids: string[]) {
  const selected = d.edges.filter(edge => ids.includes(edge.id) && !edge.locked)
  if (selected.length < 2) return 0
  const spacing = 18
  selected.forEach((edge, index) => {
    const { start, end } = edgePoints(edge, d), delta = subtract(end, start), magnitude = Math.hypot(delta.x, delta.y) || 1
    let normal = { x: -delta.y / magnitude, y: delta.x / magnitude }
    if (delta.x < 0 || Math.abs(delta.x) < .001 && delta.y < 0) normal = { x: -normal.x, y: -normal.y }
    const amount = (index - (selected.length - 1) / 2) * spacing
    if (edge.mode === 'orthogonal') {
      const orthogonal = edge.orthogonal ?? { axis: Math.abs(delta.x) >= Math.abs(delta.y) ? 'y' : 'x', offset: 0, kind: 'multi' as const }
      edge.orthogonal = { ...orthogonal, kind: 'multi', offset: orthogonal.offset + amount }
    } else {
      if (edge.mode === 'straight') {
        edge.mode = 'curve'
        edge.controls = { source: { x: delta.x / 3, y: delta.y / 3 }, target: { x: -delta.x / 3, y: -delta.y / 3 } }
      }
      edge.controls.source.x += normal.x * amount; edge.controls.source.y += normal.y * amount
      edge.controls.target.x += normal.x * amount; edge.controls.target.y += normal.y * amount
      for (const point of edge.generatedRoute ?? edge.waypoints ?? []) { point.offset.x += normal.x * amount; point.offset.y += normal.y * amount }
    }
    edge.routing = 'manual'; delete edge.routingIssue
  })
  return selected.length
}
