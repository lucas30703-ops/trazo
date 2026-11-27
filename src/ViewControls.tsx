import { Presence } from './motion'
import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Eye } from 'lucide-react'
import type { PanelId, PanelVisibility } from './workspace'

const options: { id: PanelId; label: string }[] = [
  { id: 'header', label: 'Encabezado del proyecto' },
  { id: 'diagrams', label: 'Panel de diagramas' },
  { id: 'tools', label: 'Barra de herramientas' },
  { id: 'properties', label: 'Panel de propiedades' },
  { id: 'info', label: 'Información del lienzo' },
]

export default function ViewControls({ panels, focusMode, onToggle, onFocus, grid, onGrid }: { panels: PanelVisibility; focusMode: boolean; onToggle: (id: PanelId) => void; onFocus: () => void; grid: boolean; onGrid: () => void }) {
  const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null)
  useEffect(() => { setOpen(false) }, [focusMode])
  useEffect(() => {
    if (!open) return
    const dismiss = (e: Event) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); root.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('focusin', dismiss)
    document.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('focusin',dismiss); document.removeEventListener('keydown', escape, true) }
  }, [open])
  return <div className="view-controls">
    <div className="view-menu-wrap" ref={root}>
      <button className={`toolbar-text-button ${open ? 'active-subtle' : ''}`} aria-label="Vista" aria-expanded={open} aria-controls="workspace-visibility" onClick={() => setOpen(!open)}><Eye size={15} /><span>Vista</span><ChevronDown size={11} /></button>
      <Presence show={open} kind="menu"><div className="dropdown view-menu" id="workspace-visibility" aria-label="Visibilidad de secciones">
        {options.map(({ id, label }) => <label key={id} className="view-option"><input type="checkbox" checked={panels[id]} onChange={() => onToggle(id)} /><span className="view-check" aria-hidden="true">{panels[id] && <Check size={12} />}</span><span>{label}</span></label>)}
        <label className="view-option view-divider"><input type="checkbox" checked={grid} onChange={onGrid} /><span className="view-check" aria-hidden="true">{grid && <Check size={12} />}</span><span>Cuadrícula</span></label>
        <label className="view-option"><input type="checkbox" checked={focusMode} onChange={onFocus} /><span className="view-check" aria-hidden="true">{focusMode && <Check size={12} />}</span><span>Modo lienzo</span><kbd>F9</kbd></label>
      </div></Presence>
    </div>
  </div>
}
