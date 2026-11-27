import type { DfdNode, Point } from './model'
import { equalSpacingGuides, type SpacingGuide } from './spacing'

export interface AlignmentGuide { spacing?: SpacingGuide[]; x?: number; y?: number; xStart?: number; xEnd?: number; yStart?: number; yEnd?: number; xLabel?: string; yLabel?: string }

// Shared by DFD figures and PERT events. Positions are bounding-box origins;
// the tolerance stays at seven screen pixels at every zoom level.
export function alignedPosition(model: DfdNode, current: Point, nodes: DfdNode[], scale: number) {
  let x = current.x, y = current.y, bestX = 7 / scale, bestY = bestX
  const guide: AlignmentGuide = {}
  for (const other of nodes.filter(n => n.id !== model.id)) {
    for (const a of [0, .5, 1]) for (const b of [0, .5, 1]) {
      if ((a === .5) !== (b === .5)) continue
      const dx = other.x + other.width * a - (current.x + model.width * b)
      const dy = other.y + other.height * a - (current.y + model.height * b)
      if (Math.abs(dx) < bestX) { x = current.x + dx; bestX = Math.abs(dx); guide.x = other.x + other.width * a; guide.yStart = Math.min(current.y, other.y) - 16; guide.yEnd = Math.max(current.y + model.height, other.y + other.height) + 16; guide.xLabel = a === .5 ? 'Centros' : 'Bordes' }
      if (Math.abs(dy) < bestY) { y = current.y + dy; bestY = Math.abs(dy); guide.y = other.y + other.height * a; guide.xStart = Math.min(current.x, other.x) - 16; guide.xEnd = Math.max(current.x + model.width, other.x + other.width) + 16; guide.yLabel = a === .5 ? 'Centros' : 'Bordes' }
    }
  }
  const spacing = equalSpacingGuides(model, { x, y }, nodes, scale, current)
  guide.spacing = []
  if (spacing.x && (guide.x === undefined || spacing.x.error <= Math.abs(x - current.x) + .5 / scale)) { x = spacing.x.coordinate; delete guide.x; guide.spacing.push(spacing.x.guide) }
  if (spacing.y && (guide.y === undefined || spacing.y.error <= Math.abs(y - current.y) + .5 / scale)) { y = spacing.y.coordinate; delete guide.y; guide.spacing.push(spacing.y.guide) }
  return { x, y, guide }
}
