import { useEffect, useRef, useState } from 'react'
import { focusShortcutSurface, isEditingTarget } from '../keyboard'
import type { PertActivity } from '../model'
import ActivityTable from './ActivityTable'

export default function TablePeek({ enabled, rows, decimals, selected, focusCanvas }: { enabled: boolean; rows: PertActivity[]; decimals: number; selected?: string; focusCanvas: () => void }) {
  const [visible, setVisible] = useState(false), context = useRef(focusCanvas); context.current = focusCanvas
  useEffect(() => {
    if (!enabled) { setVisible(false); return }
    let held = false
    const release = () => { held = false; setVisible(false) }
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey && !isEditingTarget(e.target) && !document.querySelector('.modal-backdrop:not([inert]) [role=dialog], [role=menu]:not([inert])')) {
        e.preventDefault(); e.stopImmediatePropagation()
        if (!e.repeat) { held = true; focusShortcutSurface(context.current); setVisible(true) }
      } else if (held && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); e.stopImmediatePropagation(); if (e.key === 'Escape') setVisible(false) }
      else if (held) release()
    }
    const up = (e: KeyboardEvent) => { if (e.key === 'Tab' && held) { e.preventDefault(); e.stopImmediatePropagation(); release() } }
    const hidden = () => { if (document.visibilityState === 'hidden') release() }
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true); window.addEventListener('blur', release); document.addEventListener('visibilitychange', hidden)
    return () => { release(); window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', hidden) }
  }, [enabled])
  if (!visible || !enabled) return null
  return <section className="parent-peek pert-table-peek" aria-label="Consulta temporal de la tabla"><header><div><strong>Tabla de actividades</strong><span>Solo lectura</span></div><p>Soltá <kbd>Tab</kbd> para volver</p></header><ActivityTable rows={rows} decimals={decimals} selected={selected} readOnly /></section>
}
