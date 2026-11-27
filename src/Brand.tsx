import trazoIcon from './assets/trazo-icon.png'

declare const __TRAZO_VERSION__: string
export const trazoVersion = __TRAZO_VERSION__

export default function Brand({ showVersion = true }: { showVersion?: boolean }) {
  return <div className="brand">
    <span className="brand-mark"><img src={trazoIcon} alt="" draggable={false} /></span>
    <span>trazo<span className="brand-period">.</span></span>
    {showVersion && <small className="brand-version" title="Versión instalada de Trazo">v{trazoVersion}</small>}
  </div>
}
