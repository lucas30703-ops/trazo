import { describe, expect, it } from 'vitest'
import { anchorPoint, diagramBounds, edgePoints, labelLayout, nearestAnchor } from './geometry'
import { clone, createDemoProject, createNode, parseProject } from './model'
import { EditorStore } from './store'
import { renderDiagramSvg } from './export'

describe('documentos y geometría del DFD', () => {
  it('conserva todos los datos al guardar y volver a abrir', () => {
    const p = createDemoProject(), e = p.diagrams[0].edges[0]
    e.label.orientation = 'manual'; e.label.angle = -37; e.label.offset = { x: -95, y: 83 }
    e.controls.source = { x: -320, y: -190 }; e.label.text = 'Recepción, reparación\ny devolución: ñ <dato>'
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })
  it('mantiene un punto arbitrario del círculo al moverlo y redimensionarlo', () => {
    const n = createNode('process', { x: 150, y: 150 }), p = { x: 184, y: 101 }
    const anchor = nearestAnchor(n, p), before = anchorPoint(n, anchor)
    n.x += 170; n.y -= 65; n.width *= 2; n.height *= 2
    const after = anchorPoint(n, anchor)
    expect((after.x - n.x) / n.width).toBeCloseTo((before.x - (n.x - 170)) / (n.width / 2))
    expect(Math.hypot(after.x - n.x - n.width / 2, after.y - n.y - n.height / 2)).toBeCloseTo(n.width / 2)
  })
  it('mantiene lado y proporción en rectángulos y almacenes', () => {
    for (const kind of ['entity', 'store'] as const) {
      const n = createNode(kind, { x: 100, y: 100 }), a = nearestAnchor(n, { x: n.x + n.width * .31, y: n.y })
      expect(a).toEqual({ kind: 'side', side: 'top', t: expect.closeTo(.31) })
      n.x += 100; n.width = 402
      expect(anchorPoint(n, a).x).toBeCloseTo(n.x + 402 * .31)
      expect(anchorPoint(n, a).y).toBe(n.y)
    }
  })
  it('arrastra las manijas cercanas con sus figuras sin deformar el otro extremo', () => {
    const p = createDemoProject(), d = p.diagrams[0], e = d.edges[0], before = edgePoints(e, d)
    const source = d.nodes.find(n => n.id === e.source.nodeId)!
    source.x += 135; source.y -= 27
    const after = edgePoints(e, d)
    expect(after.c1.x - before.c1.x).toBeCloseTo(135); expect(after.c1.y - before.c1.y).toBeCloseTo(-27)
    expect(after.end).toEqual(before.end); expect(after.c2).toEqual(before.c2)
  })
  it('rechaza versiones incompatibles, anclajes inválidos y enlaces a figuras inexistentes', () => {
    const p = createDemoProject()
    expect(() => parseProject({ ...p, version: 8 })).toThrow('versión')
    const bad = clone(p); bad.diagrams[0].edges[0].target.nodeId = 'inexistente'
    expect(() => parseProject(bad)).toThrow('no existe')
    const invalid = clone(p); invalid.diagrams[0].edges[0].source.anchor = { kind: 'angle', value: 1 }
    expect(() => parseProject(invalid)).toThrow('no coincide')
    const infinite = clone(p); infinite.diagrams[0].nodes[0].x = Infinity
    expect(() => parseProject(infinite)).toThrow('válido')
  })
})

describe('operaciones del editor', () => {
  it('deshace un gesto completo y permite rehacerlo', () => {
    const store = new EditorStore(createDemoProject()), id = store.diagram.nodes[1].id, initial = store.diagram.nodes[1].x
    store.beginGesture(); for (let i = 1; i <= 12; i++) store.updateNode(id, n => { n.x = initial + i * 10 }); store.endGesture()
    expect(store.diagram.nodes[1].x).toBe(initial + 120)
    store.undo(); expect(store.diagram.nodes[1].x).toBe(initial); expect(store.getSnapshot().canUndo).toBe(false)
    store.redo(); expect(store.diagram.nodes[1].x).toBe(initial + 120)
  })
  it('duplica un grupo con conexiones remapeadas y elimina en cascada', () => {
    const store = new EditorStore(createDemoProject()), edge = store.diagram.edges[0], initialNodes = store.diagram.nodes.length, initialEdges = store.diagram.edges.length
    store.select([edge.source.nodeId, edge.target.nodeId]); store.duplicate()
    const copied = store.diagram.edges.at(-1)!
    expect(store.diagram.nodes).toHaveLength(initialNodes + 2)
    expect(store.diagram.edges).toHaveLength(initialEdges + 2)
    expect(copied.source.nodeId).not.toBe(edge.source.nodeId); expect(copied.target.nodeId).not.toBe(edge.target.nodeId)
    expect(() => parseProject(store.getSnapshot().project)).not.toThrow()
    store.deleteSelection(); expect(store.diagram.nodes).toHaveLength(initialNodes); expect(store.diagram.edges).toHaveLength(initialEdges)
    store.undo(); expect(store.diagram.nodes).toHaveLength(initialNodes + 2)
  })
  it('conserva los diagramas al cambiar de pestaña y deshace su eliminación', () => {
    const store = new EditorStore(createDemoProject()), old = clone(store.diagram)
    store.addDiagram(); const next = store.diagram.id; store.addNode('store', { x: 150, y: 250 })
    store.switchDiagram(old.id); expect(store.diagram).toEqual(old)
    store.removeDiagram(next); expect(store.getSnapshot().project.diagrams).toHaveLength(1)
    store.undo(); expect(store.getSnapshot().project.diagrams).toHaveLength(2)
  })
})

describe('exportación del documento', () => {
  it('incluye etiquetas rotadas y controles extremos en el área exportable', () => {
    const d = createDemoProject().diagrams[0], e = d.edges[0]
    e.controls.source.y = -1000; e.label.offset = { x: -1600, y: -500 }; e.label.orientation = 'manual'; e.label.angle = -51
    const b = diagramBounds(d), l = labelLayout(e, d)
    expect(b.x).toBeLessThan(l.x - l.width / 4); expect(b.y).toBeLessThan(-700)
    const out = renderDiagramSvg(d, { format: 'svg', scale: 2, padding: 32, background: 'transparent', grid: false })
    expect(out.svg).toContain('rotate(-51)'); expect(out.svg).toContain('fill="transparent"'); expect(out.svg).not.toContain('resize-handle')
    expect(out.svg).not.toContain('pattern id="grid"')
  })
  it('escapa texto importado y fuerza fondo opaco en JPG', () => {
    const d = createDemoProject().diagrams[0]; d.nodes[1].text = '<script>hola & "mundo"</script>'; d.edges[0].label.text = '<img onerror="bad()">'
    const { svg } = renderDiagramSvg(d, { format: 'jpg', scale: 1, padding: 10, background: 'transparent', grid: false })
    expect(svg).not.toContain('<script>'); expect(svg).not.toContain('<img '); expect(svg).toContain('&lt;'); expect(svg).toContain('fill="#ffffff"')
  })
})
