import { useId, useLayoutEffect, useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import Brand, { trazoVersion } from './Brand'
import type { AppMode } from './model'

type Mode = AppMode

// Decorative previews of each notation.
function ModeIllustration({ mode }: { mode: Mode }) {
  const arrowId = useId()
  return <div className={`mode-illustration mode-illustration-${mode}`} aria-hidden="true">
    <svg viewBox="0 0 280 144" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <defs><marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="m1 1 6 3-6 3" /></marker></defs>
      {mode !== 'pert' && mode !== 'uml' && <>
        <path d="M66 72h41m66 0h41M140 99v20h62" markerEnd={`url(#${arrowId})`} />
        <rect x="19" y="53" width="47" height="38" rx="2" className="mode-node" />
        <circle cx="140" cy="72" r="28" className="mode-node-accent" />
        <rect x="214" y="53" width="47" height="38" rx="2" className="mode-node" />
        {mode === 'design' && <path d="M25 53v38m35-38v38M220 53v38m35-38v38" className="mode-node-store" />}
        <path d="M210 110h49m-49 17h49" className="mode-node-store" />
        <path d="M31 68h23m-23 8h16m74-9h38m-31 9h24m74-8h23m-23 8h16" className="mode-node-text" />
      </>}
      {mode === 'uml' && <><rect x="20" y="20" width="95" height="105" rx="3" className="mode-node"/><rect x="170" y="40" width="95" height="85" rx="3" className="mode-node"/><path d="M20 48h95M170 68h95M34 64h52M34 83h60M184 83h58M184 103h43M115 83h55m-8-6v12m-47-6 13-7m-13 7 13 7"/><path d="M34 35h53M184 55h54" className="mode-node-text"/></>}
      {mode === 'pert' && <>
        <path d="m58 66 53-28m42 0 60 28M58 79l53 28m42 0 60-28" markerEnd={`url(#${arrowId})`} />
        <circle cx="40" cy="72" r="18" className="mode-node" />
        <circle cx="132" cy="28" r="20" className="mode-node-accent" />
        <circle cx="132" cy="116" r="20" className="mode-node" />
        <circle cx="234" cy="72" r="20" className="mode-node-accent" />
        <circle cx="40" cy="72" r="3" className="mode-node-dot" /><circle cx="132" cy="28" r="3" className="mode-node-dot" />
        <circle cx="132" cy="116" r="3" className="mode-node-dot" /><circle cx="234" cy="72" r="3" className="mode-node-dot" />
      </>}
    </svg>
  </div>
}

const modes: { id: Mode; title: string; description: string }[] = [
  { id: 'analysis', title: 'DFD de análisis', description: 'Contextos, niveles y especificaciones con las herramientas que ya usás.' },
  { id: 'design', title: 'DFD de diseño', description: 'Pantallas, procesos y tablas de la base de datos, con las mismas herramientas de edición.' },
  { id: 'uml', title: 'UML de base de datos', description: 'Importá MySQL y acomodá tablas, columnas y relaciones.' },
  { id: 'pert', title: 'Diagrama PERT', description: 'Cargá actividades y estimaciones, acomodá la red y consultá holguras y caminos críticos.' },
]

export default function ModeSelection({ onOpenMode, resumeModes }: { onOpenMode: (mode: AppMode) => void; resumeModes: AppMode[] }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }) }, [])

  return <div className="mode-selection">
    <header className="mode-selection-header"><Brand showVersion={false} /><span>Modos de trabajo</span></header>
    <main className="mode-selection-main" aria-labelledby="mode-selection-title">
      <div className="mode-selection-intro">
        <h1 id="mode-selection-title" ref={heading} tabIndex={-1}>¿Qué vas a diagramar?</h1>
        <p>Elegí el modo de trabajo para continuar.</p>
      </div>
      <div className="mode-grid">
        {modes.map(mode => <article key={mode.id} className="mode-card mode-card-available" aria-labelledby={`mode-title-${mode.id}`}>
          <ModeIllustration mode={mode.id} />
          <div className="mode-card-copy"><h2 id={`mode-title-${mode.id}`}>{mode.title}</h2><p>{mode.description}</p></div>
          <div className="mode-card-footer">
            <button className="primary-button mode-open" onClick={() => onOpenMode(mode.id as AppMode)}>{resumeModes.includes(mode.id) ? 'Volver al editor' : `Abrir ${mode.title}`}<ArrowRight size={16} /></button>
          </div>
        </article>)}
      </div>
      <p className="mode-selection-note">Cada modo conserva sus propios proyectos.</p>
    </main>
    <footer className="mode-selection-footer"><span>Trazo</span><span>v{trazoVersion}</span></footer>
  </div>
}
