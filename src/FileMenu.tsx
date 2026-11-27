import { Presence } from './motion'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, CircleHelp, Download, FilePlus2, FileUp, FolderOpen, History, LayoutGrid, ListChecks, Save } from 'lucide-react'

export type FileAction = 'projects' | 'new' | 'open' | 'saveAs' | 'copy' | 'history' | 'checks' | 'help' | 'modes'
const items = [
  { id: 'projects', label: 'Mis proyectos', Icon: FolderOpen },
  { id: 'new', label: 'Nuevo proyecto', Icon: FilePlus2 },
  { id: 'open', label: 'Abrir archivo', Icon: FileUp, shortcut: 'Ctrl O' },
  { id: 'saveAs', label: 'Guardar como…', Icon: Save, shortcut: 'Ctrl Shift S', separator: true },
  { id: 'copy', label: 'Descargar copia editable', Icon: Download },
  { id: 'history', label: 'Versiones recuperables', Icon: History, separator: true },
  { id: 'checks', label: 'Comprobar proyecto', Icon: ListChecks },
  { id: 'modes', label: 'Cambiar modo', Icon: LayoutGrid, separator: true },
  { id: 'help', label: 'Ayuda y atajos', Icon: CircleHelp },
] as const
export default function FileMenu({ onAction, disabled }: { onAction: (action: FileAction) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false), root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const click = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); root.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', click); document.addEventListener('focusin',click); document.addEventListener('keydown', key, true)
    return () => { document.removeEventListener('pointerdown', click); document.removeEventListener('focusin',click); document.removeEventListener('keydown', key, true) }
  }, [open])
  return <div className="workspace-file-menu" ref={root}>
    <button className="toolbar-text-button" aria-label="Archivo" aria-expanded={open} onClick={() => setOpen(!open)}>Archivo<ChevronDown size={12} /></button>
    <Presence show={open} kind="menu"><div className="dropdown unified-file-menu">{items.map(item => <button key={item.id} disabled={disabled && (item.id === 'saveAs')} className={'separator' in item ? 'menu-separator' : ''} onClick={() => { setOpen(false); onAction(item.id) }}><item.Icon size={14} />{item.label}{'shortcut' in item && <kbd>{item.shortcut}</kbd>}</button>)}</div></Presence>
  </div>
}
