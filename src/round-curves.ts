import type { Point } from './model'
import { bezierPoint, clamp, distance, lerp, sub } from './geometry'

export type CubicSegment = { start: Point; c1: Point; c2: Point; end: Point }
export type CurveBox = { left: number; top: number; right: number; bottom: number }
export type RoundCandidate = { segment: CubicSegment; points: Point[]; box: CurveBox; cost: number; bow: number; length: number }
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x
const unit = (v: Point) => { const length = Math.hypot(v.x, v.y) || 1; return { x: v.x / length, y: v.y / length } }
const along = (p: Point, v: Point, length: number) => ({ x: p.x + v.x * length, y: p.y + v.y * length })

// Keep the anchor fixed, allowing oblique tangents inside the outward hemisphere.
function outward(direction: Point, normals: Point[]) {
  const normal = normals.reduce((best, candidate) => dot(direction, candidate) > dot(direction, best) ? candidate : best)
  const d = unit(direction), cosine = dot(d, normal)
  if (cosine >= .18) return d
  const tangent = unit({ x: d.x - normal.x * cosine, y: d.y - normal.y * cosine })
  return Math.hypot(tangent.x, tangent.y) < .1 ? normal : { x: normal.x * .18 + tangent.x * Math.sqrt(1 - .18 ** 2), y: normal.y * .18 + tangent.y * Math.sqrt(1 - .18 ** 2) }
}

function describe(segment: CubicSegment, preferredBow: number): RoundCandidate {
  const { start, c1, c2, end } = segment, chord = sub(end, start), span = distance(start, end), scale = Math.max(span, 40), axis = unit(chord)
  const points = Array.from({ length: 25 }, (_, i) => bezierPoint(start, c1, c2, end, i / 24))
  const curvatures: number[] = [], weights: number[] = []; let reversals = 0, cusps = 0, inflections = 0, previousSign = 0
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, u = 1 - t
    const velocity = { x: 3 * (u * u * (c1.x - start.x) + 2 * u * t * (c2.x - c1.x) + t * t * (end.x - c2.x)), y: 3 * (u * u * (c1.y - start.y) + 2 * u * t * (c2.y - c1.y) + t * t * (end.y - c2.y)) }
    const acceleration = { x: 6 * (u * (c2.x - 2 * c1.x + start.x) + t * (end.x - 2 * c2.x + c1.x)), y: 6 * (u * (c2.y - 2 * c1.y + start.y) + t * (end.y - 2 * c2.y + c1.y)) }
    const speed = Math.hypot(velocity.x, velocity.y), curvature = clamp(cross(velocity, acceleration) * scale / Math.max(speed ** 3, 1e-6), -100, 100)
    curvatures.push(curvature); weights.push(speed)
    if (speed < scale * .025) cusps++
    if (span > 1 && dot(velocity, axis) < -scale * .03) reversals++
    const sign = Math.abs(curvature) > .03 ? Math.sign(curvature) : 0
    if (sign && previousSign && sign !== previousSign) inflections++
    if (sign) previousSign = sign
  }
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1
  const mean = curvatures.reduce((sum, k, i) => sum + Math.abs(k) * weights[i], 0) / totalWeight
  const variation = curvatures.reduce((sum, k, i) => sum + (Math.abs(k) - mean) ** 2 * weights[i], 0) / totalWeight
  const peak = Math.max(...curvatures.map(Math.abs)), concentration = Math.max(0, peak / (mean + .1) - 1.25)
  const bow = span > 1 ? cross(axis, sub(points[12], lerp(start, end, .5))) / span : 0
  const length = points.slice(1).reduce((sum, point, i) => sum + distance(point, points[i]), 0)
  // A reference bow prevents fairness alone from flattening every curve to a line.
  const cost = inflections * 1500 + reversals * 1000 + cusps * 10000 + variation / (mean + .15) ** 2 * 32 + concentration ** 2 * 14 + (span > 1 ? (bow - preferredBow) ** 2 * 1100 : 0) + length / scale * 10
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  return { segment, points, bow, length, cost, box: { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) } }
}

export function roundCandidates(start: Point, end: Point, sourceNormals: Point[], targetNormals: Point[], preferredBow: number, detourBows: number[] = []): RoundCandidate[] {
  const sourceNormal = sourceNormals[0], targetNormal = targetNormals[0]
  const span = distance(start, end), axis = unit(sub(end, start)), side = { x: -axis.y, y: axis.x }
  if (span < 1) {
    const tangent = { x: -sourceNormal.y, y: sourceNormal.x }
    return [48, 80, 120].map(radius => describe({ start, end, c1: along(along(start, sourceNormal, radius), tangent, radius), c2: along(along(end, targetNormal, radius), tangent, -radius) }, 0))
  }
  const bows = [...new Set([preferredBow, -preferredBow, 0, .1, -.1, .18, -.18, .28, -.28, .4, -.4, .47, -.47, ...detourBows.map(bow => clamp(bow, -.72, .72))])]
  const result: RoundCandidate[] = [], seen = new Set<string>()
  for (const bow of bows) {
    // Cubic circular-arc approximation: h = bow * chord, tangent handle = 4R/3 tan(theta/4).
    // Resolving that handle along/across the chord gives these two components.
    const forward = span * (1 - 4 * bow * bow) / 3, lateral = span * 4 * bow / 3
    const sourceVector = { x: axis.x * forward + side.x * lateral, y: axis.y * forward + side.y * lateral }
    const targetVector = { x: -axis.x * forward + side.x * lateral, y: -axis.y * forward + side.y * lateral }
    const handle = Math.hypot(forward, lateral)
    for (const normalWeight of [0, .35, .75]) {
      const sourceDirection = outward(sourceVector, sourceNormals), targetDirection = outward(targetVector, targetNormals)
      const sourceAxis = sourceNormals.reduce((best, candidate) => dot(sourceDirection, candidate) > dot(sourceDirection, best) ? candidate : best)
      const targetAxis = targetNormals.reduce((best, candidate) => dot(targetDirection, candidate) > dot(targetDirection, best) ? candidate : best)
      const a = unit(lerp(sourceDirection, sourceAxis, normalWeight)), b = unit(lerp(targetDirection, targetAxis, normalWeight))
      const proportions = normalWeight === .35 ? [[1, 1], [.8, 1.15], [1.15, .8]] : [[1, 1]]
      for (const [sourceScale, targetScale] of proportions) {
        const segment = { start, end, c1: along(start, a, handle * sourceScale), c2: along(end, b, handle * targetScale) }
        const key = [segment.c1.x, segment.c1.y, segment.c2.x, segment.c2.y].map(n => n.toFixed(2)).join(':')
        if (!seen.has(key)) { seen.add(key); result.push(describe(segment, preferredBow)) }
      }
    }
  }
  return result
}

export function curveBoxesOverlap(a: CurveBox, b: CurveBox, gap = 16) {
  return a.left <= b.right + gap && a.right + gap >= b.left && a.top <= b.bottom + gap && a.bottom + gap >= b.top
}

// Soft pair cost. Node collisions are checked separately against adaptive subdivisions.
export function curvePairMetrics(a: RoundCandidate, b: RoundCandidate, gap: number) {
  if (!curveBoxesOverlap(a.box, b.box, gap)) return { conflicts: 0, cost: 0 }
  let crossings = 0, closeLength = 0
  const sharedEnds = [a.points[0], a.points.at(-1)!].filter(p => distance(p, b.points[0]) < .5 || distance(p, b.points.at(-1)!) < .5)
  for (let i = 1; i < a.points.length; i++) {
    const from = a.points[i - 1], to = a.points[i], middle = lerp(from, to, .5), delta = sub(to, from), length = distance(from, to)
    // Exempt only the unavoidable contact at an actually shared anchor.
    if (sharedEnds.some(p => distance(middle, p) < Math.max(6, gap / 2))) continue
    let close = false
    for (let j = 1; j < b.points.length; j++) {
      const otherFrom = b.points[j - 1], otherTo = b.points[j], otherDelta = sub(otherTo, otherFrom)
      if (Math.max(from.x, to.x) + gap < Math.min(otherFrom.x, otherTo.x) || Math.min(from.x, to.x) - gap > Math.max(otherFrom.x, otherTo.x) || Math.max(from.y, to.y) + gap < Math.min(otherFrom.y, otherTo.y) || Math.min(from.y, to.y) - gap > Math.max(otherFrom.y, otherTo.y)) continue
      const denominator = cross(delta, otherDelta)
      if (Math.abs(denominator) > 1e-6) {
        const between = sub(otherFrom, from), t = cross(between, otherDelta) / denominator, u = cross(between, delta) / denominator
        if (t > 0 && t <= 1 && u > 0 && u <= 1) crossings++
      }
      const t = clamp(dot(sub(middle, otherFrom), otherDelta) / (dot(otherDelta, otherDelta) || 1), 0, 1)
      if (Math.abs(dot(unit(delta), unit(otherDelta))) > .8 && distance(middle, lerp(otherFrom, otherTo, t)) < gap) close = true
    }
    if (close) closeLength += length
  }
  const overlap = closeLength / Math.max(20, Math.min(a.length, b.length))
  return { conflicts: crossings + (closeLength > Math.max(3, gap / 3) ? 1 : 0), cost: crossings * 85 + overlap * 160 }
}
