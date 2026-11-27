import { describe, expect, it, vi } from 'vitest'
import { startCanvasPan } from './pan'
import { createDemoProject } from './model'
import { EditorStore } from './store'

function pointer(type: string, pointerId: number, x: number, y: number) { const event = new Event(type); return Object.assign(event, { pointerId, clientX: x, clientY: y }) }
describe('desplazamiento con clic derecho', () => {
  it('mueve la vista con el gesto completo, conserva el documento y no registra deshacer', () => {
    const target = new EventTarget(), s = new EditorStore(createDemoProject()), before = s.getSnapshot(), translate = vi.fn(), end = vi.fn()
    const start = { button: 2, pointerId: 7, clientX: 300, clientY: 200, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    startCanvasPan(start, target, { x: -120, y: 30 }, translate, end)
    target.dispatchEvent(pointer('pointermove', 7, 350, 180)); target.dispatchEvent(pointer('pointermove', 7, 390, 260)); target.dispatchEvent(pointer('pointerup', 7, 390, 260))
    expect(translate.mock.calls.map(call => call[0])).toEqual([{ x: -70, y: 10 }, { x: -30, y: 90 }]); expect(end).toHaveBeenCalledOnce()
    target.dispatchEvent(pointer('pointermove', 7, 800, 800)); expect(translate).toHaveBeenCalledTimes(2)
    expect(s.getSnapshot()).toBe(before); expect(s.getSnapshot().canUndo).toBe(false)
    expect(start.preventDefault).toHaveBeenCalledOnce(); expect(start.stopPropagation).toHaveBeenCalledOnce()
  })
  it('ignora clic izquierdo y otros punteros, y limpia el gesto si se cancela', () => {
    const target = new EventTarget(), translate = vi.fn(), end = vi.fn(), start = { button: 0, pointerId: 1, clientX: 10, clientY: 10, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    expect(startCanvasPan(start, target, { x: 0, y: 0 }, translate, end)).toBeUndefined()
    const dispose = startCanvasPan({ ...start, button: 2 }, target, { x: 0, y: 0 }, translate, end)!
    target.dispatchEvent(pointer('pointermove', 2, 20, 20)); target.dispatchEvent(pointer('pointerup', 2, 20, 20)); expect(translate).not.toHaveBeenCalled(); expect(end).not.toHaveBeenCalled()
    target.dispatchEvent(pointer('pointercancel', 1, 30, 30)); target.dispatchEvent(pointer('pointermove', 1, 40, 40)); dispose()
    expect(translate).not.toHaveBeenCalled(); expect(end).toHaveBeenCalledOnce()
  })
  it('distingue un clic derecho de pequeños movimientos y no abre menú al arrastrar o cancelar', () => {
    const target = new EventTarget(), move = vi.fn(), click = vi.fn(), end = vi.fn()
    const start = { button: 2, pointerId: 1, clientX: 100, clientY: 100, preventDefault: vi.fn(), stopPropagation: vi.fn() }
    startCanvasPan(start, target, { x: 10, y: 20 }, move, end, click)
    target.dispatchEvent(pointer('pointermove', 1, 102, 101)); target.dispatchEvent(pointer('pointerup', 1, 102, 101))
    expect(click).toHaveBeenCalledOnce(); expect(move).not.toHaveBeenCalled()
    startCanvasPan(start, target, { x: 10, y: 20 }, move, end, click)
    target.dispatchEvent(pointer('pointermove', 1, 120, 130)); target.dispatchEvent(pointer('pointermove', 1, 100, 100)); target.dispatchEvent(pointer('pointerup', 1, 100, 100))
    expect(click).toHaveBeenCalledOnce(); expect(move).toHaveBeenCalledTimes(2)
    startCanvasPan(start, target, { x: 10, y: 20 }, move, end, click)
    target.dispatchEvent(pointer('pointercancel', 1, 100, 100)); expect(click).toHaveBeenCalledOnce()
    startCanvasPan({ ...start, button: 1 }, target, { x: 10, y: 20 }, move, end, click)
    target.dispatchEvent(pointer('pointerup', 1, 100, 100)); expect(click).toHaveBeenCalledOnce()
  })

})
