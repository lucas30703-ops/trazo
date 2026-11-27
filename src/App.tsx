import { lazy, Suspense, useCallback, useState } from 'react'
import type { AppMode } from './model'
import ModeSelection from './ModeSelection'

const DfdWorkspace = lazy(() => import('./DfdWorkspace'))
const UmlWorkspace = lazy(() => import('./uml/UmlWorkspace'))
const PertWorkspace = lazy(() => import('./pert/PertWorkspace'))

export default function App() {
  const [mode, setMode] = useState<AppMode | null>(null)
  const [sessions, setSessions] = useState<AppMode[]>([])
  const [readyModes, setReadyModes] = useState<AppMode[]>([])
  const markReady = useCallback((ready: AppMode) => setReadyModes(previous => previous.includes(ready) ? previous : [...previous, ready]), [])
  const markUmlReady = useCallback(() => markReady('uml'), [markReady])
  const markPertReady = useCallback(() => markReady('pert'), [markReady])
  const chooseMode = useCallback(() => setMode(null), [])
  const openMode = (next: AppMode) => { setSessions(previous => previous.includes(next) ? previous : [...previous, next]); setMode(next) }

  return <>
    {sessions.map(session => {
      const active = mode === session, label = session === 'pert' ? 'PERT' : session === 'uml' ? 'UML' : 'DFD'
      return <Suspense key={session} fallback={active ? <div className="uml-empty" role="status">Abriendo {label}…</div> : null}>
        {session === 'pert' ? <PertWorkspace active={active} onChooseMode={chooseMode} onReady={markPertReady} /> :
          session === 'uml' ? <UmlWorkspace active={active} onChooseMode={chooseMode} onReady={markUmlReady} /> :
            <DfdWorkspace mode={session} active={active} onChooseMode={chooseMode} onReady={markReady} />}
      </Suspense>
    })}
    {mode === null && <ModeSelection onOpenMode={openMode} resumeModes={readyModes} />}
  </>
}
