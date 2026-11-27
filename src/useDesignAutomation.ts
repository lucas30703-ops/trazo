import { useEffect, useRef } from 'react'
import { isEditingTarget } from './keyboard'
import {
  applyDesignBatch,
  applyDesignHistory,
  createDesignDiagram,
  createDesignSpecification,
  deleteDesignDiagram,
  deleteDesignElements,
  designSnapshot,
  linkDesignSpecification,
  organizeDesignFlows,
  renameDesignContent,
} from './designAutomation'
import { createProject, projectMode } from './model'
import type { Project } from './model'
import type { EditorStore } from './store'
import { diskStorage } from './diskStorage'
import type { AutosaveQueue } from './autosave'

declare const __TRAZO_VERSION__: string
type Job = { id: string; name: string; args: Record<string, unknown>; expiresAt: number }
interface Options {
  store: EditorStore; enabled: boolean; active: boolean; busy: boolean
  queue: () => AutosaveQueue | null
  open: (project: Project, guard?: () => void) => Promise<boolean>
  notify: (message: string) => void
  fit: () => void
}
export function useDesignAutomation(options: Options) {
  const current = useRef(options); current.current = options
  const tabId = useRef(crypto.randomUUID())
  useEffect(() => {
    if (!options.enabled || !diskStorage.serverSession) return
    let stopped = false, timer: ReturnType<typeof setTimeout> | undefined
    const abort = new AbortController()
    const post = async (action: string, body: unknown) => {
      const response = await fetch(`api/automation/${action}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Trazo-Version': __TRAZO_VERSION__, 'X-Trazo-Session': diskStorage.serverSession },
        body: JSON.stringify(body), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(7000)]), cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'No se pudo conectar con el MCP de Trazo.')
      return result
    }
    const busy = () => current.current.busy || current.current.store.isGestureActive() || isEditingTarget(document.activeElement)
      || !!document.querySelector('.modal-backdrop:not([inert]) [role=dialog]')
    const required = (args: Record<string, unknown>, key: string) => {
      const value = args[key]
      if (typeof value !== 'string' || !value.trim() || value.length > 4000) throw new Error(`Falta un ${key} válido.`)
      return value.trim()
    }
    const execute = async (job: Job) => {
      const o = current.current, store = o.store, original = store.getSnapshot().project
      const assertLive = () => {
        if (stopped || Date.now() >= job.expiresAt || !current.current.active) throw new Error('El pedido expiró o se cambió de modo. Volvé a leer antes de reintentar.')
      }
      const guard = () => {
        assertLive()
        if (busy()) throw new Error('Terminá la edición, el arrastre o el diálogo antes de usar el MCP.')
        if (store.getSnapshot().project !== original) throw new Error('El proyecto cambió durante el pedido. Volvé a leerlo.')
      }
      const assertProject = () => {
        if (projectMode(store.getSnapshot().project) !== 'design' || store.getSnapshot().project.id !== required(job.args, 'projectId')) throw new Error('El proyecto solicitado no está abierto en esta pestaña.')
      }
      const persist = async () => {
        const queue = current.current.queue()
        if (!queue) throw new Error('El guardado todavía no está preparado.')
        await queue.flush()
        if (queue.isPending(store.getSnapshot().project)) throw new Error('No se confirmó el guardado en disco. Revisá el estado de guardado en Trazo.')
      }
      assertLive()
      if (job.name === 'trazo_leer_diagrama') {
        assertProject()
        return designSnapshot(store, job.args.diagramId === undefined ? undefined : required(job.args, 'diagramId'))
      }
      guard()
      await persist(); guard()
      let result: object
      if (job.name === 'trazo_abrir_proyecto') {
        const id = required(job.args, 'projectId')
        if (id === original.id) return designSnapshot(store)
        const { records } = await diskStorage.list(); guard()
        const record = records.find(r => r.project.id === id && projectMode(r.project) === 'design')
        if (!record) throw new Error('No existe ese proyecto de diseño. Volvé a listar los proyectos.')
        diskStorage.setExpectedTag(id, record.etag)
        if (!await o.open(record.project, guard)) throw new Error('No se pudo abrir el proyecto; consultá el aviso en Trazo.')
        result = designSnapshot(store)
      } else if (job.name === 'trazo_crear_proyecto') {
        const project = createProject(required(job.args, 'name'), 'design')
        if (!await o.open(project, guard)) throw new Error('No se pudo crear el proyecto; consultá el aviso en Trazo.')
        result = designSnapshot(store)
      } else {
        assertProject()
        if (job.name === 'trazo_abrir_diagrama') {
          const id = required(job.args, 'diagramId')
          if (!original.diagrams.some(d => d.id === id)) throw new Error('El diagrama no existe en este proyecto.')
          if (original.activeDiagramId !== id) store.switchDiagram(id)
          result = designSnapshot(store)
        } else if (job.name === 'trazo_crear_diagrama') {
          const { sessionId: _sessionId, ...args } = job.args
          result = createDesignDiagram(store, args)
        } else if (job.name === 'trazo_aplicar') {
          const { sessionId: _sessionId, ...batch } = job.args
          result = applyDesignBatch(store, batch)
        } else if (job.name === 'trazo_ordenar_flujos') {
          const { sessionId: _sessionId, ...args } = job.args
          result = organizeDesignFlows(store, args)
        } else if (job.name === 'trazo_eliminar_elementos') {
          const { sessionId: _sessionId, ...args } = job.args
          result = deleteDesignElements(store, args)
        } else if (job.name === 'trazo_renombrar') {
          const { sessionId: _sessionId, ...args } = job.args
          result = renameDesignContent(store, args)
        } else if (job.name === 'trazo_crear_especificacion') {
          const { sessionId: _sessionId, ...args } = job.args
          result = createDesignSpecification(store, args)
        } else if (job.name === 'trazo_vincular_especificacion') {
          const { sessionId: _sessionId, ...args } = job.args
          result = linkDesignSpecification(store, args)
        } else if (job.name === 'trazo_eliminar_diagrama') {
          const { sessionId: _sessionId, ...args } = job.args
          result = deleteDesignDiagram(store, args)
        } else if (job.name === 'trazo_historial') {
          const { sessionId: _sessionId, ...args } = job.args
          result = applyDesignHistory(store, args)
        } else throw new Error('Acción MCP no disponible.')
      }
      o.fit()
      o.notify('El MCP actualizó el DFD de diseño. Podés revisar el resultado en el lienzo.')
      // An applied edit with a failed save must never be reported as unapplied.
      try { await persist(); return { ...result, applied: true, savedToDisk: true } }
      catch (error) { return { ...result, applied: true, savedToDisk: false, warning: (error as Error).message } }
    }
    const tick = async () => {
      try {
        const o = current.current, project = o.store.getSnapshot().project
        const { job } = await post('poll', { tabId: tabId.current, active: o.active, busy: busy(),
          projectId: project.id, projectName: project.name, diagramId: project.activeDiagramId }) as { job: Job | null }
        if (job) {
          let reply: { result?: unknown; error?: string }
          try { reply = { result: await execute(job) } }
          catch (error) { reply = { error: (error as Error).message } }
          // Retrying delivery never repeats the editor mutation.
          try { await post('result', { tabId: tabId.current, id: job.id, ...reply }) }
          catch { if (!stopped) await post('result', { tabId: tabId.current, id: job.id, ...reply }) }
        }
      } catch { /* An old server/offline tab reconnects on the next poll. */ }
      finally { if (!stopped) timer = setTimeout(() => { void tick() }, 900) }
    }
    void tick()
    return () => { stopped = true; clearTimeout(timer); abort.abort() }
  }, [options.enabled])
}
