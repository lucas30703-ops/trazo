import { usePresenceOpen, useMenuMotion } from './motion'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Pencil, Plus } from 'lucide-react'
import type { EditorStore } from './store'
import type { Point } from './model'
import { processTitle, specificationAction } from './hierarchy'

export default function ProcessMenu({ store, nodeId, position, onClose, onEdit }: { store: EditorStore; nodeId: string; position: Point; onClose: (restore?: boolean) => void; onEdit: (id: string) => void }) {
  const present=usePresenceOpen()
  const menu = useRef<HTMLDivElement>(null), labelId = useId(), [at, setAt] = useState(position), d = store.diagram, process = d.nodes.find(n => n.id === nodeId)!
  useLayoutEffect(() => { if (!present || !menu.current) return; const rect = menu.current.getBoundingClientRect(); setAt({ x: Math.max(8, Math.min(position.x, window.innerWidth - rect.width - 8)), y: Math.max(8, Math.min(position.y, window.innerHeight - rect.height - 8)) }); menu.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus() }, [position,present])
  useMenuMotion(menu,present)
  useEffect(() => {
    if(!present)return
    const outside = (e: Event) => { if (!menu.current?.contains(e.target as Node)) onClose(false) }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return }
      if (!menu.current?.contains(e.target as Node)) return
      if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
        e.preventDefault(); e.stopPropagation(); const items = [...menu.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')], index = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next]?.focus()
      }
    }
    document.addEventListener('pointerdown', outside, true); document.addEventListener('focusin',outside,true); document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin',outside,true); document.removeEventListener('keydown', key, true) }
  }, [onClose,present])
  if (!process) return null
  const action = specificationAction(d.rootLevel ?? 0, !!process.childDiagramId)
  return createPortal(<div ref={menu} className="canvas-process-menu" role="menu" inert={!present} aria-hidden={!present||undefined} aria-labelledby={labelId} style={{ left: at.x, top: at.y }} onContextMenu={e => e.preventDefault()}>
    <p id={labelId}>{d.rootLevel === 0 ? `Sistema · ${process.text}` : `Proceso ${processTitle(process)}`}</p>
    {!process.inheritedFrom && <button role="menuitem" disabled={!process.childDiagramId && process.locked} onClick={() => { onClose(false); store.createChild(process.id, d.id) }}>{process.childDiagramId ? <ExternalLink size={14} /> : <Plus size={14} />}{action}</button>}
    <button role="menuitem" disabled={process.locked} onClick={() => { onClose(false); onEdit(process.id) }}><Pencil size={14} />Editar texto…</button>
  </div>, document.body)
}
