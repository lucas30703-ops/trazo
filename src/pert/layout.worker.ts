import ELK from 'elkjs/lib/elk-api.js'
import ElkWorker from 'elkjs/lib/elk-worker.min.js?worker'
import type { PertActivity, PertNetwork } from '../model'
import { generateNetwork, validatePertNetwork, inheritPertPresentation } from './logic'
import { positionPert } from './layout'

self.onmessage = async (event: MessageEvent<{ activities: PertActivity[]; previous?: PertNetwork; reorganize: boolean; decimals?: number }>) => {
  let elk: InstanceType<typeof ELK> | undefined
  try {
    const { activities, previous, reorganize, decimals = 2 } = event.data, keepPositions = !reorganize && previous?.construction === 'explicit-joins', network = generateNetwork(activities, keepPositions ? previous : undefined)
    // Reorganizing changes positions, preserving explicit colors/labels/routes.
    if (!keepPositions && previous) inheritPertPresentation(network, previous, false)
    const pinned = new Set(keepPositions ? previous.events.map(e => e.id).filter(id => network.events.some(e => e.id === id)) : [])
    let issues = 0
    if (pinned.size !== network.events.length) {
      elk = new ELK({ workerFactory: () => new ElkWorker() })
      const graph = await elk.layout({ id: 'pert', layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT', 'elk.edgeRouting': 'POLYLINE', 'elk.spacing.nodeNode': '75', 'elk.layered.spacing.nodeNodeBetweenLayers': '150' }, children: network.events.map(e => ({ id: e.id, width: 54, height: 54 })), edges: network.arrows.map(a => ({ id: a.id, sources: [a.source], targets: [a.target] })) })
      const seed = new Map(network.events.map(e => { const n = graph.children?.find(n => n.id === e.id); return [e.id, { x: (n?.x ?? e.x) + 27, y: (n?.y ?? e.y) + 27 }] }))
      issues = positionPert(network, seed, decimals, pinned).issues
    }
    validatePertNetwork(network)
    self.postMessage({ network, issues })
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'No se pudo distribuir el PERT.' }) }
  finally { elk?.terminateWorker() }
}
