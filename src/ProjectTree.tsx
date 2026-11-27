import ReferencePanel from './uml/ReferencePanel'
import { Collapse, Presence } from './motion'
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'
import { ChevronRight, Download, Ellipsis, Link2Off, Pencil, Plus, Trash2 } from 'lucide-react'
import type { EditorStore } from './store'
import { projectMode } from './model'
import { diagramDescription, diagramDisplayName, diagramTrail, specificationAction, orderedProcesses, processTitle, projectHierarchy, type DiagramBranch } from './hierarchy'

interface Props { store: EditorStore; onRename: (id: string) => void; onDelete: (id: string) => void; onDownloadAll: () => void; onCreateContext: () => void }
type Folds = Record<string, boolean>
function readFolds(id: string): Folds { try { const value = JSON.parse(localStorage.getItem(`trazo-dfd:tree:${id}`) ?? '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {} } catch { return {} } }

export default function ProjectTree({ store, onRename, onDelete, onDownloadAll, onCreateContext }: Props) {
  const { project, navigationRevision } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const roots = useMemo(() => projectHierarchy(project), [project]), trail = diagramTrail(project, project.activeDiagramId), active = trail.at(-1)!
  const [foldState, setFoldState] = useState(() => ({ projectId: project.id, values: readFolds(project.id) })), [menu, setMenu] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false), detailsId = useId()
  const folds = foldState.projectId === project.id ? foldState.values : readFolds(project.id), nav = useRef<HTMLElement>(null), sidebar = useRef<HTMLElement>(null)
  const setFolds = (update: (value: Folds) => Folds) => setFoldState(current => ({ projectId: project.id, values: update(current.projectId === project.id ? current.values : readFolds(project.id)) }))
  useEffect(() => { if (foldState.projectId === project.id) try { localStorage.setItem(`trazo-dfd:tree:${project.id}`, JSON.stringify(foldState.values)) } catch {} }, [project.id, foldState])
  useEffect(() => {
    const ancestors = diagramTrail(project, project.activeDiagramId).slice(0, -1)
    setFolds(current => ({ ...current, ...Object.fromEntries(ancestors.map(branch => [branch.diagram.id, false])) })); setMenu(null)
    // Reveal ancestors only when navigation changes; ordinary edits preserve manual folds.
  }, [project.id, project.activeDiagramId, navigationRevision])
  useEffect(() => {
    if (!menu) return
    const outside = (event: Event) => { if (!sidebar.current?.contains(event.target as Node)) setMenu(null) }
    document.addEventListener('pointerdown', outside); document.addEventListener('focusin',outside)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('focusin',outside) }
  }, [menu])
  const open = (id: string) => { store.switchDiagram(id); store.setTool('select') }
  const toggle = (id: string) => setFolds(current => ({ ...current, [id]: !current[id] }))
  const visible: DiagramBranch[] = [], pending = roots.slice().reverse()
  while (pending.length) { const branch = pending.pop()!; visible.push(branch); if (!folds[branch.diagram.id]) pending.push(...branch.children.slice().reverse()) }
  const focus = (id: string) => nav.current?.querySelector<HTMLButtonElement>(`[data-diagram-link="${CSS.escape(id)}"]`)?.focus()
  const keys = (event: KeyboardEvent<HTMLElement>) => {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-diagram-link]'), id = button?.dataset.diagramLink
    if (event.key === 'Escape' && menu) { event.preventDefault(); event.stopPropagation(); setMenu(null); sidebar.current?.querySelector<HTMLButtonElement>(`[data-diagram-menu="${CSS.escape(menu)}"]`)?.focus(); return }
    if (!id || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault(); event.stopPropagation()
    const index = visible.findIndex(branch => branch.diagram.id === id), branch = visible[index]
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') focus(visible[Math.max(0, Math.min(visible.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))].diagram.id)
    if (event.key === 'Home' || event.key === 'End') focus(visible[event.key === 'Home' ? 0 : visible.length - 1].diagram.id)
    if (event.key === 'ArrowRight' && branch.children.length) { if (folds[id]) toggle(id); else focus(branch.children[0].diagram.id) }
    if (event.key === 'ArrowLeft') { if (branch.children.length && !folds[id]) toggle(id); else if (branch.parentId) focus(branch.parentId) }
  }
  const render = (branch: DiagramBranch) => {
    const d = branch.diagram, selected = d.id === project.activeDiagramId, expanded = !folds[d.id], name = diagramDisplayName(branch)
    const label = branch.level === 0 && roots.length === 1 ? 'Contexto' : name.replace(/\s+/g,' ').trim()
    const number = branch.level > 1 ? branch.process?.number.trim() : undefined
    const details = `${diagramDescription(branch)}\nDiagrama: ${d.name}${branch.process ? `\nProceso: ${processTitle(branch.process)}` : ''}`
    const containsActive = !selected && trail.some(parent => parent.diagram.id === d.id)
    return <li key={d.id} className="diagram-branch" data-diagram-id={d.id} data-has-children={branch.children.length>0||undefined}>
      <div className={`diagram-row${selected ? ' is-active' : ''}${containsActive && !expanded ? ' contains-active' : ''}`}>
        {branch.children.length ? <button className="diagram-fold" aria-label={`${expanded ? 'Plegar' : 'Desplegar'} ${name}`} aria-expanded={expanded} aria-controls={`children-${d.id}`} onClick={() => toggle(d.id)}><ChevronRight size={15} className={expanded ? 'expanded' : ''} /></button> : <span className="diagram-fold-placeholder" />}
        <button data-diagram-link={d.id} className="diagram-link" aria-current={selected ? 'page' : undefined} aria-label={`Abrir diagrama ${d.name}. ${diagramDescription(branch)}`} title={details} onClick={() => open(d.id)}>{number && <b className="diagram-number" aria-hidden="true">{number}</b>}<span className="diagram-name"><strong>{label}</strong></span></button>
        <button data-diagram-menu={d.id} className="icon-button diagram-menu" aria-label={`Opciones de ${name}`} aria-expanded={menu === d.id} onClick={() => setMenu(menu === d.id ? null : d.id)}><Ellipsis size={16} /></button>
      </div>
      <Presence show={menu === d.id} kind="vertical"><div className="diagram-actions">
        <button onClick={() => { onRename(d.id); setMenu(null) }}><Pencil size={13} />Renombrar diagrama</button>
        {branch.process && <button disabled={branch.process.locked} onClick={() => { store.switchDiagram(branch.parentId!); store.linkChild(branch.process!.id); setMenu(null) }}><Link2Off size={13} />Separar del proceso</button>}
        <button disabled={project.diagrams.length === 1} onClick={() => { onDelete(d.id); setMenu(null) }}><Trash2 size={13} />Eliminar diagrama</button>
      </div></Presence>
      {!!branch.children.length && <Collapse id={`children-${d.id}`} open={expanded} className="tree-collapse"><ul className="diagram-children">{branch.children.map(render)}</ul></Collapse>}
    </li>
  }
  return <aside ref={sidebar} className="project-sidebar hierarchy-sidebar intuitive-hierarchy" aria-label="Niveles del proyecto" onKeyDown={keys}>
    <div className="hierarchy-heading"><strong>Diagramas</strong><span>{project.diagrams.length}</span></div>
    <nav ref={nav} className="diagram-navigation" aria-label="Diagramas del proyecto"><ul>{roots.map(render)}</ul></nav>
    <section className="process-details" aria-label={active.level === 0 ? 'Sistema completo' : `Especificaciones de ${diagramDisplayName(active)}`}>
      <button type="button" className="process-details-toggle disclosure-toggle" aria-expanded={detailsOpen} aria-controls={detailsId} onClick={() => setDetailsOpen(value => !value)}><ChevronRight size={13} aria-hidden="true" /><strong>{active.level === 0 ? 'Sistema completo' : 'Especificaciones'}</strong><span>Nivel {active.level + 1}</span></button>
      <Collapse id={detailsId} open={detailsOpen}><div className="process-details-content">
      <p className="process-owner">{active.level === 0 ? 'Contexto: entidades y un sistema sin número.' : `De: ${diagramDisplayName(active)}`}</p>
      <ul>{orderedProcesses(active.diagram).map(process => {
        const title = processTitle({ ...process, number: active.level === 0 ? '' : process.number }), action = specificationAction(active.level, !!process.childDiagramId)
        return <li key={process.id}>
          <span className="detail-process-name" title={title}>{active.level > 0 && <b>{process.number || '—'}</b>}<span>{process.text || (active.level === 0 ? 'Sistema' : 'Proceso sin nombre')}</span></span>
          <button className={`detail-process-action${process.childDiagramId ? ' exists' : ''}`} disabled={!process.childDiagramId && process.locked} title={!process.childDiagramId && process.locked ? 'Desbloqueá el proceso para crear su especificación' : undefined} aria-label={`${action} de ${title}`} onClick={() => { if (process.childDiagramId) open(process.childDiagramId); else store.createChild(process.id, active.diagram.id) }}>{!process.childDiagramId && <Plus size={12} />}{action}</button>
        </li>
      })}</ul>
      {!orderedProcesses(active.diagram).length && <p className="process-details-empty">{active.level === 0 ? 'Agregá el sistema al lienzo para crear el nivel 1.' : 'Agregá un proceso al lienzo para crear su especificación.'}</p>}
      </div></Collapse>
    </section>
    {projectMode(project) === 'design' && <ReferencePanel store={store} />}
    <div className="hierarchy-footer"><button className="new-context-button" onClick={onCreateContext}><Plus size={14} />{projectMode(project) === 'design' ? 'Nuevo diagrama' : 'Nuevo contexto'}</button><button className="secondary-button" onClick={onDownloadAll}><Download size={14} />Descargar todos</button></div>
  </aside>
}
