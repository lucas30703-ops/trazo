import { isEditingTarget } from './keyboard'
import { Presence, useUiMotion } from './motion'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowUpRight, Circle, Download, LayoutGrid, Loader2, MousePointer2, Redo2, Save, Square, Type, Undo2, X, Check, Search } from 'lucide-react'
import { EditorStore } from './store'
import { canAddShape, clone, createProject, modeName, parseProject, projectMode, shapeName, uid } from './model'
import type { DfdMode, Project, ShapeKind, Tool } from './model'
import { downloadProject, getStartupMessage, loadLastProject, prepareDesignProject, projectFileName, saveLocalProject, saveProjectFile, saveRevision, supportsFilePicker, unbindProjectFile } from './persistence'
import { AutosaveQueue, recoveryJournal, type SaveState } from './autosave'
import { diskStorage } from './diskStorage'
import Canvas from './Canvas'
import type { CanvasApi } from './Canvas'
import Inspector from './Inspector'
import ViewControls from './ViewControls'
import { useWorkspace } from './workspace'
import { ExportDialog, HelpDialog, Modal, ProjectsDialog, TextDialog } from './Dialogs'
import { SearchDialog, ChecksDialog, HistoryDialog } from './ProjectDialogs'
import type { LocatedElement } from './projectTools'
import FileMenu, { type FileAction } from './FileMenu'
import ProjectTree from './ProjectTree'
import { diagramTrail, flattenHierarchy, projectHierarchy, rootLevel } from './hierarchy'
import { diagramExportName } from './exportNames'
import NewContextDialog from './NewContextDialog'
import DiagramBreadcrumbs from './DiagramBreadcrumbs'
import ParentPeek from './ParentPeek'
import Brand from './Brand'
import ScreenIcon from './ScreenIcon'
import { useDesignAutomation } from './useDesignAutomation'

function ModeControl({ mode, onChoose, compact = false }: { mode: DfdMode; onChoose: () => void; compact?: boolean }) {
  return <div className={`mode-control mode-control-${mode}${compact ? ' mode-control-compact' : ''}`}>
    <span className="current-mode">{mode === 'design' ? <ScreenIcon size={17} /> : <Circle size={16} />}<strong>{modeName(mode)}</strong></span>
    <button className="secondary-button" onClick={onChoose}><LayoutGrid size={15} />Cambiar modo</button>
  </div>
}

function StoreIcon({ size = 20 }: { size?: number }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 6h18M3 18h18" /></svg> }
const tools: { id: Tool; label: string; shortcut: string; Icon: typeof Circle | typeof StoreIcon }[] = [
  { id: 'select', label: 'Seleccionar', shortcut: 'V', Icon: MousePointer2 },
  { id: 'process', label: 'Proceso', shortcut: '1', Icon: Circle }, { id: 'entity', label: 'Entidad', shortcut: '2', Icon: Square }, { id: 'store', label: 'Almacén', shortcut: '3', Icon: StoreIcon },
  { id: 'edge', label: 'Flujo', shortcut: '4', Icon: ArrowUpRight }, { id: 'note', label: 'Texto', shortcut: 'T', Icon: Type },
]
export default function DfdWorkspace({ mode, active, onChooseMode, onReady }: { mode: DfdMode; active: boolean; onChooseMode: () => void; onReady: (mode: DfdMode) => void }) {
  const motionRoot=useUiMotion()
  const choosingMode = !active
  const modeTools = tools.map(tool => ({ ...tool, label: ['entity', 'store'].includes(tool.id) ? shapeName(tool.id as ShapeKind, mode) : tool.label, Icon: mode === 'design' && tool.id === 'entity' ? ScreenIcon : tool.Icon }))
  const [store] = useState(() => new EditorStore(createProject(undefined, mode)))
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot), d = store.diagram
  const [ready, setReady] = useState(false), [saveState, setSaveState] = useState<SaveState>({ phase: 'saving' })
  const [startupError, setStartupError] = useState(''), [bootAttempt, setBootAttempt] = useState(0)
  const saveStatus = ready ? saveState.phase : 'loading'
  const autosave = useRef<AutosaveQueue | null>(null), retiredJournals = useRef(new Map<string, string>()), bootGeneration = useRef(0)
  const [editId, setEditId] = useState<string | null>(null), [modal, setModal] = useState<'export' | 'exportAll' | 'projects' | 'newContext' | 'help' | 'rename' | 'deleteDiagram' | 'search' | 'history' | 'checks' | null>(null)
  const [diskName, setDiskName] = useState(''), [writing, setWriting] = useState(false), writeInProgress = useRef(false), importedCopy = useRef<string | null>(null)
  const [notice, setNotice] = useState(''), [diagramName, setDiagramName] = useState(''), [managedId, setManagedId] = useState('')
  const selectedTypes = new Set<string>(d.nodes.filter(node => state.selectedIds.includes(node.id)).map(node => node.kind))
  if (d.edges.some(edge => state.selectedIds.includes(edge.id))) selectedTypes.add('edge')
  const selectionType = selectedTypes.size > 1 ? 'mixed' : selectedTypes.values().next().value ?? null
  const workspace = useWorkspace({ projectId: state.project.id, diagramId: d.id, selectionType }), { panels, focusMode } = workspace
  const sidebar = panels.diagrams, inspector = panels.properties
  const canvasApi = useRef<CanvasApi | null>(null), fileInput = useRef<HTMLInputElement>(null), noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const focusCanvas=useCallback(()=>canvasApi.current?.focus(),[])
  const notify = useCallback((text: string) => { setNotice(text); clearTimeout(noticeTimer.current); noticeTimer.current = setTimeout(() => setNotice(''), 5500) }, [])
  const edit = useCallback((id: string) => { store.select([id]); const c = [...store.diagram.nodes, ...store.diagram.edges].find(c => c.id === id); if (c?.locked) { notify('Desbloqueá el elemento en Propiedades para editarlo.'); return }; setEditId(id) }, [store, notify])
  const canvasReady = useCallback((api: CanvasApi) => { canvasApi.current = api }, [])
  const chooseMode = () => { store.endGesture(); onChooseMode() }
  useEffect(() => { if (ready) onReady(mode) }, [ready, mode, onReady])
  useEffect(() => { if (!choosingMode && ready) focusCanvas() }, [choosingMode, ready, focusCanvas])
  useEffect(() => {
    let active = true; const generation = ++bootGeneration.current; setStartupError('')
    loadLastProject(mode).then(p => { if (!active || generation !== bootGeneration.current) return; if (p) store.replaceProject(p); setReady(true); if (getStartupMessage(mode)) notify(getStartupMessage(mode)) }).catch(error => { if (active && generation === bootGeneration.current) setStartupError((error as Error).message) })
    navigator.storage?.persist?.().catch(() => {})
    return () => { active = false; clearTimeout(noticeTimer.current) }
  }, [store, notify, bootAttempt, mode])
  useEffect(() => {
    if (!ready) return
    const queue = new AutosaveQueue(saveLocalProject, setSaveState,
      p => recoveryJournal.write(p, diskStorage.expectedTag(p.id)),
      p => { recoveryJournal.confirm(p); const latest = store.getSnapshot().project; if (latest !== p && latest.id === p.id) recoveryJournal.write(latest, diskStorage.expectedTag(p.id)); const retired = retiredJournals.current.get(p.id); if (retired) { recoveryJournal.remove(retired); retiredJournals.current.delete(p.id) } })
    autosave.current = queue; queue.submit(store.getSnapshot().project)
    const unsubscribe = store.subscribe(() => queue.submit(store.getSnapshot().project))
    return () => { unsubscribe(); queue.stop(); autosave.current = null }
  }, [store, ready])
  useEffect(() => {
    const preventLoss = (e: BeforeUnloadEvent) => { if (!ready) return; store.flushGestureUpdates(); if (autosave.current?.isPending(store.getSnapshot().project) || writeInProgress.current || editId) { e.preventDefault(); e.returnValue = '' } }
    const flush = () => { if (!ready) return; store.flushGestureUpdates(); void autosave.current?.flush().catch(() => {}) }
    const hidden = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('beforeunload', preventLoss); window.addEventListener('pagehide', flush); document.addEventListener('visibilitychange', hidden)
    return () => { window.removeEventListener('beforeunload', preventLoss); window.removeEventListener('pagehide', flush); document.removeEventListener('visibilitychange', hidden) }
  }, [store, ready, editId])
  const forkProject = async () => {
    store.endGesture(); const queue = autosave.current; await queue?.flush().catch(() => {})
    const previous = store.getSnapshot().project, fork = clone(previous); fork.id = uid(); fork.name = (fork.name || 'Proyecto') + ' (copia)'; fork.updatedAt = new Date().toISOString()
    queue?.discard(previous.id); retiredJournals.current.set(fork.id, previous.id); store.replaceProject(fork); setDiskName(''); importedCopy.current = fork.id
  }
  useEffect(() => { let active = true; projectFileName(state.project.id).then(name => { if (active) setDiskName(name) }).catch(() => { if (active) setDiskName('') }); return () => { active = false } }, [state.project.id])
  const saveFile = useCallback(async (saveAs = false) => {
    if (writeInProgress.current) return
    store.endGesture(); const project = store.getSnapshot().project; writeInProgress.current = true; setWriting(true)
    try { const result = await saveProjectFile(project, saveAs || importedCopy.current === project.id); if (result.downloaded) notify('Copia editable preparada para descargar.'); else { if (result.linked && importedCopy.current === project.id) importedCopy.current = null; if (store.getSnapshot().project.id === project.id) setDiskName(result.linked ? result.filename : ''); notify(`Archivo escrito: ${result.filename}.${result.linked ? '' : ' No se pudo recordar su ubicación.'}${result.checkpoint ? '' : ' No se pudo guardar su punto de recuperación.'}`) } }
    catch (e) { if ((e as Error).name !== 'AbortError') notify((e as Error).message || 'No se pudo escribir el archivo. Podés descargar una copia desde Archivo.') }
    finally { writeInProgress.current = false; setWriting(false) }
  }, [store, notify])
  const chooseProject = async (project: Project, guard?: () => void): Promise<boolean> => {
    if (projectMode(project) !== mode) { notify(`Este archivo es de ${modeName(projectMode(project))}. Usá Cambiar modo para abrirlo allí.`); return false }
    try { if (ready) { store.endGesture(); await autosave.current?.flush() } } catch { notify('No se pudo autoguardar el proyecto abierto. Guardá una copia a archivo antes de cambiar.'); return false }
    try { project = await prepareDesignProject(project) } catch { notify('No se pudo respaldar el diseño antes de adaptarlo a nivel 1. El proyecto abierto se conservó.'); return false }
    if (store.getSnapshot().project.id === project.id && JSON.stringify(store.getSnapshot().project) !== JSON.stringify(project)) { try { await saveRevision(store.getSnapshot().project, 'Antes de abrir otro archivo del mismo proyecto') } catch { notify('No se pudo conservar la versión anterior. Guardá una copia a archivo antes de abrirlo.'); return false } }
    guard?.()
    bootGeneration.current++; store.replaceProject(project); setStartupError(''); setReady(true); setModal(null); return true
  }
  useDesignAutomation({ store, enabled: mode === 'design' && ready, active, busy: !!modal || !!editId || writing,
    queue: () => autosave.current, open: chooseProject, notify, fit: () => canvasApi.current?.fit() })
  const importFile = async (file: File) => {
    try { const project = parseProject(JSON.parse(await file.text())); if (await chooseProject(project)) { importedCopy.current = project.id; setDiskName(''); await unbindProjectFile(project.id).catch(() => {}); notify('Copia abierta. El primer Guardar te permitirá elegir el destino.') } } catch (e) { notify(e instanceof Error ? e.message : 'No se pudo abrir el archivo.') }
  }
  const openFile = () => fileInput.current?.click()
  const locate = (item: LocatedElement) => { store.switchDiagram(item.diagramId); store.setTool('select'); store.select([item.id]); canvasApi.current?.locate(item.id); setModal(null) }
  const managedDiagram = state.project.diagrams.find(diagram => diagram.id === managedId)
  const fileAction = (action: FileAction) => {
    if (action === 'modes') { chooseMode(); return }
    if (action === 'new') { chooseProject(createProject(undefined, mode)); return }
    if (action === 'open') { openFile(); return }
    if (action === 'saveAs') { saveFile(true); return }
    if (action === 'copy') { downloadProject(state.project); notify('Copia editable preparada para descargar.'); return }
    setModal(action)
  }
  useEffect(() => {
    if (choosingMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.altKey) return
      const modifier = e.ctrlKey || e.metaKey, typing = isEditingTarget(e.target)
      if (modal || editId || [...document.querySelectorAll('.modal-backdrop:not([inert]) [role=dialog]')].some(el=>el.getClientRects().length)) return
      if (modifier && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(e.shiftKey); return }
      if (modifier && e.key.toLowerCase() === 'o') { e.preventDefault(); openFile(); return }
      if (modifier && e.key.toLowerCase() === 'f') { e.preventDefault(); setModal('search'); return }
      if (e.key === 'F9') { e.preventDefault(); store.endGesture(); workspace.toggleFocus(); return }
      const target=e.target instanceof Element?e.target:null
      if (!modifier && target?.closest('.dropdown,.diagram-actions,.canvas-process-menu')) return
      if (typing) return
      if (modifier) {
        const key = e.key.toLowerCase()
        if (['z', 'y', 'c', 'v', 'd', 'a'].includes(key)) e.preventDefault()
        if (key === 'z') e.shiftKey ? store.redo() : store.undo()
        if (key === 'y') store.redo()
        if (key === 'c') { store.copy(); notify('Selección copiada.') }
        if (key === 'v' && store.paste() === false) notify(mode === 'design' ? 'No se pudieron pegar los elementos en este diagrama de diseño.' : 'El contexto admite un sistema y entidades; los almacenes y procesos generales van en el nivel 1.')
        if (key === 'd' && store.duplicate() === false) notify('El contexto lleva un único sistema. Para desglosarlo, creá su nivel 1.')
        if (key === 'a') store.select([...store.diagram.nodes, ...store.diagram.edges].map(c => c.id))
        return
      }
      const tool = tools.find(t => t.shortcut.toLowerCase() === e.key.toLowerCase())
      if (tool) { e.preventDefault(); if (!['process', 'entity', 'store', 'note'].includes(tool.id) || canAddShape(store.diagram, tool.id as ShapeKind)) store.setTool(tool.id); focusCanvas(); return }
      if (target?.closest('.intuitive-hierarchy,.diagram-breadcrumbs')) return
      if (e.key === 'Escape') { store.cancelGesture(); store.setTool('select'); store.select([]); if (focusMode) workspace.toggleFocus() }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); store.deleteSelection() }
      if (e.key.toLowerCase() === 'f') canvasApi.current?.fit()
      if (e.key === '+' || e.key === '=') canvasApi.current?.zoom(1.15)
      if (e.key === '-') canvasApi.current?.zoom(1 / 1.15)
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); store.beginGesture(); const step = e.shiftKey ? 10 : 1; store.moveSelection(e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0, e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0) }
    }
    const onUp = (e: KeyboardEvent) => { if (e.key.startsWith('Arrow')) store.endGesture() }
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onUp) }
  }, [store, modal, editId, notify, saveFile, focusMode, workspace.toggleFocus, openFile, focusCanvas, choosingMode])
  return <div hidden={choosingMode} inert={choosingMode} aria-hidden={choosingMode || undefined}>
  <div ref={motionRoot} className={'app simplified-app' + (sidebar ? '' : ' sidebar-collapsed') + (panels.header ? '' : ' header-collapsed')} data-focus-mode={focusMode || undefined}>
    <Presence show={panels.header} kind="vertical"><header className="topbar"><Brand /><div className="project-heading">
      <input disabled={!ready} className="project-name" aria-label="Nombre del proyecto" value={state.project.name} onFocus={() => store.beginGesture()} onBlur={() => store.endGesture()} onChange={e => store.command(p => { p.name = e.target.value })} />

    </div><ModeControl mode={mode} onChoose={chooseMode} /></header></Presence>
    <div className="workspace">
      <Presence show={sidebar && ready} kind="horizontal"><ProjectTree store={store} onCreateContext={() => setModal('newContext')} onRename={id => { setManagedId(id); setDiagramName(state.project.diagrams.find(diagram => diagram.id === id)!.name); setModal('rename') }} onDelete={id => { setManagedId(id); setModal('deleteDiagram') }} onDownloadAll={() => setModal('exportAll')} /></Presence>
      <main className="editor-area">
        <div className="editor-toolbar">
          <div className="toolbar-left"><FileMenu onAction={fileAction} disabled={writing} /><span className="toolbar-divider" />
            <button className="icon-button" disabled={!state.canUndo} title="Deshacer (Ctrl + Z)" aria-label="Deshacer" onClick={() => store.undo()}><Undo2 size={16} /></button>
            <button className="icon-button" disabled={!state.canRedo} title="Rehacer (Ctrl + Y)" aria-label="Rehacer" onClick={() => store.redo()}><Redo2 size={16} /></button>
            <span className={`save-status ${saveStatus}`} role="status" title={saveState.folder ? `Archivos: ${saveState.folder} · Último guardado: ${saveState.savedAt ? new Date(saveState.savedAt).toLocaleTimeString('es-AR') : 'pendiente'}` : saveState.message || 'Guardado automático de proyectos'}>{saveStatus === 'saving' || saveStatus === 'loading' ? <Loader2 size={12} className="spin" /> : <span className="status-dot" />}<span key={saveStatus}>{saveStatus === 'saving' ? 'Guardando…' : saveStatus === 'loading' ? 'Abriendo…' : saveStatus === 'error' ? 'Guardado pendiente' : saveStatus === 'browser' ? 'Solo en navegador' : 'Guardado en esta PC'}</span></span>
          </div>

          <div className="toolbar-right">
            {!panels.header && <ModeControl mode={mode} onChoose={chooseMode} compact />}
            <button className="icon-button" title="Buscar elementos (Ctrl + F)" aria-label="Buscar elementos" onClick={() => setModal('search')}><Search size={16} /></button>
            <ViewControls panels={panels} focusMode={focusMode} onToggle={workspace.togglePanel} onFocus={() => { store.endGesture(); workspace.toggleFocus() }} grid={d.grid} onGrid={() => store.command((_p, diagram) => { diagram.grid = !diagram.grid })} />
            <span className="toolbar-divider" />
            <button className="toolbar-text-button" title={diskName ? `Actualizar ${diskName}` : supportsFilePicker() ? 'Elegir archivo de destino (Ctrl + S)' : 'Descargar copia editable (Ctrl + S)'} onClick={() => saveFile()} disabled={writing}><Save size={15} /><span>{writing ? 'Guardando…' : 'Guardar'}</span></button>
            <button className="primary-button toolbar-export" onClick={() => setModal('export')}><Download size={14} />Exportar</button>
          </div>
        </div>
        <Presence show={saveState.phase === 'error' || saveState.phase === 'browser'} kind="vertical"><div className="save-warning" role="alert"><div><strong>{saveState.phase === 'browser' ? 'Todavía no hay copia actualizada en disco.' : 'Hay cambios pendientes de guardar.'}</strong><span>{saveState.message}</span></div><div><button className="secondary-button compact" onClick={() => { void autosave.current?.retry().catch(() => {}) }}>Reintentar</button>{saveState.conflict && <button className="secondary-button compact" onClick={forkProject}>Guardar como proyecto nuevo</button>}<button className="secondary-button compact" onClick={() => downloadProject(store.getSnapshot().project)}>Descargar copia editable</button></div></div></Presence>
        <DiagramBreadcrumbs project={state.project} onOpen={id => { store.switchDiagram(id); store.setTool('select') }} />
        <div className="editor-body">
          <Presence show={panels.tools} kind="horizontal"><div className="tool-rail" role="toolbar" aria-label="Herramientas de dibujo">{modeTools.map((tool, i) => <div key={tool.id} className={i === 1 ? 'tool-item section-start' : 'tool-item'}><button data-testid={'tool-' + tool.id} disabled={['process','entity','store','note'].includes(tool.id) && !canAddShape(d, tool.id as ShapeKind)} aria-label={d.rootLevel === 0 && tool.id === 'process' ? 'Sistema' : tool.label} aria-pressed={state.tool === tool.id} title={(d.rootLevel === 0 && tool.id === 'process' ? 'Sistema' : tool.label) + ' (' + tool.shortcut + ')'} className={state.tool === tool.id ? 'tool-button active' : 'tool-button'} onClick={() => store.setTool(tool.id)} draggable={['process', 'entity', 'store', 'note'].includes(tool.id)} onDragStart={e => { e.dataTransfer.setData('trazo-shape', tool.id); e.dataTransfer.effectAllowed = 'copy' }}><tool.Icon size={21} /><span>{d.rootLevel === 0 && tool.id === 'process' ? 'Sistema' : tool.label === 'Seleccionar' ? 'Elegir' : tool.label}</span></button><div className="tool-tooltip">{d.rootLevel === 0 && tool.id === 'process' ? 'Sistema' : tool.label}<kbd>{tool.shortcut}</kbd></div></div>)}</div></Presence>
          {ready ? <Canvas store={store} onEdit={edit} onReady={canvasReady} notify={notify} showInfo={panels.info} /> : <div className="loading-canvas">{startupError ? <div className="startup-recovery" role="alert"><h2>No se pudo abrir el guardado</h2><p>{startupError}</p><button className="primary-button" onClick={() => setBootAttempt(n => n + 1)}>Reintentar apertura</button><button className="secondary-button" onClick={openFile}>Abrir copia editable</button><button className="text-button" onClick={() => chooseProject(createProject(undefined, mode))}>Crear proyecto nuevo</button></div> : <><Loader2 className="spin" size={24} /><span>Cargando proyecto…</span></>}</div>}
        </div>
      </main>
      <Presence show={inspector && ready} kind="horizontal"><Inspector store={store} notify={notify} closedSections={workspace.closedSections} onSectionChange={workspace.setSectionOpen} /></Presence>
    </div>
    <input ref={fileInput} type="file" accept=".json,.dfd.json,application/json" aria-label="Archivo de proyecto" className="hidden-input" onChange={e => { const file = e.target.files?.[0]; if (file) importFile(file); e.target.value = '' }} />
    <Presence show={!!notice} kind="toast"><div className="toast" role="status"><Check size={16} /><span key={notice}>{notice}</span><button aria-label="Cerrar mensaje" onClick={() => setNotice('')}><X size={14} /></button></div></Presence>
    <Presence show={!!(editId)} kind="modal">{editId && <TextDialog key={editId} store={store} id={editId} onClose={() => setEditId(null)} />}</Presence>
    {ready && !choosingMode && <ParentPeek project={state.project} disabled={!!modal} onFocusCanvas={focusCanvas} />}
    <Presence show={!!(modal === 'newContext')} kind="modal">{modal === 'newContext' && <NewContextDialog store={store} onClose={() => setModal(null)} />}</Presence>
    <Presence show={!!(modal === 'search')} kind="modal">{modal === 'search' && <SearchDialog project={state.project} onLocate={locate} onClose={() => setModal(null)} />}</Presence>
    <Presence show={!!(modal === 'checks')} kind="modal">{modal === 'checks' && <ChecksDialog project={state.project} onLocate={locate} onClose={() => setModal(null)} />}</Presence>
    <Presence show={!!(modal === 'history')} kind="modal">{modal === 'history' && <HistoryDialog store={store} notify={notify} onClose={() => setModal(null)} />}</Presence>
    <Presence show={!!((modal === 'export' || modal === 'exportAll'))} kind="modal">{(modal === 'export' || modal === 'exportAll') && <ExportDialog diagram={d} exportName={diagramExportName(diagramTrail(state.project,d.id).at(-1)!)} project={modal === 'exportAll' ? state.project : undefined} selection={state.selectedIds} onClose={() => setModal(null)} notify={notify} />}</Presence>
    <Presence show={!!(modal === 'help')} kind="modal">{modal === 'help' && <HelpDialog mode={mode} onClose={() => setModal(null)} />}</Presence>
    <Presence show={!!(modal === 'projects')} kind="modal">{modal === 'projects' && <ProjectsDialog mode={mode} currentId={state.project.id} onChoose={chooseProject} onClose={() => setModal(null)} notify={notify} />}</Presence>
    <Presence show={!!(modal === 'rename')} kind="modal">{modal === 'rename' && managedDiagram && <Modal title="Nombre del diagrama" onClose={() => setModal(null)}><form onSubmit={e => { e.preventDefault(); store.command(p => { const renamed = p.diagrams.find(diagram => diagram.id === managedId)!; renamed.rootLevel ??= flattenHierarchy(projectHierarchy(p)).find(item => item.branch.diagram.id === renamed.id)?.branch.level ?? rootLevel(renamed); renamed.name = diagramName.trim() || 'Sin título' }); setModal(null) }}><label className="field"><span className="field-label">Nombre</span><input aria-label="Nombre del diagrama" autoFocus value={diagramName} onChange={e => setDiagramName(e.target.value)} /></label><footer className="modal-footer"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancelar</button><button className="primary-button" type="submit">Guardar nombre</button></footer></form></Modal>}</Presence>
    <Presence show={!!(modal === 'deleteDiagram')} kind="modal">{modal === 'deleteDiagram' && managedDiagram && <Modal title="¿Eliminar este diagrama?" subtitle={`Se eliminará «${managedDiagram.name}» con sus figuras y flujos. Sus subdiagramas quedarán independientes. Podés deshacer esta acción.`} onClose={() => setModal(null)}><footer className="modal-footer"><button className="secondary-button" onClick={() => setModal(null)}>Conservar</button><button className="primary-button danger" onClick={() => { store.removeDiagram(managedId); setModal(null) }}>Eliminar diagrama</button></footer></Modal>}</Presence>
  </div></div>
}
