import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import { EditorStore } from './store'
import { clone, createDemoProject, createProject, parseProject } from './model'
import { diagramDisplayName, diagramTrail, flattenHierarchy, projectHierarchy, rootLevel } from './hierarchy'
import { projectArchive, projectExportPlan } from './projectExport'
import { diagramBounds, processNumberStyle, textWidth } from './geometry'
import { renderDiagramSvg } from './export'

describe('jerarquía del proyecto', () => {
  it('representa contexto, nivel 1 y especificaciones sucesivas sin un tope fijo de niveles', () => {
    const store = new EditorStore(createProject()), numbers: string[] = []
    for (let level = 0; level < 6; level++) { const id = store.addNode('process', { x: 120, y: 120 }); numbers.push(store.diagram.nodes[0].number); if (level < 5) store.createChild(id) }
    const p = store.getSnapshot().project, flattened = flattenHierarchy(projectHierarchy(p))
    expect(flattened.map(item => item.branch.level)).toEqual([0, 1, 2, 3, 4, 5])
    expect(numbers).toEqual(['', '1', '1.1', '1.1.1', '1.1.1.1', '1.1.1.1.1'])
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p)
  })
  it('ordena las ramas por número de proceso y conserva los diagramas independientes', () => {
    const s = new EditorStore(createProject()), root = s.diagram.id
    s.command((_p, d) => { d.rootLevel = 1; d.name = 'Nivel 1 · General' })
    const a = s.addNode('process', { x: 100, y: 100 }); s.updateNode(a, n => { n.number = '10' }); s.createChild(a)
    const child10 = s.diagram.id; s.switchDiagram(root)
    const b = s.addNode('process', { x: 200, y: 100 }); s.updateNode(b, n => { n.number = '2' }); s.createChild(b)
    const child2 = s.diagram.id; s.addDiagram(); const independent = s.diagram.id
    const flat = flattenHierarchy(projectHierarchy(s.getSnapshot().project))
    expect(flat.map(item => item.branch.diagram.id)).toEqual([root, child2, child10, independent])
    s.switchDiagram(root); s.select([a]); s.deleteSelection()
    expect(flattenHierarchy(projectHierarchy(s.getSnapshot().project)).some(item => item.branch.diagram.id === child10)).toBe(true)
    s.undo(); expect(flattenHierarchy(projectHierarchy(s.getSnapshot().project)).map(item => item.branch.diagram.id)).toEqual([root, child2, child10, independent])
  })
  it('crea una descomposición desde una rama que no está activa y deshace en un paso', () => {
    const s = new EditorStore(createDemoProject()), owner = s.diagram.id, node = s.diagram.nodes.find(n => n.kind === 'process')!
    s.addDiagram(); const active = s.diagram.id; s.createChild(node.id, owner)
    expect(s.diagram.id).not.toBe(active); expect(s.getSnapshot().project.diagrams.find(d => d.id === owner)!.nodes.find(n => n.id === node.id)!.childDiagramId).toBe(s.diagram.id)
    s.undo(); expect(s.diagram.id).toBe(active); expect(s.getSnapshot().project.diagrams.find(d => d.id === owner)!.nodes.find(n => n.id === node.id)!.childDiagramId).toBeUndefined()
  })
  it('mantiene el nivel inicial al renombrar y admite proyectos anteriores sin metadatos nuevos', () => {
    const p = createDemoProject(), d = p.diagrams[0]; d.name = 'Mi análisis'; expect(rootLevel(d)).toBe(1)
    const legacy = clone(p); delete legacy.diagrams[0].rootLevel; legacy.diagrams[0].name = 'Nivel 1 · Reparaciones'
    expect(projectHierarchy(parseProject(legacy))[0].level).toBe(1)
  })
  it('conserva el nivel real al separar una rama antigua sin metadatos o eliminar su padre', () => {
    const s = new EditorStore(createProject()), root = s.diagram.id, parent = s.addNode('process', { x: 100, y: 100 }); s.createChild(parent)
    const level1 = s.diagram.id, nested = s.addNode('process', { x: 100, y: 100 }); s.createChild(nested)
    const level2 = s.diagram.id
    s.command(p => { const d = p.diagrams.find(d => d.id === level2)!; delete d.rootLevel; d.name = 'Especificación personalizada' })
    s.switchDiagram(level1); s.linkChild(nested)
    expect(projectHierarchy(s.getSnapshot().project).find(b => b.diagram.id === level2)!.level).toBe(2)
    s.undo(); s.removeDiagram(level1)
    expect(projectHierarchy(s.getSnapshot().project).find(b => b.diagram.id === level2)!.level).toBe(2)
    expect(s.getSnapshot().project.diagrams.find(d => d.id === root)!.nodes[0].childDiagramId).toBeUndefined()
  })
})

describe('orientación y creación contextual', () => {
  it('señala una navegación repetida al mismo diagrama sin modificar el documento ni agregar deshacer', () => {
    const s = new EditorStore(createProject()), before = s.getSnapshot()
    s.switchDiagram(s.diagram.id)
    expect(s.getSnapshot().project).toBe(before.project)
    expect(s.getSnapshot().canUndo).toBe(false)
    expect(s.getSnapshot().navigationRevision).toBeGreaterThan(before.navigationRevision)
  })
  it('reconstruye la ruta real al llegar desde otro nivel sin usar el orden ni los nombres', () => {
    const s = new EditorStore(createProject()), root = s.diagram.id
    const p0 = s.addNode('process', { x: 100, y: 100 }); s.createChild(p0)
    const parent = s.diagram.id, p1 = s.addNode('process', { x: 100, y: 100 }); s.createChild(p1)
    const child = s.diagram.id
    s.command(p => { p.diagrams.forEach(d => { d.name = 'Diagrama repetido' }); p.diagrams.reverse() })
    s.addDiagram('Otra raíz')
    const before = JSON.stringify(s.getSnapshot().project), trail = diagramTrail(s.getSnapshot().project, child)
    expect(trail.map(branch => branch.diagram.id)).toEqual([root, parent, child])
    expect(trail.map(branch => branch.level)).toEqual([0, 1, 2])
    expect(diagramTrail(s.getSnapshot().project, s.diagram.id)).toHaveLength(1)
    expect(JSON.stringify(s.getSnapshot().project)).toBe(before)
  })
  it('abre un detalle existente sin duplicarlo y conserva la geometría del propietario', () => {
    const s = new EditorStore(createProject()), root = s.diagram.id, process = s.addNode('process', { x: 160, y: 120 })
    const geometry = JSON.stringify(s.diagram.nodes[0]); s.createChild(process)
    const child = s.diagram.id; s.switchDiagram(root)
    const savedParent = JSON.stringify(s.getSnapshot().project.diagrams.find(d => d.id === root)); s.createChild(process)
    expect(s.diagram.id).toBe(child); expect(s.getSnapshot().project.diagrams).toHaveLength(2)
    expect(JSON.stringify(s.getSnapshot().project.diagrams.find(d => d.id === root))).toBe(savedParent)
    const parentNode = { ...s.getSnapshot().project.diagrams.find(d => d.id === root)!.nodes[0] }; delete parentNode.childDiagramId
    expect(JSON.stringify(parentNode)).toBe(geometry)
  })
  it('muestra nombres legibles sin modificar nombres guardados, números ni títulos personalizados', () => {
    const s = new EditorStore(createProject()), process = s.addNode('process', { x: 100, y: 100 })
    s.createChild(process)
    const project = s.getSnapshot().project, before = JSON.stringify(project), branch = diagramTrail(project, s.diagram.id).at(-1)!
    expect(diagramDisplayName(branch)).toBe('Sistema completo')
    expect(JSON.stringify(project)).toBe(before)
    s.command((_p, d) => { d.name = 'Especificación especial' })
    expect(diagramDisplayName(diagramTrail(s.getSnapshot().project, s.diagram.id).at(-1)!)).toBe('Especificación especial')
    s.command((_p, d) => { d.name = '2026 · Recepciones' })
    expect(diagramDisplayName(diagramTrail(s.getSnapshot().project, s.diagram.id).at(-1)!)).toBe('2026 · Recepciones')
  })
})

describe('descarga ordenada del proyecto', () => {
  it('empaqueta todos los diagramas con nombres únicos, carpetas jerárquicas y un proyecto editable íntegro', () => {
    const s = new EditorStore(createProject('Proyecto ñ')), root = s.diagram.id
    const id = s.addNode('process', { x: 100, y: 100 }); s.updateNode(id, n => { n.text = '../Recepción: <dato>'; n.font.bold = true }); s.createChild(id)
    const child = s.diagram.id; s.addNode('store', { x: 300, y: 100 }); s.switchDiagram(root); s.addDiagram()
    s.command((_p, d) => { d.name = 'Nivel 0 · Contexto' })
    const p = s.getSnapshot().project, plan = projectExportPlan(p, 'svg'), buffers = plan.map(item => ({ path: item.path, data: new TextEncoder().encode(renderDiagramSvg(item.diagram, { format: 'svg', scale: 1, padding: 20, background: 'white', grid: false }).svg) }))
    expect(plan).toHaveLength(3); expect(new Set(plan.map(item => item.path)).size).toBe(3)
    const rootFile = plan.find(item => item.diagram.id === root)!.path, rootPath = rootFile.slice(0, rootFile.lastIndexOf('/'))
    expect(plan.find(item => item.diagram.id === child)!.path.startsWith(rootPath + '/')).toBe(true)
    expect(plan.every(item => !item.path.split('/').includes('..'))).toBe(true)
    const archived = unzipSync(projectArchive(p, buffers))
    expect(Object.keys(archived)).toHaveLength(5)
    expect(parseProject(JSON.parse(strFromU8(archived['proyecto.dfd.json'])))).toEqual(p)
    expect(strFromU8(archived['indice.txt'])).toContain(plan[1].path)
    for (const item of plan) expect(strFromU8(archived[item.path])).toContain('<svg')
  })
})

describe('tipografía del número y del texto del proceso', () => {
  it('comparte fuente, tamaño, negrita, cursiva y color, y los conserva al exportar y reabrir', () => {
    const p = createDemoProject(), n = p.diagrams[0].nodes.find(n => n.kind === 'process')!
    n.font = { ...n.font, fontFamily: 'Georgia', fontSize: 38, bold: true, italic: true, color: '#0000ff' }
    expect(processNumberStyle(n)).toEqual({ ...n.font, align: 'center' })
    const { svg } = renderDiagramSvg(p.diagrams[0], { format: 'svg', scale: 1, padding: 20, background: 'white', grid: false, selection: [n.id] })
    const fonts = svg.match(/<text[^>]+>/g)!
    expect(fonts).toHaveLength(2)
    for (const tag of fonts) { expect(tag).toContain('font-size="38"'); expect(tag).toContain('font-family="Georgia"'); expect(tag).toContain('font-weight="bold"'); expect(tag).toContain('font-style="italic"'); expect(tag).toContain('fill="#0000ff"') }
    expect(parseProject(p).diagrams[0].nodes.find(node => node.id === n.id)!.font).toEqual(n.font)
  })
  it('incluye números grandes y largos en los límites de exportación', () => {
    const d = createDemoProject().diagrams[0], n = d.nodes.find(n => n.kind === 'process')!
    n.number = '1.12345678901234567890'; n.font.fontSize = 120; n.font.bold = true
    const bounds = diagramBounds(d, [n.id]), width = textWidth(n.number, processNumberStyle(n))
    expect(bounds.width).toBeGreaterThanOrEqual(width); expect(bounds.y).toBeLessThan(n.y)
  })
})
