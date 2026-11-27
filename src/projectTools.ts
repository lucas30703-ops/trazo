import type { Project } from './model'
import { nodeForDiagram, projectMode, shapeName } from './model'
import { flattenHierarchy, projectHierarchy } from './hierarchy'

export interface LocatedElement { diagramId: string; id: string; title: string; detail: string }
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
export function searchElements(p: Project, query: string): LocatedElement[] {
  const terms = normalize(query.trim()).split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const levels = new Map(flattenHierarchy(projectHierarchy(p)).map(({ branch }) => [branch.diagram.id, branch.level]))
  return p.diagrams.flatMap(raw => { const d = { ...raw, rootLevel: levels.get(raw.id) }; return [
    ...d.nodes.map(n => nodeForDiagram(n, d)).map(n => ({ diagramId: d.id, id: n.id, title: `${n.number ? n.number + ' · ' : ''}${n.text || 'Sin nombre'}`, detail: `${d.name} · ${n.kind === 'process' && d.rootLevel === 0 ? 'Sistema' : shapeName(n.kind, projectMode(p) === 'design' ? 'design' : 'analysis')}` })),
    ...d.edges.map(e => ({ diagramId: d.id, id: e.id, title: e.label.text || 'Flujo sin nombre', detail: `${d.name} · Flujo` })),
  ] }).filter(result => terms.every(term => normalize(result.title).includes(term)))
}
export interface CheckOptions { emptyNames: boolean; isolated: boolean; processIO: boolean; duplicateNumbers: boolean; withoutProcess: boolean }
export const defaultChecks: CheckOptions = { emptyNames: true, isolated: true, processIO: false, duplicateNumbers: true, withoutProcess: false }
export function checkProject(p: Project, options: CheckOptions): LocatedElement[] {
  const issues: LocatedElement[] = []
  const levels = new Map(flattenHierarchy(projectHierarchy(p)).map(({ branch }) => [branch.diagram.id, branch.level]))
  for (const raw of p.diagrams) {
    const d = { ...raw, rootLevel: levels.get(raw.id) }
    const report = (id: string, title: string, detail: string) => issues.push({ diagramId: d.id, id, title, detail: `${d.name} · ${detail}` })
    for (const rawNode of d.nodes.filter(n => n.kind !== 'note')) {
      const n = nodeForDiagram(rawNode, d)
      const title = `${n.number ? n.number + ' · ' : ''}${n.text || 'Figura sin nombre'}`
      if (options.emptyNames && !n.text.trim()) report(n.id, title, 'Figura sin nombre')
      const incoming = d.edges.some(e => e.target.nodeId === n.id), outgoing = d.edges.some(e => e.source.nodeId === n.id)
      if (options.isolated && !incoming && !outgoing) report(n.id, title, 'Figura sin conexiones')
      if (options.processIO && n.kind === 'process' && (!incoming || !outgoing)) report(n.id, title, !incoming && !outgoing ? 'Proceso sin entradas ni salidas' : !incoming ? 'Proceso sin entradas' : 'Proceso sin salidas')
      if (options.duplicateNumbers && n.kind === 'process' && n.number.trim() && d.nodes.some(other => other.id !== n.id && other.kind === 'process' && other.number.trim() === n.number.trim())) report(n.id, title, 'Número de proceso repetido')
    }
    for (const e of d.edges) {
      if (options.emptyNames && !e.label.text.trim()) report(e.id, 'Flujo sin nombre', 'Etiqueta vacía')
      if (options.withoutProcess && [e.source, e.target].every(end => d.nodes.find(n => n.id === end.nodeId)?.kind !== 'process')) report(e.id, e.label.text || 'Flujo sin nombre', 'Ningún extremo es un proceso')
    }
  }
  return issues
}
