import { useEffect, useImperativeHandle, useMemo, useRef, useState, type PointerEvent, type Ref } from 'react'
import { Maximize } from 'lucide-react'
import type { EditorStore } from '../store'
import type { PertNetwork, Point } from '../model'
import { edgePoints, pointOnEdge } from '../geometry'
import { orthogonalRoute } from '../orthogonal'
import { pertBounds, pertDiagram } from './geometry'
import PertArt from './PertArt'
import { alignedPosition, type AlignmentGuide } from '../alignment'
import AlignmentGuides from '../AlignmentGuides'

export interface PertCanvasHandle { focus: () => void; locate: (id: string) => void; fit: () => void }
export default function PertCanvas({ network, projectId, decimals, selected, critical, visible, snap, store, onActivity, ref }: { network: PertNetwork; projectId: string; decimals: number; selected: string[]; critical: Set<string>; visible: boolean; snap: boolean; store: EditorStore; onActivity: (id: string) => void; ref: Ref<PertCanvasHandle> }) {
  const [camera, setCamera] = useState({ x: 0, y: 0, width: 1000, height: 700 }), [viewport, setViewport] = useState({ w: 1000, h: 700 }), svg = useRef<SVGSVGElement>(null), host = useRef<HTMLDivElement>(null), manual = useRef(false)
  const diagram = useMemo(() => pertDiagram(network, decimals), [network, decimals]), current = useRef({ network, camera, viewport, diagram }); current.current = { network, camera, viewport, diagram }
  const drag = useRef<null | { pointer: number; kind: 'event' | 'label' | 'source' | 'target' | 'lane' | 'pan'; id: string; start: Point; client: Point; position: Point }>(null)
  const [guides, setGuides] = useState<AlignmentGuide>({})
  const fit = () => { const { network, viewport } = current.current, b = pertBounds(network, decimals), width = Math.max(b.width, b.height * viewport.w / viewport.h), height = width * viewport.h / viewport.w; setCamera({ x: b.x - (width - b.width) / 2, y: b.y - (height - b.height) / 2, width, height }); manual.current = false }
  useImperativeHandle(ref, () => ({ focus: () => svg.current?.focus({ preventScroll: true }), fit, locate: id => { const { diagram, camera } = current.current, edge = diagram.edges.find(e => e.id === id || network.arrows.find(a => a.id === e.id)?.activityId === id); if (!edge) return; const p = pointOnEdge(edge, diagram, .5); manual.current = true; setCamera({ ...camera, x: p.x - camera.width / 2, y: p.y - camera.height / 2 }); store.select([edge.id]) } }))
  useEffect(() => { const element = host.current; if (!element) return; const observer = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; if (width > 0 && height > 0) setViewport({ w: width, h: height }) }); observer.observe(element); return () => observer.disconnect() }, [])
  useEffect(() => { manual.current = false; fit() }, [projectId])
  useEffect(() => { if (!manual.current) fit(); else setCamera(c => { const height = c.width * viewport.h / viewport.w; return { ...c, y: c.y + (c.height - height) / 2, height } }) }, [viewport.w, viewport.h, visible])
  useEffect(() => { if (!visible || !snap) setGuides({}); if (!visible && drag.current) { drag.current = null; store.endGesture() } }, [visible, snap, store])
  useEffect(() => {
    if (!visible) return
    const key = (e: KeyboardEvent) => { if (e.altKey) setGuides({}) }
    const release = () => { setGuides({}); if (drag.current) { drag.current = null; store.endGesture() } }
    const hidden = () => { if (document.visibilityState === 'hidden') release() }
    window.addEventListener('keydown', key); window.addEventListener('blur', release); document.addEventListener('visibilitychange', hidden)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', hidden) }
  }, [visible, store])
  const point = (e: { clientX: number; clientY: number }): Point => { const m = svg.current?.getScreenCTM(); if (!m) return { x: 0, y: 0 }; const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return { x: p.x, y: p.y } }
  const capture = (e: PointerEvent, kind: NonNullable<typeof drag.current>['kind'], id: string, position: Point) => { e.preventDefault(); e.stopPropagation(); svg.current?.focus({ preventScroll: true }); svg.current?.setPointerCapture(e.pointerId); drag.current = { pointer: e.pointerId, kind, id, start: point(e), client: { x: e.clientX, y: e.clientY }, position }; if (kind !== 'pan') store.beginGesture(); manual.current = true }
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current; if (!d || d.pointer !== e.pointerId) return
    if (d.kind === 'pan') { const rect = svg.current!.getBoundingClientRect(); setCamera(c => ({ ...c, x: d.position.x - (e.clientX - d.client.x) * c.width / rect.width, y: d.position.y - (e.clientY - d.client.y) * c.height / rect.height })); return }
    const p = point(e), delta = { x: p.x - d.start.x, y: p.y - d.start.y }
    let eventPosition = { x: d.position.x + delta.x, y: d.position.y + delta.y }
    if (d.kind === 'event' && snap && !e.altKey) {
      const model = diagram.nodes.find(n => n.id === d.id)!, scale = (svg.current?.getBoundingClientRect().width ?? viewport.w) / camera.width
      const aligned = alignedPosition(model, { x: eventPosition.x - 27, y: eventPosition.y - 27 }, diagram.nodes, scale)
      eventPosition = { x: aligned.x + 27, y: aligned.y + 27 }; setGuides(aligned.guide)
    } else setGuides({})
    store.command(project => { const n = project.pert?.network; if (!n) return; if (d.kind === 'event') { const event = n.events.find(e => e.id === d.id)!; event.x = Math.max(-1e7, Math.min(1e7, eventPosition.x)); event.y = Math.max(-1e7, Math.min(1e7, eventPosition.y)) } else { const a = n.arrows.find(a => a.id === d.id)!; const pos = { x: Math.max(-1e7, Math.min(1e7, d.position.x + delta.x)), y: Math.max(-1e7, Math.min(1e7, d.position.y + delta.y)) }; if (d.kind === 'label') a.labelOffset = pos; else if (d.kind === 'lane') { const axis = a.orthogonal?.axis ?? 'x'; a.orthogonal = { axis, kind: 'multi', offset: Math.max(-1e7, Math.min(1e7, d.position.x + delta[axis])) } } else if (d.kind === 'source' || d.kind === 'target') a.controls[d.kind] = pos } })
  }
  const finish = () => { setGuides({}); if (!drag.current) return; drag.current = null; store.endGesture() }
  const arrow = selected.length === 1 ? network.arrows.find(a => a.id === selected[0]) : undefined, edge = arrow && diagram.edges.find(e => e.id === arrow.id), ends = edge ? edgePoints(edge, diagram) : undefined
  const lane = edge?.mode === 'orthogonal' ? orthogonalRoute(edge, diagram) : undefined
  return <div className="pert-canvas-host" ref={host} hidden={!visible}><svg className="pert-canvas" ref={svg} tabIndex={0} role="application" aria-label="Diagrama PERT. Arrastrá círculos y etiquetas. Arrastre derecho para mover; rueda para zoom." viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`} onContextMenu={e => e.preventDefault()}
    onPointerDown={e => { if (e.button === 2 || e.button === 1) capture(e, 'pan', '', { x: camera.x, y: camera.y }); else store.select([]) }} onPointerMove={move} onPointerUp={finish} onLostPointerCapture={finish} onPointerCancel={() => { drag.current = null; setGuides({}); store.cancelGesture() }}
    onKeyDown={e => { if (e.key === 'Escape') { drag.current = null; setGuides({}); store.cancelGesture(); store.select([]) } else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); fit() } }}
    onWheel={e => { const p = point(e), factor = e.deltaY > 0 ? 1.1 : 1 / 1.1; manual.current = true; setCamera(c => { const width = Math.max(150, Math.min(100000, c.width * factor)), scale = width / c.width; return { x: p.x - (p.x - c.x) * scale, y: p.y - (p.y - c.y) * scale, width, height: c.height * scale } }) }}>
      <PertArt network={network} diagram={diagram} selected={selected} critical={critical} onEvent={(id, e) => { store.select([id]); const n = network.events.find(n => n.id === id)!; capture(e, 'event', id, n) }} onArrow={(id, e) => { svg.current?.focus({ preventScroll: true }); const ids = store.getSnapshot().selectedIds.filter(id => network.arrows.some(a => a.id === id)); store.select(e.shiftKey || e.ctrlKey || e.metaKey ? ids.includes(id) ? ids.filter(a => a !== id) : [...ids, id] : [id]); const a = network.arrows.find(a => a.id === id); if (a?.activityId) onActivity(a.activityId) }} onLabel={(id, e) => { if (e.shiftKey || e.ctrlKey || e.metaKey) { const ids = store.getSnapshot().selectedIds.filter(id => network.arrows.some(a => a.id === id)); store.select(ids.includes(id) ? ids.filter(a => a !== id) : [...ids, id]); return }; store.select([id]); const a = network.arrows.find(a => a.id === id)!; if (a.activityId) onActivity(a.activityId); capture(e, 'label', id, a.labelOffset) }} />
      {arrow?.mode === 'curve' && ends && (['source', 'target'] as const).map(end => { const origin = end === 'source' ? ends.start : ends.end, c = arrow.controls[end]; return <g key={end}><path d={`M${origin.x} ${origin.y}l${c.x} ${c.y}`} stroke="#df7748" strokeDasharray="4 4" /><circle cx={origin.x + c.x} cy={origin.y + c.y} r="6" fill="white" stroke="#df7748" style={{ cursor: 'move' }} onPointerDown={e => capture(e, end, arrow.id, c)} /></g> })}
      {arrow && lane && <rect x={(lane.spine.start.x + lane.spine.end.x) / 2 - 7} y={(lane.spine.start.y + lane.spine.end.y) / 2 - 7} width="14" height="14" rx="2" fill="white" stroke="#df7748" style={{ cursor: 'move' }} onPointerDown={e => capture(e, 'lane', arrow.id, { x: arrow.orthogonal?.offset ?? 0, y: 0 })} />}
      <AlignmentGuides guides={guides} scale={viewport.w / camera.width} background="#fafaf8" />
    </svg><div className="pert-canvas-controls"><button className="secondary-button" onClick={fit}><Maximize size={15} />Ajustar</button><span>Rueda: zoom · Arrastre derecho: mover · Mantener Tab: tabla{snap ? ' · Alt: sin ajuste' : ''}</span></div></div>
}
