import Dexie, { type Table } from 'dexie'
import { needsDesignLevelUpgrade, parseProject, projectMode, uid, upgradeDesignLevels } from './model'
import type { AppMode, Project } from './model'
import { diskStorage, DiskError } from './diskStorage'
import { recoveryJournal, type SaveReceipt } from './autosave'

export interface Revision { id: string; projectId: string; savedAt: string; reason: string; automatic: number; project: Project; storage?: 'disk' | 'browser' }
export interface FileHandle {
  name: string; getFile: () => Promise<File>
  createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void>; abort?: () => Promise<void> }>
  queryPermission?: (options: { mode: 'readwrite' }) => Promise<string>
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<string>
}
type PickerWindow = Window & { showSaveFilePicker?: (options: unknown) => Promise<FileHandle>; showOpenFilePicker?: (options: unknown) => Promise<FileHandle[]> }
const pickerTypes = [{ description: 'Proyecto Trazo DFD', accept: { 'application/json': ['.dfd.json'] } }]
export const supportsFilePicker = () => typeof (window as PickerWindow).showSaveFilePicker === 'function'
class ProjectDatabase extends Dexie {
  projects!: Table<Project, string>
  preferences!: Table<{ key: string; value: string }, string>
  revisions!: Table<Revision, string>
  files!: Table<{ projectId: string; handle: FileHandle }, string>
  constructor() { super('trazo-dfd'); this.version(1).stores({ projects: 'id, updatedAt', preferences: 'key' }); this.version(2).stores({ revisions: 'id, projectId, savedAt, [projectId+savedAt]', files: 'projectId' }) }
}
const db = new ProjectDatabase()
function browserDeadline<T>(task: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('El almacenamiento del navegador no respondió.')), 2500); task.then(value => { clearTimeout(timer); resolve(value) }, error => { clearTimeout(timer); reject(error) }) })
}
async function loadBrowserProject(mode: AppMode): Promise<Project | null> {
  const last = await db.preferences.get('activeProject:' + mode) ?? await db.preferences.get('activeProject')
  if (!last) return null
  const p = await db.projects.get(last.value); return p && projectMode(p) === mode ? parseProject(p) : null
}
async function saveBrowserProject(p: Project, history = true) {
  await db.transaction('rw', db.projects, db.preferences, db.revisions, async () => {
    await db.projects.put(p); await db.preferences.put({ key: 'activeProject', value: p.id })
    await db.preferences.put({ key: 'activeProject:' + projectMode(p), value: p.id })
    const latest = await db.revisions.where('[projectId+savedAt]').between([p.id, Dexie.minKey], [p.id, Dexie.maxKey]).last()
    if (history && (!latest || (Date.now() - Date.parse(latest.savedAt) >= 120000 && JSON.stringify(latest.project) !== JSON.stringify(p)))) {
      await db.revisions.put({ id: uid(), projectId: p.id, savedAt: new Date().toISOString(), reason: 'Autoguardado', automatic: 1, project: p })
      const automatic = (await db.revisions.where('projectId').equals(p.id).filter(r => !!r.automatic).toArray()).sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      await db.revisions.bulkDelete(automatic.slice(40).map(r => r.id))
    }
  })
}
async function listBrowserProjects() { return db.projects.orderBy('updatedAt').reverse().toArray() }
async function deleteBrowserProject(id: string) { await db.transaction('rw', db.projects, db.revisions, db.files, async () => { await db.projects.delete(id); await db.revisions.where('projectId').equals(id).delete(); await db.files.delete(id) }) }
async function saveBrowserRevision(p: Project, reason: string) { const r: Revision = { id: uid(), projectId: p.id, savedAt: new Date().toISOString(), reason: reason.trim() || 'Punto de recuperación', automatic: 0, project: p }; await db.revisions.put(r); return r }
async function listBrowserRevisions(projectId: string) { return (await db.revisions.where('projectId').equals(projectId).toArray()).sort((a, b) => b.savedAt.localeCompare(a.savedAt)) }
let startupMessage = ''
let diskConnected = false
export const storageDescription = () => diskConnected ? `Archivos de esta PC: ${diskStorage.folder}` : 'Solo almacenamiento de este navegador'
const startupMessages = new Map<AppMode, string>()
let loadChain: Promise<unknown> = Promise.resolve()
export const getStartupMessage = (mode: AppMode = 'analysis') => startupMessages.get(mode) ?? ''
export function loadLastProject(mode: AppMode = 'analysis'): Promise<Project | null> {
  // A second mode can open before the first finishes its additive migration.
  const task = loadChain.catch(() => {}).then(async () => {
    const original = await loadLastForMode(mode)
    const project = original ? await prepareDesignProject(original) : null
    if (project !== original) startupMessage = 'El proyecto de diseño ahora empieza en nivel 1. La copia anterior quedó en Versiones recuperables.'
    startupMessages.set(mode, startupMessage)
    return project
  })
  loadChain = task
  return task
}
export async function prepareDesignProject(p: Project): Promise<Project> {
  if (!needsDesignLevelUpgrade(p)) return p
  const reason = 'Antes de adaptar DFD de diseño a nivel 1'
  try { await diskStorage.checkpoint(p, reason, true) }
  catch {
    // A browser-only pending project also needs a confirmed complete snapshot.
    try {
      const previous = await db.revisions.where('projectId').equals(p.id).filter(r => r.reason === reason && JSON.stringify(r.project) === JSON.stringify(p)).first()
      if (!previous) await saveBrowserRevision(p, reason)
    } catch { throw new Error('No se pudo respaldar el proyecto de diseño antes de adaptarlo a nivel 1. El original se conservó; reintentá la apertura.') }
  }
  return upgradeDesignLevels(p)
}
async function loadLastForMode(mode: AppMode): Promise<Project | null> {
  startupMessage = ''
  const diskRead = diskStorage.list().then(value => ({ value, error: null }), error => ({ value: null, error: error as Error }))
  const browserResults = await Promise.allSettled([browserDeadline(loadBrowserProject(mode)), browserDeadline(listBrowserProjects())])
  const browserLast = browserResults[0].status === 'fulfilled' ? browserResults[0].value : null
  const browserProjects: Project[] = []
  if (browserResults[1].status === 'fulfilled') for (const p of browserResults[1].value) { try { const parsed = parseProject(p); if (projectMode(parsed) === mode) browserProjects.push(parsed) } catch { startupMessage = 'Se conservó un proyecto antiguo que no se pudo leer; no se eliminó.' } }
  let journal: ReturnType<typeof recoveryJournal.read> = []
  const damagedJournal = () => { startupMessage = 'Hay una copia de recuperación del navegador que no pudo leerse. No se eliminó.' }
  try {
    for (const record of recoveryJournal.read(damagedJournal)) {
      try { const project = parseProject(record.project); if (projectMode(project) === mode) journal.push({ ...record, project }) } catch { damagedJournal() }
    }
  } catch { damagedJournal() }
  let server
  try { const result = await diskRead; if (result.error) throw result.error; server = result.value!; diskConnected = true }
  catch (error) {
    diskConnected = false
    const p = journal[0]?.project ?? browserLast ?? browserProjects[0]
    if (!p) throw new Error('No se pudo abrir el guardado de esta PC. Iniciá Abrir Trazo y reintentá. No se creó ni sobrescribió ningún proyecto.')
    startupMessage = `Se recuperó la copia del navegador. ${(error as Error).message}`
    return p
  }
  const records = server.records.filter(r => projectMode(r.project) === mode), byId = new Map(records.map(r => [r.project.id, r]))
  // Migration is additive. A different disk version is never replaced by an old cache.
  for (const p of browserProjects) {
    if (projectMode(p) !== mode) continue
    if (server.deletedIds.includes(p.id)) continue
    const existing = byId.get(p.id)
    if (!existing) { const receipt = await diskStorage.save(p); byId.set(p.id, { project: p, etag: diskStorage.expectedTag(p.id)!, savedAt: receipt.savedAt, recovered: false }) }
    else if (JSON.stringify(p) !== JSON.stringify(existing.project)) await diskStorage.checkpoint(p, 'Copia previa conservada del navegador', true)
  }
  const pending = journal.find(r => {
    const record = byId.get(r.project.id)
    if (record && JSON.stringify(record.project) === JSON.stringify(r.project)) { try { recoveryJournal.confirm(r.project) } catch {}; return false }
    return true
  })
  if (pending) {
    const current = records.find(record => record.project.id === pending.project.id)
    // A sync can advance the disk copy while the browser retains an older journal.
    // Preserve that snapshot before adopting the received project and its write tag.
    if (current && pending.expectedEtag !== current.etag) {
      try { await diskStorage.checkpoint(pending.project, 'Cambios pendientes sobre una versión anterior del proyecto', true) }
      catch (error) { throw new Error(`No se pudieron respaldar los cambios pendientes del navegador. ${(error as Error).message} La copia pendiente se conservó; reintentá la apertura.`) }
      try { recoveryJournal.confirm(pending.project) } catch { /* The disk checkpoint is durable; an uncleared journal remains recoverable. */ }
      diskStorage.setExpectedTag(current.project.id, current.etag)
      await browserDeadline(saveBrowserProject(current.project, false)).catch(() => {})
      startupMessage = 'Se abrió la versión del disco. Los cambios pendientes se conservaron en Versiones recuperables.'
      return current.project
    }
    if (pending.expectedEtag !== undefined) diskStorage.setExpectedTag(pending.project.id, pending.expectedEtag)
    startupMessage = 'Se recuperaron cambios que habían quedado pendientes al cerrar. Se intentará guardarlos en disco.'
    return pending.project
  }
  const chosen = byId.get(browserLast?.id ?? '') ?? byId.get(server.activeProjectId ?? '') ?? [...byId.values()].sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt))[0]
  if (chosen?.recovered) startupMessage = 'El último archivo estaba dañado. Se abrió su copia anterior recuperable.'
  if (chosen) await browserDeadline(saveBrowserProject(chosen.project, false)).catch(() => {})
  return chosen?.project ?? null
}
let saveChain: Promise<unknown> = Promise.resolve()
export function saveLocalProject(p: Project): Promise<SaveReceipt> {
  const task = saveChain.catch(() => {}).then(async (): Promise<SaveReceipt> => {
    try {
      const result = await diskStorage.save(p); diskConnected = true
      await browserDeadline(saveBrowserProject(p, false)).catch(() => {})
      return { storage: 'disk', ...result }
    } catch (error) {
      diskConnected = false
      let cacheError: unknown
      try { await browserDeadline(saveBrowserProject(p)) } catch (failure) { cacheError = failure }
      if (error instanceof DiskError && error.conflict) throw error
      if (cacheError) throw new Error(`${(error as Error).message} Tampoco se pudo actualizar la copia del navegador. Descargá una copia editable.`)
      return { storage: 'browser', savedAt: new Date().toISOString(), warning: (error as Error).message }
    }
  })
  saveChain = task
  return task
}
export async function listLocalProjects(mode?: AppMode) {
  const local = await browserDeadline(listBrowserProjects()).catch(() => [])
  try {
    const server = await diskStorage.list(); diskConnected = true
    const combined = new Map(local.filter(p => !server.deletedIds.includes(p.id)).map(p => [p.id, p]))
    server.records.forEach(r => combined.set(r.project.id, r.project))
    return [...combined.values()].filter(p => !mode || projectMode(p) === mode).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch { diskConnected = false; if (local.length) return local.filter(p => !mode || projectMode(p) === mode); throw new Error('No se pudo acceder a los proyectos de esta PC. Volvé a iniciar Abrir Trazo.') }
}
export async function deleteLocalProject(id: string) { await diskStorage.delete(id); await deleteBrowserProject(id); try { recoveryJournal.remove(id) } catch {} }
export async function saveRevision(p: Project, reason: string) {
  try { const r = await diskStorage.checkpoint(p, reason); diskConnected = true; return { ...r, storage: 'disk' as const } }
  catch { return { ...await saveBrowserRevision(p, reason), storage: 'browser' as const } }
}
export async function listRevisions(id: string) {
  const local = await listBrowserRevisions(id).catch(() => [])
  try { const remote = await diskStorage.history(id); return [...new Map([...local, ...remote].map(r => [r.id, r])).values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt)) }
  catch { if (local.length) return local; throw new Error('No se pudo abrir el historial. Volvé a iniciar Abrir Trazo.') }
}
export async function restoreRevision(current: Project, revision: Revision) {
  const original = parseProject(revision.project)
  if (original.id !== current.id) throw new Error('La versión pertenece a otro proyecto.')
  const recovered = await prepareDesignProject(original)
  await saveRevision(current, 'Antes de recuperar una versión')
  recovered.updatedAt = new Date().toISOString(); await saveLocalProject(recovered); return recovered
}
export async function bindProjectFile(projectId: string, handle: FileHandle) { await db.files.put({ projectId, handle }) }
export async function unbindProjectFile(projectId: string) { await db.files.delete(projectId) }
export async function projectFileName(projectId: string) { return (await db.files.get(projectId))?.handle.name ?? '' }
export async function pickProjectFile() {
  const picker = (window as PickerWindow).showOpenFilePicker
  if (!picker) return null
  const [handle] = await picker.call(window, { types: pickerTypes, multiple: false })
  const project = parseProject(JSON.parse(await (await handle.getFile()).text()))
  return { project, handle }
}
export async function writeProjectToHandle(p: Project, handle: FileHandle) {
  if (handle.queryPermission && await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
    if (!handle.requestPermission || await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') throw new Error('No se concedió permiso para escribir el archivo. Podés descargar una copia desde Archivo.')
  }
  const writable = await handle.createWritable()
  try { await writable.write(JSON.stringify(p, null, 2)); await writable.close() } catch (error) { await writable.abort?.().catch(() => {}); throw error }
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000)
}
export function safeFilename(name: string) { return (name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/, '') || 'diagrama').slice(0, 120) }
export function downloadProject(p: Project) { downloadBlob(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }), `${safeFilename(p.name)}.dfd.json`) }
export async function saveProjectFile(p: Project, saveAs = false) {
  const picker = (window as PickerWindow).showSaveFilePicker
  if (!picker) { downloadProject(p); return { downloaded: true, filename: `${safeFilename(p.name)}.dfd.json` } }
  let existing: { handle: FileHandle } | undefined
  if (!saveAs) { try { existing = await db.files.get(p.id) } catch { /* Disk saving remains available when browser storage fails. */ } }
  const handle = existing?.handle ?? await picker.call(window, { suggestedName: `${safeFilename(p.name)}.dfd.json`, types: pickerTypes })
  await writeProjectToHandle(p, handle)
  // A successful disk write must remain successful even if IndexedDB is unavailable.
  let linked = true, checkpoint = true
  try { await bindProjectFile(p.id, handle) } catch { linked = false }
  try { await saveRevision(p, 'Guardado a archivo') } catch { checkpoint = false }
  return { downloaded: false, filename: handle.name, linked, checkpoint }
}
