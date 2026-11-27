import type { DfdMode, DfdNode, Diagram, Project } from './model'
import { diagramLevel, projectMode } from './model'

const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })
export const processTitle = (n: DfdNode) => `${n.number ? n.number + ' · ' : ''}${n.text.replace(/\n/g, ' ') || 'Proceso sin nombre'}`
export const orderedProcesses = (d: Diagram) => d.nodes.filter(n => n.kind === 'process' && !n.inheritedFrom).sort((a, b) => collator.compare(a.number, b.number) || collator.compare(a.text, b.text))
export const rootLevel = diagramLevel
export const specificationAction = (level: number, exists: boolean) => level === 0 ? `${exists ? 'Abrir' : 'Crear'} nivel 1` : `${exists ? 'Abrir' : 'Crear'} especificación`
export const diagramDescription = (branch: DiagramBranch) => branch.level === 0 ? 'Nivel 0 · Contexto' : branch.level === 1 ? 'Nivel 1 · Sistema completo' : `Nivel ${branch.level}${branch.process ? ` · Especificación ${branch.process.number || 'sin número'}` : ''}`
export const diagramTitle = (d: Diagram) => d.name.replace(/^\s*nivel\s+\d+\s*[·:\-]?\s*/i, '').trim() || d.name
export interface DiagramBranch { diagram: Diagram; mode?: DfdMode; level: number; parentId?: string; process?: DfdNode; children: DiagramBranch[] }

export function standardHeading(branch: DiagramBranch) {
  if (branch.level === 0) return 'Diagrama de contexto'
  if (branch.level === 1) return 'DFD nivel 1'
  const process = branch.process
  return process ? `DFD nivel ${branch.level} · Especificación del proceso ${process.number || 'sin número'} «${process.text.replace(/\s+/g, ' ').trim()}»` : `DFD nivel ${branch.level} · ${diagramTitle(branch.diagram)}`
}
export function diagramForView(branch: DiagramBranch): Diagram {
  const d = branch.diagram
  // Preserve a heading the user already drew as free text in older projects.
  const top = Math.min(...d.nodes.filter(n => n.kind !== 'note').map(n => n.y))
  const legacyHeading = !d.heading && Number.isFinite(top) && d.nodes.some(n => n.kind === 'note' && n.font.fontSize >= 20 && n.y + n.height <= top - 12)
  return { ...d, mode: branch.mode ?? 'analysis', rootLevel: branch.level, heading: d.heading?.mode === 'custom' || d.heading?.mode === 'hidden' ? d.heading : legacyHeading ? { mode: 'hidden' } : { ...d.heading, mode: 'auto', text: standardHeading(branch) } }
}

export const diagramDisplayName = (branch: DiagramBranch) => {
  const title = diagramTitle(branch.diagram), prefix = branch.process?.number ? branch.process.number + ' · ' : ''
  return prefix && title.startsWith(prefix) ? title.slice(prefix.length) : title
}

export function diagramTrail(project: Project, diagramId: string): DiagramBranch[] {
  const branches = new Map(flattenHierarchy(projectHierarchy(project)).map(({ branch }) => [branch.diagram.id, branch]))
  const path: DiagramBranch[] = [], seen = new Set<string>()
  let current = branches.get(diagramId)
  while (current && !seen.has(current.diagram.id)) { seen.add(current.diagram.id); path.unshift(current); current = current.parentId ? branches.get(current.parentId) : undefined }
  return path
}

export function projectHierarchy(p: Project): DiagramBranch[] {
  const byId = new Map(p.diagrams.map(d => [d.id, d])), linked = new Set(p.diagrams.flatMap(d => d.nodes.flatMap(n => n.childDiagramId ? [n.childDiagramId] : [])))
  const visited = new Set<string>()
  const build = (d: Diagram, level: number, parentId?: string, process?: DfdNode): DiagramBranch => {
    visited.add(d.id)
    const branch: DiagramBranch = { diagram: d, mode: projectMode(p) === 'design' ? 'design' : 'analysis', level, parentId, process, children: [] }
    for (const n of orderedProcesses(d)) {
      const child = n.childDiagramId ? byId.get(n.childDiagramId) : undefined
      if (child && !visited.has(child.id)) branch.children.push(build(child, level + 1, d.id, n))
    }
    return branch
  }
  const initialLevel = (d: Diagram) => projectMode(p) === 'design' ? Math.max(1, rootLevel(d)) : rootLevel(d)
  const roots = p.diagrams.filter(d => !linked.has(d.id)).map(d => build(d, initialLevel(d)))
  // Imported projects are validated, but retain every diagram if a caller supplies an incomplete graph.
  for (const d of p.diagrams) if (!visited.has(d.id)) roots.push(build(d, initialLevel(d)))
  return roots
}

export function flattenHierarchy(roots: DiagramBranch[]) {
  const result: { branch: DiagramBranch; depth: number; order: number[] }[] = [], stack = roots.map((branch, index) => ({ branch, depth: 0, order: [index + 1] })).reverse()
  while (stack.length) { const item = stack.pop()!; result.push(item); item.branch.children.slice().reverse().forEach((branch, reverseIndex) => stack.push({ branch, depth: item.depth + 1, order: [...item.order, item.branch.children.length - reverseIndex] })) }
  return result
}
