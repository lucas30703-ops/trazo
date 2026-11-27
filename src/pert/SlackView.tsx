import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '../Dialogs'
import type { PertAnalysis, ActivityResult } from './logic'
import { formatTime } from './logic'
import SlackBlock, { slackMetrics } from './SlackBlock'
import SlackMenu from './SlackMenu'

export function CriticalPaths({ analysis, chosen, onChoose }: { analysis: PertAnalysis; chosen: number | null; onChoose: (index: number | null) => void }) {
  const byId = new Map(analysis.results.map(r => [r.id, r.code]))
  return <section className="pert-paths"><h3>Caminos críticos <span>{analysis.pathCount}</span></h3><button className={`secondary-button${chosen === null ? ' active' : ''}`} onClick={() => onChoose(null)}>Resaltar todos</button><div className="pert-path-list">{analysis.paths.map((path, i) => <button key={i} aria-pressed={chosen === i} className={chosen === i ? 'active' : ''} onClick={() => onChoose(i)}>{path.map(id => byId.get(id)).join(' → ')}</button>)}</div>{BigInt(analysis.pathCount) > BigInt(analysis.paths.length) && <p className="field-help">Se muestran los primeros {analysis.paths.length} recorridos de {analysis.pathCount}. Se resaltan todos al elegir «Resaltar todos».</p>}</section>
}
export default function SlackView({ analysis, decimals, unit, selected, active, onSelect, onLocate, onRow }: { analysis: PertAnalysis; decimals: number; unit: string; selected?: string; active: boolean; onSelect: (id: string) => void; onLocate: (id: string) => void; onRow: (id: string) => void }) {
  const [filter, setFilter] = useState('all'), [detail, setDetail] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null), buttons = useRef(new Map<string, HTMLButtonElement>())
  const metrics = useMemo(() => slackMetrics(analysis.results, decimals), [analysis, decimals])
  const menuResult = analysis.results.find(r => r.id === menu?.id), detailResult = analysis.results.find(r => r.id === detail)
  useEffect(() => { if (!active) { setMenu(null); setDetail(null) } }, [active])
  const openMenu = (id: string, x: number, y: number) => { onSelect(id); setMenu({ id, x, y }) }
  const closeMenu = (restore = true) => { const id = menu?.id; setMenu(null); if (restore && id) requestAnimationFrame(() => buttons.current.get(id)?.focus({ preventScroll: true })) }
  const closeDetail = () => { const id = detail; setDetail(null); if (id) requestAnimationFrame(() => buttons.current.get(id)?.focus({ preventScroll: true })) }
  const f = (n: number) => formatTime(n, decimals), byId = new Map(analysis.results.map(r => [r.id, r]))
  const formula = (r: ActivityResult) => <div className="pert-formula"><p>Inicio temprano = {r.predecessors.length ? `máximo de ${r.predecessors.map(id => `${byId.get(id)!.code}: ${f(byId.get(id)!.earlyFinish)}`).join('; ')}` : '0, sin predecesores'} = {f(r.earlyStart)}</p><p>Fin temprano = {f(r.earlyStart)} + {f(r.expected)} = {f(r.earlyFinish)}</p><p>Fin tardío = {r.successors.length ? `mínimo de ${r.successors.map(id => `${byId.get(id)!.code}: ${f(byId.get(id)!.lateStart)}`).join('; ')}` : `duración del proyecto: ${f(analysis.duration)}`} = {f(r.lateFinish)}</p><p>Inicio tardío = {f(r.lateFinish)} − {f(r.expected)} = {f(r.lateStart)}</p><p>Holgura total = {f(r.lateStart)} − {f(r.earlyStart)} = {f(r.float)}</p><small>Las operaciones usan precisión completa; estos valores se muestran redondeados.</small></div>
  return <div className="pert-slack-view"><div className="pert-view-heading"><div><h1>Holguras y caminos críticos</h1><p>Duración esperada: <strong>{f(analysis.duration)} {unit}</strong>. Holgura total por actividad.</p></div><select aria-label="Filtrar actividades" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todas</option><option value="critical">Críticas</option><option value="float">Con holgura</option></select></div>
    <p className="pert-legend">Arriba: inicio / fin temprano. Abajo: inicio / fin tardío. A la derecha: holgura total.<br />Clic derecho en un bloque para ver sus opciones.</p>
    <div className="pert-slack-grid" style={{ gridTemplateColumns: `repeat(auto-fill, ${metrics.width + 26}px)` }}>{analysis.results.filter(r => filter === 'all' || (filter === 'critical' ? r.critical : !r.critical)).map(r => <button key={r.id} ref={node => { if (node) buttons.current.set(r.id, node); else buttons.current.delete(r.id) }} type="button" className={`pert-slack-block${selected === r.id ? ' selected' : ''}`} aria-pressed={selected === r.id} aria-haspopup="menu" aria-expanded={menu?.id === r.id}
      aria-label={`Actividad ${r.code}. Inicio temprano ${f(r.earlyStart)}, fin temprano ${f(r.earlyFinish)}, inicio tardío ${f(r.lateStart)}, fin tardío ${f(r.lateFinish)}. Holgura ${f(r.float)} ${unit}.${r.critical ? ' Crítica.' : ''} Clic derecho o Mayús+F10 para opciones.`}
      onClick={e => { onSelect(r.id); if (e.detail === 0) { const rect = e.currentTarget.getBoundingClientRect(); openMenu(r.id, rect.left + 12, rect.bottom) } }}
      onContextMenu={e => { e.preventDefault(); openMenu(r.id, e.clientX, e.clientY) }} onKeyDown={e => { if (e.key === 'ContextMenu' || e.key === 'F10' && e.shiftKey) { e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); openMenu(r.id, rect.left + 12, rect.bottom) } }}>
      <svg width={metrics.width} height={metrics.height} viewBox={`0 0 ${metrics.width} ${metrics.height}`} aria-hidden="true"><SlackBlock result={r} decimals={decimals} metrics={metrics} /></svg>
    </button>)}</div>{!analysis.results.length && <p className="pert-empty-note">Completá la tabla para calcular holguras y caminos críticos.</p>}
    {active && menu && menuResult && <SlackMenu code={menuResult.code} position={menu} onClose={closeMenu} onExplain={() => setDetail(menuResult.id)} onLocate={() => onLocate(menuResult.id)} onRow={() => onRow(menuResult.id)} />}
    {active && detailResult && <Modal title={`Cálculo de la actividad ${detailResult.code}`} subtitle={`Tiempos en ${unit} · Holgura total: ${f(detailResult.float)}${detailResult.critical ? ' · Crítica' : ''}`} onClose={closeDetail}>{formula(detailResult)}<footer className="modal-footer"><button className="secondary-button" onClick={closeDetail}>Cerrar</button></footer></Modal>}
  </div>
}
