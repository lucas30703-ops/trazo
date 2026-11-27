import { useId } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

export default function CollapsibleSection({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const id = useId()
  return <section className="inspector-section collapsible-section">
    <h4><button className="section-toggle" aria-expanded={open} aria-controls={id} onClick={onToggle}><ChevronRight size={13} aria-hidden="true" /><span>{title}</span></button></h4>
    <div id={id} className="section-collapse" data-open={open} aria-hidden={!open} inert={!open}><div className="section-clip"><div className="section-content">{children}</div></div></div>
  </section>
}
