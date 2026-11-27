import { Disclosure, Presence } from './motion'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Copy, Paintbrush, Plus, Trash2 } from 'lucide-react'
import type { EditorStore } from './store'
import { projectMode, type DfdMode, type StyleTarget } from './model'
import { screenLines } from './geometry'
import { captureStyle, styleNamesFor, styleRecipients, styleTarget, type StyleParts, type StyleScope, type StyleValues } from './styles'

function Swatch({ style, mode }: { style: StyleValues; mode: DfdMode }) {
  const type = style.target ?? 'edge'
  return <span className="saved-style-swatch" aria-hidden="true">
    <svg viewBox="0 0 60 34" width="60" height="34">
      {type === 'edge' ? <><path d={style.edgeMode === 'orthogonal' ? 'M3 26 H25 V8 H44 V20 H53' : style.edgeMode === 'curve' ? 'M3 26 Q28 -8 53 20' : 'M3 20 H53'} stroke={style.stroke} strokeWidth={style.strokeWidth} fill="none" /><path d="M48 15 L57 20 L48 25 Z" fill={style.stroke} /></>
        : type === 'process' ? <circle cx="30" cy="17" r="14" stroke={style.stroke} strokeWidth={style.strokeWidth} fill={style.fill ?? 'transparent'} />
        : type === 'store' ? <><rect x="5" y="5" width="50" height="24" fill={style.fill ?? 'transparent'} /><path d="M5 5 H55 M5 29 H55" stroke={style.stroke} strokeWidth={style.strokeWidth} /></>
        : type === 'entity' ? <><rect x="5" y="5" width="50" height="24" stroke={style.stroke} strokeWidth={style.strokeWidth} fill={style.fill ?? 'transparent'} />{mode === 'design' && <path d={screenLines(50, 24)} transform="translate(5 5)" stroke={style.stroke} strokeWidth={style.strokeWidth} fill="none" />}</> : null}
    </svg>
    <span style={{ fontFamily: style.font.fontFamily, fontSize: 16, color: style.font.color, fontWeight: style.font.bold ? 700 : 400, fontStyle: style.font.italic ? 'italic' : 'normal' }}>Aa</span>
  </span>
}

export default function SavedStylesPanel({ store, notify }: { store: EditorStore; notify: (message: string) => void }) {
  const { project, selectedIds } = useSyncExternalStore(store.subscribe, store.getSnapshot), diagram = store.diagram
  const mode = projectMode(project) === 'design' ? 'design' : 'analysis', styleNames = styleNamesFor(mode)
  const selected = [...diagram.nodes, ...diagram.edges].filter(element => selectedIds.includes(element.id))
  const sample = selected.length === 1 ? selected[0] : undefined, sampleType = sample ? styleTarget(sample) : undefined
  const [category, setCategory] = useState<StyleTarget>(sampleType ?? 'edge'), [choice, setChoice] = useState<string | null>(null)
  const allOfType = `${category === 'entity' || category === 'store' && mode === 'design' ? 'Todas las' : 'Todos los'} ${styleNames[category].toLowerCase()}`
  const [copied, setCopied] = useState<StyleValues | null>(null), [name, setName] = useState(''), [scope, setScope] = useState<StyleScope>('selection')
  const [parts, setParts] = useState<StyleParts>({ appearance: true, text: true, route: false })
  useEffect(() => { if (sampleType) { setCategory(sampleType); setChoice(null); setScope('selection') } }, [sampleType])
  useEffect(() => { setChoice(null); setCopied(null); setName(''); setScope('selection') }, [project.id])
  const styles = (project.styles ?? []).filter(style => !style.target || style.target === category)
  const picked = choice === 'copy' ? copied : styles.find(style => style.id === choice)
  const active = picked && (!picked.target || picked.target === category) ? { ...picked, target: category } : null
  const recipients = active ? styleRecipients(project, selectedIds, active, { scope }) : []
  const source = sample && sampleType === category ? captureStyle(sample) : null
  const existing = (project.styles ?? []).find(style => style.target === category && style.name.toLocaleLowerCase('es') === name.trim().toLocaleLowerCase('es'))
  const setPart = (part: keyof StyleParts, checked: boolean) => setParts(previous => ({ ...previous, [part]: checked }))
  const changeCategory = (value: StyleTarget) => { setCategory(value); setChoice(null); setScope('selection'); setName('') }
  const apply = () => {
    if (!active) return
    store.endGesture()
    const count = store.applyStyle(active, { scope, parts })
    notify(`Estilo aplicado a ${count} elementos. Podés deshacerlo con Ctrl + Z.`)
  }
  return <div className="saved-styles-panel">
    <label className="field"><span className="field-label">Tipo de elemento</span><select aria-label="Tipo de estilos" value={category} onChange={event => changeCategory(event.target.value as StyleTarget)}>{Object.entries(styleNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <div className="saved-style-list" aria-label={`Estilos de ${styleNames[category].toLowerCase()}`}>
      {copied?.target === category && <button className={`saved-style-card${choice === 'copy' ? ' active' : ''}`} aria-pressed={choice === 'copy'} onClick={() => setChoice('copy')}><Swatch mode={mode} style={copied} /><span><strong>Muestra copiada</strong><small>{copied.font.fontFamily} · {copied.font.fontSize} px</small></span></button>}
      {styles.map(style => <div className="saved-style-entry" key={style.id}>
        <button className={`saved-style-card${choice === style.id ? ' active' : ''}`} aria-pressed={choice === style.id} onClick={() => { setChoice(style.id); setName(style.name) }}><Swatch mode={mode} style={{ ...style, target: category }} /><span><strong>{style.name}</strong><small>{!style.target ? 'Anterior · ' : ''}{style.font.fontFamily} · {style.font.fontSize} px{style.font.bold ? ' · Negrita' : ''}</small></span></button>
        <button className="icon-button" title="Eliminar estilo guardado" aria-label={`Eliminar estilo ${style.name}`} onClick={() => { store.endGesture(); store.command(p => { p.styles = p.styles?.filter(s => s.id !== style.id) }); if (choice === style.id) setChoice(null) }}><Trash2 size={13} /></button>
      </div>)}
      {!styles.length && copied?.target !== category && <p className="field-help">Todavía no hay estilos para este tipo. Guardá una muestra desde un elemento seleccionado.</p>}
    </div>
    <Presence show={!!active}><div className="saved-style-application">{active && <>
      <label className="field"><span className="field-label">Aplicar a</span><select aria-label="Alcance del estilo" value={scope} onChange={event => setScope(event.target.value as StyleScope)}><option value="selection">Selección actual</option><option value="diagram">{allOfType} de este diagrama</option><option value="project">{allOfType} del proyecto</option></select></label>
      <label className="toggle-row"><span>{category === 'entity' || category === 'process' ? 'Trazo, relleno y tamaño' : category === 'edge' ? 'Trazo, fondo y marco' : 'Trazo y relleno'}</span><input type="checkbox" checked={parts.appearance} onChange={event => setPart('appearance', event.target.checked)} /></label>
      <label className="toggle-row"><span>Texto y tipografía</span><input type="checkbox" checked={parts.text} onChange={event => setPart('text', event.target.checked)} /></label>
      {category === 'edge' && active.edgeMode && <label className="toggle-row"><span>Tipo de flujo: {active.edgeMode === 'orthogonal' ? 'a 90°' : active.edgeMode === 'curve' ? 'curvo' : 'recto'}</span><input type="checkbox" checked={parts.route} onChange={event => setPart('route', event.target.checked)} /></label>}
      <p className="field-help">Texto incluye fuente, tamaño, color, negrita y alineación{category === 'edge' ? ', además del ancho, orientación y curvado de la etiqueta' : ''}. No copia nombres, posiciones ni puntos de las curvas.</p>
      <button className="secondary-button compact style-apply-all" disabled={!recipients.length || (!parts.appearance && !parts.text && !(parts.route && category === 'edge' && active.edgeMode))} onClick={apply}><Paintbrush size={14} />Aplicar a {recipients.length} {recipients.length === 1 ? 'elemento' : 'elementos'}</button>
      <p className="field-help">Solo {styleNames[category].toLowerCase()}; los elementos bloqueados se omiten. Un solo paso para deshacer.</p>
    </>}</div></Presence>
    <Disclosure className="inspector-details style-sample" defaultOpen={!styles.length} title="Guardar o copiar una muestra">
      {source ? <><p className="field-help">Muestra: {'kind' in sample! ? sample!.text : sample!.label.text || 'Flujo sin etiqueta'}. Incluye trazo y texto.</p>
        <button className="secondary-button compact" onClick={() => { setCopied(source); setChoice('copy'); notify('Estilo de trazo y texto copiado para este tipo de elemento.') }}><Copy size={13} />Copiar estilo de la muestra</button>
        <form className="style-save" onSubmit={event => { event.preventDefault(); if (!name.trim()) return; store.endGesture(); store.saveStyle(name, source); notify(existing ? 'Estilo actualizado con la muestra. Aplicalo para cambiar elementos.' : 'Estilo guardado con trazo y texto.'); setName('') }}><input aria-label="Nombre del estilo favorito" placeholder="Nombre del estilo" value={name} onChange={event => setName(event.target.value)} maxLength={100} /><button className="icon-button" aria-label={existing ? 'Actualizar estilo con la muestra' : 'Guardar estilo favorito'} title={existing ? 'Actualizar estilo con la muestra' : 'Guardar estilo favorito'} type="submit" disabled={!name.trim()}><Plus size={15} /></button></form>
        {existing && <p className="field-help">El estilo «{existing.name}» se actualizará con esta muestra. Los elementos cambian solo al aplicar.</p>}
      </> : <p className="field-help">Seleccioná un único elemento de este tipo para usarlo como muestra.</p>}
    </Disclosure>
  </div>
}
