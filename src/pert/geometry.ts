import type { Diagram, DfdEdge, PertNetwork } from '../model'
import { defaultFont } from '../model'
import { contentBounds, edgePoints, pointOnEdge, labelLayout } from '../geometry'
import { analyze, formatTime, type PertAnalysis } from './logic'

export function pertDiagram(network: PertNetwork, decimals = 2, showTime = true): Diagram {
  const analysis = analyze(network.source)
  return { id: 'pert', name: 'Diagrama PERT', rootLevel: 1, background: '#fafaf8', grid: false, snap: false, heading: { mode: 'hidden' },
    nodes: network.events.map(e => ({ id: e.id, kind: 'process', x: e.x - 27, y: e.y - 27, width: 54, height: 54, text: String(e.number), number: '', stroke: '#526879', strokeWidth: 2, fill: '#fff', font: defaultFont })),
    edges: network.arrows.map(a => {
      const source = network.events.find(e => e.id === a.source)!, target = network.events.find(e => e.id === a.target)!, angle = Math.atan2(target.y - source.y, target.x - source.x), result = analysis.results.find(r => r.id === a.activityId)
      return { id: a.id, source: { nodeId: a.source, anchor: { kind: 'angle', value: angle } }, target: { nodeId: a.target, anchor: { kind: 'angle', value: angle + Math.PI } }, mode: a.mode, controls: a.controls, orthogonal: a.orthogonal, cornerRadius: a.cornerRadius, stroke: a.stroke, strokeWidth: a.strokeWidth,
        label: { text: result ? result.code + (showTime ? ' · ' + formatTime(result.expected, decimals) : '') : '', t: .5, offset: a.labelOffset, width: Math.max(90, (result?.code.length ?? 0) * 9 + 90), angle: 0, orientation: a.labelOrientation ?? 'horizontal', background: true, font: { ...defaultFont, fontSize: 14, bold: true } } } satisfies DfdEdge
    }) }
}
export function pertBounds(network: PertNetwork, decimals = 2, showTime = true) {
  const b = contentBounds(pertDiagram(network, decimals, showTime))
  return { x: b.x - 45, y: b.y - 45, width: Math.max(200, b.width + 90), height: Math.max(160, b.height + 90) }
}
export function criticalArrowIds(network: PertNetwork, analysis: PertAnalysis, path?: string[]) {
  const byId = new Map(analysis.results.map(r => [r.id, r])), early = new Map<string, number>(), late = new Map<string, number>()
  const events = [...network.events].sort((a, b) => a.number - b.number)
  for (const e of events) {
    early.set(e.id, Math.max(0, ...network.arrows.filter(a => a.target === e.id).map(a => (early.get(a.source) ?? 0) + (byId.get(a.activityId ?? '')?.expected ?? 0))))
  }
  for (const e of [...events].reverse()) {
    const out = network.arrows.filter(a => a.source === e.id)
    late.set(e.id, out.length ? Math.min(...out.map(a => late.get(a.target)! - (byId.get(a.activityId ?? '')?.expected ?? 0))) : analysis.duration)
  }
  const critical = new Set(network.arrows.filter(a => Math.abs(late.get(a.target)! - early.get(a.source)! - (byId.get(a.activityId ?? '')?.expected ?? 0)) <= analysis.tolerance).map(a => a.id))
  if (!path) return critical
  // Trace only zero-duration links between this route's consecutive real arrows.
  const selected = new Set<string>(), real = path.map(id => network.arrows.find(a => a.activityId === id)!).filter(Boolean)
  const links = (from: string, to: string) => {
    const queue = [from], previous = new Map<string, { from: string; arrow: string }>(); let index = 0
    while (index < queue.length && !queue.includes(to)) { const id = queue[index++]; for (const a of network.arrows) if (!a.activityId && a.source === id && critical.has(a.id) && !previous.has(a.target) && a.target !== from) { previous.set(a.target, { from: id, arrow: a.id }); queue.push(a.target) } }
    if (from !== to && !previous.has(to)) return
    let id = to; while (id !== from) { const p = previous.get(id)!; selected.add(p.arrow); id = p.from }
  }
  for (const a of real) selected.add(a.id)
  for (let i = 1; i < real.length; i++) links(real[i - 1].target, real[i].source)
  if (real.length) { links(events[0].id, real[0].source); links(real.at(-1)!.target, events.at(-1)!.id) }
  return selected
}
export function visualWarnings(d: Diagram): { id: string; message: string }[] {
  const warnings: { id: string; message: string }[] = []
  const edges = d.edges.slice(0, 80)
  const labels = new Map(edges.filter(e => e.label.text).map(e => {
    const l = labelLayout(e, d), angle = l.angle * Math.PI / 180
    return [e.id, { x: l.x, y: l.y, width: Math.abs(Math.cos(angle)) * l.width + Math.abs(Math.sin(angle)) * l.height, height: Math.abs(Math.sin(angle)) * l.width + Math.abs(Math.cos(angle)) * l.height }] as const
  }))
  for (const e of edges) {
    const label = labels.get(e.id)
    const samples = Array.from({ length: 15 }, (_, i) => pointOnEdge(e, d, (i + 1) / 16))
    if (d.nodes.some(n => n.id !== e.source.nodeId && n.id !== e.target.nodeId && samples.some(p => Math.hypot(p.x - n.x - 27, p.y - n.y - 27) < 29))) warnings.push({ id: e.id, message: 'Una flecha pasa sobre otro evento.' })
    if (label && d.nodes.some(n => Math.abs(label.x - n.x - 27) < label.width / 2 + 20 && Math.abs(label.y - n.y - 27) < label.height / 2 + 20)) warnings.push({ id: e.id, message: 'Una etiqueta está cerca de un evento.' })
    for (const other of edges) if (other.id < e.id && label) { const q = labels.get(other.id); if (q && Math.abs(label.x - q.x) < (label.width + q.width) / 2 && Math.abs(label.y - q.y) < (label.height + q.height) / 2) { warnings.push({ id: e.id, message: 'Hay etiquetas superpuestas.' }); break } }
    if (warnings.length >= 30) break
  }
  return warnings
}
export { edgePoints }
