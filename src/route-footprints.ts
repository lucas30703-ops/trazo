import type { DfdEdge, Diagram, Point } from './model'
import { labelLayout } from './geometry'
import type { CurveBox } from './round-curves'

export type Footprint = { points: Point[]; box: CurveBox }
export function rectangleFootprint(box: CurveBox): Footprint {
  return { box, points: [{ x: box.left, y: box.top }, { x: box.right, y: box.top }, { x: box.right, y: box.bottom }, { x: box.left, y: box.bottom }] }
}
export function labelFootprint(edge: DfdEdge, diagram: Diagram, padding = 3): Footprint | null {
  if (!edge.label.text.trim()) return null
  const label = labelLayout(edge, diagram), angle = label.angle * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
  const width = label.width / 2 + padding, height = label.height / 2 + padding
  const points = [[-width, -height], [width, -height], [width, height], [-width, height]].map(([x, y]) => ({ x: label.x + x * c - y * s, y: label.y + x * s + y * c }))
  return { points, box: { left: Math.min(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), right: Math.max(...points.map(p => p.x)), bottom: Math.max(...points.map(p => p.y)) } }
}
export function boxesTouch(a: CurveBox, b: CurveBox) { return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top }

// Separating axes use the actual rotated rectangles, not their large enclosing boxes.
export function footprintsOverlap(a: Footprint, b: Footprint) {
  if (!boxesTouch(a.box, b.box)) return false
  for (const polygon of [a.points, b.points]) for (let i = 0; i < polygon.length; i++) {
    const next = polygon[(i + 1) % polygon.length], axis = { x: polygon[i].y - next.y, y: next.x - polygon[i].x }
    const project = (p: Point) => p.x * axis.x + p.y * axis.y
    const first = a.points.map(project), second = b.points.map(project)
    if (Math.max(...first) < Math.min(...second) || Math.max(...second) < Math.min(...first)) return false
  }
  return true
}
export function pathTouchesFootprint(points: Point[], polygon: Footprint) {
  const inside = (point: Point) => {
    let sign = 0
    for (let j = 0; j < polygon.points.length; j++) {
      const a = polygon.points[j], b = polygon.points[(j + 1) % polygon.points.length], cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
      if (Math.abs(cross) < 1e-8) continue
      if (sign && Math.sign(cross) !== sign) return false
      sign = Math.sign(cross)
    }
    return true
  }
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i]
    if (!boxesTouch({ left: Math.min(from.x, to.x), top: Math.min(from.y, to.y), right: Math.max(from.x, to.x), bottom: Math.max(from.y, to.y) }, polygon.box)) continue
    if (inside(from) || inside(to)) return true
    for (let j = 0; j < polygon.points.length; j++) {
      const a = polygon.points[j], b = polygon.points[(j + 1) % polygon.points.length]
      const dx = to.x - from.x, dy = to.y - from.y, ex = b.x - a.x, ey = b.y - a.y, denominator = dx * ey - dy * ex
      if (Math.abs(denominator) < 1e-9) continue
      const t = ((a.x - from.x) * ey - (a.y - from.y) * ex) / denominator, u = ((a.x - from.x) * dy - (a.y - from.y) * dx) / denominator
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true
    }
  }
  return false
}
