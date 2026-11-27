import { describe, expect, it } from 'vitest'
import { EditorStore } from './store'
import { createProject, nodeForDiagram, parseProject } from './model'
import { diagramDescription, diagramTrail, specificationAction } from './hierarchy'
import { nodeTextLayout } from './geometry'
import { renderDiagramSvg } from './export'
import { searchElements } from './projectTools'
import { projectExportPlan } from './projectExport'

describe('numeración de niveles DFD', () => {
  it('crea un contexto con un sistema sin número y permite entidades y textos, reservando almacenes para el nivel 1', () => {
    const s = new EditorStore(createProject()); s.addDiagram('Órdenes de trabajo')
    expect(s.diagram.nodes).toHaveLength(1)
    expect(s.diagram.nodes[0]).toMatchObject({ kind: 'process', text: 'Órdenes de trabajo', number: '' })
    expect(s.addNode('process', { x: 0, y: 0 })).toBe('')
    expect(s.addNode('store', { x: 0, y: 0 })).toBe('')
    expect(s.addNode('entity', { x: 0, y: 0 })).not.toBe('')
    expect(s.addNode('note', { x: 0, y: 0 })).not.toBe('')
    s.select([s.diagram.nodes[0].id]); expect(s.duplicate()).toBe(false)
    expect(s.diagram.nodes.filter(n => n.kind === 'process')).toHaveLength(1)
  })
  it('distingue sistema completo, procesos generales y especificaciones 1.1/1.2 sin duplicar las existentes', () => {
    const s = new EditorStore(createProject()), system = s.addNode('process', { x: 300, y: 300 })
    expect(s.diagram.nodes[0].number).toBe(''); s.createChild(system)
    const overview = s.diagram.id, a = s.addNode('process', { x: 100, y: 100 }), b = s.addNode('process', { x: 100, y: 300 })
    expect(s.diagram.nodes.filter(n => n.kind === 'process').map(n => n.number)).toEqual(['1', '2'])
    expect(s.addNode('store', { x: 400, y: 100 })).not.toBe('')
    s.createChild(a)
    const specification = s.diagram.id; s.addNode('process', { x: 100, y: 100 }); s.addNode('process', { x: 100, y: 300 })
    expect(s.diagram.nodes.map(n => n.number)).toEqual(['1.1', '1.2'])
    const p = s.getSnapshot().project, trail = diagramTrail(p, specification)
    expect(trail.map(diagramDescription)).toEqual(['Nivel 0 · Contexto', 'Nivel 1 · Sistema completo', 'Nivel 2 · Especificación 1'])
    expect(specificationAction(0, false)).toBe('Crear nivel 1'); expect(specificationAction(1, false)).toBe('Crear especificación')
    s.switchDiagram(overview); s.createChild(a); expect(s.diagram.id).toBe(specification); expect(s.getSnapshot().project.diagrams).toHaveLength(3)
    expect(s.getSnapshot().project.diagrams.find(d => d.id === overview)!.nodes.find(n => n.id === b)!.childDiagramId).toBeUndefined()
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })
  it('representa contextos antiguos sin mostrar el 0 y conserva sus datos originales al exportar o buscar', () => {
    const s = new EditorStore(createProject()), id = s.addNode('process', { x: 100, y: 100 })
    s.updateNode(id, n => { n.number = '0'; n.text = 'Sistema de taller' })
    const p = s.getSnapshot().project, before = JSON.stringify(p), d = s.diagram, n = nodeForDiagram(d.nodes[0], d)
    expect(n.number).toBe(''); expect(nodeTextLayout(n).centerY).toBe(n.height / 2)
    const { svg } = renderDiagramSvg(d, { format: 'svg', scale: 1, padding: 20, background: 'white', grid: false })
    expect(svg.match(/<text\b/g)).toHaveLength(2); expect(svg).toContain('Diagrama de contexto')
    expect(searchElements(p, 'Sistema')[0].title).toBe('Sistema de taller')
    expect(projectExportPlan(p, 'svg')[0].diagram.rootLevel).toBe(0)
    expect(JSON.stringify(p)).toBe(before)
  })
})
