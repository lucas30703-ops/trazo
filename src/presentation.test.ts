import { describe, expect, it, vi } from 'vitest'
import { EditorStore } from './store'
import { clone, createDemoProject, createProject, parseProject } from './model'
import { anchorPoint, diagramBounds, edgePath, edgeVisual, headingLayout, labelPosition } from './geometry'
import { orderedProcesses } from './hierarchy'
import { renderDiagramSvg } from './export'
import { projectExportPlan } from './projectExport'
import { defaultOrthogonal } from './orthogonal'
const options = { format: 'svg' as const, scale: 1, padding: 0, background: 'white' as const, grid: false }

describe('geometría interactiva de flujos densos', () => {
  it('calcula 31 rótulos ortogonales sin remuestrear el recorrido por cada punto de búsqueda', () => {
    const d = createDemoProject().diagrams[0], templates = clone(d.edges)
    while (d.edges.length < 31) {
      const edge = clone(templates[d.edges.length % templates.length])
      edge.id = `flujo-denso-${d.edges.length}`
      d.edges.push(edge)
    }
    for (const edge of d.edges) {
      edge.mode = 'orthogonal'
      edge.orthogonal = defaultOrthogonal(edge, d, 'multi')
      edge.label.orientation = 'tangent'
    }
    const hypot = Math.hypot.bind(Math), measured = vi.spyOn(Math, 'hypot').mockImplementation((...values) => hypot(...values))
    try {
      for (const edge of d.edges) labelPosition(edge, d)
      expect(measured.mock.calls.length).toBeLessThan(30_000)
    } finally {
      measured.mockRestore()
    }
  })
})

describe('puntas visibles sin modificar la geometría guardada', () => {
  it.each([.5, 4, 16])('separa la punta de un borde de %s px y escala con el grosor de la flecha', thickness => {
    const p = createDemoProject(), d = p.diagrams[0], e = d.edges[1], target = d.nodes.find(n => n.id === e.target.nodeId)!
    e.mode = 'straight'; target.strokeWidth = thickness; e.strokeWidth = thickness
    const before = JSON.stringify(d), anchor = anchorPoint(target, e.target.anchor), label = labelPosition(e, d)
    const v = edgeVisual(e, d), bounds = diagramBounds(d)
    expect(v.head).toHaveLength(3); expect(v.tip.x).toBeGreaterThan(target.x + target.width + thickness / 2)
    expect(Math.hypot(v.head[1].x - v.head[2].x, v.head[1].y - v.head[2].y)).toBeGreaterThanOrEqual(10)
    expect(Math.hypot(v.tip.x - anchor.x, v.tip.y - anchor.y)).toBeGreaterThan(thickness / 2)
    for (const q of v.head) { expect(q.x).toBeGreaterThan(bounds.x); expect(q.x).toBeLessThan(bounds.x + bounds.width); expect(q.y).toBeGreaterThan(bounds.y); expect(q.y).toBeLessThan(bounds.y + bounds.height) }
    expect(labelPosition(e, d)).toEqual(label); expect(JSON.stringify(d)).toBe(before)
    target.x += 73; target.width += 80
    expect(edgeVisual(e, d).tip.x).toBeGreaterThan(target.x + target.width + thickness / 2)
  })
  it('recorta una curva oblicua fuera del círculo grueso y exporta las puntas encima de las figuras', () => {
    const d = createDemoProject().diagrams[0], e = d.edges[0], n = d.nodes.find(n => n.id === e.target.nodeId)!
    n.strokeWidth = 16
    const savedPath = edgePath(e, d), v = edgeVisual(e, d), svg = renderDiagramSvg(d, options).svg
    expect(Math.hypot(v.tip.x - n.x - n.width / 2, v.tip.y - n.y - n.height / 2)).toBeGreaterThan(n.width / 2 + 8)
    expect(svg).toContain(`d="${v.path}"`); expect(svg.indexOf('<polygon')).toBeGreaterThan(svg.indexOf('<circle cx='))
    expect(edgePath(e, d)).toBe(savedPath)
    expect(v.head.flatMap(q => [q.x, q.y]).every(Number.isFinite)).toBe(true)
  })
  it('respeta los laterales abiertos del almacén y los trazos horizontales gruesos', () => {
    const d = createDemoProject().diagrams[0], e = d.edges[2], n = d.nodes.find(n => n.id === e.target.nodeId)!
    n.strokeWidth = 16
    const v = edgeVisual(e, d)
    expect(v.tip.x).toBeCloseTo(n.x - 1.5)
    e.mode = 'straight'; e.target.anchor = { kind: 'side', side: 'top', t: .5 }
    const source = d.nodes.find(n => n.id === e.source.nodeId)!
    source.x = n.x + n.width / 2 - source.width / 2; source.y = n.y - 220; e.source.anchor = { kind: 'angle', value: Math.PI / 2 }
    expect(edgeVisual(e, d).tip.y).toBeLessThan(n.y - 8)
  })
})

describe('títulos predeterminados y contexto de una especificación', () => {
  it('conserva la posición manual al mover figuras, guardar, deshacer y exportar; permite volver a automática', () => {
    const s = new EditorStore(createProject()), id = s.addNode('process', { x: 400, y: 320 })
    const initial = headingLayout(s.diagram)!, origin = { x: initial.x + initial.width / 2, y: initial.y + initial.height / 2 }
    s.setHeadingPosition(origin)
    expect(headingLayout(s.diagram)).toEqual(initial)
    s.beginGesture(); s.setHeadingPosition({ x: -700, y: -800 }); s.setHeadingPosition({ x: -900, y: -1000 }); s.endGesture()
    s.undo(); expect(s.diagram.heading!.position).toEqual(origin)
    s.redo(); expect(s.diagram.heading!.position).toEqual({ x: -900, y: -1000 })
    s.updateNode(id, n => { n.x = 1800; n.y = 2400 })
    const h = headingLayout(s.diagram)!, bounds = diagramBounds(s.diagram)
    expect(h.x + h.width / 2).toBeCloseTo(-900); expect(h.y + h.height / 2).toBeCloseTo(-1000)
    expect(bounds.x).toBeLessThanOrEqual(h.x); expect(bounds.y).toBeLessThanOrEqual(h.y)
    expect(parseProject(JSON.parse(JSON.stringify(s.getSnapshot().project))).diagrams[0].heading!.position).toEqual({ x: -900, y: -1000 })
    const svg = renderDiagramSvg(s.diagram, options).svg
    const title = svg.match(/<tspan x="([^"]+)" y="([^"]+)">Diagrama de contexto/)!
    expect(Number(title[1])).toBeCloseTo(-900); expect(Number(title[2])).toBeCloseTo(-1000); expect(svg).not.toContain('heading-drag')
    s.setHeadingPosition(); expect(s.diagram.heading!.position).toBeUndefined()
    expect(headingLayout(s.diagram)!.x + headingLayout(s.diagram)!.width / 2).toBeCloseTo(1852)
  })
  it('mantiene títulos largos y personalizados en una sola línea completa, sin recortes', () => {
    const s = new EditorStore(createProject()); s.addNode('process', { x: 400, y: 320 })
    const text = 'DFD nivel 3 · Especificación del proceso 1.1 «Atender formularios de recepción y entrega de unidades»'
    s.command((_p, d) => { d.heading = { mode: 'custom', text: text.replace(' · ', '\n\n · ') } })
    const d = s.diagram, h = headingLayout(d)!, bounds = diagramBounds(d), svg = renderDiagramSvg(d, options).svg
    expect(h.lines).toEqual([text]); expect(h.width).toBeGreaterThan(1400)
    expect(bounds.x).toBeLessThanOrEqual(h.x); expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(h.x + h.width)
    expect(svg).toContain('«Atender formularios de recepción y entrega de unidades»')
  })
  it('copia una sola vez los vecinos en ambos sentidos, sin flujos, hijos ni cambios en el padre', () => {
    const p = createDemoProject(), s = new EditorStore(p), parent = s.diagram.id, process = s.diagram.nodes.find(n => n.kind === 'process')!
    const neighbourProcess = s.diagram.nodes.find(n => n.kind === 'process' && n.id !== process.id)!
    s.addEdge(process, neighbourProcess, { x: process.x, y: process.y }, { x: neighbourProcess.x, y: neighbourProcess.y })
    s.createChild(neighbourProcess.id); const sibling = s.diagram.id; s.switchDiagram(parent)
    const original = clone(s.getSnapshot().project.diagrams.find(d => d.id === parent)!)
    const neighbours = new Set(original.edges.flatMap(e => e.source.nodeId === process.id ? [e.target.nodeId] : e.target.nodeId === process.id ? [e.source.nodeId] : []))
    s.createChild(process.id); const childId = s.diagram.id, child = clone(s.diagram)
    expect(child.edges).toHaveLength(0); expect(child.nodes).toHaveLength(neighbours.size)
    for (const n of child.nodes) { expect(n.id).not.toBe(n.inheritedFrom!.nodeId); expect(n.childDiagramId).toBeUndefined(); expect(n.locked).toBe(false); expect(n.inheritedFrom!.diagramId).toBe(parent) }
    const reference = child.nodes.find(n => n.kind === 'process')!
    expect(reference.number).toBe(neighbourProcess.number); expect(orderedProcesses(child)).toHaveLength(0)
    s.createChild(reference.id); expect(s.diagram.id).toBe(childId)
    const internal = s.addNode('process', { x: 400, y: 320 })
    expect(s.diagram.nodes.find(n => n.id === internal)!.number).toBe('1.1')
    expect(s.getSnapshot().project.diagrams.some(d => d.id === sibling)).toBe(true)
    const after = clone(s.getSnapshot().project.diagrams.find(d => d.id === parent)!); delete after.nodes.find(n => n.id === process.id)!.childDiagramId
    expect(after).toEqual(original)
    const restored = parseProject(JSON.parse(JSON.stringify(s.getSnapshot().project)))
    expect(restored.diagrams.find(d => d.id === childId)!.nodes[0].inheritedFrom).toEqual(child.nodes[0].inheritedFrom)
    s.undo(); s.undo(); expect(s.getSnapshot().project.diagrams.some(d => d.id === childId)).toBe(false)
    s.redo(); expect(s.diagram.nodes).toEqual(child.nodes)
  })
  it('genera contexto, nivel 1 y especificación y actualiza el título al editar el proceso padre', () => {
    const s = new EditorStore(createProject()), context = s.diagram.id
    expect(headingLayout(s.diagram)!.lines.join(' ')).toBe('Diagrama de contexto')
    const system = s.addNode('process', { x: 400, y: 320 }); s.createChild(system)
    expect(headingLayout(s.diagram)!.lines.join(' ')).toBe('DFD nivel 1')
    const overview = s.diagram.id, id = s.addNode('process', { x: 400, y: 320 })
    s.updateNode(id, n => { n.text = 'Atender cliente' }); s.createChild(id)
    const detail = s.diagram.id
    expect(headingLayout(s.diagram)!.lines.join(' ')).toBe('DFD nivel 2 · Especificación del proceso 1 «Atender cliente»')
    s.switchDiagram(overview); s.updateNode(id, n => { n.text = 'Recibir cliente' }); s.switchDiagram(detail)
    expect(headingLayout(s.diagram)!.lines.join(' ')).toContain('Recibir cliente')
    const plan = projectExportPlan(s.getSnapshot().project, 'svg')
    expect(renderDiagramSvg(plan.find(item => item.diagram.id === detail)!.diagram, options).svg).toContain('Recibir cliente')
    expect(renderDiagramSvg(plan.find(item => item.diagram.id === context)!.diagram, options).svg).toContain('Diagrama de contexto')
  })
  it('guarda títulos personalizados u ocultos y excluye el título al exportar una selección', () => {
    const s = new EditorStore(createProject()), id = s.addNode('process', { x: 600, y: -1300 })
    s.command((_p, d) => { d.heading = { mode: 'custom', text: 'Título propio <&>' } })
    const d = s.diagram, h = headingLayout(d)!, bounds = diagramBounds(d)
    expect(h.y + h.height).toBeLessThan(d.nodes[0].y)
    expect(bounds.y).toBeLessThanOrEqual(h.y); expect(renderDiagramSvg(d, options).svg).toContain('Título propio &lt;&amp;&gt;')
    expect(renderDiagramSvg(d, { ...options, selection: [id] }).svg).not.toContain('Título propio')
    expect(parseProject(s.getSnapshot().project).diagrams[0].heading!.text).toBe('Título propio <&>')
    s.command((_p, diagram) => { diagram.heading = { mode: 'hidden' } })
    expect(headingLayout(s.diagram)).toBeNull()
    s.undo(); expect(headingLayout(s.diagram)!.lines.join(' ')).toBe('Título propio <&>')
  })
})
