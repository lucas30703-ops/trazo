import type { Project } from './model'

export interface SaveReceipt { storage: 'disk' | 'browser'; savedAt: string; warning?: string; folder?: string }
export interface SaveState { phase: 'saving' | 'saved' | 'error' | 'browser'; savedAt?: string; message?: string; folder?: string; conflict?: boolean }
export interface RecoveryRecord { project: Project; capturedAt: number; expectedEtag?: string | null }
const prefix = 'trazo-dfd:recovery:'
export const recoveryJournal = {
  write(p: Project, expectedEtag?: string | null) { localStorage.setItem(prefix + p.id, JSON.stringify({ project: p, capturedAt: Date.now(), expectedEtag })) },
  confirm(p: Project) { const key = prefix + p.id, value = localStorage.getItem(key); if (value && JSON.stringify(JSON.parse(value).project) === JSON.stringify(p)) localStorage.removeItem(key) },
  read(onInvalid?: () => void): RecoveryRecord[] {
    const result: RecoveryRecord[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(prefix)) continue
      try {
        const r = JSON.parse(localStorage.getItem(key)!)
        if (!r?.project || typeof r.capturedAt !== 'number') throw new Error('Copia dañada')
        result.push(r)
      } catch { onInvalid?.() }
    }
    return result.sort((a, b) => b.capturedAt - a.capturedAt)
  },
  remove(id: string) { localStorage.removeItem(prefix + id) },
}

// One writer per tab. A newer snapshot can never be acknowledged by an older write.
export class AutosaveQueue {
  private pending = new Map<string, Project>()
  private latest: Project | null = null
  private acknowledged: Project | null = null
  private timer?: ReturnType<typeof setTimeout>
  private maximum?: ReturnType<typeof setTimeout>
  private retryTimer?: ReturnType<typeof setTimeout>
  private running: Promise<void> | null = null
  private stopped = false
  constructor(private save: (p: Project) => Promise<SaveReceipt>, private onState: (state: SaveState) => void, private journal: (p: Project) => void, private confirm: (p: Project) => void) {}
  submit(p: Project) {
    if (this.stopped || this.latest === p) return
    this.latest = p; this.pending.set(p.id, p)
    try { this.journal(p) } catch { /* The durable save still runs; an error never acknowledges it. */ }
    this.onState({ phase: 'saving' }); clearTimeout(this.timer)
    this.timer = setTimeout(() => { void this.flush().catch(() => {}) }, 350)
    this.maximum ??= setTimeout(() => { void this.flush().catch(() => {}) }, 2000)
  }
  isPending(p: Project) { return this.acknowledged !== p }
  retry() { if (this.latest) this.pending.set(this.latest.id, this.latest); this.onState({ phase: 'saving' }); return this.flush() }
  discard(id: string) { this.pending.delete(id); clearTimeout(this.retryTimer) }
  async flush(): Promise<void> {
    clearTimeout(this.timer); clearTimeout(this.maximum); this.maximum = undefined
    if (this.running) { await this.running; if (this.pending.size) return this.flush(); return }
    this.running = this.drain()
    try { await this.running } finally { this.running = null }
  }
  private async drain() {
    while (this.pending.size && !this.stopped) {
      const [id, p] = this.pending.entries().next().value!
      this.pending.delete(id)
      try {
        const result = await this.save(p)
        if (result.storage === 'disk') { clearTimeout(this.retryTimer); try { this.confirm(p) } catch {} }
        if (!this.stopped && this.latest === p) {
          this.acknowledged = result.storage === 'disk' ? p : null
          this.onState({ phase: result.storage === 'disk' ? 'saved' : 'browser', savedAt: result.savedAt, folder: result.folder, message: result.warning })
          if (result.storage !== 'disk') this.scheduleRetry()
        }
      } catch (error) {
        if (!this.pending.has(id)) this.pending.set(id, p)
        if (!this.stopped) this.onState({ phase: 'error', message: (error as Error).message || 'No se pudo guardar el proyecto.', conflict: !!(error as { conflict?: boolean }).conflict })
        if (!(error as { conflict?: boolean }).conflict) this.scheduleRetry()
        throw error
      }
    }
  }
  private scheduleRetry() {
    clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => { if (this.latest && !this.stopped) { this.pending.set(this.latest.id, this.latest); void this.flush().catch(() => {}) } }, 5000)
  }
  stop() { this.stopped = true; clearTimeout(this.timer); clearTimeout(this.maximum); clearTimeout(this.retryTimer) }
}
