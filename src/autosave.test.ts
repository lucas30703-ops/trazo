import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutosaveQueue, recoveryJournal, type SaveReceipt, type SaveState } from './autosave'
import { clone, createProject } from './model'
const receipt: SaveReceipt = { storage: 'disk', savedAt: '2026-10-21T20:00:00Z', folder: 'datos-qa' }
function deferred<T>() { let resolve!: (v: T) => void, reject!: (e: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe('guardado serial y confirmaciones de la última versión', () => {
  it('captura recuperación antes del debounce y guarda la última edición', async () => {
    vi.useFakeTimers()
    const a = createProject(), b = clone(a); b.name = 'Última edición'
    const save = vi.fn(async (_p: ReturnType<typeof createProject>) => receipt), journal = vi.fn(), states: SaveState[] = []
    const queue = new AutosaveQueue(save, s => states.push(s), journal, vi.fn())
    queue.submit(a); expect(journal).toHaveBeenCalledWith(a); expect(save).not.toHaveBeenCalled()
    queue.submit(b); await vi.advanceTimersByTimeAsync(350)
    expect(save).toHaveBeenCalledOnce(); expect(save).toHaveBeenCalledWith(b); expect(queue.isPending(b)).toBe(false); expect(states.at(-1)!.phase).toBe('saved'); queue.stop()
  })
  it('una escritura lenta no confirma una edición posterior ni permite escrituras simultáneas', async () => {
    vi.useFakeTimers()
    const a = createProject(), b = clone(a); b.name = 'Más nuevo'
    const first = deferred<SaveReceipt>(), second = deferred<SaveReceipt>(), states: SaveState[] = []
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const queue = new AutosaveQueue(save, s => states.push(s), vi.fn(), vi.fn())
    queue.submit(a); const complete = queue.flush(); queue.submit(b)
    expect(save).toHaveBeenCalledOnce(); first.resolve(receipt); await Promise.resolve(); await Promise.resolve()
    expect(queue.isPending(b)).toBe(true); expect(states.at(-1)!.phase).toBe('saving')
    second.resolve(receipt); await complete
    expect(save.mock.calls.map(call => call[0].name)).toEqual([a.name, b.name]); expect(queue.isPending(b)).toBe(false); queue.stop()
  })
  it('guarda durante un gesto continuo sin esperar a que termine', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async (_p: ReturnType<typeof createProject>) => receipt), queue = new AutosaveQueue(save, vi.fn(), vi.fn(), vi.fn()), p = createProject()
    for (let i = 0; i < 15; i++) { queue.submit({ ...p, name: String(i) }); await vi.advanceTimersByTimeAsync(150) }
    expect(save).toHaveBeenCalled(); queue.stop()
  })
  it('retiene el cambio tras un fallo y lo reintenta sin marcarlo como guardado', async () => {
    vi.useFakeTimers()
    const p = createProject(), states: SaveState[] = [], save = vi.fn().mockRejectedValueOnce(new Error('Disco lleno')).mockResolvedValue(receipt)
    const queue = new AutosaveQueue(save, s => states.push(s), vi.fn(), vi.fn())
    queue.submit(p); await expect(queue.flush()).rejects.toThrow('Disco lleno')
    expect(queue.isPending(p)).toBe(true); expect(states.at(-1)!.phase).toBe('error')
    await queue.retry(); expect(queue.isPending(p)).toBe(false); expect(save).toHaveBeenLastCalledWith(p); queue.stop()
  })
  it('distingue respaldo solo en navegador de escritura confirmada en disco', async () => {
    vi.useFakeTimers()
    const p = createProject(), states: SaveState[] = [], confirm = vi.fn(), save = vi.fn().mockResolvedValueOnce({ storage: 'browser', savedAt: receipt.savedAt, warning: 'Apache detenido' }).mockResolvedValue(receipt)
    const queue = new AutosaveQueue(save, s => states.push(s), vi.fn(), confirm)
    queue.submit(p); await queue.flush()
    expect(states.at(-1)!.phase).toBe('browser'); expect(queue.isPending(p)).toBe(true); expect(confirm).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(5000); expect(queue.isPending(p)).toBe(false); expect(confirm).toHaveBeenCalledWith(p); queue.stop()
  })
  it('conserva proyectos pendientes distintos al cambiar entre ellos', async () => {
    vi.useFakeTimers()
    const first = createProject('Uno'), second = createProject('Dos'), save = vi.fn(async (_p: ReturnType<typeof createProject>) => receipt)
    const queue = new AutosaveQueue(save, vi.fn(), vi.fn(), vi.fn())
    queue.submit(first); queue.submit(second); await queue.flush()
    expect(save.mock.calls.map(c => c[0].id)).toEqual([first.id, second.id]); queue.stop()
  })
})
describe('copia síncrona de recuperación', () => {
  it('conserva las copias válidas cuando otra entrada está truncada', () => {
    const p = createProject(), map = new Map([['trazo-dfd:recovery:rota', '{'], ['trazo-dfd:recovery:' + p.id, JSON.stringify({ project: p, capturedAt: 1 })]])
    vi.stubGlobal('localStorage', { get length() { return map.size }, key: (i: number) => [...map.keys()][i] ?? null, getItem: (k: string) => map.get(k) ?? null })
    const damaged = vi.fn()
    expect(recoveryJournal.read(damaged)).toEqual([{ project: p, capturedAt: 1 }]); expect(damaged).toHaveBeenCalledOnce()
    expect(map.get('trazo-dfd:recovery:rota')).toBe('{')
  })
  it('no borra un cambio nuevo al confirmar otro anterior y conserva el origen esperado', () => {
    const map = new Map<string, string>()
    vi.stubGlobal('localStorage', { get length() { return map.size }, key: (i: number) => [...map.keys()][i] ?? null, setItem: (k: string, v: string) => map.set(k, v), getItem: (k: string) => map.get(k) ?? null, removeItem: (k: string) => map.delete(k) })
    const p = createProject(), newer = clone(p); newer.name = 'Cambios antes de cerrar'
    recoveryJournal.write(p, 'base-1'); recoveryJournal.write(newer, 'base-2'); recoveryJournal.confirm(p)
    expect(recoveryJournal.read()[0]).toMatchObject({ project: newer, expectedEtag: 'base-2' })
    recoveryJournal.confirm(newer); expect(recoveryJournal.read()).toEqual([])
  })
})
