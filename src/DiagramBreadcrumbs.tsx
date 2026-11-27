import { useEffect, useRef } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Project } from './model'
import { diagramDisplayName, diagramTrail } from './hierarchy'

export default function DiagramBreadcrumbs({ project, onOpen }: { project: Project; onOpen: (id: string) => void }) {
  const trail = diagramTrail(project, project.activeDiagramId), current = useRef<HTMLSpanElement>(null)
  useEffect(() => { current.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }) }, [project.activeDiagramId])
  return <nav className="diagram-breadcrumbs" aria-label="Ruta del diagrama"><ol>{trail.map((branch, index) => <li key={branch.diagram.id}>
    {index > 0 && <ChevronRight size={13} aria-hidden="true" />}
    {index === trail.length - 1 ? <span ref={current} aria-current="page" title={branch.diagram.name}>{diagramDisplayName(branch)}</span> : <button title={`Volver a ${branch.diagram.name}`} onClick={() => onOpen(branch.diagram.id)}>{diagramDisplayName(branch)}</button>}
  </li>)}</ol><span className="breadcrumb-level">Nivel {trail.at(-1)?.level ?? 0}</span></nav>
}
