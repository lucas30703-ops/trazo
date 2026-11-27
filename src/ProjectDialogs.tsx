import { Disclosure } from './motion'
import { useEffect, useState } from 'react'
import { Download, History, Plus, Search, Undo2 } from 'lucide-react'
import { Modal } from './Dialogs'
import type { EditorStore } from './store'
import { downloadProject, listRevisions, restoreRevision, saveRevision, type Revision } from './persistence'
import { checkProject, defaultChecks, searchElements, type CheckOptions, type LocatedElement } from './projectTools'
import type { Project } from './model'

function Results({ items, onLocate, empty }: { items: LocatedElement[]; onLocate: (item: LocatedElement) => void; empty: string }) {
  return <div className="result-list">{items.map((item, i) => <button key={`${item.id}-${i}`} className="result-row" onClick={() => onLocate(item)}><strong>{item.title}</strong><span>{item.detail}</span></button>)}{!items.length && <p className="empty-list">{empty}</p>}</div>
}
export function SearchDialog({ project, onLocate, onClose }: { project: Project; onLocate: (item: LocatedElement) => void; onClose: () => void }) {
  const [query, setQuery] = useState(''), results = searchElements(project, query)
  return <Modal title="Buscar en el proyecto" onClose={onClose}><label className="search-field"><Search size={17} /><input aria-label="Buscar elementos" autoFocus placeholder="Proceso, almacén, entidad o flujo…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && results[0]) onLocate(results[0]) }} /></label><Results items={results} onLocate={onLocate} empty={query.trim() ? 'No se encontraron elementos.' : 'Escribí un nombre o número de proceso.'} /></Modal>
}
const checkLabels: Record<keyof CheckOptions, string> = { emptyNames: 'Figuras y flujos sin nombre', isolated: 'Figuras sin conexiones', processIO: 'Procesos sin entradas o salidas', duplicateNumbers: 'Números de proceso repetidos', withoutProcess: 'Flujos sin un proceso en sus extremos' }
function readChecks() { try { const saved = JSON.parse(localStorage.getItem('trazo-dfd:checks:v1') ?? '{}'); return Object.fromEntries(Object.entries(defaultChecks).map(([key, value]) => [key, typeof saved?.[key] === 'boolean' ? saved[key] : value])) as unknown as CheckOptions } catch { return defaultChecks } }
export function ChecksDialog({ project, onLocate, onClose }: { project: Project; onLocate: (item: LocatedElement) => void; onClose: () => void }) {
  const [options, setOptions] = useState(readChecks), issues = checkProject(project, options)
  useEffect(() => { try { localStorage.setItem('trazo-dfd:checks:v1', JSON.stringify(options)) } catch {} }, [options])
  return <Modal title="Comprobar proyecto" subtitle="Avisos estructurales para revisar. Los criterios de la cátedra y el balanceo entre niveles requieren revisión manual." onClose={onClose} wide><Disclosure className="check-settings" title="Elegir comprobaciones">{(Object.keys(checkLabels) as (keyof CheckOptions)[]).map(key => <label className="toggle-row" key={key}><span>{checkLabels[key]}</span><input type="checkbox" checked={options[key]} onChange={e => setOptions(current => ({ ...current, [key]: e.target.checked }))} /></label>)}</Disclosure><p className="result-count">{issues.length} {issues.length === 1 ? 'aviso' : 'avisos'}</p><Results items={issues} onLocate={onLocate} empty="Sin avisos para las comprobaciones activadas." /></Modal>
}
export function HistoryDialog({ store, onClose, notify }: { store: EditorStore; onClose: () => void; notify: (message: string) => void }) {
  const [revisions, setRevisions] = useState<Revision[]>([]), [name, setName] = useState(''), [selected, setSelected] = useState<Revision | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const load = () => listRevisions(store.getSnapshot().project.id).then(setRevisions).catch(() => setError('No se pudo acceder al historial de proyectos.'))
  useEffect(() => { load() }, [store])
  const snapshot = async () => { setBusy(true); setError(''); try { const revision = await saveRevision(store.getSnapshot().project, name); setName(''); await load(); notify(revision.storage === 'disk' ? 'Punto de recuperación escrito en disco.' : 'Punto guardado solo en el navegador; el disco no está disponible.') } catch { setError('No se pudo guardar el punto de recuperación.') } finally { setBusy(false) } }
  const recover = async () => { if (!selected) return; setBusy(true); setError(''); try { const p = await restoreRevision(store.getSnapshot().project, selected); store.replaceProject(p); onClose(); notify('Versión recuperada. Se conservó una copia del estado anterior en el historial.') } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  return <Modal title="Versiones recuperables" subtitle="Copias en esta PC, incluida la anterior al último guardado. Hasta 40 versiones automáticas con al menos 2 minutos entre ellas; los puntos manuales se conservan. También se muestran las versiones anteriores del navegador." onClose={() => { if (!busy) onClose() }} wide>
    <form className="checkpoint-form" onSubmit={e => { e.preventDefault(); snapshot() }}><input aria-label="Nombre del punto de recuperación" placeholder="Nombre del punto de recuperación (opcional)" value={name} onChange={e => setName(e.target.value)} /><button className="secondary-button" disabled={busy}><Plus size={14} />Crear punto</button></form>
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="revision-list">{revisions.map(r => <div className={`revision-row ${selected?.id === r.id ? 'selected' : ''}`} key={r.id}><button className="result-row" disabled={busy} onClick={() => setSelected(r)} aria-pressed={selected?.id === r.id}><strong><History size={13} />{r.reason}</strong><span>{new Date(r.savedAt).toLocaleString('es-AR')} · {r.project.pert ? `${r.project.pert.activities.length} actividades PERT` : r.project.uml ? `${r.project.uml.tables.length} tablas · ${r.project.uml.relations.length} relaciones` : `${r.project.diagrams.length} diagramas · ${r.project.diagrams.reduce((total, d) => total + d.nodes.length + d.edges.length, 0)} elementos`}</span></button><button className="icon-button" title="Descargar esta versión" aria-label={`Descargar ${r.reason}`} onClick={() => downloadProject({ ...r.project, name: `${r.project.name} ${r.savedAt.slice(0, 19).replace(/[T:]/g, '-')}` })}><Download size={15} /></button></div>)}{!revisions.length && <p className="empty-list">Todavía no hay versiones. Creá un punto de recuperación.</p>}</div>
    {selected && <p className="field-help">Recuperar «{selected.reason}» reemplaza el proyecto abierto. Antes se guardará un punto con el estado actual.</p>}
    <footer className="modal-footer"><button className="secondary-button" disabled={busy} onClick={onClose}>Cerrar</button><button className="primary-button" disabled={!selected || busy} onClick={recover}><Undo2 size={14} />Recuperar versión</button></footer>
  </Modal>
}
