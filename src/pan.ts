import type { Point } from './model'

interface PanInput { button: number; pointerId: number; clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }
export function startCanvasPan(event: PanInput, target: EventTarget, initial: Point, translate: (point: Point) => void, onEnd: () => void, onRightClick?: () => void): (() => void) | undefined {
  if (event.button !== 2 && event.button !== 1) return
  event.preventDefault(); event.stopPropagation()
  let moved = false
  const move = (raw: Event) => { const e = raw as PointerEvent; if (e.pointerId !== event.pointerId) return; if (Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) >= 5) moved = true; if (moved) translate({ x: initial.x + e.clientX - event.clientX, y: initial.y + e.clientY - event.clientY }) }
  const release = (raw: Event) => { const e = raw as PointerEvent; if (e.pointerId !== event.pointerId) return; const click = raw.type === 'pointerup' && !moved && Math.hypot(e.clientX - event.clientX, e.clientY - event.clientY) < 5 && event.button === 2; cleanup(); if (click) onRightClick?.() }
  let finished = false
  const cleanup = () => { if (finished) return; finished = true; target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', release); target.removeEventListener('pointercancel', release); onEnd() }
  target.addEventListener('pointermove', move); target.addEventListener('pointerup', release); target.addEventListener('pointercancel', release)
  return cleanup
}
