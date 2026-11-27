import type { PertActivity, PertArrow, PertEvent, PertNetwork } from '../model'

export type ActivityField = 'code' | 'predecessors' | 'pessimistic' | 'normal' | 'optimistic'
export interface PertIssue { id: string; field: ActivityField; message: string }
export interface ActivityResult { id: string; code: string; predecessors: string[]; successors: string[]; expected: number; variance: number; earlyStart: number; earlyFinish: number; lateStart: number; lateFinish: number; float: number; critical: boolean }
export interface PertAnalysis { issues: PertIssue[]; results: ActivityResult[]; order: string[]; duration: number; tolerance: number; signature: string; paths: string[][]; pathCount: string }

// Explicit, optional table simplification; never change saved networks on read.
export function redundantPredecessors(analysis: PertAnalysis) {
  const redundant: { id: string; predecessor: string; via: string }[] = []
  if (analysis.issues.length) return redundant
  const rows = new Map(analysis.results.map(r => [r.id, r])), ancestors = new Map<string, Set<string>>()
  for (const id of analysis.order) {
    const row = rows.get(id)!, all = new Set<string>()
    for (const p of row.predecessors) { all.add(p); for (const a of ancestors.get(p)!) all.add(a) }
    ancestors.set(id, all)
    for (const p of row.predecessors) {
      const via = row.predecessors.find(q => q !== p && ancestors.get(q)!.has(p))
      if (via) redundant.push({ id, predecessor: rows.get(p)!.code, via: rows.get(via)!.code })
    }
  }
  return redundant
}

export const predecessorCodes = (text: string) => /^\s*(ninguno|ninguna|-)\s*$/i.test(text) ? [] : text.trim().toUpperCase().split(/[\s,;\-]+/).filter(Boolean)
export function numericTime(text: string): number | null {
  const value = text.trim().replace(',', '.')
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 && number <= 1e9 ? number : null
}
export function estimates(a: PertActivity) {
  const low = numericTime(a.optimistic), normal = numericTime(a.normal), high = numericTime(a.pessimistic)
  if (low === null || normal === null || high === null || low > normal || normal > high) return null
  return { expected: (low + 4 * normal + high) / 6, variance: ((high - low) / 6) ** 2 }
}
export function analyze(activities: PertActivity[]): PertAnalysis {
  const issues: PertIssue[] = [], byCode = new Map<string, PertActivity>(), byId = new Map(activities.map(a => [a.id, a]))
  const add = (a: PertActivity, field: ActivityField, message: string) => issues.push({ id: a.id, field, message })
  for (const a of activities) {
    const code = a.code.trim().toUpperCase()
    if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(code) || code === 'NINGUNO' || code === 'NINGUNA') add(a, 'code', 'Usá un código que empiece con una letra, sin espacios ni guiones. Ninguno es una palabra reservada.')
    if (byCode.has(code)) { add(a, 'code', `El código ${code} está repetido.`); add(byCode.get(code)!, 'code', `El código ${code} está repetido.`) }
    byCode.set(code, a)
    for (const field of ['optimistic', 'normal', 'pessimistic'] as const) if (numericTime(a[field]) === null) add(a, field, 'Ingresá un número entre 0 y 1.000.000.000; coma o punto decimal.')
    if (numericTime(a.optimistic) !== null && numericTime(a.normal) !== null && numericTime(a.pessimistic) !== null && !estimates(a)) add(a, 'normal', 'Debe cumplirse: optimista ≤ normal ≤ pesimista.')
  }
  const pred = new Map<string, string[]>(), succ = new Map(activities.map(a => [a.id, [] as string[]]))
  for (const a of activities) {
    const codes = predecessorCodes(a.predecessors), ids: string[] = []
    if (codes.length > 32) add(a, 'predecessors', 'Se admiten hasta 32 predecesores inmediatos por actividad.')
    if (new Set(codes).size !== codes.length) add(a, 'predecessors', 'Hay predecesores repetidos.')
    for (const code of new Set(codes)) {
      const previous = byCode.get(code)
      if (!previous) add(a, 'predecessors', `No existe la actividad ${code}.`)
      else if (previous.id === a.id) add(a, 'predecessors', 'Una actividad no puede depender de sí misma.')
      else { ids.push(previous.id); succ.get(previous.id)!.push(a.id) }
    }
    pred.set(a.id, ids)
  }
  if (Array.from(pred.values()).reduce((n, ids) => n + ids.length, 0) > 2000 && activities.length) add(activities[0], 'predecessors', 'El proyecto supera el límite de 2.000 dependencias.')
  const remaining = new Map(activities.map(a => [a.id, pred.get(a.id)!.length])), queue = activities.filter(a => !remaining.get(a.id)).map(a => a.id), order: string[] = []
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]; order.push(id)
    for (const next of succ.get(id)!) { remaining.set(next, remaining.get(next)! - 1); if (!remaining.get(next)) queue.push(next) }
  }
  if (order.length !== activities.length) {
    const unresolved = activities.filter(a => !order.includes(a.id))
    const cycle: string[] = [], seen = new Map<string, number>(); let id = unresolved[0].id
    while (!seen.has(id)) { seen.set(id, cycle.length); cycle.push(id); id = pred.get(id)!.find(p => !order.includes(p))! }
    const chain = [...cycle.slice(seen.get(id)), id].reverse().map(id => byId.get(id)!.code).join(' → ')
    for (const a of unresolved) add(a, 'predecessors', `Hay una dependencia circular: ${chain}.`)
  }
  const empty: PertAnalysis = { issues, results: [], order, duration: 0, tolerance: 1e-9, signature: '', paths: [], pathCount: '0' }
  if (issues.length || !activities.length) return empty
  const signature = JSON.stringify(activities.map(a => [a.id, [...pred.get(a.id)!].sort()]).sort((a, b) => String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0))
  const results = new Map<string, ActivityResult>()
  for (const id of order) {
    const a = byId.get(id)!, value = estimates(a)!, predecessors = pred.get(id)!, earlyStart = Math.max(0, ...predecessors.map(id => results.get(id)!.earlyFinish))
    results.set(id, { id, code: a.code.trim().toUpperCase(), predecessors, successors: succ.get(id)!, ...value, earlyStart, earlyFinish: earlyStart + value.expected, lateStart: 0, lateFinish: 0, float: 0, critical: false })
  }
  const duration = Math.max(...[...results.values()].map(r => r.earlyFinish)), tolerance = Math.max(1e-10, Number.EPSILON * Math.max(1, duration) * (activities.length + 1) * 4)
  for (const id of [...order].reverse()) {
    const r = results.get(id)!; r.lateFinish = r.successors.length ? Math.min(...r.successors.map(id => results.get(id)!.lateStart)) : duration
    r.lateStart = r.lateFinish - r.expected; r.float = Math.max(0, r.lateStart - r.earlyStart); r.critical = r.float <= tolerance
    if (r.critical) r.float = 0
  }
  // Count with dynamic programming; only materialize the first 100 paths.
  const nextCritical = (r: ActivityResult) => r.successors.filter(id => { const s = results.get(id)!; return s.critical && Math.abs(r.earlyFinish - s.earlyStart) <= tolerance })
  const counts = new Map<string, bigint>()
  for (const id of [...order].reverse()) {
    const r = results.get(id)!, next = nextCritical(r)
    counts.set(id, !r.critical ? 0n : next.length ? next.reduce((n, id) => n + counts.get(id)!, 0n) : !r.successors.length && Math.abs(r.earlyFinish - duration) <= tolerance ? 1n : 0n)
  }
  const roots = order.filter(id => { const r = results.get(id)!; return r.critical && !r.predecessors.length && r.earlyStart <= tolerance })
  const paths: string[][] = [], stack = [...roots].reverse().map(id => [id])
  while (stack.length && paths.length < 100) {
    const path = stack.pop()!, r = results.get(path.at(-1)!)!, next = nextCritical(r).filter(id => counts.get(id)! > 0n)
    if (!next.length && counts.get(r.id)! > 0n) paths.push(path)
    else for (const id of [...next].reverse()) stack.push([...path, id])
  }
  return { issues, results: activities.map(a => results.get(a.id)!), order, duration, tolerance, signature, paths, pathCount: roots.reduce((n, id) => n + counts.get(id)!, 0n).toString() }
}

// Contract only a zero-duration edge whose source has no other exits, or whose
// target has no other entries. This preserves every activity's prerequisite
// set. Keep at most one real arrival per event, following the chosen drawing
// convention. Other predecessors retain their completion events and dummies.
function compactEvents(events: PertEvent[], arrows: PertArrow[], preference: Map<string, number>) {
  let attempts = 0
  while (attempts < 10000) {
    const incoming = new Map<string, number>(), outgoing = new Map<string, number>(), realIncoming = new Map<string, number>()
    for (const a of arrows) { incoming.set(a.target, (incoming.get(a.target) ?? 0) + 1); outgoing.set(a.source, (outgoing.get(a.source) ?? 0) + 1); if (a.activityId) realIncoming.set(a.target, (realIncoming.get(a.target) ?? 0) + 1) }
    let changed = false
    for (const edge of arrows.filter(a => !a.activityId).sort((a, b) => (preference.get(a.id) ?? 0) - (preference.get(b.id) ?? 0))) {
      if (edge.activityId || outgoing.get(edge.source) !== 1 && incoming.get(edge.target) !== 1) continue
      if ((realIncoming.get(edge.source) ?? 0) + (realIncoming.get(edge.target) ?? 0) > 1) continue
      if (++attempts > 10000) break
      const remove = edge.source, keep = edge.target, candidate: PertArrow[] = [], pairs = new Map<string, PertArrow>()
      let invalid = false
      for (const a of arrows) {
        if (a.id === edge.id) continue
        const from = a.source === remove ? keep : a.source, to = a.target === remove ? keep : a.target, key = JSON.stringify([from, to]), duplicate = pairs.get(key)
        if (from === to || duplicate && (a.activityId || duplicate.activityId)) { invalid = true; break }
        if (duplicate) continue
        const next = { ...a, source: from, target: to }; pairs.set(key, next); candidate.push(next)
      }
      if (invalid) continue
      events.splice(events.findIndex(e => e.id === remove), 1); arrows.splice(0, arrows.length, ...candidate)
      changed = true; break
    }
    if (!changed) break
  }
}

export function inheritPertPresentation(network: PertNetwork, previous: PertNetwork, positions: boolean) {
  if (positions) for (const e of network.events) { const old = previous.events.find(n => n.id === e.id); if (old) { e.x = old.x; e.y = old.y } }
  for (const a of network.arrows) {
    const old = previous.arrows.find(e => e.id === a.id)
    if (old) { const ends = { source: a.source, target: a.target, activityId: a.activityId }; Object.assign(a, old, ends) }
  }
}

export function generateNetwork(source: PertActivity[], previous?: PertNetwork, legacy = false): PertNetwork {
  const analysis = analyze(source)
  if (analysis.issues.length || !source.length) throw new Error('Completá y corregí la tabla antes de generar el diagrama.')
  const results = new Map(analysis.results.map(r => [r.id, r])), events: PertEvent[] = [], arrows: PertArrow[] = []
  const rowOrder = new Map(source.map((a, i) => [a.id, i])), preference = new Map<string, number>()
  // Prefer the middle predecessor in table order for the direct arrival.
  // This is only a drawing tie-breaker; safety checks always take precedence.
  const prefer = (id: string, predecessor: string, group: string[]) => { const ordered = [...group].sort((a, b) => rowOrder.get(a)! - rowOrder.get(b)!); preference.set(id, Math.abs(ordered.indexOf(predecessor) - Math.floor(ordered.length / 2))) }
  const event = (id: string) => { if (!events.some(e => e.id === id)) events.push({ id, number: 0, x: 0, y: 0 }); return id }
  const arrow = (id: string, start: string, end: string, activityId?: string) => arrows.push({ id, source: start, target: end, activityId, mode: 'straight', controls: { source: { x: 0, y: 0 }, target: { x: 0, y: 0 } }, cornerRadius: 12, labelOffset: { x: 0, y: -15 }, stroke: '#526879', strokeWidth: 2 })
  const start = event('start')
  for (const id of analysis.order) {
    const r = results.get(id)!, end = event('end:' + id); let origin = start
    if (r.predecessors.length === 1) origin = 'end:' + r.predecessors[0]
    else if (r.predecessors.length > 1) {
      origin = 'join:' + JSON.stringify([...r.predecessors].sort())
      if (!events.some(e => e.id === origin)) {
        event(origin)
        for (const p of [...r.predecessors].sort()) { const id = 'dummy:' + JSON.stringify([p, origin]); arrow(id, 'end:' + p, origin); prefer(id, p, r.predecessors) }
      }
    }
    arrow('activity:' + id, origin, end, id)
  }
  const terminals = analysis.results.filter(r => !r.successors.length)
  if (terminals.length > 1) { const end = event('finish'); for (const r of terminals) { const id = 'terminal:' + r.id; arrow(id, 'end:' + r.id, end); prefer(id, r.id, terminals.map(r => r.id)) } }
  if (!legacy) compactEvents(events, arrows, preference)
  const incoming = new Map(events.map(e => [e.id, arrows.filter(a => a.target === e.id).length])), ready = events.filter(e => !incoming.get(e.id)).map(e => e.id), sorted: PertEvent[] = []
  const level = new Map<string, number>([[start, 0]])
  for (let i = 0; i < ready.length; i++) {
    const id = ready[i], e = events.find(e => e.id === id)!; e.number = sorted.length + 1; sorted.push(e)
    for (const a of arrows.filter(a => a.source === id)) { level.set(a.target, Math.max(level.get(a.target) ?? 0, level.get(id)! + 1)); incoming.set(a.target, incoming.get(a.target)! - 1); if (!incoming.get(a.target)) ready.push(a.target) }
  }
  const rows = new Map<number, number>()
  if (sorted.length !== events.length) throw new Error('La red PERT contiene un ciclo de eventos.')
  for (const e of sorted) { const rank = level.get(e.id)!, row = rows.get(rank) ?? 0; e.x = rank * 200 + 80; e.y = row * 130 + 80; rows.set(rank, row + 1) }
  const network: PertNetwork = { signature: analysis.signature, source: structuredClone(source), events: sorted, arrows, ...(!legacy ? { construction: 'explicit-joins' as const } : {}) }
  if (previous) inheritPertPresentation(network, previous, true)
  return network
}

export function validatePertNetwork(network: PertNetwork) {
  if (new Set(network.source.map(a => a.id)).size !== network.source.length) throw new Error('La copia de origen tiene actividades repetidas.')
  const analysis = analyze(network.source)
  if (analysis.issues.length || !network.source.length || analysis.signature !== network.signature || new Set(network.source.map(a => a.id)).size !== network.source.length) throw new Error('La copia de origen del diagrama PERT es inválida.')
  const actual = new Map(network.events.map(e => [e.id, e])), ids = new Set(actual.keys()), pairs = new Set<string>(), activities = new Set<string>()
  const sourceIds = new Set(network.source.map(a => a.id)), realIncoming = new Map<string, number>()
  if (actual.size !== network.events.length || new Set(network.events.map(e => e.number)).size !== actual.size) throw new Error('Hay eventos PERT repetidos.')
  for (const a of network.arrows) {
    const from = actual.get(a.source), to = actual.get(a.target), pair = JSON.stringify([a.source, a.target])
    if (ids.has(a.id) || pairs.has(pair) || !from || !to || from.number >= to.number) throw new Error('La red PERT tiene identificadores, parejas de eventos o direcciones inválidas.')
    ids.add(a.id); pairs.add(pair)
    if (a.activityId) {
      if (!sourceIds.has(a.activityId) || activities.has(a.activityId)) throw new Error('Hay actividades reales PERT inexistentes o repetidas.')
      activities.add(a.activityId); realIncoming.set(a.target, (realIncoming.get(a.target) ?? 0) + 1)
      if (network.construction === 'explicit-joins' && realIncoming.get(a.target)! > 1) throw new Error('Una reunión PERT debe conservar las ficticias de las otras actividades.')
    }
  }
  if (activities.size !== sourceIds.size) throw new Error('Faltan actividades reales en el diagrama PERT.')
  const starts = network.events.filter(e => !network.arrows.some(a => a.target === e.id)), ends = network.events.filter(e => !network.arrows.some(a => a.source === e.id))
  if (starts.length !== 1 || ends.length !== 1) throw new Error('El PERT debe tener un inicio y un final comunes.')
  // Legacy documents keep their exact old construction and saved geometry.
  if (!network.construction) {
    const expected = generateNetwork(network.source, undefined, true), arrows = new Map(network.arrows.map(a => [a.id, a]))
    if (expected.events.length !== actual.size || expected.events.some(e => !actual.has(e.id)) || expected.arrows.length !== arrows.size || expected.arrows.some(a => { const b = arrows.get(a.id); return !b || a.source !== b.source || a.target !== b.target || a.activityId !== b.activityId })) throw new Error('La red PERT anterior no corresponde a su tabla.')
  }
  // Independent reachability check: every real arrow must require exactly
  // the table's transitive predecessors, including through dummy arrows.
  const tableAncestors = new Map<string, Set<string>>(), results = new Map(analysis.results.map(r => [r.id, r]))
  for (const id of analysis.order) { const ancestors = new Set<string>(); for (const p of results.get(id)!.predecessors) { ancestors.add(p); for (const ancestor of tableAncestors.get(p)!) ancestors.add(ancestor) }; tableAncestors.set(id, ancestors) }
  const eventAncestors = new Map<string, Set<string>>(), directPredecessors = new Map<string, Set<string>>()
  for (const e of [...network.events].sort((a, b) => a.number - b.number)) {
    const ancestors = new Set<string>(), direct = new Set<string>()
    for (const a of network.arrows.filter(a => a.target === e.id)) { for (const id of eventAncestors.get(a.source)!) ancestors.add(id); if (a.activityId) { ancestors.add(a.activityId); direct.add(a.activityId) } else for (const id of directPredecessors.get(a.source)!) direct.add(id) }
    eventAncestors.set(e.id, ancestors); directPredecessors.set(e.id, direct)
  }
  for (const a of network.arrows) if (a.activityId) {
    const declared = results.get(a.activityId)!.predecessors, direct = directPredecessors.get(a.source)!
    if (declared.length !== direct.size || declared.some(id => !direct.has(id))) throw new Error('La lectura de predecesoras del PERT no coincide con su tabla.')
    const wanted = tableAncestors.get(a.activityId)!, found = eventAncestors.get(a.source)!
    if (wanted.size !== found.size || [...wanted].some(id => !found.has(id))) throw new Error('La red PERT introduce o pierde una precedencia de la tabla.')
  }
}

export function nextCode(rows: PertActivity[]) {
  const used = new Set(rows.map(a => a.code.toUpperCase())); let i = 0, code = ''
  do { let n = ++i; code = ''; while (n) { code = String.fromCharCode(65 + (n - 1) % 26) + code; n = Math.floor((n - 1) / 26) } } while (used.has(code))
  return code
}
export const formatTime = (n: number, decimals = 2) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(n)
