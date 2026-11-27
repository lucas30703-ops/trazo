import { useEffect, useRef, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic } from 'lucide-react'
import { palette, type TextStyle } from './model'
import { clamp } from './geometry'

export function NumberField({ label, value, onChange, min = -100000, max = 100000, step = 1, suffix }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100)), focused = useRef(false)
  useEffect(() => { if (!focused.current) setDraft(String(Math.round(value * 100) / 100)) }, [value])
  return <label className="number-field"><span>{label}</span><div><input aria-label={label} type="number" value={draft} min={min} max={max} step={step} onFocus={() => { focused.current = true }} onBlur={() => { focused.current = false; const n = draft.trim() === '' ? value : Number(draft); const next = Number.isFinite(n) ? clamp(n, min, max) : value; setDraft(String(Math.round(next * 100) / 100)); onChange(next) }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} onChange={e => { setDraft(e.target.value); const n = e.target.valueAsNumber; if (Number.isFinite(n) && n >= min && n <= max) onChange(n) }} />{suffix && <span>{suffix}</span>}</div></label>
}
export function ColorField({ label, value, onChange, transparent = false, quick = false }: { label: string; value: string; onChange: (color: string) => void; transparent?: boolean; quick?: boolean }) {
  return <div className="color-field"><span className="field-label">{label}</span><div className="color-input"><span className="color-preview" style={{ background: value }} /><input aria-label={label} type="color" value={value === 'transparent' ? '#ffffff' : value} onChange={e => onChange(e.target.value)} /><span className="color-code">{value === 'transparent' ? 'Sin relleno' : value.toUpperCase()}</span>{transparent && <button className="clear-color" aria-label={`Quitar ${label.toLowerCase()}`} title="Transparente" onClick={() => onChange('transparent')}>∅</button>}</div>{quick && <div className="swatch-row" aria-label={`Colores para ${label.toLowerCase()}`}>{palette.map(color => <button key={color.value} aria-label={`${label}: ${color.name}`} title={color.name} aria-pressed={value.toLowerCase() === color.value} className={`swatch ${value.toLowerCase() === color.value ? 'selected' : ''}`} style={{ backgroundColor: color.value }} onClick={() => onChange(color.value)} />)}</div>}</div>
}
export function FontControls({ font, onChange }: { font: TextStyle; onChange: (patch: Partial<TextStyle>) => void }) {
  return <>
    <label className="field"><span className="field-label">Tipografía</span><select aria-label="Tipografía" value={font.fontFamily} onChange={e => onChange({ fontFamily: e.target.value })}><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Courier New</option></select></label>
    <div className="type-row"><NumberField label="Tamaño de texto" value={font.fontSize} min={6} max={120} onChange={fontSize => onChange({ fontSize })} /><div className="button-group"><button aria-pressed={font.bold} aria-label="Negrita" title="Negrita" className={font.bold ? 'active' : ''} onClick={() => onChange({ bold: !font.bold })}><Bold size={15} /></button><button aria-pressed={font.italic} aria-label="Cursiva" title="Cursiva" className={font.italic ? 'active' : ''} onClick={() => onChange({ italic: !font.italic })}><Italic size={15} /></button></div></div>
    <div className="button-group align-group">{([['left', AlignLeft, 'Alinear texto a la izquierda'], ['center', AlignCenter, 'Centrar texto'], ['right', AlignRight, 'Alinear texto a la derecha']] as const).map(([align, Icon, title]) => <button key={align} aria-pressed={font.align === align} className={font.align === align ? 'active' : ''} title={title} aria-label={title} onClick={() => onChange({ align })}><Icon size={16} /></button>)}</div>
    <ColorField label="Color del texto" value={font.color} onChange={color => onChange({ color })} />
  </>
}
