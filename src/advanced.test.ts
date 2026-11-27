import { describe, expect, it } from 'vitest'
import { bendEdge, diagramBounds, edgePath, edgeVisual, edgeSegments, insertWaypoint, labelPosition, pointOnEdge, routePoints } from './geometry'
import { clone, createDemoProject, parseProject } from './model'
import { canLinkChild, EditorStore, parentProcess } from './store'
import { renderDiagramSvg } from './export'

describe('curvas por tramos y formato evolutivo', () => {
  it('divide una curva sin desplazar el trazado ni la etiqueta, y persiste los puntos', () => {
    const p = createDemoProject(), d = p.diagrams[0], e = d.edges[0], before = clone(d), old = clone(e), label = labelPosition(e, d)
    insertWaypoint(e, d, .37)
    for (let i = 0; i <= 100; i++) {
      const t = i / 100, mapped = t <= .37 ? t / .37 / 2 : .5 + (t - .37) / .63 / 2
      const a = pointOnEdge(old, before, t), b = pointOnEdge(e, d, mapped)
      expect(b.x).toBeCloseTo(a.x, 8); expect(b.y).toBeCloseTo(a.y, 8)
    }
    expect(labelPosition(e, d).x).toBeCloseTo(label.x); expect(labelPosition(e, d).y).toBeCloseTo(label.y)
    insertWaypoint(e, d, .75)
    expect(edgeSegments(e, d)).toHaveLength(3)
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p)
    expect(parseProject({ ...clone(p), version: 1 }).version).toBe(3)
    expect(parseProject({ ...clone(p), version: 2 }).version).toBe(3)
  })
  it('arrastra un punto del trazado conservando extremos y deshace todo el gesto', () => {
    const store = new EditorStore(createDemoProject()), id = store.diagram.edges[0].id, before = clone(store.diagram)
    store.addWaypoint(id, .4); const original = clone(store.diagram.edges[0]), start = pointOnEdge(original, store.diagram, .7)
    store.beginGesture()
    for (let step = 1; step <= 10; step++) store.updateEdge(id, e => { Object.assign(e, clone(original)); bendEdge(e, store.diagram, .7, { x: step * 3, y: step * -4 }) })
    store.endGesture()
    const current = store.diagram.edges[0], end = pointOnEdge(current, store.diagram, .7)
    expect(end.x - start.x).toBeCloseTo(30); expect(end.y - start.y).toBeCloseTo(-40)
    expect(pointOnEdge(current, store.diagram, 0)).toEqual(pointOnEdge(before.edges[0], before, 0))
    expect(pointOnEdge(current, store.diagram, 1)).toEqual(pointOnEdge(before.edges[0], before, 1))
    store.undo(); expect(store.diagram.edges[0]).toEqual(original)
    store.redo(); expect(pointOnEdge(store.diagram.edges[0], store.diagram, .7)).toEqual(end)
  })
  it('traslada los puntos intermedios con sus dos extremos y conserva el modo alternado', () => {
    const p = createDemoProject(), d = p.diagrams[0], e = d.edges[0]; insertWaypoint(e, d, .5)
    const point = routePoints(e, d)[0], original = edgePath(e, d)
    e.mode = 'straight'; expect(edgePath(e, d)).toContain(' L '); e.mode = 'curve'; expect(edgePath(e, d)).toBe(original)
    d.nodes.filter(n => [e.source.nodeId, e.target.nodeId].includes(n.id)).forEach(n => { n.x += 143; n.y -= 81 })
    expect(routePoints(e, d)[0].x - point.x).toBeCloseTo(143); expect(routePoints(e, d)[0].y - point.y).toBeCloseTo(-81)
  })
  it('exporta todos los tramos y etiquetas giradas, incluidos puntos alejados del área visible', () => {
    const d = createDemoProject().diagrams[0], e = d.edges[0]; insertWaypoint(e, d, .5)
    e.waypoints![0].offset.y = -1400; e.waypoints![0].outgoing.x = 1500; e.label.orientation = 'manual'; e.label.angle = 36; e.label.width = 260
    const bounds = diagramBounds(d), route = routePoints(e, d)[0]
    expect(bounds.y).toBeLessThan(route.y); expect(bounds.x + bounds.width).toBeGreaterThan(route.x + 1500)
    const exported = renderDiagramSvg(d, { format: 'svg', scale: 1, padding: 32, background: 'transparent', grid: false })
    expect(exported.svg).toContain(`d="${edgeVisual(e, d).path}"`); expect(exported.svg).toContain('rotate(36)'); expect(exported.svg).not.toContain('label-rotate')
  })
  it('rechaza puntos fuera de orden y enlaces circulares entre niveles', () => {
    const p = createDemoProject(), e = p.diagrams[0].edges[0]; insertWaypoint(e, p.diagrams[0], .4); insertWaypoint(e, p.diagrams[0], .8)
    e.waypoints!.reverse(); expect(() => parseProject(p)).toThrow('ordenados')
    const store = new EditorStore(createDemoProject()), root = store.diagram.id, process = store.diagram.nodes.find(n => n.kind === 'process')!
    store.createChild(process.id); const child = store.diagram.id
    expect(canLinkChild(store.getSnapshot().project, child, root)).toBe(false)
    const id = store.addNode('process', { x: 100, y: 100 }), bad = clone(store.getSnapshot().project)
    bad.diagrams.find(d => d.id === child)!.nodes.find(n => n.id === id)!.childDiagramId = root
    expect(() => parseProject(bad)).toThrow('circular')
  })
})

describe('bloqueos, estilos y niveles', () => {
  it('protege figuras bloqueadas de mover, redimensionar, alinear y eliminar, incluso en grupos', () => {
    const s = new EditorStore(createDemoProject()), a = s.diagram.nodes[1], b = s.diagram.nodes[2]
    s.select([a.id]); s.setLocked(true); const locked = clone(s.diagram.nodes[1])
    s.updateNode(a.id, n => { n.width = 200 }); s.updateNodes([a.id], { x: 1000 }); s.select([a.id, b.id]); s.moveSelection(50, 20); s.align('left'); s.deleteSelection()
    expect(s.diagram.nodes.find(n => n.id === a.id)).toEqual(locked); expect(s.diagram.nodes.find(n => n.id === b.id)).toBeUndefined()
    s.select([a.id]); s.setLocked(false); s.moveSelection(50, 20); expect(s.diagram.nodes[1].x).toBe(a.x + 50)
  })
  it('un flujo bloqueado impide borrar por accidente una de sus figuras', () => {
    const s = new EditorStore(createDemoProject()), e = s.diagram.edges[0]
    s.select([e.id]); s.setLocked(true); s.select([e.source.nodeId]); s.deleteSelection()
    expect(s.diagram.nodes.some(n => n.id === e.source.nodeId)).toBe(true); expect(s.diagram.edges.some(edge => edge.id === e.id)).toBe(true)
  })
  it('guarda estilos portables y los aplica en una operación a figuras y flujos', () => {
    const s = new EditorStore(createDemoProject()), n = s.diagram.nodes[1], e = s.diagram.edges[0]
    s.saveStyle('Datos externos', { stroke: '#123456', strokeWidth: 3, fill: '#ffffff', font: { ...n.font, bold: true } })
    const before = clone(s.diagram); s.select([n.id, e.id]); s.applyStyle(s.getSnapshot().project.styles![0])
    expect(s.diagram.nodes[1].stroke).toBe('#123456'); expect(s.diagram.edges[0].label.font.bold).toBe(true)
    expect(parseProject(s.getSnapshot().project).styles![0].name).toBe('Datos externos')
    const invalid = clone(s.getSnapshot().project); invalid.styles!.push(clone(invalid.styles![0])); expect(() => parseProject(invalid)).toThrow('repetidos')
    s.undo(); expect(s.diagram).toEqual(before)
  })
  it('crea niveles, numera procesos y mantiene referencias al duplicar, borrar y deshacer', () => {
    const s = new EditorStore(createDemoProject()), root = s.diagram.id, n = s.diagram.nodes.find(n => n.kind === 'process')!
    s.createChild(n.id); const child = s.diagram.id
    const first = s.addNode('process', { x: 100, y: 100 }); expect(s.diagram.nodes.find(n => n.id === first)!.number).toBe('1.1')
    const second = s.addNode('process', { x: 300, y: 100 }); expect(s.diagram.nodes.find(n => n.id === second)!.number).toBe('1.2')
    expect(parentProcess(s.getSnapshot().project, child)?.diagram.id).toBe(root)
    s.switchDiagram(root); s.select([n.id]); s.duplicate(); expect(s.diagram.nodes.at(-1)!.childDiagramId).toBeUndefined()
    s.removeDiagram(child); expect(s.diagram.nodes.find(node => node.id === n.id)!.childDiagramId).toBeUndefined()
    s.undo(); expect(s.diagram.nodes.find(node => node.id === n.id)!.childDiagramId).toBe(child)
    expect(() => parseProject(s.getSnapshot().project)).not.toThrow()
  })
})
