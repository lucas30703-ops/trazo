import type { PertNetwork, Point } from '../model'
import { betterLayout, layoutEvaluator } from './layoutScore'

export function positionPert(network: PertNetwork, seed: Map<string, Point>, decimals: number, pinned: Set<string>) {
  const events = [...network.events].sort((a, b) => a.number - b.number), byId = new Map(events.map(e => [e.id, e])), incoming = new Map(events.map(e => [e.id, network.arrows.filter(a => a.target === e.id)])), outgoing = new Map(events.map(e => [e.id, network.arrows.filter(a => a.source === e.id)]))
  const realOut = new Map(events.map(e => [e.id, outgoing.get(e.id)!.filter(a => a.activityId).length])), dummyIn = new Map(events.map(e => [e.id, incoming.get(e.id)!.filter(a => !a.activityId).length])), dummyOut = new Map(events.map(e => [e.id, outgoing.get(e.id)!.filter(a => !a.activityId).length]))
  const evaluator = layoutEvaluator(network, decimals), fixed = new Map(events.filter(e => pinned.has(e.id)).map(e => [e.id, { x: e.x, y: e.y }])), activityOrder = new Map(network.source.map((a, i) => [a.id, i]))
  const order = new Map<string, number>()
  for (const e of events) { const real = incoming.get(e.id)!.find(a => a.activityId); order.set(e.id, real ? activityOrder.get(real.activityId!)! : incoming.get(e.id)!.reduce((n, a) => n + order.get(a.source)!, 0) / Math.max(1, incoming.get(e.id)!.length)) }
  const applyPins = (positions: Map<string, Point>) => { for (const [id, p] of fixed) positions.set(id, p); return positions }
  let best = applyPins(new Map(events.map(e => [e.id, seed.get(e.id) ?? { x: e.x, y: e.y }]))), bestScore = evaluator.score(best)
  const rankVariants = [false]
  if (events.some(e => dummyIn.get(e.id)! > 2 || dummyOut.get(e.id)! > 2)) rankVariants.push(true)
  for (const spreadFanout of rankVariants) {
    const ranks = new Map(events.map(e => [e.id, 0]))
    for (const e of events) for (const a of outgoing.get(e.id)!) {
      const step = a.activityId || spreadFanout && (dummyOut.get(e.id)! > 2 || dummyIn.get(a.target)! > 2) ? 1 : 0
      ranks.set(a.target, Math.max(ranks.get(a.target)!, ranks.get(e.id)! + step))
    }
    const columns = Array.from({ length: Math.max(...ranks.values()) + 1 }, () => [] as string[])
    for (const e of events) columns[ranks.get(e.id)!].push(e.id)
    const gaps = Array.from({ length: columns.length - 1 }, () => 126)
    for (const a of network.arrows) if (a.activityId) { const first = ranks.get(a.source)!, last = ranks.get(a.target)!, needed = (72 + evaluator.dimensions.get(a.id)!.width) / (last - first); for (let i = first; i < last; i++) gaps[i] = Math.max(gaps[i], needed) }
    const labelHeight = Math.max(0, ...[...evaluator.dimensions.values()].map(d => d.height)), scales = events.length <= 100 ? [[1, 118], [1.2, 138], [1.45, 118]] : events.length <= 300 ? [[1, 120], [1.25, 140]] : [[1.1, 132]]
    const modes = events.length <= 100 ? [0, 1, -1, 2, -2] : events.length <= 300 ? [0, 1, -1, 2] : [0, -1, 2]
    for (const mode of modes) for (const [horizontal, vertical] of scales) {
      const groups = columns.map(ids => [...ids].sort((a, b) => (mode ? mode * ((seed.get(a)?.y ?? 0) - (seed.get(b)?.y ?? 0)) : order.get(a)! - order.get(b)!) || byId.get(a)!.number - byId.get(b)!.number)), y = new Map<string, number>(), hint = new Map<string, number>(), gap = Math.max(vertical, labelHeight + 66)
      for (const ids of groups) ids.forEach((id, i) => { const value = (i - (ids.length - 1) / 2) * gap; y.set(id, value); hint.set(id, value) })
      // Explore branch permutations from both directions, not just table order
      // and its mirror. Dummies participate equally in these ordering sweeps.
      if (Math.abs(mode) === 2) for (let pass = 0; pass < 6; pass++) {
        const forward = (pass % 2 === 0) === (mode > 0)
        for (const ids of forward ? groups : [...groups].reverse()) {
          const centers = new Map(ids.map(id => {
            const edges = (forward ? incoming : outgoing).get(id)!
            const neighbors = edges.map(a => a.source === id ? a.target : a.source).filter(other => ranks.get(other) !== ranks.get(id))
            return [id, neighbors.length ? neighbors.reduce((sum, other) => sum + y.get(other)!, 0) / neighbors.length : y.get(id)!]
          }))
          ids.sort((a, b) => centers.get(a)! - centers.get(b)! || y.get(a)! - y.get(b)! || byId.get(a)!.number - byId.get(b)!.number)
          ids.forEach((id, i) => { const value = (i - (ids.length - 1) / 2) * gap; y.set(id, value); hint.set(id, value) })
        }
      }
      // Weighted isotonic regression: preserve each column's branch order and
      // minimum spacing, while straightening real chains between columns.
      for (let pass = 0; pass < 8; pass++) for (const ids of pass % 2 ? [...groups].reverse() : groups) {
        const blocks: { first: number; last: number; sum: number; weight: number }[] = []
        ids.forEach((id, i) => {
          let sum = hint.get(id)! * .04, weight = .04
          for (const a of [...incoming.get(id)!, ...outgoing.get(id)!]) { const other = a.source === id ? a.target : a.source, w = a.activityId ? realOut.get(a.source) === 1 ? 6 : 1 : .08; sum += y.get(other)! * w; weight += w }
          blocks.push({ first: i, last: i, sum: sum - i * gap * weight, weight })
          while (blocks.length > 1) { const b = blocks.at(-1)!, a = blocks.at(-2)!; if (a.sum / a.weight <= b.sum / b.weight) break; blocks.splice(-2, 2, { first: a.first, last: b.last, sum: a.sum + b.sum, weight: a.weight + b.weight }) }
        })
        for (const b of blocks) for (let i = b.first; i <= b.last; i++) y.set(ids[i], b.sum / b.weight + i * gap)
      }
      const x = [60]; for (const g of gaps) x.push(x.at(-1)! + g * horizontal)
      const positions = applyPins(new Map(events.map(e => [e.id, { x: x[ranks.get(e.id)!], y: y.get(e.id)! }])))
      const score = evaluator.score(positions); if (betterLayout(score, bestScore)) { best = positions; bestScore = score }
    }
  }
  // Swap chains together to escape layouts that cannot improve one node at a
  // time. Keep x, topology, user routes and pinned positions unchanged.
  const chain = (id: string) => {
    const ids = [id]
    while (outgoing.get(id)!.length === 1) {
      const edge = outgoing.get(id)![0], next = edge.target
      if (!edge.activityId || incoming.get(next)!.length !== 1 || pinned.has(next)) break
      ids.push(next); id = next
    }
    return ids
  }
  let swaps = events.length <= 100 ? 100 : events.length <= 300 ? 36 : 12
  for (let pass = 0; pass < 3 && swaps > 0; pass++) {
    let improved = false
    for (let i = 0; i < events.length && swaps > 0; i++) for (let j = i + 1; j < events.length && swaps > 0; j++) {
      const a = events[i].id, b = events[j].id, pa = best.get(a)!, pb = best.get(b)!
      if (pinned.has(a) || pinned.has(b) || Math.abs(pa.x - pb.x) > 1 || Math.abs(pa.y - pb.y) < 1) continue
      const first = chain(a), second = chain(b)
      if (first.some(id => second.includes(id))) continue
      swaps--
      const probe = new Map(best), dy = pb.y - pa.y
      for (const id of first) { const p = best.get(id)!; probe.set(id, { x: p.x, y: p.y + dy }) }
      for (const id of second) { const p = best.get(id)!; probe.set(id, { x: p.x, y: p.y - dy }) }
      const score = evaluator.score(probe)
      if (betterLayout(score, bestScore)) { best = probe; bestScore = score; improved = true }
    }
    if (!improved) break
  }
  // Small, bounded repair on actual geometry. Existing manual positions are
  // immutable; local moves never change topology or turn real arrows back.
  let budget = events.length <= 100 ? 120 : events.length <= 300 ? 36 : 12
  while (budget > 0 && (bestScore.nodes || bestScore.labels || bestScore.overlaps || bestScore.crossings)) {
    let improved = false
    for (const id of bestScore.hotspots) {
      if (pinned.has(id)) continue
      const original = best.get(id)!
      for (const [dx, dy] of [[0, -42], [0, 42], [-36, 0], [36, 0], [0, -84], [0, 84]]) {
        if (--budget < 0) break
        const p = { x: original.x + dx, y: original.y + dy }, probe = new Map(best); probe.set(id, p)
        if ([...incoming.get(id)!, ...outgoing.get(id)!].some(a => probe.get(a.target)!.x - probe.get(a.source)!.x < (a.activityId ? 80 : -.01))) continue
        const score = evaluator.score(probe); if (betterLayout(score, bestScore)) { best = probe; bestScore = score; improved = true; break }
      }
      if (improved || budget <= 0) break
    }
    if (!improved) break
  }
  const shiftX = pinned.size ? 0 : 60 - Math.min(...[...best.values()].map(p => p.x)), shiftY = pinned.size ? 0 : 60 - Math.min(...[...best.values()].map(p => p.y))
  for (const e of network.events) { const p = best.get(e.id)!; e.x = p.x + shiftX; e.y = p.y + shiftY }
  return { issues: bestScore.nodes + bestScore.labels + bestScore.overlaps + bestScore.crossings }
}
