import { describe, expect, it } from 'vitest'
import {
  applyDesignBatch,
  applyDesignHistory,
  createDesignDiagram,
  createDesignSpecification,
  deleteDesignDiagram,
  deleteDesignElements,
  designSnapshot,
  linkDesignSpecification,
  organizeDesignFlows,
  renameDesignContent,
} from './designAutomation'
import { createProject } from './model'
import { EditorStore } from './store'

describe('automatización de DFD de diseño', () => {
  it('crea pantalla, tabla y flujo recto como una sola operación', () => {
    const store = new EditorStore(createProject('Prueba MCP', 'design'))
    const before = designSnapshot(store)

    const result = applyDesignBatch(store, {
      projectId: before.projectId,
      diagramId: before.diagramId,
      expectedRevision: before.revision,
      nodes: [
        { ref: 'pantalla', kind: 'pantalla', text: 'Recepción', x: 100, y: 120 },
        { ref: 'tabla', kind: 'tabla', text: 'Unidades', x: 520, y: 120 },
      ],
      flows: [{ ref: 'flujo', source: 'pantalla', target: 'tabla', text: 'R. de unidad' }],
    })

    const diagram = store.diagram
    const screen = diagram.nodes.find(node => node.id === result.refs.pantalla)!
    const table = diagram.nodes.find(node => node.id === result.refs.tabla)!
    const flow = diagram.edges.find(edge => edge.id === result.refs.flujo)!
    expect(screen).toMatchObject({ kind: 'entity', text: 'Recepción', x: 100, y: 120 })
    expect(table).toMatchObject({ kind: 'store', text: 'Unidades', x: 520, y: 120 })
    expect(flow).toMatchObject({ mode: 'straight', source: { nodeId: screen.id }, target: { nodeId: table.id }, label: { text: 'R. de unidad' } })
    expect(designSnapshot(store).flows).toContainEqual(expect.objectContaining({ id: flow.id, source: expect.objectContaining({ nodeId: screen.id }), target: expect.objectContaining({ nodeId: table.id }), text: 'R. de unidad', mode: 'straight' }))

    store.undo()
    expect(store.diagram.nodes).toHaveLength(0)
    expect(store.diagram.edges).toHaveLength(0)
  })

  it('rechaza una escritura basada en una revisión anterior', () => {
    const store = new EditorStore(createProject('Prueba MCP', 'design'))
    const snapshot = designSnapshot(store)
    store.addNode('entity', { x: 20, y: 20 })

    expect(() => applyDesignBatch(store, {
      projectId: snapshot.projectId,
      diagramId: snapshot.diagramId,
      expectedRevision: snapshot.revision,
      nodes: [{ ref: 'tabla', kind: 'tabla', text: 'Unidades', x: 300, y: 20 }],
    })).toThrow('El editor cambió desde la lectura')
  })

  it('crea un proceso, reconecta un flujo existente y agrega otro flujo en un lote', () => {
    const store = new EditorStore(createProject('Autonomía MCP', 'design'))
    const first = designSnapshot(store)
    const base = applyDesignBatch(store, {
      projectId: first.projectId,
      diagramId: first.diagramId,
      expectedRevision: first.revision,
      nodes: [
        { ref: 'pantalla', kind: 'pantalla', text: 'Recepción', x: 80, y: 180 },
        { ref: 'tabla', kind: 'tabla', text: 'Unidades', x: 620, y: 180 },
      ],
      flows: [{ ref: 'directo', source: 'pantalla', target: 'tabla', text: 'R. de unidad' }],
    })

    const result = applyDesignBatch(store, {
      projectId: base.projectId,
      diagramId: base.diagramId,
      expectedRevision: base.revision,
      nodes: [{ ref: 'proceso', kind: 'proceso', text: 'Consultar unidades', x: 350, y: 160 }],
      flowUpdates: [{ id: base.refs.directo, target: 'proceso', text: 'R. de unidad', mode: 'straight' }],
      flows: [{ ref: 'consulta', source: base.refs.tabla, target: 'proceso', text: 'r_unidades' }],
    })

    const process = store.diagram.nodes.find(node => node.id === result.refs.proceso)!
    const redirected = store.diagram.edges.find(edge => edge.id === base.refs.directo)!
    const query = store.diagram.edges.find(edge => edge.id === result.refs.consulta)!
    expect(process).toMatchObject({ kind: 'process', text: 'Consultar unidades', number: '1' })
    expect(redirected).toMatchObject({ source: { nodeId: base.refs.pantalla }, target: { nodeId: process.id }, label: { text: 'R. de unidad' }, mode: 'straight' })
    expect(query).toMatchObject({ source: { nodeId: base.refs.tabla }, target: { nodeId: process.id }, label: { text: 'r_unidades' } })

    store.undo()
    expect(store.diagram.nodes.some(node => node.id === process.id)).toBe(false)
    expect(store.diagram.edges.find(edge => edge.id === base.refs.directo)!.target.nodeId).toBe(base.refs.tabla)
  })

  it('ordena los flujos de un proceso por sus vecinos sin mover figuras', () => {
    const store = new EditorStore(createProject('Orden visual MCP', 'design'))
    const before = designSnapshot(store)
    const made = applyDesignBatch(store, {
      projectId: before.projectId,
      diagramId: before.diagramId,
      expectedRevision: before.revision,
      nodes: [
        { ref: 'proceso', kind: 'proceso', text: 'Registrar solicitud', x: 320, y: 900, width: 180, height: 180 },
        { ref: 'tabla_1', kind: 'tabla', text: 'Usuarios', x: 820, y: 120 },
        { ref: 'tabla_2', kind: 'tabla', text: 'Órdenes', x: 820, y: 360 },
        { ref: 'tabla_3', kind: 'tabla', text: 'Clientes', x: 820, y: 600 },
      ],
      flows: [
        { ref: 'f1', source: 'tabla_1', target: 'proceso', text: 'R_usuarios' },
        { ref: 'f2', source: 'tabla_2', target: 'proceso', text: 'R_ordenes' },
        { ref: 'f3', source: 'tabla_3', target: 'proceso', text: 'R_clientes' },
        { ref: 'f4', source: 'proceso', target: 'tabla_3', text: 'clientes' },
      ],
    })
    const positions = store.diagram.nodes.map(node => ({ id: node.id, x: node.x, y: node.y }))
    const original = structuredClone(store.diagram.edges)

    const arranged = organizeDesignFlows(store, {
      projectId: made.projectId,
      diagramId: made.diagramId,
      expectedRevision: made.revision,
      focusNodeId: made.refs.proceso,
      flowIds: [made.refs.f3, made.refs.f1, made.refs.f4, made.refs.f2],
    })

    expect(arranged.organizedFlowIds).toHaveLength(4)
    expect(store.diagram.nodes.map(node => ({ id: node.id, x: node.x, y: node.y }))).toEqual(positions)
    const ordered = ['f1', 'f2', 'f3', 'f4'].map(ref => store.diagram.edges.find(edge => edge.id === made.refs[ref])!)
    const processAngles = ordered.map(edge => (edge.source.nodeId === made.refs.proceso ? edge.source : edge.target).anchor)
      .map(anchor => anchor.kind === 'angle' ? anchor.value : Number.NaN)
    expect(processAngles[0]).toBeLessThan(processAngles[1])
    expect(processAngles[1]).toBeLessThan(processAngles[2])
    expect(processAngles[2]).toBeLessThan(processAngles[3])
    expect(new Set(processAngles).size).toBe(4)
    expect(ordered.every(edge => edge.mode === 'straight')).toBe(true)
    expect(ordered.slice(0, 3).map(edge => edge.label.t)).toEqual([.24, .24, .24])
    expect(ordered[3].label.t).toBe(.76)
    expect(ordered[2].source.anchor).not.toEqual(ordered[3].target.anchor)
    expect(ordered[2].label.offset).not.toEqual(ordered[3].label.offset)

    store.undo()
    expect(store.diagram.edges).toEqual(original)
  })

  it('permite una presentación legible explícita con tamaños y carriles', () => {
    const store = new EditorStore(createProject('Legibilidad MCP', 'design'))
    const before = designSnapshot(store)
    const result = applyDesignBatch(store, {
      projectId: before.projectId,
      diagramId: before.diagramId,
      expectedRevision: before.revision,
      nodes: [
        { ref: 'proceso', kind: 'proceso', text: 'Registrar', x: 340, y: 300, width: 132, height: 132, fontSize: 15, stroke: '#c2410c', fill: '#ffedd5', fontColor: '#7c2d12' },
        { ref: 'tabla', kind: 'tabla', text: 'Clientes', x: 800, y: 120, width: 220, height: 58, fontSize: 14, stroke: '#1d4ed8', fill: '#dbeafe', fontColor: '#172554' },
      ],
      flows: [{
        ref: 'flujo', source: 'proceso', target: 'tabla', text: 'R_clientes', mode: 'orthogonal',
        stroke: '#7c3aed', labelFontColor: '#4c1d95',
        sourceSide: 'right', sourceT: .35, targetSide: 'left', targetT: .5,
        orthogonalAxis: 'x', orthogonalOffset: 42, orthogonalKind: 'multi', cornerRadius: 18,
        labelT: .82, labelFontSize: 13, labelWidth: 160, labelOrientation: 'horizontal',
      }],
    })

    const process = store.diagram.nodes.find(node => node.id === result.refs.proceso)!
    const table = store.diagram.nodes.find(node => node.id === result.refs.tabla)!
    const flow = store.diagram.edges.find(edge => edge.id === result.refs.flujo)!
    expect(process).toMatchObject({ x: 340, y: 300, width: 132, height: 132, stroke: '#c2410c', fill: '#ffedd5', font: { fontSize: 15, color: '#7c2d12' } })
    expect(table).toMatchObject({ x: 800, y: 120, width: 220, height: 58, stroke: '#1d4ed8', fill: '#dbeafe', font: { fontSize: 14, color: '#172554' } })
    expect(flow).toMatchObject({
      stroke: '#7c3aed',
      mode: 'orthogonal', orthogonal: { axis: 'x', offset: 42, kind: 'multi' }, cornerRadius: 18,
      label: { t: .82, width: 160, orientation: 'horizontal', font: { fontSize: 13, color: '#4c1d95' } },
    })
    expect(result.nodes).toContainEqual(expect.objectContaining({ id: process.id, fontSize: 15, stroke: '#c2410c', fill: '#ffedd5', fontColor: '#7c2d12' }))
    expect(result.flows).toContainEqual(expect.objectContaining({ id: flow.id, stroke: '#7c3aed', label: expect.objectContaining({ t: .82, fontSize: 13, fontColor: '#4c1d95' }) }))

    store.undo()
    expect(store.diagram.nodes).toHaveLength(0)
    expect(store.diagram.edges).toHaveLength(0)
  })

  it('cambia colores existentes sin alterar su geometría', () => {
    const store = new EditorStore(createProject('Colores MCP', 'design'))
    const before = designSnapshot(store)
    const created = applyDesignBatch(store, {
      projectId: before.projectId,
      diagramId: before.diagramId,
      expectedRevision: before.revision,
      nodes: [
        { ref: 'pantalla', kind: 'pantalla', text: 'Recepción', x: 80, y: 120 },
        { ref: 'proceso', kind: 'proceso', text: 'Registrar', x: 360, y: 120 },
      ],
      flows: [{ ref: 'flujo', source: 'pantalla', target: 'proceso', text: 'Datos' }],
    })
    const geometry = {
      nodes: store.diagram.nodes.map(node => ({ id: node.id, x: node.x, y: node.y, width: node.width, height: node.height })),
      flow: structuredClone(store.diagram.edges[0]),
    }

    const colored = applyDesignBatch(store, {
      projectId: created.projectId,
      diagramId: created.diagramId,
      expectedRevision: created.revision,
      backgroundColor: '#f8fafc',
      updates: [
        { id: created.refs.pantalla, stroke: '#1d4ed8', fill: '#dbeafe', fontColor: '#172554' },
        { id: created.refs.proceso, stroke: '#c2410c', fill: '#ffedd5', fontColor: '#7c2d12' },
      ],
      flowUpdates: [{ id: created.refs.flujo, stroke: '#7c3aed', labelFontColor: '#4c1d95' }],
    })

    expect(store.diagram.background).toBe('#f8fafc')
    expect(store.diagram.nodes.find(node => node.id === created.refs.pantalla)).toMatchObject({
      stroke: '#1d4ed8', fill: '#dbeafe', font: { color: '#172554' },
    })
    expect(store.diagram.nodes.find(node => node.id === created.refs.proceso)).toMatchObject({
      stroke: '#c2410c', fill: '#ffedd5', font: { color: '#7c2d12' },
    })
    expect(store.diagram.edges[0]).toMatchObject({ stroke: '#7c3aed', label: { font: { color: '#4c1d95' } } })
    expect(store.diagram.nodes.map(node => ({ id: node.id, x: node.x, y: node.y, width: node.width, height: node.height }))).toEqual(geometry.nodes)
    expect(store.diagram.edges[0]).toMatchObject({
      id: geometry.flow.id,
      source: geometry.flow.source,
      target: geometry.flow.target,
      mode: geometry.flow.mode,
      controls: geometry.flow.controls,
    })
    expect(colored.diagram.background).toBe('#f8fafc')
    expect(colored.nodes).toContainEqual(expect.objectContaining({ id: created.refs.pantalla, stroke: '#1d4ed8', fill: '#dbeafe', fontColor: '#172554' }))
    expect(colored.flows).toContainEqual(expect.objectContaining({ id: created.refs.flujo, stroke: '#7c3aed', label: expect.objectContaining({ fontColor: '#4c1d95' }) }))

    const serialized = JSON.stringify(store.getSnapshot().project)
    expect(() => applyDesignBatch(store, {
      projectId: colored.projectId,
      diagramId: colored.diagramId,
      expectedRevision: colored.revision,
      updates: [{ id: created.refs.pantalla, stroke: 'azul' }],
    })).toThrow()
    expect(JSON.stringify(store.getSnapshot().project)).toBe(serialized)
    expect(store.getSnapshot().revision).toBe(colored.revision)
  })

  it('actualiza procesos, textos y geometría sin perder los IDs', () => {
    const store = new EditorStore(createProject('Edición MCP', 'design'))
    const before = designSnapshot(store)
    const created = applyDesignBatch(store, {
      projectId: before.projectId,
      diagramId: before.diagramId,
      expectedRevision: before.revision,
      nodes: [
        { ref: 'proceso', kind: 'proceso', text: 'Anterior', x: 100, y: 100 },
        { ref: 'texto', kind: 'texto', text: 'Título', x: 100, y: 20 },
      ],
    })
    const updated = applyDesignBatch(store, {
      projectId: created.projectId,
      diagramId: created.diagramId,
      expectedRevision: created.revision,
      updates: [
        { id: created.refs.proceso, text: 'Nuevo nombre', number: '7', x: 240, y: 260, width: 130, height: 130 },
        { id: created.refs.texto, text: 'Título actualizado', x: 40, y: 30 },
      ],
    })
    expect(updated.nodes).toContainEqual(expect.objectContaining({ id: created.refs.proceso, kind: 'proceso', text: 'Nuevo nombre', number: '7', x: 240, y: 260, width: 130, height: 130 }))
    expect(updated.nodes).toContainEqual(expect.objectContaining({ id: created.refs.texto, kind: 'texto', text: 'Título actualizado', x: 40, y: 30 }))
  })

  it('elimina flujos o figuras con sus flujos incidentes y permite deshacer', () => {
    const store = new EditorStore(createProject('Borrado MCP', 'design'))
    const before = designSnapshot(store)
    const made = applyDesignBatch(store, {
      projectId: before.projectId,
      diagramId: before.diagramId,
      expectedRevision: before.revision,
      nodes: [
        { ref: 'pantalla', kind: 'pantalla', text: 'Recepción', x: 80, y: 100 },
        { ref: 'proceso', kind: 'proceso', text: 'Procesar', x: 360, y: 90 },
        { ref: 'tabla', kind: 'tabla', text: 'Unidades', x: 650, y: 100 },
      ],
      flows: [
        { ref: 'entrada', source: 'pantalla', target: 'proceso', text: 'entrada' },
        { ref: 'salida', source: 'proceso', target: 'tabla', text: 'salida' },
      ],
    })
    const deletedFlow = deleteDesignElements(store, {
      projectId: made.projectId, diagramId: made.diagramId, expectedRevision: made.revision,
      flowIds: [made.refs.entrada],
    })
    expect(deletedFlow.deleted.flowIds).toEqual([made.refs.entrada])
    expect(store.diagram.edges.map(edge => edge.id)).toEqual([made.refs.salida])

    const deletedNode = deleteDesignElements(store, {
      projectId: deletedFlow.projectId, diagramId: deletedFlow.diagramId, expectedRevision: deletedFlow.revision,
      nodeIds: [made.refs.proceso],
    })
    expect(deletedNode.deleted).toEqual({ nodeIds: [made.refs.proceso], flowIds: [made.refs.salida] })
    expect(store.diagram.nodes.some(node => node.id === made.refs.proceso)).toBe(false)
    expect(store.diagram.edges).toHaveLength(0)
    store.undo()
    expect(store.diagram.nodes.some(node => node.id === made.refs.proceso)).toBe(true)
    expect(store.diagram.edges.map(edge => edge.id)).toEqual([made.refs.salida])
  })

  it('gestiona nombres, especificaciones, vínculos y diagramas con revisión', () => {
    const store = new EditorStore(createProject('Proyecto inicial', 'design'))
    const root = designSnapshot(store)
    const made = applyDesignBatch(store, {
      projectId: root.projectId, diagramId: root.diagramId, expectedRevision: root.revision,
      nodes: [{ ref: 'proceso', kind: 'proceso', text: 'Recepcionar', x: 250, y: 150 }],
    })
    const renamed = renameDesignContent(store, {
      projectId: made.projectId, expectedRevision: made.revision,
      projectName: 'Taller', diagramId: made.diagramId, diagramName: 'Recepción',
    })
    expect(renamed.projectName).toBe('Taller')
    expect(renamed.diagrams.find(diagram => diagram.id === made.diagramId)!.name).toBe('Recepción')

    const child = createDesignSpecification(store, {
      projectId: renamed.projectId, diagramId: made.diagramId, processId: made.refs.proceso,
      expectedRevision: renamed.revision, name: 'Detalle de recepción',
    })
    expect(child.activeDiagramId).not.toBe(made.diagramId)
    expect(child.diagrams.find(diagram => diagram.id === child.activeDiagramId)).toMatchObject({ level: 2, parentDiagramId: made.diagramId, ownerProcessId: made.refs.proceso })

    const other = createDesignDiagram(store, { projectId: child.projectId, expectedRevision: child.revision, name: 'Otra raíz' })
    const otherId = other.diagramId
    const linked = linkDesignSpecification(store, {
      projectId: other.projectId, ownerDiagramId: made.diagramId, processId: made.refs.proceso,
      expectedRevision: other.revision, action: 'desvincular',
    })
    expect(linked.diagrams.find(diagram => diagram.id === child.activeDiagramId)!.parentDiagramId).toBeUndefined()

    const relinked = linkDesignSpecification(store, {
      projectId: linked.projectId, ownerDiagramId: made.diagramId, processId: made.refs.proceso,
      childDiagramId: child.activeDiagramId, expectedRevision: linked.revision, action: 'vincular',
    })
    expect(relinked.diagrams.find(diagram => diagram.id === child.activeDiagramId)!.parentDiagramId).toBe(made.diagramId)

    const removed = deleteDesignDiagram(store, {
      projectId: relinked.projectId, diagramId: child.activeDiagramId, expectedRevision: relinked.revision,
    })
    expect(removed.diagrams.some(diagram => diagram.id === child.activeDiagramId)).toBe(false)
    expect(removed.diagrams.some(diagram => diagram.id === otherId)).toBe(true)
    expect(store.getSnapshot().project.diagrams.find(diagram => diagram.id === made.diagramId)!.nodes.find(node => node.id === made.refs.proceso)!.childDiagramId).toBeUndefined()
  })

  it('no elimina una figura ni un flujo bloqueados', () => {
    const store = new EditorStore(createProject('Bloqueos MCP', 'design'))
    const before = designSnapshot(store)
    const made = applyDesignBatch(store, {
      projectId: before.projectId, diagramId: before.diagramId, expectedRevision: before.revision,
      nodes: [
        { ref: 'pantalla', kind: 'pantalla', text: 'Recepción', x: 50, y: 100 },
        { ref: 'tabla', kind: 'tabla', text: 'Unidades', x: 400, y: 100 },
      ],
      flows: [{ ref: 'flujo', source: 'pantalla', target: 'tabla', text: 'datos' }],
    })
    store.command((_project, diagram) => { diagram.edges.find(edge => edge.id === made.refs.flujo)!.locked = true })
    const locked = designSnapshot(store), serialized = JSON.stringify(store.getSnapshot().project)
    expect(() => deleteDesignElements(store, {
      projectId: locked.projectId, diagramId: locked.diagramId, expectedRevision: locked.revision,
      nodeIds: [made.refs.pantalla],
    })).toThrow('flujo bloqueado')
    expect(JSON.stringify(store.getSnapshot().project)).toBe(serialized)
  })

  it('deshace y rehace solo con la revisión leída', () => {
    const store = new EditorStore(createProject('Historial MCP', 'design'))
    const before = designSnapshot(store)
    const made = applyDesignBatch(store, {
      projectId: before.projectId, diagramId: before.diagramId, expectedRevision: before.revision,
      nodes: [{ ref: 'tabla', kind: 'tabla', text: 'Unidades', x: 300, y: 200 }],
    })
    const undone = applyDesignHistory(store, { projectId: made.projectId, expectedRevision: made.revision, action: 'deshacer' })
    expect(undone.nodes).toHaveLength(0)
    const redone = applyDesignHistory(store, { projectId: undone.projectId, expectedRevision: undone.revision, action: 'rehacer' })
    expect(redone.nodes).toContainEqual(expect.objectContaining({ kind: 'tabla', text: 'Unidades' }))
  })
})
