import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ListFilter, Plus, Trash2 } from 'lucide-react'
import type { PertActivity } from '../model'
import { estimates, formatTime, type ActivityField, type PertIssue } from './logic'

export const activityColumns = ['Actividad', 'Predecesor', 'T. pesimista', 'T. normal', 'T. optimista', 'T. esperado', 'Varianza']
const fields: ActivityField[] = ['code', 'predecessors', 'pessimistic', 'normal', 'optimistic']
function Cell({ value, label, error, numeric, onCommit, onDraft, onBegin, onEnd, onCancel, onKeyDown }: { value: string; label: string; error?: string; numeric: boolean; onCommit: (value: string, original: string) => void; onDraft?: (value: string) => void; onBegin?: () => void; onEnd?: () => void; onCancel?: () => void; onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void }) {
  const [draft, setDraft] = useState(value), original = useRef(value), latest = useRef(value), editing = useRef(false)
  useEffect(() => { latest.current = value; setDraft(value) }, [value])
  return <input aria-label={label} aria-invalid={!!error} title={error} value={draft} inputMode={numeric ? 'decimal' : 'text'} spellCheck={false} maxLength={numeric ? 64 : label.startsWith('Predecesor') ? 4000 : 32}
    onFocus={() => { original.current = value; editing.current = true; onBegin?.() }} onChange={e => { latest.current = e.target.value; setDraft(e.target.value); onDraft?.(e.target.value) }} onBlur={() => { if (!editing.current) return; editing.current = false; onCommit(latest.current, original.current); onEnd?.() }} onKeyDown={e => { if (e.key === 'Escape') { editing.current = false; latest.current = original.current; setDraft(original.current); if (onCancel) onCancel(); else { onDraft?.(original.current); onEnd?.() }; e.currentTarget.blur(); return } onKeyDown(e) }} />
}
export default function ActivityTable({ rows, decimals, issues = [], selected, readOnly = false, onCommit, onDraft, onBegin, onEnd, onCancel, onAdd, onDelete, onSelect, onPick, onPaste }: {
  rows: PertActivity[]; decimals: number; issues?: PertIssue[]; selected?: string; readOnly?: boolean
  onCommit?: (id: string, field: ActivityField, value: string, original?: string) => void; onDraft?: (id: string, field: ActivityField, value: string) => void; onBegin?: () => void; onEnd?: () => void; onCancel?: () => void; onAdd?: (after?: string) => void; onDelete?: (id: string) => void; onSelect?: (id: string) => void; onPick?: (id: string) => void; onPaste?: (text: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => { if (selected) host.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [selected])
  const enter = (e: KeyboardEvent<HTMLInputElement>, index: number, field: ActivityField) => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const inputs = Array.from(host.current?.querySelectorAll<HTMLInputElement>('tbody input') ?? []), target = inputs[inputs.indexOf(e.currentTarget) + (e.shiftKey ? -1 : 1)]
      if (target) { e.preventDefault(); target.focus() }
      else if (!e.shiftKey) { e.preventDefault(); host.current?.querySelector<HTMLButtonElement>('.pert-add-row')?.focus() }
      return
    }
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault(); e.currentTarget.blur()
    const next = host.current?.querySelectorAll<HTMLTableRowElement>('tbody tr')[index + 1]?.querySelectorAll<HTMLInputElement>('input')[fields.indexOf(field)]
    if (next) next.focus(); else onAdd?.(rows[index].id)
  }
  return <div className="pert-table-scroll" ref={host} onPaste={readOnly ? undefined : e => { const text = e.clipboardData.getData('text'); if (text.includes('\t') || text.includes('\n')) { e.preventDefault(); if (e.target instanceof HTMLElement) e.target.blur(); onPaste?.(text) } }}>
    <table className={`pert-table${readOnly ? ' readonly' : ''}`}><caption className="sr-only">Estimaciones PERT. Tiempo esperado y varianza calculados por actividad.</caption><thead><tr>{activityColumns.map(c => <th scope="col" key={c}>{c}</th>)}{!readOnly && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr></thead>
      <tbody>{rows.map((a, index) => { const computed = estimates(a); return <tr key={a.id} data-row-id={a.id} className={selected === a.id ? 'selected' : ''} onFocus={() => onSelect?.(a.id)} onClick={() => onSelect?.(a.id)}>
        {fields.map(field => { const error = issues.find(i => i.id === a.id && i.field === field)?.message; return <td key={field} data-field={field} className={error ? 'invalid' : ''}>{readOnly ? field === 'predecessors' ? a[field] || 'Ninguno' : a[field] || '—' : <div className="pert-cell"><Cell value={a[field]} numeric={!['code', 'predecessors'].includes(field)} label={`${activityColumns[fields.indexOf(field)]} · ${a.code || index + 1}`} error={error} onBegin={onBegin} onEnd={onEnd} onCancel={onCancel} onDraft={value => onDraft?.(a.id, field, value)} onCommit={(value, original) => onCommit?.(a.id, field, value, original)} onKeyDown={e => enter(e, index, field)} />{field === 'predecessors' && <button className="icon-button" aria-label={`Elegir predecesores de ${a.code}`} title="Elegir predecesores" onClick={() => onPick?.(a.id)}><ListFilter size={14} /></button>}</div>}</td> })}
        <td className="pert-result">{computed ? formatTime(computed.expected, decimals) : '—'}</td><td className="pert-result">{computed ? formatTime(computed.variance, Math.min(8, decimals + 2)) : '—'}</td>
        {!readOnly && <td><button className="icon-button" aria-label={`Eliminar actividad ${a.code}`} onClick={() => onDelete?.(a.id)}><Trash2 size={15} /></button></td>}
      </tr> })}</tbody>
    </table>{!rows.length && <p className="pert-empty-note">Agregá tu primera actividad para comenzar.</p>}{!readOnly && <button className="pert-add-row" disabled={rows.length >= 400} onClick={() => onAdd?.()}><Plus size={16} />Agregar actividad</button>}
  </div>
}
