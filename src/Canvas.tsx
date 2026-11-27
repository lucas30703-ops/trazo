import { Presence } from './motion'
import AlignmentGuides from './AlignmentGuides'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Eye, Maximize, Minus, Plus, LocateFixed, Scissors } from 'lucide-react'
import { DiagramEngine } from './engine'
import type { EditorStore } from './store'
import type { DfdNode, Point, ShapeKind } from './model'
import { clone } from './model'
import { defaultOrthogonal, orthogonalRoute } from './orthogonal'
import { startCanvasPan } from './pan'
import ProcessMenu from './ProcessMenu'
import { selectedInRect, selectionRect, type SelectionRect } from './selection'
import { anchorPoint, bendEdge, clamp, closestEdgeT, edgePath, edgePoints, edgeSegments, editorContentBounds, editorGeometry, headingLayout, hitNode, nearestAnchor, pointOnEdge, polygonPoints, routePoints, sub } from './geometry'
import { analyzeEditorFlowReadability, connectedFlowIds } from './flowReadability'
import { flowEndMark, flowEndMarkPath } from './geometry'

export interface CanvasApi { fit: () => void; zoom: (factor: number) => void; resetZoom: () => void; locate: (id: string) => void; focus: () => void }
interface Props { store: EditorStore; onEdit: (id: string) => void; onReady: (api: CanvasApi) => void; notify: (text: string) => void; showInfo?: boolean }
type Preview = { start: Point; end: Point; targetId?: string }
export default function Canvas({ store, onEdit, onReady, notify, showInfo = true }: Props) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot), d = store.diagram
  const { selectedIds, tool } = state
  const graphRef = useRef<HTMLDivElement>(null), engine = useRef<DiagramEngine | null>(null), rootRef = useRef<HTMLDivElement>(null)
  const overlayRef = useRef<SVGGElement>(null), viewportScale = useRef<number | undefined>(undefined)
  const [scale, setScale] = useState(1)
  const [preview, setPreview] = useState<Preview | null>(null), [guides, setGuides] = useState<import('./engine').AlignmentGuide>({})
  const [panning, setPanning] = useState(false), [hoverAnchor, setHoverAnchor] = useState<Point | null>(null)
  const [marquee, setMarquee] = useState<SelectionRect | null>(null)
  const [processMenu, setProcessMenu] = useState<{ id: string; position: Point } | null>(null)
  const [traceFlows, setTraceFlows] = useState(false), [hoveredId, setHoveredId] = useState<string>()
  const clarifyCrossings = d.flowCrossings !== false
  const readability = useMemo(() => showInfo ? analyzeEditorFlowReadability(d) : undefined, [d, showInfo])
  const heading = useMemo(() => headingLayout(d, editorContentBounds), [d])
  const arrowEnds = useMemo(() => d.edges.map(edge => {
    const visual = editorGeometry.visual(edge, d)
    return { edge, head: polygonPoints(visual.head), mark: flowEndMarkPath(flowEndMark(edge, d, visual)) }
  }), [d])
  const labelLayouts = useMemo(() => new Map(d.edges.filter(edge => edge.label.text).map(edge => [edge.id, editorGeometry.label(edge, d)])), [d])
  const traceIds = useMemo(() => traceFlows ? connectedFlowIds(d, hoveredId ? [hoveredId] : selectedIds) : undefined, [d, hoveredId, selectedIds, traceFlows])
  const arrowArt = useMemo(() => arrowEnds.map(({ edge, head, mark }) => <g key={edge.id} opacity={!traceIds || traceIds.has(edge.id) ? 1 : .12} pointerEvents="none">
    <polygon points={head} fill={edge.stroke} />
    {mark && <path d={mark} fill="none" stroke={edge.stroke} strokeWidth={edge.strokeWidth} strokeLinecap="round" />}
  </g>), [arrowEnds, traceIds])
  const dragCleanup = useRef<(() => void) | null>(null)
  useEffect(() => { dragCleanup.current?.(); setProcessMenu(null); setHoveredId(undefined) }, [d.id, state.project.id])
  useEffect(() => {
    const stage = rootRef.current!, overlay = overlayRef.current!
    const e = new DiagramEngine(graphRef.current!, store, view => {
      overlay.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.scale})`)
      stage.style.backgroundPosition = `${view.x}px ${view.y}px`
      if (viewportScale.current !== view.scale) {
        viewportScale.current = view.scale
        stage.style.backgroundSize = `${20 * view.scale}px ${20 * view.scale}px`
        setScale(view.scale)
      }
    }, onEdit, setGuides, setHoveredId); engine.current = e
    onReady({ fit: () => e.fit(), zoom: f => e.zoom(f), resetZoom: () => e.resetZoom(), locate: id => e.locate(id), focus: () => rootRef.current?.focus({ preventScroll: true }) })
    return () => { dragCleanup.current?.(); e.dispose(); engine.current = null }
  }, [store, onEdit, onReady])
  useEffect(() => engine.current?.setTrace(traceIds), [traceIds])
  useEffect(() => {
    const blur = () => { setProcessMenu(null); setPanning(false); dragCleanup.current?.(); store.endGesture() }
    window.addEventListener('blur', blur)
    return () => window.removeEventListener('blur', blur)
  }, [store])
  const local = useCallback((e: { clientX: number; clientY: number }) => engine.current!.local({ x: e.clientX, y: e.clientY }), [])
  const drag = useCallback((event: ReactPointerEvent, move: (p: Point, e: PointerEvent) => void, end?: (p: Point, e: PointerEvent) => void, record = true) => {
    event.preventDefault(); event.stopPropagation(); dragCleanup.current?.(); if (record) store.beginGesture()
    const pointerId = event.pointerId
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      if (record) store.scheduleGestureUpdate(() => move(local(e), e))
      else move(local(e), e)
    }
    const cleanup = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel); dragCleanup.current = null; if (record) store.endGesture(); setPanning(false); setPreview(null); setHoverAnchor(null); setMarquee(null) }
    const onUp = (e: PointerEvent) => { if (e.pointerId !== pointerId) return; if (record) store.flushGestureUpdates(); end?.(local(e), e); cleanup() }
    const onCancel = (e: PointerEvent) => { if (e.pointerId !== pointerId) return; if (record) store.cancelGesture(); cleanup() }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onCancel); dragCleanup.current = cleanup
  }, [local, store])
  const labelArt = useMemo(() => d.edges.filter(e => e.label.text).map(e => {
      const l = labelLayouts.get(e.id)!, f = e.label.font, selected = selectedIds.includes(e.id)
      return <g key={e.id} data-overlay-interactive="label" data-testid={`label-${e.id}`} className="flow-label" opacity={!traceIds || traceIds.has(e.id) ? 1 : .12} transform={`translate(${l.x} ${l.y}) rotate(${l.angle})`}
        onPointerEnter={() => setHoveredId(e.id)} onPointerLeave={() => setHoveredId(undefined)}
        onDoubleClick={evt => { evt.stopPropagation(); onEdit(e.id) }} onPointerDown={evt => {
          if (tool !== 'select') return; const start = local(evt), offset = { ...e.label.offset }, base = pointOnEdge(e,d,e.label.t); store.select(evt.shiftKey ? [...new Set([...selectedIds, e.id])] : [e.id])
          if (!e.locked) drag(evt, p => store.updateEdge(e.id, edge => {
            const desired = { x: base.x + p.x-start.x, y: base.y + p.y-start.y }
            if (edge.label.orientation === 'tangent') {
              const center = { x: desired.x+offset.x, y: desired.y+offset.y }
              edge.label.t = closestEdgeT(edge,d,center)
              const onCurve = pointOnEdge(edge,d,edge.label.t)
              edge.label.offset = { x: center.x-onCurve.x, y: center.y-onCurve.y }
            } else edge.label.offset = { x: offset.x+p.x-start.x, y: offset.y+p.y-start.y }
          }))
        }}>
        {l.framePath ? <path d={l.framePath} fill={e.label.background ? (d.background === 'transparent' ? '#ffffff' : d.background) : 'transparent'} stroke={e.label.borderWidth ? e.stroke : 'none'} strokeWidth={e.label.borderWidth ?? 0} strokeLinejoin="round" /> : <rect x={-l.width / 2} y={-l.height / 2} width={l.width} height={l.height} rx="3" fill={e.label.background ? (d.background === 'transparent' ? '#ffffff' : d.background) : 'transparent'} stroke={e.label.borderWidth ? e.stroke : 'none'} strokeWidth={e.label.borderWidth ?? 0} />}
        {selected && (l.framePath ? <path d={l.framePath} fill="none" stroke="#e57752" strokeWidth={.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" pointerEvents="none" /> : <rect x={-l.width / 2} y={-l.height / 2} width={l.width} height={l.height} rx="3" fill="none" stroke="#e57752" strokeWidth={.8} vectorEffect="non-scaling-stroke" pointerEvents="none" />)}
        {l.glyphs.length ? <g fill={f.color} fontFamily={f.fontFamily} fontSize={f.fontSize} fontWeight={f.bold ? 'bold' : 'normal'} fontStyle={f.italic ? 'italic' : 'normal'} textAnchor="middle" dominantBaseline="central" pointerEvents="none">{l.glyphs.map((g,i)=><text key={i} transform={`translate(${g.x} ${g.y}) rotate(${g.angle})`} xmlSpace="preserve">{g.text}</text>)}</g> : <text fill={f.color} fontFamily={f.fontFamily} fontSize={f.fontSize} fontWeight={f.bold ? 'bold' : 'normal'} fontStyle={f.italic ? 'italic' : 'normal'} textAnchor={f.align === 'left' ? 'start' : f.align === 'right' ? 'end' : 'middle'} dominantBaseline="central" pointerEvents="none">
          {l.lines.map((line, i) => <tspan key={i} x={f.align === 'left' ? -l.width / 2 + 8 : f.align === 'right' ? l.width / 2 - 8 : 0} y={(i - (l.lines.length - 1) / 2) * f.fontSize * 1.35}>{line}</tspan>)}
        </text>}
      </g>
  }), [d, labelLayouts, selectedIds, tool, traceIds, drag, local, onEdit, store])
  const connect = (e: ReactPointerEvent, node: DfdNode, startAt: Point) => {
    const start = anchorPoint(node, nearestAnchor(node, startAt)); setPreview({ start, end: startAt })
    const targetAt = (point: Point) => hitNode(store.diagram.nodes, point, 18 / engine.current!.getView().scale)
    drag(e, p => { const target = targetAt(p); setPreview({ start, end: target ? anchorPoint(target, nearestAnchor(target, p)) : p, targetId: target?.id }) }, p => {
      const target = targetAt(p)
      if (target) store.addEdge(node, target, startAt, p); else notify('Soltá la flecha sobre el borde de una figura para conectarla.')
    })
  }
  const capture = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('.canvas-controls,.canvas-caption,.canvas-empty,.canvas-toast,.canvas-process-menu')) return
    const camera = engine.current
    if (!camera) return
    camera.settleCamera()
    const scale = camera.getView().scale
    setProcessMenu(null)
    if (e.button === 2 || e.button === 1) {
      dragCleanup.current?.(); setPanning(true); const view = camera.getView(), candidate = hitNode(d.nodes, local(e), 0), position = { x: e.clientX, y: e.clientY }
      dragCleanup.current = startCanvasPan(e, window, view, point => camera.panTo(point), () => { dragCleanup.current = null; setPanning(false); setHoverAnchor(null) }, () => { if (candidate?.kind === 'process') { store.select([candidate.id]); setProcessMenu({ id: candidate.id, position }) } }) ?? null
      return
    }
    if (e.button !== 0 || (e.target as Element).closest('[data-overlay-interactive]')) return
    const p = local(e)
    if (['process', 'entity', 'store', 'note'].includes(state.tool)) { e.preventDefault(); e.stopPropagation(); const id = store.addNode(state.tool as ShapeKind, p); if (id) onEdit(id); return }
    if (state.tool === 'edge') {
      e.preventDefault(); e.stopPropagation(); const node = hitNode(d.nodes, p, 18 / scale)
      if (node) connect(e, node, p); else notify('Empezá la flecha desde el borde de una figura.')
    }
    if (state.tool === 'select' && !(e.target as Element).closest('[data-cell-id],.x6-node,.x6-edge,.x6-widget-selection-box')) {
      const start = p, existing = e.shiftKey || e.ctrlKey || e.metaKey ? [...state.selectedIds] : []
      const moved = (point: Point) => Math.hypot(point.x - start.x, point.y - start.y) * scale >= 3
      drag(e, point => { if (moved(point)) setMarquee(selectionRect(start, point)) }, point => {
        const ids = moved(point) ? selectedInRect(store.diagram, selectionRect(start, point), scale) : []
        store.select([...new Set([...existing, ...ids])])
      }, false)
    }
  }
  const selectedNode = state.selectedIds.length === 1 ? d.nodes.find(n => n.id === state.selectedIds[0]) : undefined
  const selectedEdge = state.selectedIds.length === 1 ? d.edges.find(e => e.id === state.selectedIds[0]) : undefined
  const selectedLabelPoint = useMemo(() => selectedEdge?.label.text ? pointOnEdge(selectedEdge, d, selectedEdge.label.t) : undefined, [selectedEdge, d])
  const pointerMove = (e: ReactPointerEvent) => {
    if (state.tool !== 'edge' || preview || panning) { if (hoverAnchor) setHoverAnchor(null); return }
    const p = local(e), n = hitNode(d.nodes, p, 18 / scale); setHoverAnchor(n ? anchorPoint(n, nearestAnchor(n, p)) : null)
  }
  return <div ref={rootRef} tabIndex={-1} data-shortcut-surface className={`canvas-stage tool-${state.tool}${panning ? ' pointer-panning' : ''}`} data-testid="canvas" onContextMenu={event => event.preventDefault()} onPointerDownCapture={capture} onPointerMove={pointerMove}
    onKeyDown={e => { if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && selectedNode?.kind === 'process') { e.preventDefault(); e.stopPropagation(); const r = rootRef.current!.getBoundingClientRect(), view = engine.current!.getView(); setProcessMenu({ id: selectedNode.id, position: { x: r.x + view.x + (selectedNode.x + selectedNode.width) * view.scale, y: r.y + view.y + (selectedNode.y + selectedNode.height / 2) * view.scale } }) } }}
    onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const kind = e.dataTransfer.getData('trazo-shape') as ShapeKind; if (['process', 'entity', 'store', 'note'].includes(kind)) { const id = store.addNode(kind, local(e)); if (id) onEdit(id) } }}
    style={{ backgroundColor: d.background === 'transparent' ? '#ffffff' : d.background, backgroundImage: d.grid ? 'radial-gradient(circle, #abb3b93b 1px, transparent 1px)' : 'none' }}>
    <div ref={graphRef} className="graph-mount" />
    <svg className="canvas-overlay" aria-label="Etiquetas y controles del diagrama">
      <g ref={overlayRef}>
        {marquee && <rect data-testid="selection-marquee" x={marquee.x} y={marquee.y} width={marquee.width} height={marquee.height} fill="#e577521a" stroke="#c16c48" strokeWidth={1 / scale} pointerEvents="none" />}
        {arrowArt}
        {(() => { const h = heading, manual = !!d.heading?.position; return h && <g className={`diagram-heading${manual ? ' is-manual' : ''}`} data-overlay-interactive={manual ? 'heading' : undefined} style={{ pointerEvents: manual ? 'all' : 'none', cursor: manual ? 'grab' : undefined }} onPointerDown={evt => {
          if (!manual || evt.button !== 0) return
          const start = local(evt), center = { x: h.x + h.width / 2, y: h.y + h.height / 2 }, diagramId = d.id
          store.select([])
          drag(evt, point => { if (store.diagram.id === diagramId) store.setHeadingPosition({ x: center.x + point.x - start.x, y: center.y + point.y - start.y }) })
        }}>
          {manual && <rect className="heading-drag-frame" data-testid="heading-drag" x={h.x} y={h.y} width={h.width} height={h.height} rx={3 / scale} fill="transparent" stroke="#e5775255" strokeWidth={1 / scale} strokeDasharray={`${4 / scale} ${4 / scale}`}><title>Arrastrar título</title></rect>}
          <text x={h.x + h.width / 2} fill={h.font.color} fontFamily={h.font.fontFamily} fontSize={h.font.fontSize} fontWeight="bold" textAnchor="middle" dominantBaseline="central" pointerEvents="none">{h.lines.map((line, i) => <tspan key={i} x={h.x + h.width / 2} y={h.y + h.height / 2 + (i - (h.lines.length - 1) / 2) * h.font.fontSize * 1.35}>{line}</tspan>)}</text>
        </g> })()}
        {labelArt}
        {state.selectedIds.length > 1 && d.nodes.filter(n => state.selectedIds.includes(n.id)).map(n => <rect key={n.id} x={n.x - 5 / scale} y={n.y - 5 / scale} width={n.width + 10 / scale} height={n.height + 10 / scale} rx="3" fill="none" stroke="#e57752" strokeWidth={1 / scale} strokeDasharray={`${4 / scale} ${3 / scale}`} />)}
        {selectedNode && <g className="node-controls">
          <rect x={selectedNode.x - 6 / scale} y={selectedNode.y - 6 / scale} width={selectedNode.width + 12 / scale} height={selectedNode.height + 12 / scale} rx={3 / scale} fill="none" stroke="#e57752" strokeWidth={1 / scale} />
          {!selectedNode.locked && [[0, 0], [1, 0], [0, 1], [1, 1]].map(([sx, sy]) => <rect key={`${sx}${sy}`} data-overlay-interactive="resize" data-testid={`resize-${sx}-${sy}`} x={selectedNode.x + sx * selectedNode.width - 4 / scale} y={selectedNode.y + sy * selectedNode.height - 4 / scale} width={8 / scale} height={8 / scale} rx={1.5 / scale} className={`resize-handle resize-${sx}${sy}`}
            onPointerDown={e => { const original = { ...selectedNode }, start = local(e); drag(e, p => {
              let width = Math.max(40, original.width + (p.x - start.x) * (sx ? 1 : -1)), height = Math.max(28, original.height + (p.y - start.y) * (sy ? 1 : -1))
              if (original.kind === 'process') width = height = Math.max(56, Math.max(width, height))
              store.updateNode(original.id, n => { n.width = width; n.height = height; n.x = sx ? original.x : original.x + original.width - width; n.y = sy ? original.y : original.y + original.height - height })
            }) }} />)}
        </g>}
        {selectedEdge && !selectedEdge.locked && (() => {
          const p = edgePoints(selectedEdge, d), e = selectedEdge
          return <g className="edge-controls">
            {e.mode==='orthogonal' && (()=>{
              const route=orthogonalRoute(e,d),config=e.orthogonal??defaultOrthogonal(e,d),handle={x:(route.spine.start.x+route.spine.end.x)/2,y:(route.spine.start.y+route.spine.end.y)/2}
              return <g>
                <path d={edgePath(e,d)} fill="none" stroke="transparent" strokeWidth={14/scale} style={{pointerEvents:'stroke'}} onDoubleClick={evt=>{evt.stopPropagation();onEdit(e.id)}} />
                {config.kind!=='elbow' && <rect data-overlay-interactive="orthogonal-lane" x={handle.x-5/scale} y={handle.y-5/scale} width={10/scale} height={10/scale} rx={2/scale} className="curve-handle" style={{cursor:config.axis==='x'?'ew-resize':'ns-resize'}} onPointerDown={evt=>{const start=local(evt);drag(evt,p=>store.updateEdge(e.id,flow=>{flow.orthogonal={...config,offset:clamp(config.offset+p[config.axis]-start[config.axis],-10000000,10000000)}}))}}><title>Arrastrar el tramo central</title></rect>}
              </g>
            })()}
            {e.mode === 'curve' && <>
              <path data-overlay-interactive="bend" data-testid="curve-body" d={edgePath(e, d)} fill="none" stroke="transparent" strokeWidth={14 / scale} style={{ pointerEvents: 'stroke', cursor: 'grab' }} onDoubleClick={evt => { evt.stopPropagation(); onEdit(e.id) }} onPointerDown={evt => { const start = local(evt), t = closestEdgeT(e, d, start), original = clone(e); drag(evt, point => store.updateEdge(e.id, edge => { Object.assign(edge, clone(original)); bendEdge(edge, d, t, sub(point, start)) })) }}><title>Arrastrar para curvar · Doble clic para editar texto</title></path>
              {!e.generatedRoute?.length && edgeSegments(e, d).map((s, index, segments) => <g key={index}>
                <path d={`M${s.start.x} ${s.start.y} L${s.c1.x} ${s.c1.y} M${s.end.x} ${s.end.y} L${s.c2.x} ${s.c2.y}`} fill="none" stroke="#e57752" strokeWidth={1 / scale} strokeDasharray={`${4 / scale} ${3 / scale}`} />
                {(['source', 'target'] as const).map((key, i) => <circle key={key} data-overlay-interactive="curve" data-testid={index === 0 && i === 0 ? 'curve-source' : index === segments.length - 1 && i === 1 ? 'curve-target' : `curve-${index}-${key}`} cx={(i ? s.c2 : s.c1).x} cy={(i ? s.c2 : s.c1).y} r={4.5 / scale} className="curve-handle" onPointerDown={evt => { const end = i ? s.end : s.start; drag(evt, point => store.updateEdge(e.id, edge => { const value = sub(point, end); if (i ? index === segments.length - 1 : index === 0) edge.controls[key] = value; else if (i) edge.waypoints![index].incoming = value; else edge.waypoints![index - 1].outgoing = value })) }} />)}
              </g>)}
              {!e.generatedRoute && routePoints(e, d).map((point, i) => <circle key={i} data-overlay-interactive="waypoint" data-testid={`waypoint-${i}`} cx={point.x} cy={point.y} r={5.5 / scale} className="endpoint-handle" onDoubleClick={evt => { evt.stopPropagation(); store.removeWaypoint(e.id, i) }} onPointerDown={evt => { const start = local(evt), offset = { ...e.waypoints![i].offset }; drag(evt, p => store.updateEdge(e.id, edge => { edge.waypoints![i].offset = { x: offset.x + p.x - start.x, y: offset.y + p.y - start.y } })) }}><title>Arrastrar punto · Doble clic para quitarlo</title></circle>)}
            </>}
            {(['source', 'target'] as const).map((key, i) => <circle key={key} data-overlay-interactive="endpoint" data-testid={`endpoint-${key}`} cx={(i ? p.end : p.start).x} cy={(i ? p.end : p.start).y} r={5.5 / scale} className="endpoint-handle" onPointerDown={evt => {
              drag(evt, point => { const n = hitNode(store.diagram.nodes, point, 20 / scale); if (n) { setHoverAnchor(anchorPoint(n, nearestAnchor(n, point))); store.updateEdge(e.id, edge => { edge[key] = { nodeId: n.id, anchor: nearestAnchor(n, point) } }) } else setHoverAnchor(point) })
            }} />)}
            {selectedLabelPoint && <circle data-overlay-interactive="label-position" data-testid="label-position" cx={selectedLabelPoint.x} cy={selectedLabelPoint.y} r={3 / scale} fill="#e57752" />}
            {e.label.text && (() => { const l = labelLayouts.get(e.id)!; return <g transform={`translate(${l.x} ${l.y}) rotate(${l.angle})`}>
              {l.framePath ? <path d={l.framePath} fill="none" stroke="#e57752" strokeWidth={.7 / scale} strokeDasharray={`${3 / scale} ${3 / scale}`} pointerEvents="none" /> : <rect x={-e.label.width / 2} y={-l.height / 2} width={e.label.width} height={l.height} fill="none" stroke="#e57752" strokeWidth={.7 / scale} strokeDasharray={`${3 / scale} ${3 / scale}`} />}
              <line x1={0} y1={-l.height / 2} x2={0} y2={-l.height / 2 - 25 / scale} stroke="#e57752" strokeWidth={1 / scale} />
              <circle data-overlay-interactive="label-rotate" data-testid="label-rotate" cx={0} cy={-l.height / 2 - 25 / scale} r={5 / scale} className="curve-handle" onPointerDown={evt => { const start = local(evt), initial = Math.atan2(start.y - l.y, start.x - l.x); drag(evt, (point, ev) => store.updateEdge(e.id, edge => { let angle = l.angle + (Math.atan2(point.y - l.y, point.x - l.x) - initial) * 180 / Math.PI; angle = ((angle + 540) % 360) - 180; edge.label.angle = ev.shiftKey ? Math.round(angle / 15) * 15 : Math.round(angle); edge.label.orientation = 'manual' })) }}><title>Girar etiqueta · Shift para pasos de 15°</title></circle>
              {[-1, 1].map(side => <rect key={side} data-overlay-interactive="label-width" data-testid={`label-width-${side}`} x={side * e.label.width / 2 - 4 / scale} y={-4 / scale} width={8 / scale} height={8 / scale} className="resize-handle" onPointerDown={evt => { const radians = l.angle * Math.PI / 180; drag(evt, point => store.updateEdge(e.id, edge => { const dx = point.x - l.x, dy = point.y - l.y; edge.label.width = clamp(2 * side * (dx * Math.cos(radians) + dy * Math.sin(radians)), 24, 20000) })) }}><title>Ajustar ancho de la etiqueta</title></rect>)}
            </g> })()}
          </g>
        })()}
        {preview && <>
          <path d={`M ${preview.start.x} ${preview.start.y} L ${preview.end.x} ${preview.end.y}`} stroke="#e57752" strokeWidth={1.8 / scale} fill="none" strokeDasharray={`${5 / scale} ${4 / scale}`} />
          {preview.targetId && (() => { const n = d.nodes.find(n => n.id === preview.targetId); return n && <rect x={n.x - 5} y={n.y - 5} width={n.width + 10} height={n.height + 10} fill="none" stroke="#e57752" strokeWidth={1.5 / scale} rx={n.kind === 'process' ? n.width : 2} /> })()}
          <circle cx={preview.start.x} cy={preview.start.y} r={4 / scale} fill="#e57752" /><circle cx={preview.end.x} cy={preview.end.y} r={5 / scale} fill="#fff" stroke="#e57752" strokeWidth={2 / scale} />
        </>}
        {hoverAnchor && <circle className="motion-guide" cx={hoverAnchor.x} cy={hoverAnchor.y} r={6 / scale} fill="#e5775233" stroke="#e57752" strokeWidth={1.5 / scale} />}
        <AlignmentGuides guides={guides} scale={scale} background={d.background} />
      </g>
    </svg>
    <Presence show={!!processMenu} kind="menu">{processMenu && <ProcessMenu store={store} nodeId={processMenu.id} position={processMenu.position} onEdit={onEdit} onClose={(restore = true) => { setProcessMenu(null); if (restore) rootRef.current?.focus({ preventScroll: true }) }} />}</Presence>
    <Presence show={showInfo}><div className="canvas-caption"><span className="small-tag">DFD</span><span>{d.nodes.filter(n => n.kind !== 'note').length} figuras</span>{readability && readability.crossings > 0 && <span title={clarifyCrossings ? 'Los cruces se muestran con una interrupción en la flecha que pasa por debajo.' : 'Los cortes en cruces están desactivados.'}>{readability.crossings} {readability.crossings === 1 ? clarifyCrossings ? 'cruce aclarado' : 'cruce' : clarifyCrossings ? 'cruces aclarados' : 'cruces'}</span>}{readability && readability.overlaps.length > 0 && <span className="flow-overlap-warning" title="Seleccion� los flujos superpuestos y us� Separar recorridos.">{readability.overlaps.length} {readability.overlaps.length === 1 ? 'superposici�n' : 'superposiciones'}</span>}</div></Presence>
    {!d.nodes.length && showInfo && <div className="canvas-empty compact-empty"><p>Diagrama vacío</p><button className="text-button" onClick={() => store.setTool('process')}><Plus size={14} />{d.rootLevel === 0 ? 'Agregar sistema' : 'Agregar proceso'}</button></div>}
    <div className="canvas-controls"><button title="Alejar (−)" aria-label="Alejar" onClick={() => engine.current?.zoom(1 / 1.15)}><Minus size={16} /></button><button className="zoom-value" title="Restablecer al 100 %" onClick={() => engine.current?.resetZoom()}>{Math.round(scale * 100)}%</button><button title="Acercar (+)" aria-label="Acercar" onClick={() => engine.current?.zoom(1.15)}><Plus size={16} /></button><span className="divider" /><button title="Ajustar al contenido (F)" aria-label="Ajustar al contenido" onClick={() => engine.current?.fit()}><Maximize size={16} /></button><span className="divider" /><button className={traceFlows ? 'active' : ''} aria-pressed={traceFlows} title="Seguir los flujos de la selecci�n" aria-label="Seguir flujos" onClick={() => setTraceFlows(value => !value)}><Eye size={16} /></button><span className="divider" /><button data-testid="toggle-flow-crossings" className={clarifyCrossings ? 'active' : ''} aria-pressed={clarifyCrossings} title={clarifyCrossings ? 'Desactivar cortes en cruces' : 'Activar cortes en cruces'} aria-label="Cortes en cruces" onClick={() => store.setFlowCrossings(!clarifyCrossings)}><Scissors size={16} /></button></div>
    <Presence show={showInfo}><div className="canvas-hint"><LocateFixed size={13} /><span>{state.tool === 'edge' ? 'Arrastrá de un borde a otro para conectar' : panning ? 'Arrastrá para recorrer el lienzo' : state.tool !== 'select' ? 'Hacé clic en el lienzo para colocar la figura' : (selectedNode?.kind === 'process' ? `Clic derecho en ${d.rootLevel === 0 ? 'el sistema' : 'el proceso'}: opciones` : 'Arrastrá con clic derecho para mover el lienzo') + (d.snap ? ' · Alt: sin ajuste' : '')}</span></div></Presence>
  </div>
}
