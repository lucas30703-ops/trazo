import { z } from 'zod'
import { anchorPoint, closestEdgeT, pointOnEdge, resetSimpleCurve } from './geometry'
import { flattenHierarchy, projectHierarchy } from './hierarchy'
import { clone, createNode, defaultFont, parseProject, projectMode, uid } from './model'
import type { Anchor, DfdEdge, DfdNode, Diagram, Project, ShapeKind } from './model'
import { defaultOrthogonal } from './orthogonal'
import { canLinkChild } from './store'
import type { EditorStore } from './store'

const id = z.string().trim().min(1).max(200)
const text = z.string().trim().min(1).max(4000)
const optionalText = z.string().trim().max(4000)
const processNumber = z.string().trim().max(100)
const coordinate = z.number().finite().min(-100000).max(100000)
const dimension = z.number().finite().min(24).max(20000)
const fontSize = z.number().finite().min(8).max(72)
const color = z.string().regex(/^(#(?:[\da-fA-F]{3}|[\da-fA-F]{4}|[\da-fA-F]{6}|[\da-fA-F]{8})|transparent)$/)
const side = z.enum(['top', 'right', 'bottom', 'left'])
const flowMode = z.enum(['straight', 'curve', 'orthogonal'])
const endMark = z.enum(['alta', 'baja', 'none'])
const organizedFlowMode = z.enum(['straight', 'curve'])
const orthogonalAxis = z.enum(['x', 'y'])
const orthogonalKind = z.enum(['elbow', 'multi'])
const cornerRadius = z.number().finite().min(0).max(200)
const labelOrientation = z.enum(['horizontal', 'tangent'])
const publicNodeKind = z.enum(['proceso', 'pantalla', 'tabla', 'texto'])

const curveVector = z.object({ x: coordinate, y: coordinate }).strict()
const curveWaypoint = z.object({
  t: z.number().gt(0).lt(1),
  offset: curveVector,
  incoming: curveVector,
  outgoing: curveVector,
}).strict()
const curveInput = z.object({
  controls: z.object({ source: curveVector.optional(), target: curveVector.optional() }).strict()
    .refine(controls => controls.source !== undefined || controls.target !== undefined, 'Indicá al menos una manija de la curva.').optional(),
  waypoints: z.array(curveWaypoint).max(32)
    .refine(points => points.every((point, index) => index === 0 || point.t > points[index - 1].t), 'Los puntos intermedios deben estar en orden creciente de t.').optional(),
}).strict().refine(curve => curve.controls !== undefined || curve.waypoints !== undefined, 'Indicá manijas o puntos intermedios para la curva.')

const nodeInput = z.object({
  ref: id,
  kind: publicNodeKind,
  text,
  number: processNumber.optional(),
  x: coordinate,
  y: coordinate,
  width: dimension.optional(),
  height: dimension.optional(),
  fontSize: fontSize.optional(),
  stroke: color.optional(),
  fill: color.optional(),
  fontColor: color.optional(),
}).strict()

const nodeUpdate = z.object({
  id,
  text: text.optional(),
  number: processNumber.optional(),
  x: coordinate.optional(),
  y: coordinate.optional(),
  width: dimension.optional(),
  height: dimension.optional(),
  fontSize: fontSize.optional(),
  stroke: color.optional(),
  fill: color.optional(),
  fontColor: color.optional(),
}).strict()

const flowInput = z.object({
  ref: id,
  source: id,
  target: id,
  text,
  mode: flowMode.optional(),
  curve: curveInput.optional(),
  endMark: endMark.optional(),
  sourceSide: side.optional(),
  targetSide: side.optional(),
  sourceT: z.number().min(0).max(1).optional(),
  targetT: z.number().min(0).max(1).optional(),
  labelWidth: dimension.optional(),
  labelOffsetX: coordinate.optional(),
  labelOffsetY: coordinate.optional(),
  labelT: z.number().min(0).max(1).optional(),
  labelFontSize: fontSize.optional(),
  stroke: color.optional(),
  labelFontColor: color.optional(),
  labelOrientation: labelOrientation.optional(),
  orthogonalAxis: orthogonalAxis.optional(),
  orthogonalOffset: coordinate.optional(),
  orthogonalKind: orthogonalKind.optional(),
  cornerRadius: cornerRadius.optional(),
}).strict()

const flowUpdate = z.object({
  id,
  source: id.optional(),
  target: id.optional(),
  text: optionalText.optional(),
  mode: flowMode.optional(),
  curve: curveInput.optional(),
  endMark: endMark.optional(),
  sourceSide: side.optional(),
  targetSide: side.optional(),
  sourceT: z.number().min(0).max(1).optional(),
  targetT: z.number().min(0).max(1).optional(),
  labelWidth: dimension.optional(),
  labelOffsetX: coordinate.optional(),
  labelOffsetY: coordinate.optional(),
  labelT: z.number().min(0).max(1).optional(),
  labelFontSize: fontSize.optional(),
  stroke: color.optional(),
  labelFontColor: color.optional(),
  labelOrientation: labelOrientation.optional(),
  orthogonalAxis: orthogonalAxis.optional(),
  orthogonalOffset: coordinate.optional(),
  orthogonalKind: orthogonalKind.optional(),
  cornerRadius: cornerRadius.optional(),
}).strict()

export const designBatchSchema = z.object({
  projectId: id,
  diagramId: id,
  expectedRevision: z.number().int().nonnegative(),
  backgroundColor: color.optional(),
  nodes: z.array(nodeInput).max(200).default([]),
  updates: z.array(nodeUpdate).max(200).default([]),
  flows: z.array(flowInput).max(400).default([]),
  flowUpdates: z.array(flowUpdate).max(400).default([]),
}).strict()

const deleteElementsSchema = z.object({
  projectId: id,
  diagramId: id,
  expectedRevision: z.number().int().nonnegative(),
  nodeIds: z.array(id).max(200).default([]),
  flowIds: z.array(id).max(400).default([]),
}).strict()

const organizeFlowsSchema = z.object({
  projectId: id,
  diagramId: id,
  expectedRevision: z.number().int().nonnegative(),
  focusNodeId: id,
  flowIds: z.array(id).max(400).default([]),
  mode: organizedFlowMode.default('straight'),
}).strict()

const renameSchema = z.object({
  projectId: id,
  expectedRevision: z.number().int().nonnegative(),
  projectName: text.optional(),
  diagramId: id.optional(),
  diagramName: text.optional(),
}).strict().superRefine((value, context) => {
  if (!value.projectName && !value.diagramName) context.addIssue({ code: 'custom', message: 'Indicá el nombre del proyecto o del diagrama.' })
  if (value.diagramName && !value.diagramId) context.addIssue({ code: 'custom', message: 'Falta diagramId para renombrar el diagrama.' })
})

const specificationSchema = z.object({
  projectId: id,
  diagramId: id,
  processId: id,
  expectedRevision: z.number().int().nonnegative(),
  name: text.optional(),
}).strict()

const createDiagramSchema = z.object({
  projectId: id,
  expectedRevision: z.number().int().nonnegative(),
  name: text,
}).strict()

const linkSchema = z.object({
  projectId: id,
  ownerDiagramId: id,
  processId: id,
  expectedRevision: z.number().int().nonnegative(),
  action: z.enum(['vincular', 'desvincular']),
  childDiagramId: id.optional(),
}).strict().superRefine((value, context) => {
  if (value.action === 'vincular' && !value.childDiagramId) context.addIssue({ code: 'custom', message: 'Falta childDiagramId para vincular.' })
})

const deleteDiagramSchema = z.object({
  projectId: id,
  diagramId: id,
  expectedRevision: z.number().int().nonnegative(),
}).strict()

const historySchema = z.object({
  projectId: id,
  expectedRevision: z.number().int().nonnegative(),
  action: z.enum(['deshacer', 'rehacer']),
}).strict()

const kindToInternal: Record<z.infer<typeof publicNodeKind>, ShapeKind> = {
  proceso: 'process',
  pantalla: 'entity',
  tabla: 'store',
  texto: 'note',
}

const kindToPublic = (kind: ShapeKind): z.infer<typeof publicNodeKind> => ({
  process: 'proceso',
  entity: 'pantalla',
  store: 'tabla',
  note: 'texto',
})[kind] as z.infer<typeof publicNodeKind>

function writableState(store: EditorStore, projectId: string, expectedRevision: number, diagramId?: string) {
  const state = store.getSnapshot()
  if (projectMode(state.project) !== 'design' || state.project.id !== projectId) {
    throw new Error('Cambió el proyecto abierto. Volvé a leerlo antes de escribir.')
  }
  if (diagramId && state.project.activeDiagramId !== diagramId) {
    throw new Error('Cambió el diagrama abierto. Volvé a leerlo antes de escribir.')
  }
  if (state.revision !== expectedRevision) throw new Error('El editor cambió desde la lectura. Volvé a leer y preparar el pedido.')
  if (store.isGestureActive()) throw new Error('Hay un arrastre en curso. Terminá el gesto antes de dibujar con Codex.')
  return state
}

function diagramBounds(diagram: Diagram) {
  if (!diagram.nodes.length) return null
  const left = Math.min(...diagram.nodes.map(node => node.x))
  const top = Math.min(...diagram.nodes.map(node => node.y))
  const right = Math.max(...diagram.nodes.map(node => node.x + node.width))
  const bottom = Math.max(...diagram.nodes.map(node => node.y + node.height))
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

export function designSnapshot(store: EditorStore, diagramId = store.diagram.id) {
  const state = store.getSnapshot(), project = state.project
  if (projectMode(project) !== 'design') throw new Error('Solo se admite DFD de diseño.')
  const diagram = project.diagrams.find(item => item.id === diagramId)
  if (!diagram) throw new Error('El diagrama no existe en el proyecto abierto.')
  const hierarchy = flattenHierarchy(projectHierarchy(project))
  const branch = hierarchy.find(item => item.branch.diagram.id === diagram.id)?.branch
  const nodesById = new Map(diagram.nodes.map(node => [node.id, node]))
  return {
    projectId: project.id,
    projectName: project.name,
    revision: state.revision,
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    activeDiagramId: project.activeDiagramId,
    diagramId: diagram.id,
    diagramName: diagram.name,
    diagramLevel: branch?.level,
    diagram: {
      id: diagram.id,
      name: diagram.name,
      level: branch?.level,
      background: diagram.background,
      grid: diagram.grid,
      snap: diagram.snap,
      heading: diagram.heading,
      bounds: diagramBounds(diagram),
    },
    diagrams: hierarchy.map(({ branch: item }) => ({
      id: item.diagram.id,
      name: item.diagram.name,
      level: item.level,
      parentDiagramId: item.parentId,
      ownerProcessId: item.process?.id,
      ownerProcessNumber: item.process?.number,
      ownerProcessName: item.process?.text,
      active: item.diagram.id === project.activeDiagramId,
    })),
    coordinates: 'x/y son la esquina superior izquierda, en unidades del lienzo. No dependen del zoom.',
    nodes: diagram.nodes.map(node => ({
      id: node.id,
      kind: kindToPublic(node.kind),
      text: node.text,
      number: node.number,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      fontSize: node.font.fontSize,
      stroke: node.stroke,
      fill: node.fill,
      fontColor: node.font.color,
      locked: !!node.locked,
      childDiagramId: node.childDiagramId,
      inheritedFrom: node.inheritedFrom,
    })),
    flows: diagram.edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourcePoint: anchorPoint(nodesById.get(edge.source.nodeId)!, edge.source.anchor),
      targetPoint: anchorPoint(nodesById.get(edge.target.nodeId)!, edge.target.anchor),
      text: edge.label.text,
      mode: edge.mode,
      curve: edge.mode === 'curve' ? {
        controls: edge.controls,
        waypoints: edge.generatedRoute ?? edge.waypoints ?? [],
      } : undefined,
      endMark: edge.endMark ?? 'none',
      stroke: edge.stroke,
      orthogonal: edge.orthogonal,
      cornerRadius: edge.cornerRadius,
      locked: !!edge.locked,
      label: {
        text: edge.label.text,
        t: edge.label.t,
        offset: edge.label.offset,
        width: edge.label.width,
        fontSize: edge.label.font.fontSize,
        fontColor: edge.label.font.color,
        orientation: edge.label.orientation,
      },
    })),
  }
}

// Ray/rectangle intersection puts the port on the border facing the other node.
// Explicit sides permit separate, parallel flows without creating curves.
function port(node: DfdNode, other: DfdNode, explicit?: z.infer<typeof side>, t?: number): Anchor {
  const dx = other.x + other.width / 2 - node.x - node.width / 2
  const dy = other.y + other.height / 2 - node.y - node.height / 2
  if (node.kind === 'process') {
    if (explicit) {
      const at = t ?? .5
      const px = explicit === 'left' ? -node.width / 2 : explicit === 'right' ? node.width / 2 : (at - .5) * node.width
      const py = explicit === 'top' ? -node.height / 2 : explicit === 'bottom' ? node.height / 2 : (at - .5) * node.height
      return { kind: 'angle', value: Math.atan2(py, px) }
    }
    return { kind: 'angle', value: Math.atan2(dy, dx) }
  }
  const horizontal = Math.abs(dx) / node.width >= Math.abs(dy) / node.height
  const chosen = explicit ?? (horizontal ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top'))
  const at = t ?? (explicit ? .5 : horizontal
    ? .5 + dy * (node.width / 2) / (Math.abs(dx) || 1) / node.height
    : .5 + dx * (node.height / 2) / (Math.abs(dy) || 1) / node.width)
  return { kind: 'side', side: chosen, t: Math.max(0, Math.min(1, at)) }
}

type PortSide = z.infer<typeof side>

function facingSide(node: DfdNode, other: DfdNode): PortSide {
  const horizontalGap = other.x >= node.x + node.width ? other.x - node.x - node.width
    : node.x >= other.x + other.width ? node.x - other.x - other.width : -1
  const verticalGap = other.y >= node.y + node.height ? other.y - node.y - node.height
    : node.y >= other.y + other.height ? node.y - other.y - other.height : -1
  const dx = other.x + other.width / 2 - node.x - node.width / 2
  const dy = other.y + other.height / 2 - node.y - node.height / 2
  // Established columns take priority over diagonal proximity: every table in
  // the column at the right uses the same side of the focus figure.
  if (horizontalGap >= 24) return dx >= 0 ? 'right' : 'left'
  if (verticalGap >= 24) return dy >= 0 ? 'bottom' : 'top'
  return Math.abs(dx) / node.width >= Math.abs(dy) / node.height
    ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top')
}

function oppositeSide(value: PortSide): PortSide {
  return value === 'left' ? 'right' : value === 'right' ? 'left' : value === 'top' ? 'bottom' : 'top'
}

function organizedPort(node: DfdNode, sideValue: PortSide, t: number): Anchor {
  if (node.kind !== 'process') return { kind: 'side', side: sideValue, t }
  const base = sideValue === 'right' ? 0 : sideValue === 'bottom' ? Math.PI / 2 : sideValue === 'left' ? Math.PI : -Math.PI / 2
  const spread = Math.PI * .72
  return { kind: 'angle', value: base + (t - .5) * spread }
}

function distributedSlot(index: number, count: number, margin = .14) {
  return count <= 1 ? .5 : margin + index * (1 - margin * 2) / (count - 1)
}

function applyFlowMode(edge: DfdEdge, diagram: Diagram, mode: DfdEdge['mode']) {
  edge.mode = mode
  edge.routing = 'manual'
  delete edge.routingIssue
  delete edge.generatedRoute
  edge.waypoints = []
  edge.controls = { source: { x: 0, y: 0 }, target: { x: 0, y: 0 } }
  if (mode === 'straight') {
    delete edge.orthogonal
    delete edge.cornerRadius
  } else if (mode === 'curve') {
    delete edge.orthogonal
    delete edge.cornerRadius
    resetSimpleCurve(edge, diagram)
  } else {
    edge.orthogonal = defaultOrthogonal(edge, diagram, 'elbow')
    edge.cornerRadius ??= 16
  }
}

function applyCurveOptions(edge: DfdEdge, diagram: Diagram, curve: z.infer<typeof curveInput> | undefined, keepLabelPosition = false) {
  if (!curve) return
  if (edge.mode !== 'curve') throw new Error(`Las manijas y puntos intermedios requieren mode=curve: ${edge.id}.`)

  const existingWaypoints = edge.generatedRoute ?? edge.waypoints
  const segmentCountChanges = curve.waypoints !== undefined && curve.waypoints.length !== (existingWaypoints?.length ?? 0)
  const labelReference = keepLabelPosition && (edge.generatedRoute?.length || segmentCountChanges)
    ? pointOnEdge(edge, diagram, edge.label.t)
    : undefined

  if (curve.controls) edge.controls = { ...edge.controls, ...curve.controls }
  if (curve.waypoints !== undefined) edge.waypoints = curve.waypoints
  else if (edge.generatedRoute) edge.waypoints = edge.generatedRoute
  edge.routing = 'manual'
  delete edge.generatedRoute
  delete edge.routingIssue

  if (labelReference) edge.label.t = closestEdgeT(edge, diagram, labelReference)
}

interface OrthogonalOptions {
  orthogonalAxis?: 'x' | 'y'
  orthogonalOffset?: number
  orthogonalKind?: 'elbow' | 'multi'
  cornerRadius?: number
}

function applyOrthogonalOptions(edge: DfdEdge, diagram: Diagram, options: OrthogonalOptions) {
  const requested = options.orthogonalAxis !== undefined || options.orthogonalOffset !== undefined
    || options.orthogonalKind !== undefined || options.cornerRadius !== undefined
  if (!requested) return
  if (edge.mode !== 'orthogonal') throw new Error(`La geometría ortogonal requiere mode=orthogonal: ${edge.id}.`)
  const current = edge.orthogonal ?? defaultOrthogonal(edge, diagram, 'multi')
  edge.orthogonal = {
    axis: options.orthogonalAxis ?? current.axis,
    offset: options.orthogonalOffset ?? current.offset,
    kind: options.orthogonalKind ?? current.kind ?? 'multi',
  }
  if (options.cornerRadius !== undefined) edge.cornerRadius = options.cornerRadius
}

function nextProcessNumber(project: Project, diagram: Diagram) {
  const branch = flattenHierarchy(projectHierarchy(project)).find(item => item.branch.diagram.id === diagram.id)?.branch
  const parent = project.diagrams.flatMap(item => item.nodes).find(node => node.childDiagramId === diagram.id)
  const prefix = (branch?.level ?? 1) > 1 && parent?.number ? `${parent.number}.` : ''
  let index = 1
  while (diagram.nodes.some(node => node.kind === 'process' && node.number === `${prefix}${index}`)) index++
  return `${prefix}${index}`
}

function commitProject(store: EditorStore, next: Project) {
  parseProject(next)
  store.command(project => { Object.assign(project, next) })
}

function commitDiagram(store: EditorStore, diagram: Diagram) {
  const candidate = clone(store.getSnapshot().project)
  const index = candidate.diagrams.findIndex(item => item.id === diagram.id)
  candidate.diagrams[index] = diagram
  parseProject(candidate)
  store.command(project => {
    const target = project.diagrams.findIndex(item => item.id === diagram.id)
    project.diagrams[target] = diagram
  })
}

export function applyDesignBatch(store: EditorStore, raw: unknown) {
  const batch = designBatchSchema.parse(raw)
  const before = writableState(store, batch.projectId, batch.expectedRevision, batch.diagramId)
  if (!batch.nodes.length && !batch.updates.length && !batch.flows.length && !batch.flowUpdates.length && batch.backgroundColor === undefined) throw new Error('El pedido está vacío.')
  const next = clone(before.project), diagram = next.diagrams.find(item => item.id === batch.diagramId)!
  if (batch.backgroundColor !== undefined) diagram.background = batch.backgroundColor
  const refs = new Map<string, string>(), used = new Set([...diagram.nodes, ...diagram.edges].map(element => element.id))
  const reserve = (ref: string) => {
    if (refs.has(ref) || used.has(ref)) throw new Error(`Referencia duplicada o confundida con un ID existente: ${ref}`)
    const newId = uid()
    refs.set(ref, newId)
    used.add(newId)
    return newId
  }
  const resolveNode = (reference: string, flowRef: string) => {
    const nodeId = refs.get(reference) ?? reference
    const node = diagram.nodes.find(item => item.id === nodeId)
    if (!node || node.kind === 'note') throw new Error(`Extremo inválido para el flujo ${flowRef}: ${reference}.`)
    return node
  }

  for (const input of batch.nodes) {
    const kind = kindToInternal[input.kind]
    if (kind !== 'process' && input.number !== undefined) throw new Error(`Solo un proceso puede tener número: ${input.ref}.`)
    const node = createNode(kind, { x: 0, y: 0 })
    const defaults = kind === 'process' ? [104, 104] : kind === 'entity' ? [180, 70] : kind === 'store' ? [200, 70] : [230, 44]
    Object.assign(node, {
      id: reserve(input.ref),
      text: input.text,
      number: kind === 'process' ? input.number ?? nextProcessNumber(next, diagram) : '',
      x: input.x,
      y: input.y,
      width: input.width ?? defaults[0],
      height: input.height ?? defaults[1],
    })
    if (input.fontSize !== undefined) node.font.fontSize = input.fontSize
    if (input.stroke !== undefined) node.stroke = input.stroke
    if (input.fill !== undefined) node.fill = input.fill
    if (input.fontColor !== undefined) node.font.color = input.fontColor
    diagram.nodes.push(node)
  }

  const updatedNodes = new Set<string>()
  for (const update of batch.updates) {
    if (updatedNodes.has(update.id)) throw new Error(`Actualización de figura repetida: ${update.id}`)
    updatedNodes.add(update.id)
    const node = diagram.nodes.find(item => item.id === update.id)
    if (!node || node.locked) throw new Error(`Figura inexistente o bloqueada: ${update.id}`)
    if (update.number !== undefined && node.kind !== 'process') throw new Error(`Solo un proceso puede tener número: ${update.id}.`)
    const { id: _id, fontSize: nextFontSize, fontColor: nextFontColor, ...patch } = update
    Object.assign(node, patch)
    if (nextFontSize !== undefined) node.font.fontSize = nextFontSize
    if (nextFontColor !== undefined) node.font.color = nextFontColor
  }

  const updatedFlows = new Set<string>()
  for (const update of batch.flowUpdates) {
    if (updatedFlows.has(update.id)) throw new Error(`Actualización de flujo repetida: ${update.id}`)
    updatedFlows.add(update.id)
    const edge = diagram.edges.find(item => item.id === update.id)
    if (!edge || edge.locked) throw new Error(`Flujo inexistente o bloqueado: ${update.id}`)
    const source = resolveNode(update.source ?? edge.source.nodeId, update.id)
    const target = resolveNode(update.target ?? edge.target.nodeId, update.id)
    if (source.id === target.id) throw new Error(`Un flujo no puede volver a la misma figura: ${update.id}.`)
    const endpointsChanged = update.source !== undefined || update.target !== undefined
      || update.sourceSide !== undefined || update.targetSide !== undefined || update.sourceT !== undefined || update.targetT !== undefined
    if (endpointsChanged) {
      edge.source = { nodeId: source.id, anchor: port(source, target, update.sourceSide, update.sourceT) }
      edge.target = { nodeId: target.id, anchor: port(target, source, update.targetSide, update.targetT) }
    }
    if (update.text !== undefined) edge.label.text = update.text
    if (update.labelWidth !== undefined) edge.label.width = update.labelWidth
    if (update.labelOffsetX !== undefined) edge.label.offset.x = update.labelOffsetX
    if (update.labelOffsetY !== undefined) edge.label.offset.y = update.labelOffsetY
    if (update.labelT !== undefined) edge.label.t = update.labelT
    if (update.labelFontSize !== undefined) edge.label.font.fontSize = update.labelFontSize
    if (update.stroke !== undefined) edge.stroke = update.stroke
    if (update.labelFontColor !== undefined) edge.label.font.color = update.labelFontColor
    if (update.labelOrientation !== undefined) edge.label.orientation = update.labelOrientation
    // Reaffirming curve mode must preserve the existing handles and waypoints.
    if (update.mode !== undefined && (update.mode !== 'curve' || edge.mode !== 'curve')) applyFlowMode(edge, diagram, update.mode)
    if (update.endMark === 'none') delete edge.endMark
    else if (update.endMark !== undefined) edge.endMark = update.endMark
    applyOrthogonalOptions(edge, diagram, update)
    applyCurveOptions(edge, diagram, update.curve, update.labelT === undefined)
  }

  for (const input of batch.flows) {
    const source = resolveNode(input.source, input.ref), target = resolveNode(input.target, input.ref)
    if (source.id === target.id) throw new Error(`Un flujo no puede volver a la misma figura: ${input.ref}.`)
    const edge: DfdEdge = {
      id: reserve(input.ref),
      source: { nodeId: source.id, anchor: port(source, target, input.sourceSide, input.sourceT) },
      target: { nodeId: target.id, anchor: port(target, source, input.targetSide, input.targetT) },
      mode: 'straight',
      routing: 'manual',
      controls: { source: { x: 0, y: 0 }, target: { x: 0, y: 0 } },
      stroke: input.stroke ?? source.stroke,
      strokeWidth: 1.8,
      label: {
        text: input.text,
        t: input.labelT ?? .5,
        offset: { x: input.labelOffsetX ?? 0, y: input.labelOffsetY ?? 0 },
        width: input.labelWidth ?? 180,
        angle: 0,
        orientation: input.labelOrientation ?? 'tangent',
        background: true,
        font: { ...defaultFont, fontSize: input.labelFontSize ?? 12, color: input.labelFontColor ?? defaultFont.color },
      },
    }
    diagram.edges.push(edge)
    if (input.mode && input.mode !== 'straight') applyFlowMode(edge, diagram, input.mode)
    if (input.endMark !== undefined && input.endMark !== 'none') edge.endMark = input.endMark
    applyOrthogonalOptions(edge, diagram, input)
    applyCurveOptions(edge, diagram, input.curve)
  }

  commitDiagram(store, diagram)
  return { refs: Object.fromEntries(refs), ...designSnapshot(store) }
}

export function organizeDesignFlows(store: EditorStore, raw: unknown) {
  const input = organizeFlowsSchema.parse(raw)
  const before = writableState(store, input.projectId, input.expectedRevision, input.diagramId)
  const diagram = clone(before.project.diagrams.find(item => item.id === input.diagramId)!)
  const focus = diagram.nodes.find(node => node.id === input.focusNodeId)
  if (!focus || focus.kind === 'note') throw new Error(`Figura focal inexistente o inválida: ${input.focusNodeId}`)
  if (new Set(input.flowIds).size !== input.flowIds.length) throw new Error('Hay IDs de flujo repetidos en el pedido de ordenamiento.')
  const requested = input.flowIds.length ? new Set(input.flowIds) : undefined
  if (requested) for (const flowId of requested) {
    const edge = diagram.edges.find(item => item.id === flowId)
    if (!edge) throw new Error(`Flujo inexistente: ${flowId}`)
    if (edge.source.nodeId !== focus.id && edge.target.nodeId !== focus.id) throw new Error(`El flujo ${flowId} no está conectado con la figura focal.`)
  }
  const selected = diagram.edges.filter(edge => (!requested || requested.has(edge.id))
    && (edge.source.nodeId === focus.id || edge.target.nodeId === focus.id))
  if (!selected.length) throw new Error('La figura focal no tiene flujos para ordenar.')
  const locked = selected.find(edge => edge.locked)
  if (locked) throw new Error(`Flujo inexistente o bloqueado: ${locked.id}`)

  const records = selected.map(edge => {
    const focusIsSource = edge.source.nodeId === focus.id
    const otherId = focusIsSource ? edge.target.nodeId : edge.source.nodeId
    const other = diagram.nodes.find(node => node.id === otherId)!
    const sideValue = facingSide(focus, other)
    const along = sideValue === 'left' || sideValue === 'right'
      ? other.y + other.height / 2 : other.x + other.width / 2
    return { edge, focusIsSource, other, sideValue, along }
  })
  const sideOrder: PortSide[] = ['top', 'right', 'bottom', 'left']
  for (const sideValue of sideOrder) {
    const group = records.filter(record => record.sideValue === sideValue).sort((a, b) =>
      a.along - b.along || a.other.id.localeCompare(b.other.id)
      || Number(a.focusIsSource) - Number(b.focusIsSource) || a.edge.id.localeCompare(b.edge.id))
    group.forEach((record, index) => {
      const anchor = organizedPort(focus, sideValue, distributedSlot(index, group.length))
      if (record.focusIsSource) record.edge.source.anchor = anchor
      else record.edge.target.anchor = anchor
    })
  }

  const byOther = new Map<string, typeof records>()
  for (const record of records) {
    const key = `${record.other.id}:${oppositeSide(record.sideValue)}`
    byOther.set(key, [...(byOther.get(key) ?? []), record])
  }
  for (const group of byOther.values()) {
    group.sort((a, b) => Number(a.focusIsSource) - Number(b.focusIsSource) || a.edge.id.localeCompare(b.edge.id))
    group.forEach((record, index) => {
      const otherSide = oppositeSide(record.sideValue)
      const anchor = organizedPort(record.other, otherSide, distributedSlot(index, group.length, .3))
      if (record.focusIsSource) record.edge.target.anchor = anchor
      else record.edge.source.anchor = anchor
      record.edge.label.t = record.focusIsSource ? .76 : .24
      record.edge.label.offset = { x: 0, y: (index - (group.length - 1) / 2) * 20 }
      applyFlowMode(record.edge, diagram, input.mode)
    })
  }

  commitDiagram(store, diagram)
  return { organizedFlowIds: records.map(record => record.edge.id), focusNodeId: focus.id, ...designSnapshot(store) }
}

export function deleteDesignElements(store: EditorStore, raw: unknown) {
  const input = deleteElementsSchema.parse(raw)
  const before = writableState(store, input.projectId, input.expectedRevision, input.diagramId)
  if (!input.nodeIds.length && !input.flowIds.length) throw new Error('Indicá al menos una figura o un flujo para eliminar.')
  if (new Set(input.nodeIds).size !== input.nodeIds.length || new Set(input.flowIds).size !== input.flowIds.length) throw new Error('Hay IDs repetidos en el pedido de eliminación.')
  const diagram = clone(before.project.diagrams.find(item => item.id === input.diagramId)!)
  const nodeIds = new Set(input.nodeIds), flowIds = new Set(input.flowIds)
  for (const nodeId of nodeIds) {
    const node = diagram.nodes.find(item => item.id === nodeId)
    if (!node || node.locked) throw new Error(`Figura inexistente o bloqueada: ${nodeId}`)
    const lockedIncident = diagram.edges.find(edge => edge.locked && (edge.source.nodeId === nodeId || edge.target.nodeId === nodeId))
    if (lockedIncident) throw new Error(`La figura ${nodeId} tiene un flujo bloqueado: ${lockedIncident.id}`)
  }
  for (const flowId of flowIds) {
    const edge = diagram.edges.find(item => item.id === flowId)
    if (!edge || edge.locked) throw new Error(`Flujo inexistente o bloqueado: ${flowId}`)
  }
  for (const edge of diagram.edges) if (nodeIds.has(edge.source.nodeId) || nodeIds.has(edge.target.nodeId)) flowIds.add(edge.id)
  diagram.nodes = diagram.nodes.filter(node => !nodeIds.has(node.id))
  diagram.edges = diagram.edges.filter(edge => !flowIds.has(edge.id))
  commitDiagram(store, diagram)
  return { deleted: { nodeIds: [...nodeIds], flowIds: [...flowIds] }, ...designSnapshot(store) }
}

export function renameDesignContent(store: EditorStore, raw: unknown) {
  const input = renameSchema.parse(raw)
  const before = writableState(store, input.projectId, input.expectedRevision)
  const next = clone(before.project)
  if (input.projectName) next.name = input.projectName
  if (input.diagramName) {
    const diagram = next.diagrams.find(item => item.id === input.diagramId)
    if (!diagram) throw new Error('El diagrama a renombrar no existe.')
    const level = flattenHierarchy(projectHierarchy(next)).find(item => item.branch.diagram.id === diagram.id)?.branch.level
    diagram.rootLevel ??= level
    diagram.name = input.diagramName
  }
  commitProject(store, next)
  return designSnapshot(store)
}

export function createDesignSpecification(store: EditorStore, raw: unknown) {
  const input = specificationSchema.parse(raw)
  const before = writableState(store, input.projectId, input.expectedRevision)
  const owner = before.project.diagrams.find(item => item.id === input.diagramId)
  const process = owner?.nodes.find(node => node.id === input.processId)
  if (!owner) throw new Error('El diagrama propietario no existe.')
  if (!process || process.kind !== 'process' || process.locked || process.inheritedFrom) throw new Error('El proceso no existe, está bloqueado o es heredado.')
  store.createChild(process.id, owner.id, input.name)
  return designSnapshot(store)
}

export function createDesignDiagram(store: EditorStore, raw: unknown) {
  const input = createDiagramSchema.parse(raw)
  writableState(store, input.projectId, input.expectedRevision)
  store.addDiagram(input.name)
  return designSnapshot(store)
}

export function linkDesignSpecification(store: EditorStore, raw: unknown) {
  const input = linkSchema.parse(raw)
  const before = writableState(store, input.projectId, input.expectedRevision)
  const next = clone(before.project), owner = next.diagrams.find(item => item.id === input.ownerDiagramId)
  const process = owner?.nodes.find(node => node.id === input.processId)
  if (!owner) throw new Error('El diagrama propietario no existe.')
  if (!process || process.kind !== 'process' || process.locked || process.inheritedFrom) throw new Error('El proceso no existe, está bloqueado o es heredado.')
  if (input.action === 'desvincular') {
    if (!process.childDiagramId) throw new Error('El proceso no tiene una especificación vinculada.')
    delete process.childDiagramId
  } else {
    const childId = input.childDiagramId!
    if (process.childDiagramId) throw new Error('El proceso ya tiene una especificación vinculada.')
    if (!canLinkChild(next, owner.id, childId)) throw new Error('No se puede vincular ese diagrama: ya tiene padre, no existe o formaría un ciclo.')
    process.childDiagramId = childId
  }
  commitProject(store, next)
  return designSnapshot(store)
}

export function deleteDesignDiagram(store: EditorStore, raw: unknown) {
  const input = deleteDiagramSchema.parse(raw)
  const before = writableState(store, input.projectId, input.expectedRevision)
  if (before.project.diagrams.length === 1) throw new Error('No se puede eliminar el único diagrama del proyecto.')
  if (!before.project.diagrams.some(diagram => diagram.id === input.diagramId)) throw new Error('El diagrama no existe.')
  const next = clone(before.project)
  next.diagrams = next.diagrams.filter(diagram => diagram.id !== input.diagramId)
  for (const diagram of next.diagrams) for (const node of diagram.nodes) if (node.childDiagramId === input.diagramId) delete node.childDiagramId
  if (next.activeDiagramId === input.diagramId) next.activeDiagramId = next.diagrams[0].id
  commitProject(store, next)
  return designSnapshot(store)
}

export function applyDesignHistory(store: EditorStore, raw: unknown) {
  const input = historySchema.parse(raw)
  const before = writableState(store, input.projectId, input.expectedRevision)
  if (input.action === 'deshacer') {
    if (!before.canUndo) throw new Error('No hay una operación para deshacer.')
    store.undo()
  } else {
    if (!before.canRedo) throw new Error('No hay una operación para rehacer.')
    store.redo()
  }
  return designSnapshot(store)
}
