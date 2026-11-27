import { clone, type DfdMode } from './model'
import type { DfdEdge, DfdNode, Project, SavedStyle, StyleTarget } from './model'

export type StyleValues = Omit<SavedStyle, 'id' | 'name'>
export type StyleScope = 'selection' | 'diagram' | 'project'
export interface StyleParts { appearance: boolean; text: boolean; route: boolean }
export interface StyleApplication { scope?: StyleScope; parts?: StyleParts; target?: StyleTarget }
export const styleNames: Record<StyleTarget, string> = { edge: 'Flujos', process: 'Procesos', entity: 'Entidades', store: 'Almacenes', note: 'Textos libres' }
export const styleNamesFor = (mode: DfdMode) => mode === 'design' ? { ...styleNames, entity: 'Pantallas', store: 'Tablas' } : styleNames
export const styleTarget = (element: DfdNode | DfdEdge): StyleTarget => 'kind' in element ? element.kind : 'edge'
export function captureStyle(element: DfdNode | DfdEdge): StyleValues {
  const common = { target: styleTarget(element), stroke: element.stroke, strokeWidth: element.strokeWidth }
  return 'kind' in element
    ? { ...common, fill: element.fill, font: clone(element.font), ...(['entity','process'].includes(element.kind) ? { nodeWidth: element.width, nodeHeight: element.height } : {}) }
    : { ...common, font: clone(element.label.font), labelBackground: element.label.background, labelWidth: element.label.width, edgeMode: element.mode, edgeCornerRadius: element.cornerRadius ?? 12, edgeOrthogonalKind: element.mode==='orthogonal' ? element.orthogonal?.kind??'multi' : undefined, labelBorderWidth: element.label.borderWidth ?? 0, labelCurved: element.label.curved ?? false, labelOrientation: element.label.orientation }
}
export function styleRecipients(project: Project, selected: string[], style: StyleValues, options: StyleApplication = {}) {
  const scope = options.scope ?? 'selection', target = options.target ?? style.target
  return project.diagrams.filter(d => scope === 'project' || d.id === project.activeDiagramId)
    .flatMap(d => [...d.nodes, ...d.edges])
    .filter(element => !element.locked && (!target || styleTarget(element) === target) && (scope !== 'selection' || selected.includes(element.id)))
}
export function applyStyleTo(element: DfdNode | DfdEdge, style: StyleValues, parts: StyleParts) {
  if (parts.appearance) {
    element.stroke = style.stroke; element.strokeWidth = style.strokeWidth
    if ('kind' in element) { if (style.fill !== undefined) element.fill = style.fill; if (['entity','process'].includes(element.kind)) { if (style.nodeWidth !== undefined) element.width = style.nodeWidth; if (style.nodeHeight !== undefined) element.height = style.nodeHeight; if (element.kind === 'process' && style.nodeWidth !== undefined) element.height = element.width } }
    else { if (style.labelBackground !== undefined) element.label.background = style.labelBackground; if (style.labelBorderWidth !== undefined) element.label.borderWidth = style.labelBorderWidth }
  }
  if (parts.text) {
    if ('kind' in element) element.font = clone(style.font)
    else { element.label.font = clone(style.font); if (style.labelCurved !== undefined) element.label.curved = style.labelCurved; if (style.labelOrientation !== undefined) element.label.orientation = style.labelOrientation; if (style.labelWidth !== undefined) element.label.width = style.labelWidth }
  }
  if (!('kind' in element) && parts.route && style.edgeMode) { element.mode = style.edgeMode; if (style.edgeCornerRadius !== undefined) element.cornerRadius = style.edgeCornerRadius; if (element.mode==='orthogonal' && style.edgeOrthogonalKind !== undefined && element.orthogonal && (element.orthogonal.kind??'multi')!==style.edgeOrthogonalKind) delete element.orthogonal }
}
