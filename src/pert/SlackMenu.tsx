import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calculator, LocateFixed, Table2 } from 'lucide-react'
import { useMenuMotion } from '../motion'
import type { Point } from '../model'

export default function SlackMenu({ code, position, onClose, onExplain, onLocate, onRow }: { code: string; position: Point; onClose: (restore?: boolean) => void; onExplain: () => void; onLocate: () => void; onRow: () => void }) {
  const menu = useRef<HTMLDivElement>(null), [at, setAt] = useState(position), close = useRef(onClose); close.current = onClose
  useMenuMotion(menu, true)
  useLayoutEffect(() => {
    const node = menu.current; if (!node) return
    const rect = node.getBoundingClientRect()
    setAt({ x: Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8)), y: Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8)) })
    node.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
  }, [position])
  useEffect(() => {
    const outside = (e: Event) => { if (!menu.current?.contains(e.target as Node)) close.current(false) }
    const scroll = (e: Event) => { if (!menu.current?.contains(e.target as Node)) close.current(false) }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); close.current(true); return }
      if (!menu.current?.contains(e.target as Node) || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return
      e.preventDefault(); e.stopPropagation()
      const items = [...menu.current.querySelectorAll<HTMLButtonElement>('button')], index = items.indexOf(document.activeElement as HTMLButtonElement)
      items[e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
    }
    const blur = () => close.current(false)
    document.addEventListener('pointerdown', outside, true); document.addEventListener('focusin', outside, true); document.addEventListener('keydown', key, true); document.addEventListener('scroll', scroll, true); window.addEventListener('blur', blur); window.addEventListener('resize', blur)
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', outside, true); document.removeEventListener('keydown', key, true); document.removeEventListener('scroll', scroll, true); window.removeEventListener('blur', blur); window.removeEventListener('resize', blur) }
  }, [])
  const choose = (action: () => void) => { onClose(false); action() }
  return createPortal(<div ref={menu} className="canvas-process-menu pert-slack-menu" role="menu" aria-label={`Opciones de la actividad ${code}`} style={{ left: at.x, top: at.y }} onContextMenu={e => e.preventDefault()}>
    <p>Actividad {code}</p>
    <button role="menuitem" onClick={() => choose(onExplain)}><Calculator size={14} />Ver cálculo…</button>
    <button role="menuitem" onClick={() => choose(onLocate)}><LocateFixed size={14} />Localizar en diagrama</button>
    <button role="menuitem" onClick={() => choose(onRow)}><Table2 size={14} />Ir a su fila</button>
  </div>, document.body)
}
