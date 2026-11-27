import { Presence, useChangeMotion } from './motion'
import ArrowShapeControls from './ArrowShapeControls'
import SavedStylesPanel from './SavedStylesPanel'
import { useId, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { AlignHorizontalJustifyCenter, AlignVerticalJustifyCenter, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, MoveHorizontal, MoveVertical, Trash2, SlidersHorizontal, LockKeyhole, UnlockKeyhole, RotateCcw } from 'lucide-react'
import { canLinkChild, type EditorStore } from './store'
import { defaultFont, projectMode, type DfdEdge, type DfdNode, type TextStyle } from './model'
import { editorContentBounds, editorGeometry, headingLayout } from './geometry'
import CollapsibleSection from './CollapsibleSection'
import { ColorField, FontControls, NumberField } from './InspectorFields'
export { ColorField, NumberField } from './InspectorFields'

const names = { process: 'Proceso', entity: 'Entidad externa', store: 'Almacén de datos', note: 'Texto libre' }
const tabs = [{ id: 'style', label: 'Forma y color' }, { id: 'text', label: 'Texto' }, { id: 'organize', label: 'Organizar' }] as const
type Tab = typeof tabs[number]['id']
interface Props { store: EditorStore; notify: (text: string) => void; closedSections: Record<string, boolean>; onSectionChange: (id: string, open: boolean) => void }

export default function Inspector({ store, notify, closedSections, onSectionChange }: Props) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot), d = store.diagram
  const modeNames = projectMode(state.project) === 'design' ? { ...names, entity: 'Pantalla', store: 'Tabla de base de datos' } : names
  const nodes = d.nodes.filter(n => state.selectedIds.includes(n.id)), edges = d.edges.filter(e => state.selectedIds.includes(e.id))
  const count = nodes.length + edges.length, node = count === 1 ? nodes[0] : undefined, edge = count === 1 ? edges[0] : undefined
  const [tab, setTab] = useState<Tab>('style')
  const panel=useRef<HTMLElement>(null)
  useChangeMotion(panel,`${tab}:${node?.kind??(edge?'edge':count?'mixed':'diagram')}:${count}`)
  const tabId = useId(), tabBar = useRef<HTMLDivElement>(null)
  const locked = [...nodes, ...edges].some(c => c.locked)
  const fonts = [...nodes.map(n => n.font), ...edges.map(e => e.label.font)], font = fonts[0] ?? defaultFont
  const mixedFont = fonts.some(f => JSON.stringify(f) !== JSON.stringify(font))
  const stroke = nodes[0]?.stroke ?? edges[0]?.stroke ?? '#334553', strokeWidth = nodes[0]?.strokeWidth ?? edges[0]?.strokeWidth ?? 1.8
  const setFont = (patch: Partial<TextStyle>) => store.command((_p, diagram) => { for (const n of diagram.nodes) if (state.selectedIds.includes(n.id) && !n.locked) Object.assign(n.font, patch); for (const e of diagram.edges) if (state.selectedIds.includes(e.id) && !e.locked) Object.assign(e.label.font, patch) })
  const setStroke = (patch: { stroke?: string; strokeWidth?: number }) => store.command((_p, diagram) => { [...diagram.nodes, ...diagram.edges].filter(c => state.selectedIds.includes(c.id) && !c.locked).forEach(c => Object.assign(c, patch)) })
  const labelEdge = edges[0]
  const textMode = (e:DfdEdge) => e.label.curved && e.label.orientation==='tangent' ? 'curved' : e.label.orientation
  const labelMode = labelEdge ? textMode(labelEdge) : 'horizontal'
  const updateLabels = (fn: (edge: DfdEdge) => void) => store.command((_p, diagram) => { for (const flow of diagram.edges) if (state.selectedIds.includes(flow.id) && !flow.locked) fn(flow) })
  const updateEdge = (fn: (edge: DfdEdge) => void) => edge && store.updateEdge(edge.id, fn)
  const setSize = (key: 'width' | 'height', value: number) => node && store.updateNode(node.id, n => { n[key] = value; if (n.kind === 'process') n.width = n.height = value })
  const section = (id: string, title: string, content: ReactNode, defaultOpen = true) => {
    const open = closedSections[id] === undefined ? defaultOpen : !closedSections[id]
    return <CollapsibleSection key={id} title={title} open={open} onToggle={() => onSectionChange(id, !open)}>{content}</CollapsibleSection>
  }
  const currentHeading = headingLayout(d, editorContentBounds), visibleHeading = d.heading?.mode !== 'hidden'
  return <aside ref={panel} className="inspector inspector-v2" aria-label="Panel de propiedades"
    onFocusCapture={e => { if ((e.target as HTMLElement).matches('input,textarea')) store.beginGesture() }}
    onBlurCapture={e => { if ((e.target as HTMLElement).matches('input,textarea')) store.endGesture() }}>
    <div className="inspector-title"><SlidersHorizontal size={16} /><span>{count ? 'Propiedades' : 'Diagrama'}</span>{count > 1 && <span className="count-badge">{count}</span>}
    </div>
    {count > 0 && <>
      <section className="inspector-selection">
        <div className="selection-kind"><span>{node ? node.kind === 'process' && d.rootLevel === 0 ? 'Sistema' : modeNames[node.kind] : edge ? 'Flujo de datos' : 'Selección múltiple'}</span>
          <button className="icon-button" aria-label={locked ? 'Desbloquear selección' : 'Bloquear selección'} title={locked ? 'Desbloquear selección' : 'Bloquear selección'} onClick={() => store.setLocked(!locked)}>{locked ? <LockKeyhole size={15} /> : <UnlockKeyhole size={15} />}</button>
        </div>
        <h3>{node ? `${node.kind === 'process' && d.rootLevel !== 0 && node.number ? node.number + ' · ' : ''}${node.text.replace(/\n/g, ' ') || 'Sin nombre'}` : edge ? edge.label.text.replace(/\n/g, ' ') || 'Sin etiqueta' : `${nodes.length} figuras · ${edges.length} flujos`}</h3>
        {node?.inheritedFrom && <p className="field-help">Elemento de contexto copiado del nivel superior.</p>}
        {locked && <p className="locked-message">Selección bloqueada. Usá el candado para editar.</p>}
      </section>
      <div ref={tabBar} className="inspector-tabs" role="tablist" aria-label="Grupos de propiedades" onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault(); const index = tabs.findIndex(t => t.id === tab)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
        setTab(tabs[next].id); tabBar.current?.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus()
      }}>{tabs.map(t => <button key={t.id} id={`${tabId}-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls={`${tabId}-panel`} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>
    </>}
    <div className="inspector-scroll">
      {!count ? <>
        {section('heading', 'Título del diagrama', <>
          <label className="toggle-row"><span>Mostrar título</span><input aria-label="Mostrar título" type="checkbox" checked={visibleHeading} onChange={e => store.command((_p, diagram) => { const text = diagram.heading?.text; diagram.heading = { ...diagram.heading, mode: e.target.checked ? text === undefined ? 'auto' : 'custom' : 'hidden', ...(text === undefined ? {} : { text }) } })} /></label>
          <Presence show={visibleHeading} kind="vertical"><div className="motion-fields">
            <button className={`secondary-button compact heading-position-button${d.heading?.position ? ' active' : ''}`} aria-pressed={!!d.heading?.position} disabled={!currentHeading && !d.heading?.position} onClick={() => { if (d.heading?.position) store.setHeadingPosition(); else if (currentHeading) { store.setHeadingPosition({ x: currentHeading.x + currentHeading.width / 2, y: currentHeading.y + currentHeading.height / 2 }); store.setTool('select') } }}><MoveHorizontal size={14} />Posición manual del título</button>
            {d.heading?.position && <><p className="field-help">Arrastrá el título en el lienzo. Desactivá el botón para volver a la posición automática.</p><div className="field-pair"><NumberField label="Posición X del título" value={d.heading.position.x} min={-10000000} max={10000000} onChange={x => store.setHeadingPosition({ x, y: d.heading!.position!.y })} /><NumberField label="Posición Y del título" value={d.heading.position.y} min={-10000000} max={10000000} onChange={y => store.setHeadingPosition({ x: d.heading!.position!.x, y })} /></div></>}
            <label className="field"><span className="field-label">Contenido del título</span><select aria-label="Contenido del título" value={d.heading?.mode ?? 'auto'} onChange={e => store.command((_p, diagram) => { const position = diagram.heading?.position; diagram.heading = { ...(position ? { position } : {}), ...(e.target.value === 'custom' ? { mode: 'custom', text: currentHeading?.lines.join(' ') ?? '' } : { mode: 'auto' }) } })}><option value="auto">Automático según el nivel</option><option value="custom">Personalizado</option></select></label>
            {d.heading?.mode === 'custom' ? <label className="field"><span className="field-label">Título</span><input type="text" aria-label="Título" value={(d.heading.text ?? '').replace(/\s+/g, ' ')} onChange={e => store.command((_p, diagram) => { diagram.heading = { ...diagram.heading, mode: 'custom', text: e.target.value } })} /></label> : <p className="heading-preview">{currentHeading?.lines.join(' ')}</p>}
          </div></Presence>
        </>)}
        {section('canvas', 'Lienzo', <><ColorField label="Color de fondo" value={d.background} onChange={background => store.command((_p, diagram) => { diagram.background = background })} /><label className="toggle-row"><span>Guías y ajuste al mover</span><input aria-label="Guías y ajuste al mover" type="checkbox" checked={d.snap} onChange={e => store.command((_p, diagram) => { diagram.snap = e.target.checked })} /></label></>)}
        {section('stats', 'Contenido', <div className="diagram-stats"><div><strong>{d.nodes.filter(n => n.kind !== 'note').length}</strong><span>Figuras</span></div><div><strong>{d.edges.length}</strong><span>Flujos</span></div></div>, false)}
      </> : <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`}>
        {tab === 'style' && edges.length > 0 && section('route', 'Recorrido de la flecha', <ArrowShapeControls store={store} edges={edges} notify={notify} />)}
        <fieldset className="selection-fields" disabled={locked}>
          {tab === 'style' && <>
            {section('appearance', edge ? 'Trazo de la flecha' : node?.kind === 'note' ? 'Fondo del texto' : 'Trazo y relleno', <>
              {nodes.some(n => n.kind !== 'note') || edges.length ? <>
                <ColorField label={edge ? 'Color de la flecha' : 'Color del borde'} value={stroke} quick onChange={stroke => setStroke({ stroke })} />
                <NumberField label={edge ? 'Grosor de la flecha' : 'Grosor del borde'} value={strokeWidth} min={.5} max={16} step={.25} suffix="px" onChange={strokeWidth => setStroke({ strokeWidth })} />
              </> : <p className="field-help">La fuente y su color se cambian en Texto.</p>}
              {nodes.length > 0 && <ColorField label="Relleno" value={nodes[0].fill} transparent onChange={fill => store.updateNodes(nodes.map(n => n.id), { fill })} />}
            </>)}

          </>}
          {tab === 'text' && <>
            {count === 1 && section('content', edge ? 'Etiqueta del flujo' : 'Contenido', <>
              {node?.kind === 'process' && d.rootLevel !== 0 && <label className="field"><span className="field-label">Número de proceso</span><input aria-label="Número de proceso" value={node.number} onChange={e => store.updateNode(node.id, n => { n.number = e.target.value })} /></label>}
              <label className="field"><span className="field-label">{edge ? 'Nombre del flujo' : node?.kind === 'note' ? 'Texto' : 'Nombre'}</span><textarea aria-label={edge ? 'Nombre del flujo' : node?.kind === 'note' ? 'Texto' : 'Nombre'} value={node?.text ?? edge?.label.text ?? ''} onChange={e => { if (node) store.updateNode(node.id, n => { n.text = e.target.value; if (n.kind === 'process' && d.rootLevel === 0) n.number = '' }); else updateEdge(flow => { flow.label.text = e.target.value }) }} /></label>
            </>)}
            {section('text', 'Fuente y color', <>{mixedFont && <p className="field-help">La selección tiene tipografías distintas. Cambiar una opción la unifica.</p>}<FontControls font={font} onChange={setFont} />{node?.kind === 'process' && <p className="field-help">El número y el nombre comparten el formato.</p>}</>)}
            {edges.length > 0 && section('label-format', 'Disposición del texto', <>
              {edges.length > 1 && <p className="field-help">Aplicar a las {edges.length} flechas seleccionadas.</p>}
              <label className="field"><span className="field-label">Cómo se muestra</span><select aria-label="Disposición del texto" value={edges.some(e=>textMode(e)!==labelMode)?'mixed':labelMode} onChange={evt=>updateLabels(e=>{const mode=evt.target.value;e.label.curved=mode==='curved';e.label.orientation=mode==='curved'?'tangent':mode as DfdEdge['label']['orientation']})}><option value="mixed" disabled>Varias disposiciones</option><option value="horizontal">Horizontal</option><option value="tangent">Inclinado con la flecha</option><option value="curved">Letras sobre la curva</option><option value="manual">Ángulo manual</option></select></label>
              {labelMode==='tangent' && <p className="field-help">El bloque se inclina según el tramo más cercano. Arrastralo para cambiar su posición.</p>}
              {labelMode==='curved' && <><p className="field-help">Las letras y su banda siguen el recorrido. En dobleces cerrados vuelve al bloque inclinado.</p>{edges.length===1 && !editorGeometry.label(labelEdge,d).glyphs.length && <p className="field-help" role="status">Se está mostrando como bloque inclinado para conservar la legibilidad.</p>}</>}
              <Presence show={labelMode==='manual'} kind="vertical"><NumberField label="Ángulo del texto" value={labelEdge.label.angle} min={-360} max={360} suffix="°" onChange={angle=>updateLabels(e=>{e.label.angle=angle})} /></Presence>
              <NumberField label="Ancho máximo del texto" value={labelEdge.label.width} min={24} max={20000} suffix="px" onChange={width=>updateLabels(e=>{e.label.width=width})} />
            </>)}
            {edges.length > 0 && section('label-box','Fondo y marco del texto',<>
              <label className="toggle-row"><span>Fondo del color del lienzo</span><input type="checkbox" checked={labelEdge.label.background} onChange={evt=>updateLabels(e=>{e.label.background=evt.target.checked})} /></label>
              <label className="toggle-row"><span>Marco del color de la flecha</span><input type="checkbox" checked={!!labelEdge.label.borderWidth} onChange={evt=>updateLabels(e=>{e.label.borderWidth=evt.target.checked?1.5:0})} /></label>
              <Presence show={!!labelEdge.label.borderWidth} kind="vertical"><NumberField label="Grosor del marco" value={labelEdge.label.borderWidth??1.5} min={.25} max={16} step={.25} suffix="px" onChange={v=>updateLabels(e=>{e.label.borderWidth=v})} /></Presence>
            </>)}

            {edge && section('label-position', 'Posición del texto', <>
              <label className="field"><span className="field-label range-label">A lo largo de la flecha <span>{Math.round(edge.label.t * 100)}%</span></span><input aria-label="Posición en el flujo" type="range" min="0" max="100" value={edge.label.t * 100} onPointerDown={() => store.beginGesture()} onPointerUp={() => store.endGesture()} onChange={evt => updateEdge(e => { e.label.t = Number(evt.target.value) / 100 })} /></label>
              <div className="field-pair"><NumberField label="Desplazamiento X" value={edge.label.offset.x} onChange={x => updateEdge(e => { e.label.offset.x = x })} /><NumberField label="Desplazamiento Y" value={edge.label.offset.y} onChange={y => updateEdge(e => { e.label.offset.y = y })} /></div>
              <button className="text-button" onClick={() => updateEdge(e => { e.label.t = .5; e.label.offset = { x: 0, y: -16 } })}><RotateCcw size={13} />Centrar texto</button>
            </>, false)}

          </>}
          {tab === 'organize' && <>
            {node && section('dimensions', 'Tamaño y posición', <>
              {node.kind === 'process' ? <NumberField label="Diámetro" value={node.width} min={56} max={20000} suffix="px" onChange={v => setSize('width', v)} /> : <div className="field-pair"><NumberField label="Ancho" value={node.width} min={40} max={20000} suffix="px" onChange={v => setSize('width', v)} /><NumberField label="Alto" value={node.height} min={28} max={20000} suffix="px" onChange={v => setSize('height', v)} /></div>}
              <div className="field-pair"><NumberField label="Posición X" value={node.x} onChange={x => store.updateNode(node.id, n => { n.x = x })} /><NumberField label="Posición Y" value={node.y} onChange={y => store.updateNode(node.id, n => { n.y = y })} /></div>
            </>)}
            {nodes.length > 1 && section('alignment', 'Alinear y distribuir', <div className="alignment-tools">{([['left', ArrowLeftToLine, 'Alinear a la izquierda'], ['center', AlignHorizontalJustifyCenter, 'Alinear al centro'], ['right', ArrowRightToLine, 'Alinear a la derecha'], ['top', ArrowUpToLine, 'Alinear arriba'], ['middle', AlignVerticalJustifyCenter, 'Alinear al medio'], ['bottom', ArrowDownToLine, 'Alinear abajo'], ['distributeX', MoveHorizontal, 'Distribuir horizontalmente'], ['distributeY', MoveVertical, 'Distribuir verticalmente']] as const).map(([mode, Icon, title]) => <button key={mode} title={title} aria-label={title} disabled={mode.startsWith('distribute') && nodes.length < 3} onClick={() => store.align(mode)}><Icon size={17} /></button>)}</div>)}
            {node?.kind === 'process' && !node.inheritedFrom && section('levels', d.rootLevel === 0 ? 'Vincular nivel 1 existente' : 'Vincular especificación existente', <>
              <label className="field"><span className="field-label">Diagrama vinculado</span><select aria-label="Subdiagrama" value={node.childDiagramId ?? ''} onChange={e => store.linkChild(node.id, e.target.value || undefined)}><option value="">Sin vínculo</option>{state.project.diagrams.filter(diagram => diagram.id === node.childDiagramId || canLinkChild(state.project, d.id, diagram.id)).map(diagram => <option key={diagram.id} value={diagram.id}>{diagram.name}</option>)}</select></label>
              <p className="field-help">Para crear uno nuevo, usá el clic derecho sobre el proceso.</p>
            </>, false)}
          </>}
        </fieldset>

      </div>}
      <div hidden={count > 0 && tab !== 'style'}>{section('savedStyles', 'Estilos guardados', <SavedStylesPanel store={store} notify={notify} />)}</div>
    </div>
    {count > 0 && <footer className="inspector-bottom"><button className="danger-button" disabled={locked} onClick={() => store.deleteSelection()}><Trash2 size={14} />Eliminar {count > 1 ? 'selección' : 'elemento'}<kbd>Supr</kbd></button></footer>}
  </aside>
}
