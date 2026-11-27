import { alignedPosition, type AlignmentGuide } from './alignment'
export type { AlignmentGuide } from './alignment'
import { Graph, Path, Point as GraphPoint, Selection } from '@antv/x6'
import { anchorPoint, clamp, diagramBounds, editorContentBounds, editorGeometry, nodeTextLayout, processNumberStyle, screenLines } from './geometry'
import type { Anchor, DfdMode, DfdNode, Diagram, Point } from './model'
import { nodeForDiagram } from './model'
import type { EditorStore } from './store'
import { analyzeEditorFlowReadability } from './flowReadability'

Graph.registerNode('trazo-node', {}, true)
Graph.registerAnchor('trazo-perimeter', (view, _magnet, _ref, args) => {
  const n = view.cell.getData<DfdNode>(), pos = view.cell.position(), size = view.cell.size()
  const p = anchorPoint({ ...n, ...pos, ...size }, args.anchor as Anchor)
  return new GraphPoint(p.x, p.y)
}, true)
Graph.registerConnector('trazo-curve', (source, target, _route, options) => {
  const path = (options as { path?: string }).path ?? `M ${source.x} ${source.y} L ${target.x} ${target.y}`
  return options.raw ? Path.parse(path)! : path
}, true)

function nodeAppearance(n: DfdNode, mode: DfdMode = 'analysis') {
  const t = nodeTextLayout(n, mode), isCircle = n.kind === 'process', numberFont = processNumberStyle(n)
  const body = { fill: n.fill, stroke: n.kind === 'store' || n.kind === 'note' ? 'none' : n.stroke, strokeWidth: n.strokeWidth, ...(isCircle ? { cx: n.width / 2, cy: n.height / 2, rx: n.width / 2, ry: n.height / 2 } : { x: 0, y: 0, width: n.width, height: n.height, rx: 0 }), cursor: 'move' }
  return {
    markup: [{ tagName: isCircle ? 'ellipse' : 'rect', selector: 'body' }, { tagName: 'path', selector: 'screenLines' }, ...(n.kind === 'store' ? [{ tagName: 'path', selector: 'lines' }] : []), { tagName: 'text', selector: 'number' }, { tagName: 'text', selector: 'label' }],
    attrs: {
      body,
      screenLines: { d: screenLines(n.width, n.height), display: mode === 'design' && n.kind === 'entity' ? 'inline' : 'none', stroke: n.stroke, strokeWidth: n.strokeWidth, fill: 'none', pointerEvents: 'none' },
      lines: { d: `M 0 0 H ${n.width} M 0 ${n.height} H ${n.width}`, stroke: n.stroke, strokeWidth: n.strokeWidth, strokeLinecap: 'round', fill: 'none' },
      number: { display: isCircle && n.number ? 'inline' : 'none', x: n.width / 2, y: n.height * .28, text: isCircle ? n.number : '', fill: numberFont.color, fontFamily: numberFont.fontFamily, fontSize: numberFont.fontSize, fontWeight: numberFont.bold ? 'bold' : 'normal', fontStyle: numberFont.italic ? 'italic' : 'normal', textAnchor: 'middle', textVerticalAnchor: 'middle', pointerEvents: 'none' },
      label: { x: t.x, y: t.centerY, text: t.lines.join('\n'), fill: n.font.color, fontFamily: n.font.fontFamily, fontSize: n.font.fontSize, fontWeight: n.font.bold ? 'bold' : 'normal', fontStyle: n.font.italic ? 'italic' : 'normal', textAnchor: n.font.align === 'left' ? 'start' : n.font.align === 'right' ? 'end' : 'middle', textVerticalAnchor: 'middle', lineHeight: n.font.fontSize * 1.35, pointerEvents: 'none' },
    },
  }
}

export interface Viewport { x: number; y: number; scale: number }
interface NodeDrag { node: DfdNode; members: DfdNode[]; start: Point; moving: boolean }
const noGuides: AlignmentGuide = {}

export class DiagramEngine {
  graph: Graph
  private syncing = false
  private unsubscribe: () => void
  private observer: ResizeObserver
  private drawnDiagram?: Diagram
  private drawnTrace?: Set<string>
  private fingerprints = new Map<string, string>()
  private serialized = new WeakMap<object, string>()
  private nodeDrag?: NodeDrag
  private viewport: Viewport = { x: 0, y: 0, scale: 1 }
  private wheelFrame?: number
  private wheelView?: Viewport
  private wheelRect?: DOMRect
  private cameraFrame: number | undefined
  private fitOnResize = true
  private traceIds: Set<string> | undefined
  private traceKey = ''
  constructor(public container: HTMLDivElement, public store: EditorStore, private onView: (v: Viewport) => void, onEdit: (id: string) => void, onGuide: (g: AlignmentGuide) => void, onHover?: (id?: string) => void) {
    const graph = this.graph = new Graph({ container, width: container.clientWidth, height: container.clientHeight, grid: false, async: false,
      interacting: () => store.getSnapshot().tool === 'select' ? { nodeMovable: false, edgeMovable: false, edgeLabelMovable: false, magnetConnectable: false, arrowheadMovable: false } : false,
      panning: false,
      mousewheel: { enabled: false },
      connecting: { allowBlank: false },
    })
    // Canvas owns area selection so custom Bézier paths and labels are included.
    graph.use(new Selection({ enabled: true, rubberband: false, multiple: true, multipleSelectionModifiers: ['ctrl', 'meta', 'shift'], selectNodeOnMoved: true, selectEdgeOnMoved: true, movable: false, showNodeSelectionBox: false, showEdgeSelectionBox: false }))
    graph.on('selection:changed', ({ selected }) => { if (!this.syncing) store.select(selected.map(c => c.id)) })
    graph.on('cell:mouseenter', ({ cell }) => onHover?.(cell.id))
    graph.on('cell:mouseleave', () => onHover?.())
    let bypassSnap = false
    const snapKey = (evt: KeyboardEvent) => { bypassSnap = evt.altKey; if (bypassSnap || evt.key === 'Escape') onGuide(noGuides) }
    const scheduleMove = (drag: NodeDrag, client: Point) => {
      store.scheduleGestureUpdate(() => {
        const point = this.local(client), dx = point.x - drag.start.x, dy = point.y - drag.start.y
        const d = store.diagram
        // Compute a single position from the pointer. X6 only draws the accepted result.
        if (d.snap && !bypassSnap && drag.members.length === 1) {
          const raw = { x: drag.node.x + dx, y: drag.node.y + dy }
          const { x, y, guide } = alignedPosition(drag.node, raw, d.nodes, this.viewport.scale)
          onGuide(guide)
          store.moveNodes(new Map([[drag.node.id, { x, y }]]))
          return
        }
        onGuide(noGuides)
        store.moveNodes(new Map(drag.members.map(n => [n.id, { x: n.x + dx, y: n.y + dy }])))
      })
    }
    const finishDrag = (event?: { clientX: number; clientY: number; altKey: boolean; button?: number }) => {
      const drag = this.nodeDrag
      if (!drag || (typeof event?.button === 'number' && event.button !== 0)) return
      if (drag.moving) {
        if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
          bypassSnap = event.altKey
          scheduleMove(drag, { x: event.clientX, y: event.clientY })
        }
        store.endGesture()
      }
      this.nodeDrag = undefined
      onGuide(noGuides)
    }
    const cancelDrag = () => {
      if (!this.nodeDrag) return
      if (this.nodeDrag.moving) store.cancelGesture()
      this.nodeDrag = undefined
      onGuide(noGuides)
    }
    const blur = () => { finishDrag(); bypassSnap = false; this.settleCamera() }
    window.addEventListener('keydown', snapKey); window.addEventListener('keyup', snapKey); window.addEventListener('blur', blur)
    window.addEventListener('mouseup', finishDrag); window.addEventListener('pointercancel', cancelDrag); window.addEventListener('touchcancel', cancelDrag)
    graph.on('node:mousedown', ({ node, e }) => {
      if (this.syncing || (typeof e.button === 'number' && e.button !== 0) || store.getSnapshot().tool !== 'select') return
      const d = store.diagram, figure = d.nodes.find(n => n.id === node.id)
      if (!figure || figure.locked) return
      const selected = new Set(store.getSnapshot().selectedIds)
      const members = selected.has(figure.id) ? d.nodes.filter(n => selected.has(n.id) && !n.locked) : [figure]
      this.nodeDrag = { node: figure, members, start: this.local({ x: e.clientX, y: e.clientY }), moving: false }
    })
    graph.on('node:mousemove', ({ node, e }) => {
      const drag = this.nodeDrag
      if (!drag || drag.node.id !== node.id) return
      bypassSnap = e.altKey
      if (!drag.moving) { store.endGesture(); drag.moving = true; store.beginGesture() }
      scheduleMove(drag, { x: e.clientX, y: e.clientY })
    })
    graph.on('node:mouseup', ({ e }) => finishDrag(e))
    graph.on('cell:dblclick', ({ cell }) => onEdit(cell.id))
    const surface = container.parentElement ?? container
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); event.stopPropagation()
      this.stopCamera()
      this.fitOnResize = false
      const current = this.wheelView ?? this.viewport, rect = this.wheelRect ??= container.getBoundingClientRect()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1)
      const scale = clamp(current.scale * Math.exp(-clamp(delta, -240, 240) * .002), .2, 3)
      this.wheelView = this.zoomAround(current, scale, { x: event.clientX - rect.left, y: event.clientY - rect.top })
      this.wheelFrame ??= requestAnimationFrame(() => this.flushWheel())
    }
    surface.addEventListener('wheel', wheel, { passive: false, capture: true })
    let surfaceWidth = surface.clientWidth, surfaceHeight = surface.clientHeight
    this.observer = new ResizeObserver(() => {
      const width = surface.clientWidth, height = surface.clientHeight
      if (width <= 0 || height <= 0 || width === surfaceWidth && height === surfaceHeight) return
      this.settleCamera()
      graph.resize(width, height)
      // Panels animate after the initial fit. Refit to their actual dimensions,
      // or preserve the visible world center once the user has moved the view.
      if (this.fitOnResize) this.fit(false)
      else this.applyView({ ...this.viewport, x: this.viewport.x + (width - surfaceWidth) / 2, y: this.viewport.y + (height - surfaceHeight) / 2 })
      surfaceWidth = width; surfaceHeight = height
    }); this.observer.observe(surface)
    this.unsubscribe = store.subscribe(() => this.sync())
    this.onView(this.viewport)
    this.sync()
    const dispose = this.dispose.bind(this)
    this.dispose = () => {
      cancelDrag()
      surface.removeEventListener('wheel', wheel, true)
      window.removeEventListener('mouseup', finishDrag); window.removeEventListener('pointercancel', cancelDrag); window.removeEventListener('touchcancel', cancelDrag)
      window.removeEventListener('keydown', snapKey); window.removeEventListener('keyup', snapKey); window.removeEventListener('blur', blur)
      dispose()
    }
  }
  sync() {
    const d = this.store.diagram, state = this.store.getSnapshot(), graph = this.graph
    this.syncing = true
    try {
      const switched = this.drawnDiagram?.id !== d.id
      if (switched) { graph.clearCells(); this.fingerprints.clear(); graph.setGridSize(1) }
      if (switched || (this.nodeDrag?.moving && !this.store.isGestureActive())) this.nodeDrag = undefined
      graph.toggleRubberband(state.tool === 'select')
      if (this.drawnDiagram !== d || this.drawnTrace !== this.traceIds) {
        this.syncCells(d)
        this.drawnDiagram = d; this.drawnTrace = this.traceIds
      }
      if (graph.getSelectedCells().map(c => c.id).sort().join(',') !== [...state.selectedIds].sort().join(',')) graph.resetSelection(state.selectedIds.filter(id => graph.getCellById(id)))
      if (switched) this.fit(false)
    } finally { this.syncing = false }
  }
  private fingerprint(element: DfdNode | Diagram['edges'][number]) {
    const saved = this.serialized.get(element)
    if (saved !== undefined) return saved
    const value = JSON.stringify(element)
    this.serialized.set(element, value)
    return value
  }
  private syncCells(d: Diagram) {
    const graph = this.graph, cuts = d.flowCrossings === false ? undefined : analyzeEditorFlowReadability(d).paths
    const wanted = new Set([...d.nodes, ...d.edges].map(c => c.id))
    for (const cell of graph.getCells()) if (!wanted.has(cell.id)) { graph.removeCell(cell); this.fingerprints.delete(cell.id) }
    for (const n of d.nodes) {
      const opacity = !this.traceIds || this.traceIds.has(n.id) ? 1 : .14
      const zIndex = d.edges.length + (n.kind === 'note' ? 3 : 2)
      const fingerprint = this.fingerprint(n) + (d.mode ?? 'analysis') + opacity + ':' + zIndex
      if (this.fingerprints.get(n.id) === fingerprint) continue
      const appearance = nodeAppearance(nodeForDiagram(n, d), d.mode)
      let cell = graph.getCellById(n.id)
      if (!cell) cell = graph.addNode({ id: n.id, shape: 'trazo-node', x: n.x, y: n.y, width: n.width, height: n.height, ...appearance, data: n, zIndex })
      else if (cell.isNode()) { cell.position(n.x, n.y); cell.resize(n.width, n.height); cell.setData(n, { overwrite: true }); cell.attr(appearance.attrs); cell.setZIndex(zIndex) }
      cell.attr({ body: { opacity }, screenLines: { opacity }, lines: { opacity }, number: { opacity }, label: { opacity } })
      this.fingerprints.set(n.id, fingerprint)
    }
    for (const [index, e] of d.edges.entries()) {
      const path = (this.traceIds?.has(e.id) ? undefined : cuts?.get(e.id)) ?? editorGeometry.visual(e, d).path
      const opacity = !this.traceIds || this.traceIds.has(e.id) ? 1 : .12, zIndex = index + 1
      const fingerprint = this.fingerprint(e) + path + opacity + ':' + zIndex
      if (this.fingerprints.get(e.id) === fingerprint) continue
      const end = (value: typeof e.source) => ({ cell: value.nodeId, anchor: { name: 'trazo-perimeter', args: { anchor: value.anchor } }, connectionPoint: 'anchor' })
      const connector = { name: 'trazo-curve', args: { path } }
      const attrs = { line: { stroke: e.stroke, strokeWidth: e.strokeWidth, fill: 'none', targetMarker: null, strokeLinecap: 'round', opacity }, wrap: { strokeWidth: 16, cursor: 'pointer' } }
      let cell = graph.getCellById(e.id)
      if (!cell) cell = graph.addEdge({ id: e.id, source: end(e.source), target: end(e.target), connector, attrs, zIndex })
      else if (cell.isEdge()) { cell.setSource(end(e.source)); cell.setTarget(end(e.target)); cell.setConnector(connector); cell.attr(attrs); cell.setZIndex(zIndex) }
      this.fingerprints.set(e.id, fingerprint)
    }
  }
  setTrace(ids?: Set<string>) {
    const key = ids ? [...ids].sort().join(',') : ''
    if (key === this.traceKey) return
    this.traceKey = key; this.traceIds = ids; this.sync()
  }
  local(point: Point) { return this.graph.clientToLocal(point) }
  getView() { return this.viewport }
  private zoomAround(view: Viewport, scale: number, point: Point): Viewport {
    if (scale === view.scale) return view
    const ratio = scale / view.scale
    return { scale, x: point.x - (point.x - view.x) * ratio, y: point.y - (point.y - view.y) * ratio }
  }
  private applyView(view: Viewport) {
    const previous = this.viewport
    if (previous.x === view.x && previous.y === view.y && previous.scale === view.scale) return
    const graph = this.graph, matrix = graph.matrix()
    matrix.a = matrix.d = view.scale; matrix.e = view.x; matrix.f = view.y
    graph.matrix(matrix)
    graph.options.x = view.x; graph.options.y = view.y
    this.viewport = view
    this.onView(view)
    if (view.scale !== previous.scale) graph.trigger('scale', { sx: view.scale, sy: view.scale, ox: 0, oy: 0 })
    else graph.trigger('translate', { tx: view.x, ty: view.y })
  }
  private flushWheel() {
    if (this.wheelFrame !== undefined) cancelAnimationFrame(this.wheelFrame)
    this.wheelFrame = undefined; this.wheelRect = undefined
    const view = this.wheelView
    this.wheelView = undefined
    if (view) this.applyView(view)
  }
  settleCamera() { this.stopCamera(); this.flushWheel() }
  private stopCamera() { if(this.cameraFrame!==undefined)cancelAnimationFrame(this.cameraFrame);this.cameraFrame=undefined }
  private moveView(target:Viewport,smooth=true) {
    this.settleCamera()
    if(!smooth||window.matchMedia('(prefers-reduced-motion: reduce)').matches){this.applyView(target);return}
    const from=this.viewport,start=performance.now()
    const frame=(now:number)=>{
      const t=clamp((now-start)/160,0,1),ease=1-(1-t)**3
      this.applyView({x:from.x+(target.x-from.x)*ease,y:from.y+(target.y-from.y)*ease,scale:from.scale+(target.scale-from.scale)*ease})
      this.cameraFrame=t<1?requestAnimationFrame(frame):undefined
    }
    this.cameraFrame=requestAnimationFrame(frame)
  }
  zoom(factor: number) {
    this.settleCamera()
    this.fitOnResize = false
    const {width,height}=this.container.getBoundingClientRect(), scale=clamp(this.viewport.scale*factor,.2,3)
    this.moveView(this.zoomAround(this.viewport, scale, { x: width / 2, y: height / 2 }))
  }
  resetZoom() { this.settleCamera(); this.zoom(1 / this.viewport.scale) }
  panTo(point: Point) { this.fitOnResize = false; this.settleCamera(); this.applyView({ ...point, scale: this.viewport.scale }) }
  locate(id: string) {
    this.settleCamera()
    this.fitOnResize = false
    const b = diagramBounds(this.store.diagram, [id]), surface = this.container.parentElement ?? this.container, s = this.viewport.scale
    this.moveView({scale:s,x:surface.clientWidth/2-(b.x+b.width/2)*s,y:surface.clientHeight/2-(b.y+b.height/2)*s})
  }
  fit(smooth=true) {
    this.fitOnResize = true
    const surface = this.container.parentElement ?? this.container
    const bounds = diagramBounds(this.store.diagram, undefined, true, editorContentBounds), width = surface.clientWidth, height = surface.clientHeight
    if (width <= 0 || height <= 0) return
    const s = clamp(Math.min((width - 110) / bounds.width, (height - 130) / bounds.height), .2, 1.1)
    this.moveView({scale:s,x:(width-bounds.width*s)/2-bounds.x*s,y:(height-bounds.height*s)/2-bounds.y*s},smooth)
  }
  dispose() {
    this.stopCamera()
    if (this.wheelFrame !== undefined) cancelAnimationFrame(this.wheelFrame)
    this.unsubscribe(); this.observer.disconnect(); this.graph.dispose()
  }
}
