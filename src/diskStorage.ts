import { parseProject } from './model'
import type { Project } from './model'
import type { Revision } from './persistence'
declare const __TRAZO_VERSION__: string

export interface DiskRecord { project: Project; etag: string; savedAt: string; recovered: boolean }
export class DiskError extends Error { constructor(message: string, public conflict = false) { super(message) } }
class DiskStorage {
  folder = ''
  private session = ''
  get serverSession() { return this.session }
  private tags = new Map<string, string | null>()
  expectedTag(id: string) { return this.tags.get(id) }
  setExpectedTag(id: string, tag: string | null) { this.tags.set(id, tag) }
  private async request(action: string, body?: object, id?: string) {
    const url = new URL('api/storage', typeof document === 'undefined' ? 'http://127.0.0.1/' : document.baseURI)
    if (!body) { url.searchParams.set('action', action); if (id) url.searchParams.set('id', id) }
    let response: Response
    try {
      const data = body ? JSON.stringify({ action, ...body }) : undefined
      const headers: Record<string, string> = { 'X-Trazo-Version': typeof __TRAZO_VERSION__ === 'undefined' ? 'development' : __TRAZO_VERSION__ }
      if (body) { headers['Content-Type'] = 'application/json'; headers['X-Trazo-Session'] = this.session }
      response = await fetch(url, { method: body ? 'POST' : 'GET', headers, body: data, cache: 'no-store', signal: AbortSignal.timeout(7000), keepalive: !!data && new TextEncoder().encode(data).byteLength < 50000 })
    } catch { throw new DiskError('No se pudo conectar con el guardado de esta PC. Volvé a iniciar Abrir Trazo.') }
    let data
    try { data = await response.json() } catch { throw new DiskError('El servidor de esta dirección no ofrece guardado en disco. Usá la dirección habitual de Trazo.') }
    if (!response.ok) throw new DiskError(data.error || 'No se pudo guardar en disco.', data.code === 'conflict' || data.code === 'incompatible')
    if (data.folder) this.folder = data.folder
    return data
  }
  async list() {
    const data = await this.request('list')
    if (data.protocol !== 2 || !Array.isArray(data.records) || typeof data.session !== 'string' || !Array.isArray(data.deletedIds)) throw new DiskError('El servidor de guardado no es compatible. Volvé a iniciar Abrir Trazo.')
    this.session = data.session
    const records: DiskRecord[] = data.records.map((r: DiskRecord) => ({ ...r, project: parseProject(r.project) }))
    for (const r of records) if (!this.tags.has(r.project.id)) this.tags.set(r.project.id, r.etag)
    return { records, activeProjectId: data.activeProjectId as string | null, deletedIds: data.deletedIds as string[] }
  }
  async save(project: Project) {
    // Unknown IDs are creations: never adopt another window's newer version silently.
    const receipt = await this.request('save', { project, expectedEtag: this.tags.get(project.id) ?? null })
    if (typeof receipt.etag !== 'string' || typeof receipt.savedAt !== 'string') throw new DiskError('El servidor no confirmó la escritura.')
    this.tags.set(project.id, receipt.etag)
    return { savedAt: receipt.savedAt, folder: this.folder }
  }
  async checkpoint(project: Project, reason: string, deduplicate = false): Promise<Revision> { return (await this.request('checkpoint', { project, reason, deduplicate })).revision }
  async history(id: string): Promise<Revision[]> { return (await this.request('history', undefined, id)).revisions }
  async delete(id: string) { await this.request('delete', { id, expectedEtag: this.tags.get(id) ?? null }); this.tags.delete(id) }
}
export const diskStorage = new DiskStorage()
