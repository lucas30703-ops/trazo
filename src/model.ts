import { z } from 'zod'
import { validatePertNetwork } from './pert/logic'

export type Point = { x: number; y: number }
export type DfdMode = 'analysis' | 'design'
export type AppMode = DfdMode | 'uml' | 'pert'
export interface PertActivity { id: string; code: string; predecessors: string; pessimistic: string; normal: string; optimistic: string }
export interface PertEvent { id: string; number: number; x: number; y: number }
export interface PertArrow { id: string; source: string; target: string; activityId?: string; mode: DfdEdge['mode']; controls: DfdEdge['controls']; orthogonal?: DfdEdge['orthogonal']; cornerRadius: number; labelOffset: Point; labelOrientation?: 'horizontal' | 'tangent'; stroke: string; strokeWidth: number }
export interface PertNetwork { construction?: 'compact' | 'explicit-joins'; signature: string; source: PertActivity[]; events: PertEvent[]; arrows: PertArrow[] }
export interface PertData { activities: PertActivity[]; network?: PertNetwork; snap?: boolean; unit: 'días' | 'horas' | 'semanas'; decimals: number }
export interface UmlColumn { id: string; name: string; nullable: boolean; primary: boolean; foreign: boolean }
export interface UmlTable { id: string; name: string; columns: UmlColumn[]; uniqueKeys: string[][]; x: number; y: number; headerColor: string; borderColor: string }
export interface UmlRelation { autoRoute?: { source: Point; target: Point; points: Point[] }; id: string; childTable: string; parentTable: string; childColumns: string[]; parentColumns: string[]; parentOptional: boolean; childUnique: boolean; sourceSide?: 'left' | 'right'; targetSide?: 'left' | 'right'; mode: DfdEdge['mode']; controls: DfdEdge['controls']; orthogonal?: DfdEdge['orthogonal']; cornerRadius?: number; stroke: string; strokeWidth: number }
export interface UmlSchema { tables: UmlTable[]; relations: UmlRelation[] }
export interface UmlReference { name: string; mime: 'image/png' | 'image/jpeg' | 'image/webp'; data: string; width: number; height: number }
export type ShapeKind = 'process' | 'entity' | 'store' | 'note'
export type Tool = 'select' | ShapeKind | 'edge'
export type Anchor = { kind: 'angle'; value: number } | { kind: 'side'; side: 'top' | 'right' | 'bottom' | 'left'; t: number }
export interface TextStyle {
  fontFamily: string; fontSize: number; color: string; bold: boolean; italic: boolean; align: 'left' | 'center' | 'right'
}
export interface DfdNode {
  id: string; kind: ShapeKind; x: number; y: number; width: number; height: number
  text: string; number: string; stroke: string; strokeWidth: number; fill: string; font: TextStyle
  locked?: boolean; childDiagramId?: string
  inheritedFrom?: { diagramId: string; nodeId: string }
}
export interface RoutePoint { t: number; offset: Point; incoming: Point; outgoing: Point }
export interface DfdEdge {
  id: string; source: { nodeId: string; anchor: Anchor }; target: { nodeId: string; anchor: Anchor }
  endMark?: 'alta' | 'baja'
  mode: 'straight' | 'curve' | 'orthogonal'; controls: { source: Point; target: Point }; stroke: string; strokeWidth: number
  orthogonal?: { axis: 'x' | 'y'; offset: number; kind?: 'elbow' | 'multi' }; cornerRadius?: number; generatedRoute?: RoutePoint[]; waypoints?: RoutePoint[]; locked?: boolean; routing?: 'auto' | 'manual'; routingIssue?: 'blocked'
  label: { text: string; t: number; offset: Point; width: number; angle: number; orientation: 'horizontal' | 'tangent' | 'manual'; background: boolean; borderWidth?: number; curved?: boolean; font: TextStyle }
}
// mode is supplied by diagramForView; the persisted notation belongs to Project.
export interface Diagram { id: string; name: string; mode?: DfdMode; rootLevel?: number; nodes: DfdNode[]; edges: DfdEdge[]; background: string; grid: boolean; snap: boolean; flowCrossings?: boolean; heading?: { mode: 'auto' | 'custom' | 'hidden'; text?: string; position?: Point } }
export const diagramLevel = (d: Diagram) => d.rootLevel ?? Number(d.name.match(/^\s*nivel\s+(\d+)\b/i)?.[1] ?? 0)
export const nodeForDiagram = (n: DfdNode, d: Diagram) => n.kind === 'process' && diagramLevel(d) === 0 && n.number ? { ...n, number: '' } : n
export const canAddShape = (d: Diagram, kind: ShapeKind) => diagramLevel(d) !== 0 || (kind !== 'store' && (kind !== 'process' || !d.nodes.some(n => n.kind === 'process')))
export type StyleTarget = ShapeKind | 'edge'
export interface SavedStyle { id: string; name: string; stroke: string; strokeWidth: number; font: TextStyle; fill?: string; labelBackground?: boolean; target?: StyleTarget; edgeMode?: DfdEdge['mode']; labelWidth?: number; nodeWidth?: number; nodeHeight?: number; labelBorderWidth?: number; labelCurved?: boolean; edgeCornerRadius?: number; edgeOrthogonalKind?: 'elbow' | 'multi'; labelOrientation?: DfdEdge['label']['orientation'] }
export interface Project { format: 'trazo-dfd'; version: 3; mode?: AppMode; pert?: PertData; uml?: UmlSchema; umlReference?: UmlReference; id: string; name: string; activeDiagramId: string; updatedAt: string; diagrams: Diagram[]; styles?: SavedStyle[] }
export const projectMode = (p: Project): AppMode => p.mode ?? 'analysis'
export const modeName = (mode: AppMode) => mode === 'pert' ? 'Diagrama PERT' : mode === 'uml' ? 'UML de base de datos' : mode === 'design' ? 'DFD de diseño' : 'DFD de análisis'
export const shapeName = (kind: StyleTarget, mode: DfdMode = 'analysis') => ({ process: 'Proceso', entity: mode === 'design' ? 'Pantalla' : 'Entidad', store: mode === 'design' ? 'Tabla' : 'Almacén', note: 'Texto', edge: 'Flujo' })[kind]

export const palette = [
  { name: 'Rojo', value: '#ff0000' }, { name: 'Azul', value: '#0000ff' },
  { name: 'Amarillo', value: '#ffff00' }, { name: 'Verde', value: '#008000' },
  { name: 'Naranja', value: '#ffa500' }, { name: 'Violeta', value: '#800080' },
  { name: 'Negro', value: '#000000' }, { name: 'Blanco', value: '#ffffff' },
]
export const defaultFont: TextStyle = { fontFamily: 'Arial', fontSize: 14, color: '#334553', bold: false, italic: false, align: 'center' }
export const uid = () => crypto.randomUUID()
export const clone = <T,>(value: T): T => structuredClone(value)
export function createDiagram(name?: string, mode: DfdMode = 'analysis'): Diagram { return { id: uid(), name: name ?? (mode === 'design' ? 'Nivel 1 · Sistema completo' : 'Nivel 0 · Contexto'), rootLevel: mode === 'design' ? 1 : 0, nodes: [], edges: [], background: '#fafaf8', grid: true, snap: true } }
export function createProject(name = 'Proyecto sin título', mode: DfdMode = 'analysis'): Project {
  const diagram = createDiagram(undefined, mode)
  return { format: 'trazo-dfd', version: 3, ...(mode === 'design' ? { mode } : {}), id: uid(), name, activeDiagramId: diagram.id, updatedAt: new Date().toISOString(), diagrams: [diagram] }
}
export function createNode(kind: ShapeKind, point: Point, index = 1): DfdNode {
  const [width, height] = kind === 'process' ? [104, 104] : kind === 'store' ? [184, 46] : kind === 'note' ? [230, 44] : [156, 70]
  return { id: uid(), kind, x: point.x - width / 2, y: point.y - height / 2, width, height,
    text: kind === 'process' ? 'Nuevo proceso' : kind === 'entity' ? 'Nueva entidad' : kind === 'store' ? 'Nuevo almacén' : 'Escribí un título',
    number: kind === 'process' ? String(index) : '', stroke: kind === 'process' ? '#e57752' : '#334553', strokeWidth: 1.8,
    fill: kind === 'note' ? 'transparent' : '#ffffff', font: { ...defaultFont, fontSize: kind === 'note' ? 24 : 14, bold: kind === 'note' } }
}

function legacyDesignRoots(p: Project) {
  if (projectMode(p) !== 'design') return []
  const children = new Set(p.diagrams.flatMap(d => d.nodes.flatMap(n => n.childDiagramId ? [n.childDiagramId] : [])))
  return p.diagrams.filter(d => !children.has(d.id) && diagramLevel(d) === 0)
}
export const needsDesignLevelUpgrade = (p: Project) => legacyDesignRoots(p).length > 0

// The caller must confirm a complete recovery snapshot before using this copy.
// Only legacy design trees rooted at zero are lifted; analysis is unchanged.
export function upgradeDesignLevels(p: Project): Project {
  if (!needsDesignLevelUpgrade(p)) return p
  const next = clone(p), byId = new Map(next.diagrams.map(d => [d.id, d])), visited = new Set<string>()
  const lift = (d: Diagram, level: number, prefix = '', oldPrefix = '') => {
    if (visited.has(d.id)) return
    visited.add(d.id)
    d.rootLevel = level
    d.name = level === 1 && /^\s*nivel\s+0\s*·\s*contexto\s*$/i.test(d.name) ? 'Nivel 1 · Sistema completo' : d.name.replace(/^(\s*nivel\s+)\d+/i, (_match, start: string) => start + level)
    const processes = d.nodes.filter(n => n.kind === 'process' && !n.inheritedFrom)
    const oldNumbers = new Map(d.nodes.map(n => [n.id, n.number]))
    for (const n of processes) {
      if (prefix && /^\d+(\.\d+)*$/.test(n.number) && (!oldPrefix || n.number.startsWith(oldPrefix + '.'))) {
        const suffix = oldPrefix ? n.number.slice(oldPrefix.length + 1) : n.number
        n.number = prefix + '.' + suffix
      }
    }
    const used = new Set(processes.map(n => n.number).filter(Boolean))
    let index = 1
    for (const n of processes) if (!n.number.trim()) {
      while (used.has((prefix ? prefix + '.' : '') + index)) index++
      n.number = (prefix ? prefix + '.' : '') + index++; used.add(n.number)
    }
    for (const n of d.nodes) if (n.childDiagramId) {
      const child = byId.get(n.childDiagramId)
      if (child) lift(child, level + 1, n.number, oldNumbers.get(n.id) ?? '')
    }
  }
  for (const root of legacyDesignRoots(next)) lift(root, 1)
  for (const d of next.diagrams) for (const n of d.nodes) if (n.kind === 'process' && n.inheritedFrom) {
    const source = byId.get(n.inheritedFrom.diagramId)?.nodes.find(source => source.id === n.inheritedFrom!.nodeId)
    if (source?.kind === 'process') n.number = source.number
  }
  next.updatedAt = new Date().toISOString()
  return next
}

export function createDemoProject(): Project {
  const p = createProject('Sistema de reparaciones')
  const d = p.diagrams[0]; d.name = 'Nivel 1 · Reparaciones'; d.rootLevel = 1
  const add = (kind: ShapeKind, x: number, y: number, text: string, number = '') => {
    const n = createNode(kind, { x, y }); n.text = text; n.number = number; d.nodes.push(n); return n
  }
  const title = add('note', 455, 50, 'Gestión de reparaciones'); title.width = 470; title.x = 220; title.font = { ...defaultFont, fontSize: 25, bold: true }
  const cliente = add('entity', 118, 216, 'Cliente')
  const alumno = add('entity', 118, 453, 'Alumno')
  const atender = add('process', 424, 216, 'Atender\ncliente', '1')
  const reparar = add('process', 424, 453, 'Reparar\nunidad', '2'); reparar.stroke = '#42847e'
  const pendientes = add('store', 754, 162, 'Unidades pendientes')
  const finalizadas = add('store', 754, 366, 'Unidades finalizadas')
  const documentos = add('store', 754, 555, 'Documentos')
  const side = (side: 'top' | 'right' | 'bottom' | 'left', t = .5): Anchor => ({ kind: 'side', side, t })
  const angle = (value: number): Anchor => ({ kind: 'angle', value })
  const edge = (a: DfdNode, b: DfdNode, sa: Anchor, ta: Anchor, text: string, c1: Point, c2: Point, color: string, offset: Point = { x: 0, y: -16 }, t = .5) => {
    d.edges.push({ id: uid(), source: { nodeId: a.id, anchor: sa }, target: { nodeId: b.id, anchor: ta }, mode: 'curve', controls: { source: c1, target: c2 }, stroke: color, strokeWidth: 1.8,
      label: { text, t, offset, width: 170, angle: 0, orientation: 'tangent', background: true, font: { ...defaultFont, fontSize: 11.5 } } })
  }
  edge(cliente, atender, side('right', .28), angle(-2.7), 'Unidad a reparar\nFormulario de recepción', { x: 64, y: -34 }, { x: -55, y: -34 }, '#e57752', { x: 0, y: -16 })
  edge(atender, cliente, angle(2.7), side('right', .8), 'Comprobante de ingreso', { x: -54, y: 30 }, { x: 55, y: 30 }, '#e57752', { x: 0, y: 16 })
  edge(atender, pendientes, angle(-.65), side('left', .5), 'Unidad registrada', { x: 68, y: -52 }, { x: -66, y: -20 }, '#e57752', { x: 0, y: -16 })
  edge(pendientes, reparar, side('bottom', .32), angle(-.6), 'Unidad pendiente', { x: -5, y: 105 }, { x: 125, y: -55 }, '#42847e', { x: 23, y: 0 })
  edge(alumno, reparar, side('right', .32), angle(-2.8), 'Formulario firmado', { x: 65, y: -32 }, { x: -62, y: -32 }, '#42847e')
  edge(reparar, alumno, angle(2.7), side('right', .85), 'Unidad asignada', { x: -62, y: 30 }, { x: 62, y: 30 }, '#42847e', { x: 0, y: 16 })
  edge(reparar, finalizadas, angle(-.1), side('left', .65), 'Unidad reparada', { x: 80, y: 0 }, { x: -64, y: 55 }, '#42847e')
  edge(reparar, documentos, angle(.65), side('left'), 'Informe de reparación', { x: 70, y: 72 }, { x: -82, y: 15 }, '#42847e', { x: 0, y: 20 })
  return p
}

const coord = z.number().finite().min(-10_000_000).max(10_000_000)
const pointSchema = z.object({ x: coord, y: coord })
const color = z.string().regex(/^(#(?:[\da-fA-F]{3}|[\da-fA-F]{4}|[\da-fA-F]{6}|[\da-fA-F]{8})|transparent)$/)
const fontSchema = z.object({ fontFamily: z.enum(['Arial', 'Georgia', 'Courier New', 'Verdana']), fontSize: z.number().min(6).max(120), color, bold: z.boolean(), italic: z.boolean(), align: z.enum(['left', 'center', 'right']) })
const anchorSchema = z.discriminatedUnion('kind', [z.object({ kind: z.literal('angle'), value: z.number().finite() }), z.object({ kind: z.literal('side'), side: z.enum(['top', 'right', 'bottom', 'left']), t: z.number().min(0).max(1) })])
const nodeSchema = z.object({ id: z.string().min(1), kind: z.enum(['process', 'entity', 'store', 'note']), x: coord, y: coord, width: z.number().min(24).max(20000), height: z.number().min(24).max(20000), text: z.string(), number: z.string(), stroke: color, strokeWidth: z.number().min(.5).max(16), fill: color, font: fontSchema, locked: z.boolean().optional(), childDiagramId: z.string().min(1).optional(), inheritedFrom: z.object({ diagramId: z.string().min(1), nodeId: z.string().min(1) }).optional() })
const endSchema = z.object({ nodeId: z.string(), anchor: anchorSchema })
const edgeSchema = z.object({ id: z.string().min(1), source: endSchema, target: endSchema, endMark: z.enum(['alta', 'baja']).optional(), mode: z.enum(['straight', 'curve', 'orthogonal']), controls: z.object({ source: pointSchema, target: pointSchema }), orthogonal: z.object({ kind: z.enum(['elbow','multi']).optional(), axis: z.enum(['x','y']), offset: z.number().min(-10000000).max(10000000) }).optional(), cornerRadius: z.number().min(0).max(200).optional(), routing: z.enum(['auto', 'manual']).optional(), routingIssue: z.literal('blocked').optional(), generatedRoute: z.array(z.object({ t: z.number().gt(0).lt(1), offset: pointSchema, incoming: pointSchema, outgoing: pointSchema })).optional(), waypoints: z.array(z.object({ t: z.number().gt(0).lt(1), offset: pointSchema, incoming: pointSchema, outgoing: pointSchema })).optional(), locked: z.boolean().optional(), stroke: color, strokeWidth: z.number().min(.5).max(16), label: z.object({ text: z.string(), t: z.number().min(0).max(1), offset: pointSchema, width: z.number().min(24).max(20000), angle: z.number().min(-360).max(360), orientation: z.enum(['horizontal', 'tangent', 'manual']), background: z.boolean(), borderWidth: z.number().min(0).max(16).optional(), curved: z.boolean().optional(), font: fontSchema }) })
const umlColumnSchema = z.object({ id: z.string().min(1), name: z.string().min(1), nullable: z.boolean(), primary: z.boolean(), foreign: z.boolean() })
const umlTableSchema = z.object({ id: z.string().min(1), name: z.string().min(1), columns: z.array(umlColumnSchema).min(1).max(500), uniqueKeys: z.array(z.array(z.string()).min(1)), x: coord, y: coord, headerColor: color, borderColor: color })
const umlRelationSchema = z.object({ autoRoute: z.object({ source: pointSchema, target: pointSchema, points: z.array(pointSchema).min(2).max(2000) }).optional(), id: z.string().min(1), childTable: z.string(), parentTable: z.string(), childColumns: z.array(z.string()).min(1), parentColumns: z.array(z.string()).min(1), parentOptional: z.boolean(), childUnique: z.boolean(), sourceSide: z.enum(['left','right']).optional(), targetSide: z.enum(['left','right']).optional(), mode: z.enum(['straight','curve','orthogonal']), controls: z.object({ source: pointSchema, target: pointSchema }), orthogonal: z.object({ axis: z.enum(['x','y']), offset: z.number().finite(), kind: z.enum(['elbow','multi']).optional() }).optional(), cornerRadius: z.number().min(0).max(200).optional(), stroke: color, strokeWidth: z.number().min(.5).max(16) })
const umlSchema = z.object({ tables: z.array(umlTableSchema).min(1).max(200), relations: z.array(umlRelationSchema).max(1000) })
const umlReferenceSchema = z.object({ name: z.string().min(1), mime: z.enum(['image/png','image/jpeg','image/webp']), data: z.string().max(12_000_000), width: z.number().int().min(1).max(16384), height: z.number().int().min(1).max(16384) }).superRefine((v,c)=>{ if (!v.data.startsWith('data:'+v.mime+';base64,') || !/^[A-Za-z0-9+/]+=*$/.test(v.data.split(',')[1]??'') || v.width*v.height>64_000_000) c.addIssue({code:'custom',message:'Referencia inválida'}) })
const pertActivitySchema = z.object({ id: z.string().min(1).max(100), code: z.string().max(32), predecessors: z.string().max(4000), pessimistic: z.string().max(64), normal: z.string().max(64), optimistic: z.string().max(64) })
const pertNetworkSchema = z.object({ construction: z.enum(['compact','explicit-joins']).optional(), signature: z.string().max(500000), source: z.array(pertActivitySchema).min(1).max(400), events: z.array(z.object({ id: z.string().min(1).max(50000), number: z.number().int().positive(), x: coord, y: coord })).min(2).max(802), arrows: z.array(z.object({ id: z.string().min(1).max(50000), source: z.string(), target: z.string(), activityId: z.string().optional(), mode: z.enum(['straight','curve','orthogonal']), controls: z.object({ source: pointSchema, target: pointSchema }), orthogonal: z.object({ axis: z.enum(['x','y']), offset: coord, kind: z.enum(['elbow','multi']).optional() }).optional(), cornerRadius: z.number().min(0).max(200), labelOffset: pointSchema, labelOrientation: z.enum(['horizontal','tangent']).optional(), stroke: color, strokeWidth: z.number().min(.5).max(16) })).max(3000) })
const pertSchema = z.object({ activities: z.array(pertActivitySchema).max(400), network: pertNetworkSchema.optional(), snap: z.boolean().optional(), unit: z.enum(['días','horas','semanas']), decimals: z.number().int().min(0).max(6) })
const projectSchema = z.object({ format: z.literal('trazo-dfd'), version: z.literal(3), mode: z.enum(['analysis', 'design', 'uml', 'pert']).optional(), pert: pertSchema.optional(), uml: umlSchema.optional(), umlReference: umlReferenceSchema.optional(), id: z.string().min(1), name: z.string(), activeDiagramId: z.string(), updatedAt: z.string(), diagrams: z.array(z.object({ id: z.string().min(1), name: z.string(), rootLevel: z.number().int().min(0).max(1000000).optional(), heading: z.object({ mode: z.enum(['auto', 'custom', 'hidden']), text: z.string().optional(), position: pointSchema.optional() }).optional(), nodes: z.array(nodeSchema), edges: z.array(edgeSchema), background: color, grid: z.boolean(), snap: z.boolean(), flowCrossings: z.boolean().optional() })).min(1), styles: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), stroke: color, strokeWidth: z.number().min(.5).max(16), font: fontSchema, fill: color.optional(), labelBackground: z.boolean().optional(), target: z.enum(['process', 'entity', 'store', 'note', 'edge']).optional(), edgeMode: z.enum(['straight', 'curve', 'orthogonal']).optional(), labelWidth: z.number().min(24).max(20000).optional(), nodeWidth: z.number().min(40).max(20000).optional(), nodeHeight: z.number().min(28).max(20000).optional(), labelBorderWidth: z.number().min(0).max(16).optional(), labelCurved: z.boolean().optional(), edgeCornerRadius: z.number().min(0).max(200).optional(), edgeOrthogonalKind: z.enum(['elbow','multi']).optional(), labelOrientation: z.enum(['horizontal', 'tangent', 'manual']).optional() })).optional() })
export function parseProject(input: unknown): Project {
  if (typeof input === 'object' && input && 'version' in input) {
    if (input.version !== 1 && input.version !== 2 && input.version !== 3) throw new Error('Este archivo usa una versión de proyecto incompatible.')
    if (input.version === 1 || input.version === 2) input = { ...input, version: 3 }
  }
  const result = projectSchema.safeParse(input)
  if (!result.success) throw new Error('El archivo no es un proyecto válido de Trazo. Elegí un archivo .dfd.json.')
  const p = result.data as Project
  if (p.mode === 'pert') {
    if (!p.pert || p.uml || p.umlReference || p.diagrams.length !== 1 || p.diagrams.some(d => d.nodes.length || d.edges.length)) throw new Error('El proyecto PERT tiene una estructura incompatible.')
    if (new Set(p.pert.activities.map(a => a.id)).size !== p.pert.activities.length) throw new Error('Hay actividades PERT repetidas.')
    if (p.pert.network) validatePertNetwork(p.pert.network)
  } else if (p.pert) throw new Error('El contenido PERT no corresponde a este modo.')
  if (p.mode === 'uml') {
    if (!p.uml || p.umlReference || p.diagrams.length !== 1 || p.diagrams.some(d=>d.nodes.length || d.edges.length)) throw new Error('El proyecto UML tiene una estructura incompatible.')
    const ids=new Set<string>(), tables=new Map(p.uml.tables.map(t=>[t.id,t]))
    for(const t of p.uml.tables) {
      if(ids.has(t.id)) throw new Error('Tabla UML repetida.'); ids.add(t.id)
      const columns=new Set(t.columns.map(c=>c.id)); if(columns.size!==t.columns.length || t.uniqueKeys.some(k=>k.some(id=>!columns.has(id)))) throw new Error('Columnas o claves UML inválidas.')
    }
    for(const r of p.uml.relations) {
      if(ids.has(r.id)) throw new Error('Relación UML repetida.'); ids.add(r.id)
      if(r.autoRoute && (r.mode!=='orthogonal' || !r.sourceSide || !r.targetSide || !r.autoRoute.points.some(p=>Math.hypot(p.x-r.autoRoute!.source.x,p.y-r.autoRoute!.source.y)>.01) || Math.hypot(r.autoRoute.points[0].x-r.autoRoute.source.x,r.autoRoute.points[0].y-r.autoRoute.source.y)>.01 || Math.hypot(r.autoRoute.points.at(-1)!.x-r.autoRoute.target.x,r.autoRoute.points.at(-1)!.y-r.autoRoute.target.y)>.01 || r.autoRoute.points.some((p,i,ps)=>i>0 && Math.abs(p.x-ps[i-1].x)>.01 && Math.abs(p.y-ps[i-1].y)>.01))) throw new Error('El recorrido UML calculado es inválido.')
      const child=tables.get(r.childTable), parent=tables.get(r.parentTable)
      if(!child || !parent || r.childColumns.length!==r.parentColumns.length || r.childColumns.some(id=>!child.columns.some(c=>c.id===id)) || r.parentColumns.some(id=>!parent.columns.some(c=>c.id===id))) throw new Error('Una relación UML refiere a columnas inexistentes.')
      const optional=r.childColumns.some(id=>child.columns.find(c=>c.id===id)!.nullable)
      const unique=child.uniqueKeys.some(k=>k.every(id=>r.childColumns.includes(id)))
      if(r.parentOptional!==optional || r.childUnique!==unique || !parent.uniqueKeys.some(k=>k.every(id=>r.parentColumns.includes(id)))) throw new Error('Cardinalidad UML inconsistente.')
    }
  } else if (p.uml || (p.umlReference && p.mode!=='design')) throw new Error('El contenido UML no corresponde a este modo.')
  const diagramIds = new Set<string>()
  for (const d of p.diagrams) {
    if (diagramIds.has(d.id)) throw new Error('El archivo contiene diagramas con identificadores repetidos.')
    diagramIds.add(d.id)
    const ids = new Set<string>(); const nodes = new Map(d.nodes.map(n => [n.id, n]))
    for (const n of d.nodes) { if (ids.has(n.id)) throw new Error('Hay figuras repetidas en el archivo.'); ids.add(n.id); if (n.kind === 'process' && n.width !== n.height) throw new Error('Un proceso debe conservar su forma circular.') }
    for (const e of d.edges) {
      if (ids.has(e.id)) throw new Error('Hay conexiones repetidas en el archivo.'); ids.add(e.id)
      if ((e.generatedRoute ?? e.waypoints)?.some((w, i, ws) => i > 0 && w.t <= ws[i - 1].t)) throw new Error('Los puntos del recorrido no están ordenados.')
      for (const end of [e.source, e.target]) {
        const n = nodes.get(end.nodeId)
        if (!n || n.kind === 'note') throw new Error('Una conexión apunta a una figura que no existe.')
        if ((n.kind === 'process') !== (end.anchor.kind === 'angle')) throw new Error('Un punto de conexión no coincide con su figura.')
      }
    }
  }
  if (!diagramIds.has(p.activeDiagramId)) throw new Error('El diagrama activo no existe en el archivo.')
  const parents = new Map<string, string>()
  for (const d of p.diagrams) for (const n of d.nodes) if (n.childDiagramId) {
    if (n.kind !== 'process' || !diagramIds.has(n.childDiagramId)) throw new Error('Un subdiagrama apunta a un nivel que no existe o no pertenece a un proceso.')
    if (parents.has(n.childDiagramId)) throw new Error('Un subdiagrama no puede pertenecer a dos procesos.')
    parents.set(n.childDiagramId, d.id)
  }
  for (const d of p.diagrams) { const visited = new Set<string>(); let id: string | undefined = d.id; while (id) { if (visited.has(id)) throw new Error('Los niveles contienen un enlace circular.'); visited.add(id); id = parents.get(id) } }
  if (new Set(p.styles?.map(s => s.id)).size !== (p.styles?.length ?? 0)) throw new Error('Hay estilos favoritos repetidos.')
  return p
}
