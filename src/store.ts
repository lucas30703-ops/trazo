import { applyStyleTo, styleRecipients, type StyleApplication } from './styles'
import { defaultOrthogonal } from './orthogonal'
import { nearestAnchor, resetSimpleCurve, insertWaypoint, closestEdgeT, pointOnEdge } from './geometry'
import { canAddShape, clone, createDiagram, createNode, createProject, defaultFont, projectMode, uid } from './model'
import type { DfdEdge, DfdNode, Diagram, Point, Project, SavedStyle, ShapeKind, Tool } from './model'
import { diagramForView, flattenHierarchy, projectHierarchy, type DiagramBranch } from './hierarchy'
import { separateFlowPaths } from './flowReadability'

export interface EditorState { project: Project; selectedIds: string[]; tool: Tool; canUndo: boolean; canRedo: boolean; revision: number; navigationRevision: number }
type Listener = () => void
export class EditorStore {
  private listeners = new Set<Listener>()
  private past: Project[] = []; private future: Project[] = []; private gesture: Project | null = null
  private clipboard: { nodes: DfdNode[]; edges: DfdEdge[] } | null = null
  private state: EditorState
  private viewProject?: Project
  private activeBranch?: DiagramBranch
  private activeView?: Diagram
  private gestureFrame?: number
  private pendingGestureUpdate?: () => void
  constructor(project = createProject()) { this.state = { project, selectedIds: [], tool: 'select', canUndo: false, canRedo: false, revision: 0, navigationRevision: 0 } }
  getSnapshot = () => this.state
  isGestureActive() { return this.gesture !== null }
  subscribe = (fn: Listener) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private emit(patch: Partial<EditorState> = {}) { this.state = { ...this.state, ...patch, canUndo: !!this.past.length, canRedo: !!this.future.length, revision: this.state.revision + 1 }; this.listeners.forEach(fn => fn()) }
  get diagram(): Diagram {
    const p = this.state.project
    if (this.viewProject !== p) {
      this.activeBranch = flattenHierarchy(projectHierarchy(p)).find(({ branch }) => branch.diagram.id === p.activeDiagramId)!.branch
      this.activeView = diagramForView(this.activeBranch)
      this.viewProject = p
    }
    return this.activeView!
  }
  setTool(tool: Tool) { this.emit({ tool }) }
  setFlowCrossings(enabled: boolean) { this.command((_p, d) => { d.flowCrossings = enabled }) }
  setHeadingPosition(position?: Point) {
    const d = this.activeDocument()
    if (d.heading && d.heading.position?.x === position?.x && d.heading.position?.y === position?.y) return
    const heading = { mode: 'auto' as const, ...d.heading }
    if (position) heading.position = { ...position }; else delete heading.position
    this.replaceActiveDocument({ ...d, heading })
  }
  select(ids: string[]) { if (ids.join(',') !== this.state.selectedIds.join(',')) this.emit({ selectedIds: ids }) }
  beginGesture() { this.gesture ??= this.state.project }
  scheduleGestureUpdate(update: () => void) {
    if (!this.gesture) return
    this.pendingGestureUpdate = update
    this.gestureFrame ??= requestAnimationFrame(() => this.flushGestureUpdates())
  }
  flushGestureUpdates() {
    if (this.gestureFrame !== undefined) cancelAnimationFrame(this.gestureFrame)
    this.gestureFrame = undefined
    const update = this.pendingGestureUpdate
    this.pendingGestureUpdate = undefined
    update?.()
  }
  private discardGestureUpdates() {
    if (this.gestureFrame !== undefined) cancelAnimationFrame(this.gestureFrame)
    this.gestureFrame = undefined
    this.pendingGestureUpdate = undefined
  }
  moveNodes(positions: ReadonlyMap<string, Point>) {
    const d = this.activeDocument()
    let changed = false
    const nodes = d.nodes.map(node => {
      const point = positions.get(node.id)
      if (!point || node.locked || (node.x === point.x && node.y === point.y)) return node
      changed = true
      return { ...node, x: point.x, y: point.y }
    })
    if (changed) this.replaceActiveDocument({ ...d, nodes })
  }
  endGesture() {
    if (!this.gesture) return
    this.flushGestureUpdates()
    const before = this.gesture
    this.gesture = null
    if (before !== this.state.project) {
      this.remember(before)
      const project = { ...this.state.project, updatedAt: new Date().toISOString() }
      if (this.viewProject === this.state.project) this.viewProject = project
      this.emit({ project }); return
    }
    this.emit()
  }
  cancelGesture() { if (this.gesture) { this.discardGestureUpdates(); const p = this.gesture; this.gesture = null; this.emit({ project: p }) } }
  private remember(project: Project) { this.past.push(project); this.past = this.past.slice(-100); this.future = [] }
  private commit(project: Project) {
    if (!this.gesture) this.remember(this.state.project)
    this.emit({ project })
  }
  private activeDocument() { return this.state.project.diagrams.find(d => d.id === this.state.project.activeDiagramId)! }
  private replaceActiveDocument(diagram: Diagram) {
    const previous = this.state.project
    const project = { ...previous, diagrams: previous.diagrams.map(d => d.id === diagram.id ? diagram : d), updatedAt: new Date().toISOString() }
    // A local edit cannot change the active diagram's parent or level.
    if (this.viewProject === previous) {
      this.activeBranch = { ...this.activeBranch!, diagram }
      this.activeView = diagramForView(this.activeBranch)
      this.viewProject = project
    }
    this.commit(project)
  }
  command(fn: (p: Project, d: Diagram) => void) {
    const p = clone(this.state.project), d = p.diagrams.find(d => d.id === p.activeDiagramId)!
    fn(p, d)
    if (JSON.stringify(p) === JSON.stringify(this.state.project)) return
    const linkedBefore = new Set(this.state.project.diagrams.flatMap(diagram => diagram.nodes.flatMap(n => n.childDiagramId ? [n.childDiagramId] : [])))
    const linkedAfter = new Set(p.diagrams.flatMap(diagram => diagram.nodes.flatMap(n => n.childDiagramId ? [n.childDiagramId] : [])))
    const detached = p.diagrams.filter(diagram => linkedBefore.has(diagram.id) && !linkedAfter.has(diagram.id))
    if (detached.length) { const levels = new Map(flattenHierarchy(projectHierarchy(this.state.project)).map(item => [item.branch.diagram.id, item.branch.level])); detached.forEach(diagram => { diagram.rootLevel = levels.get(diagram.id) ?? diagram.rootLevel }) }
    p.updatedAt = new Date().toISOString(); this.commit(p)
  }
  replaceProject(project: Project) { this.discardGestureUpdates(); this.gesture = null; this.past = []; this.future = []; this.emit({ project, selectedIds: [], tool: 'select', navigationRevision: this.state.navigationRevision + 1 }) }
  undo() { this.endGesture(); const p = this.past.pop(); if (p) { this.future.push(this.state.project); this.emit({ project: p, selectedIds: [] }) } }
  redo() { const p = this.future.pop(); if (p) { this.past.push(this.state.project); this.emit({ project: p, selectedIds: [] }) } }
  updateNodes(ids: string[], patch: Partial<DfdNode>) { this.command((_p, d) => { d.nodes.forEach(n => { if (ids.includes(n.id) && !n.locked) Object.assign(n, clone(patch)) }) }) }
  updateNode(id: string, fn: (n: DfdNode) => void) {
    const d = this.activeDocument(), original = d.nodes.find(n => n.id === id)
    if (!original || original.locked) return
    const node = clone(original)
    fn(node)
    if (JSON.stringify(node) === JSON.stringify(original)) return
    if (node.childDiagramId !== original.childDiagramId) {
      this.command((_p, diagram) => { diagram.nodes = diagram.nodes.map(n => n.id === id ? node : n) })
      return
    }
    this.replaceActiveDocument({ ...d, nodes: d.nodes.map(n => n === original ? node : n) })
  }
  updateEdge(id: string, fn: (e: DfdEdge) => void) {
    const d = this.activeDocument(), original = d.edges.find(e => e.id === id)
    if (!original || original.locked) return
    const e = clone(original)
    const geometry = JSON.stringify([e.controls, e.waypoints, e.generatedRoute]), endpoints = JSON.stringify([e.source, e.target]); fn(e)
    if (geometry !== JSON.stringify([e.controls, e.waypoints, e.generatedRoute]) && endpoints === JSON.stringify([e.source, e.target])) { e.routing = 'manual'; delete e.routingIssue }
    if (JSON.stringify(e) === JSON.stringify(original)) return
    this.replaceActiveDocument({ ...d, edges: d.edges.map(edge => edge === original ? e : edge) })
  }
  resetEdges(ids: string[]) {
    const count = this.diagram.edges.filter(e => ids.includes(e.id) && !e.locked).length
    if (!count) return 0
    this.command((_p, d) => {
      const edges = d.edges.filter(e => ids.includes(e.id) && !e.locked)
      for (const edge of edges) {
        if(edge.mode==='orthogonal') {edge.orthogonal=defaultOrthogonal(edge,d,edge.orthogonal?.kind??'multi');edge.routing='manual';delete edge.routingIssue}
        else if(edge.mode==='curve') resetSimpleCurve(edge,d)
        edge.waypoints=[];delete edge.generatedRoute
      }
    })
    return count
  }
  setEdgeMode(ids:string[],mode:DfdEdge['mode']) {
    this.command((_p,d)=>{for(const e of d.edges)if(ids.includes(e.id)&&!e.locked){
      e.mode=mode;e.routing='manual';delete e.routingIssue
      if(mode==='orthogonal')e.orthogonal??=defaultOrthogonal(e,d,'elbow')
    }})
  }
  reorderEdges(ids: string[], direction: 'front' | 'back') {
    const selected = new Set(this.diagram.edges.filter(e => ids.includes(e.id) && !e.locked).map(e => e.id))
    if (!selected.size) return 0
    this.command((_p, d) => {
      const moving = d.edges.filter(e => selected.has(e.id)), rest = d.edges.filter(e => !selected.has(e.id))
      d.edges = direction === 'front' ? [...rest, ...moving] : [...moving, ...rest]
    })
    return selected.size
  }
  separateEdges(ids: string[]) {
    const count = this.diagram.edges.filter(e => ids.includes(e.id) && !e.locked).length
    if (count < 2) return 0
    this.command((_p, d) => { separateFlowPaths(d, ids) })
    return count
  }
  addNode(kind: ShapeKind, point: Point): string {
    if (!canAddShape(this.diagram, kind)) return ''
    const n = createNode(kind, point, this.diagram.nodes.filter(n => n.kind === 'process').length + 1)
    if (projectMode(this.state.project) === 'design') {
      if (kind === 'entity') n.text = 'Nueva pantalla'
      if (kind === 'store') n.text = 'Nueva tabla'
    }
    if (kind === 'process') {
      const level = flattenHierarchy(projectHierarchy(this.state.project)).find(item => item.branch.diagram.id === this.diagram.id)?.branch.level ?? 0
      const parent = this.state.project.diagrams.flatMap(d => d.nodes).find(n => n.childDiagramId === this.diagram.id), prefix = level > 1 && parent?.number ? parent.number + '.' : ''
      let i = 1; while (this.diagram.nodes.some(n => n.kind === 'process' && n.number === prefix + i)) i++
      n.number = level === 0 ? '' : prefix + i
      if (level === 0) n.text = 'Sistema'
    }
    this.command((_p, d) => d.nodes.push(n)); this.emit({ selectedIds: [n.id], tool: 'select' }); return n.id
  }
  addEdge(sourceNode: DfdNode, targetNode: DfdNode, sourcePoint: Point, targetPoint: Point) {
    const source = { nodeId: sourceNode.id, anchor: nearestAnchor(sourceNode, sourcePoint) }, target = { nodeId: targetNode.id, anchor: nearestAnchor(targetNode, targetPoint) }
    const e: DfdEdge = { id: uid(), source, target, mode: 'curve', routing: 'manual', controls: { source: { x: 0, y: 0 }, target: { x: 0, y: 0 } }, stroke: sourceNode.stroke, strokeWidth: 1.8,
      label: { text: 'Flujo de datos', t: .5, offset: { x: 0, y: 0 }, width: 180, angle: 0, orientation: 'tangent', background: true, font: { ...defaultFont, fontSize: 12 } } }
    resetSimpleCurve(e, this.diagram)
    this.command((_p, d) => d.edges.push(e)); this.emit({ selectedIds: [e.id], tool: 'select' }); return e.id
  }
  deleteSelection() {
    const ids = this.state.selectedIds.filter(id => { const c = [...this.diagram.nodes, ...this.diagram.edges].find(c => c.id === id); return c && !c.locked && !this.diagram.edges.some(e => e.locked && (e.source.nodeId === id || e.target.nodeId === id)) })
    this.command((_p, d) => { d.nodes = d.nodes.filter(n => !ids.includes(n.id)); d.edges = d.edges.filter(e => !ids.includes(e.id) && !ids.includes(e.source.nodeId) && !ids.includes(e.target.nodeId)) }); this.select([])
  }
  copy() {
    const ids = this.state.selectedIds, d = this.diagram
    this.clipboard = clone({ nodes: d.nodes.filter(n => ids.includes(n.id)), edges: d.edges.filter(e => ids.includes(e.id) || (ids.includes(e.source.nodeId) && ids.includes(e.target.nodeId))) })
  }
  paste() {
    if (!this.clipboard) return
    if (this.diagram.rootLevel === 0 && (this.clipboard.nodes.some(n => n.kind === 'store') || this.diagram.nodes.filter(n => n.kind === 'process').length + this.clipboard.nodes.filter(n => n.kind === 'process').length > 1)) return false
    const cp = clone(this.clipboard), remap = new Map<string, string>(), selected: string[] = []
    for (const n of cp.nodes) { remap.set(n.id, uid()); n.id = remap.get(n.id)!; n.x += 24; n.y += 24; delete n.childDiagramId; n.locked = false; selected.push(n.id) }
    if (this.diagram.rootLevel === 0) cp.nodes.filter(n => n.kind === 'process').forEach(n => { n.number = '' })
    const existing = new Set(this.diagram.nodes.map(n => n.id))
    cp.edges = cp.edges.filter(e => (remap.has(e.source.nodeId) || existing.has(e.source.nodeId)) && (remap.has(e.target.nodeId) || existing.has(e.target.nodeId)))
    for (const e of cp.edges) { e.id = uid(); e.locked = false; e.source.nodeId = remap.get(e.source.nodeId) ?? e.source.nodeId; e.target.nodeId = remap.get(e.target.nodeId) ?? e.target.nodeId; if (!cp.nodes.length) { e.controls.source.y += 28; e.controls.target.y += 28; e.label.offset.y += 16 }; selected.push(e.id) }
    this.command((_p, d) => { d.nodes.push(...cp.nodes); d.edges.push(...cp.edges) }); this.select(selected)
    // The next paste advances again instead of stacking duplicates on top of one another.
    this.clipboard.nodes.forEach(n => { n.x += 24; n.y += 24 })
  }
  duplicate() { this.copy(); return this.paste() }
  moveSelection(dx: number, dy: number) { this.command((_p, d) => { d.nodes.forEach(n => { if (this.state.selectedIds.includes(n.id) && !n.locked) { n.x += dx; n.y += dy } }) }) }
  align(mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distributeX' | 'distributeY') {
    const ids = this.state.selectedIds
    this.command((_p, d) => {
      const ns = d.nodes.filter(n => ids.includes(n.id) && !n.locked); if (ns.length < 2) return
      const left = Math.min(...ns.map(n => n.x)), right = Math.max(...ns.map(n => n.x + n.width)), top = Math.min(...ns.map(n => n.y)), bottom = Math.max(...ns.map(n => n.y + n.height))
      if (mode === 'distributeX' || mode === 'distributeY') {
        if (ns.length < 3) return; const horizontal = mode === 'distributeX'; ns.sort((a, b) => horizontal ? a.x - b.x : a.y - b.y)
        const extent = horizontal ? right - left : bottom - top, sum = ns.reduce((s, n) => s + (horizontal ? n.width : n.height), 0), gap = (extent - sum) / (ns.length - 1)
        let pos = horizontal ? left : top; ns.forEach(n => { if (horizontal) n.x = pos; else n.y = pos; pos += (horizontal ? n.width : n.height) + gap }); return
      }
      ns.forEach(n => { if (mode === 'left') n.x = left; if (mode === 'right') n.x = right - n.width; if (mode === 'center') n.x = (left + right - n.width) / 2; if (mode === 'top') n.y = top; if (mode === 'bottom') n.y = bottom - n.height; if (mode === 'middle') n.y = (top + bottom - n.height) / 2 })
    })
  }
  switchDiagram(id: string) { this.endGesture(); this.command(p => { p.activeDiagramId = id }); this.emit({ selectedIds: [], navigationRevision: this.state.navigationRevision + 1 }) }
  addDiagram(name?: string) {
    const mode = projectMode(this.state.project), design = mode === 'design'
    const title = name?.trim() || `${design ? 'Sistema' : 'Contexto'} ${this.state.project.diagrams.length + 1}`
    const d = createDiagram(`Nivel ${design ? 1 : 0} · ${title}`, design ? 'design' : 'analysis')
    if (!design) {
      const system = createNode('process', { x: 400, y: 300 }); system.text = title; system.number = ''; system.width = system.height = 160; system.x = 320; system.y = 220; d.nodes.push(system)
    }
    this.command(p => { p.diagrams.push(d); p.activeDiagramId = d.id }); this.select([])
  }
  removeDiagram(id: string) { if (this.state.project.diagrams.length === 1) return; this.command(p => { p.diagrams = p.diagrams.filter(d => d.id !== id); p.diagrams.forEach(d => d.nodes.forEach(n => { if (n.childDiagramId === id) delete n.childDiagramId })); if (p.activeDiagramId === id) p.activeDiagramId = p.diagrams[0].id }); this.select([]) }
  setLocked(locked: boolean) { this.command((_p, d) => { [...d.nodes, ...d.edges].filter(c => this.state.selectedIds.includes(c.id)).forEach(c => { c.locked = locked }) }) }
  addWaypoint(id: string, t: number) { this.command((_p, d) => { const e = d.edges.find(e => e.id === id); if (e && !e.locked) { e.mode = 'curve'; e.routing = 'manual'; delete e.routingIssue; insertWaypoint(e, d, t) } }) }
  removeWaypoint(id: string, index: number) { this.command((_p, d) => { const e = d.edges.find(e => e.id === id); if (e && !e.locked && e.waypoints?.[index]) { e.routing = 'manual'; delete e.routingIssue; const label = pointOnEdge(e, d, e.label.t); e.waypoints.splice(index, 1); e.label.t = closestEdgeT(e, d, label) } }) }
  saveStyle(name: string, style: Omit<SavedStyle, 'id' | 'name'>) {
    if (!name.trim()) return
    this.command(p => {
      const styles = p.styles ??= [], existing = styles.find(s => s.target === style.target && s.name.toLocaleLowerCase('es') === name.trim().toLocaleLowerCase('es'))
      if (existing) Object.assign(existing, clone(style), { name: name.trim() })
      else styles.push({ ...clone(style), id: uid(), name: name.trim() })
    })
  }
  applyStyle(style: SavedStyle | Omit<SavedStyle, 'id' | 'name'>, options: StyleApplication = {}) {
    const recipients = styleRecipients(this.state.project, this.state.selectedIds, style, options)
    if (!recipients.length) return 0
    this.command(p => {
      for (const element of styleRecipients(p, this.state.selectedIds, style, options)) {
        applyStyleTo(element, style, options.parts ?? { appearance: true, text: true, route: false })
        if(!('kind' in element)&&element.mode==='orthogonal'&&!element.orthogonal)element.orthogonal=defaultOrthogonal(element,p.diagrams.find(d=>d.edges.some(e=>e.id===element.id))!,options.parts?.route ? style.edgeOrthogonalKind??'multi' : 'multi')
      }
    })
    return recipients.length
  }
  createChild(processId: string, diagramId = this.diagram.id, name?: string) {
    const owner = this.state.project.diagrams.find(d => d.id === diagramId), n = owner?.nodes.find(n => n.id === processId); if (!n || n.kind !== 'process' || n.inheritedFrom) return
    if (n.childDiagramId) { this.switchDiagram(n.childDiagramId); return }
    if (n.locked) return
    const level = (flattenHierarchy(projectHierarchy(this.state.project)).find(item => item.branch.diagram.id === diagramId)?.branch.level ?? 0) + 1
    const child = createDiagram(`Nivel ${level} · ${name?.trim() || (level === 1 ? 'Sistema completo' : `${n.number || 'Proceso'} · ${n.text.replace(/\n/g, ' ')}`)}`)
    child.rootLevel = level
    child.background = owner!.background; child.grid = owner!.grid; child.snap = owner!.snap
    // One-hop neighbours, in either flow direction, copied once and independently.
    const neighbours = new Set(owner!.edges.flatMap(e => e.source.nodeId === n.id ? [e.target.nodeId] : e.target.nodeId === n.id ? [e.source.nodeId] : []))
    const dx = 400 - (n.x + n.width / 2), dy = 320 - (n.y + n.height / 2)
    child.nodes = owner!.nodes.filter(other => other.id !== n.id && other.kind !== 'note' && neighbours.has(other.id)).map(other => {
      const copy = clone(other); copy.id = uid(); copy.x += dx; copy.y += dy; copy.locked = false; delete copy.childDiagramId
      copy.inheritedFrom = { diagramId: owner!.id, nodeId: other.id }
      return copy
    })
    this.command(p => { p.diagrams.find(d => d.id === diagramId)!.nodes.find(n => n.id === processId)!.childDiagramId = child.id; p.diagrams.push(child); p.activeDiagramId = child.id }); this.select([])
  }
  linkChild(processId: string, diagramId?: string) {
    this.command((p, d) => { const n = d.nodes.find(n => n.id === processId); if (!n || n.kind !== 'process' || n.locked || n.inheritedFrom) return
      if (!diagramId) { delete n.childDiagramId; return }
      if (!canLinkChild(p, d.id, diagramId)) return; n.childDiagramId = diagramId
    })
  }
}
export function parentProcess(project: Project, diagramId: string) {
  for (const diagram of project.diagrams) { const process = diagram.nodes.find(n => n.childDiagramId === diagramId); if (process) return { diagram, process } }
}
export function canLinkChild(p: Project, parentId: string, childId: string) {
  if (!p.diagrams.some(d => d.id === childId) || parentProcess(p, childId)) return false
  let id: string | undefined = parentId; const seen = new Set<string>()
  while (id) { if (id === childId || seen.has(id)) return false; seen.add(id); id = parentProcess(p, id)?.diagram.id }
  return true
}
