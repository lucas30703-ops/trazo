import type { PointerEvent } from 'react'
import type { Diagram, PertNetwork } from '../model'
import { edgeVisual, labelLayout, polygonPoints } from '../geometry'

export default function PertArt({ network, diagram, selected = [], critical = new Set<string>(), transparentLabels = false, onEvent, onArrow, onLabel }: {
  network: PertNetwork; diagram: Diagram; selected?: string[]; critical?: Set<string>
  transparentLabels?: boolean
  onEvent?: (id: string, e: PointerEvent<SVGGElement>) => void; onArrow?: (id: string, e: PointerEvent<SVGGElement>) => void; onLabel?: (id: string, e: PointerEvent<SVGGElement>) => void
}) {
  return <g data-diagram-content="" fontFamily="Arial" textRendering="geometricPrecision">
    {diagram.edges.map(e => { const visual = edgeVisual(e, diagram), arrow = network.arrows.find(a => a.id === e.id)!, color = critical.has(e.id) ? '#bc513b' : e.stroke, width = critical.has(e.id) ? e.strokeWidth + 1.2 : e.strokeWidth; return <g key={e.id} onPointerDown={event => { if (event.button === 0) { event.stopPropagation(); onArrow?.(e.id, event) } }} style={{ cursor: onArrow ? 'pointer' : undefined }}>
      <title>{e.label.text || 'Actividad ficticia: conserva una precedencia, duración cero'}{critical.has(e.id) ? ' · Camino crítico' : ''}</title>
      <path d={visual.path} stroke="transparent" strokeWidth="16" fill="none" />
      {selected.includes(e.id) && <path d={visual.path} stroke="#df7748" opacity=".23" strokeWidth={width + 8} fill="none" />}
      <path d={visual.path} stroke={color} strokeWidth={width} strokeDasharray={arrow.activityId ? undefined : '7 5'} fill="none" strokeLinecap="round" />
      <polygon points={polygonPoints(visual.head)} fill={color} />
    </g> })}
    {network.events.map(e => <g key={e.id} transform={`translate(${e.x} ${e.y})`} onPointerDown={event => { if (event.button === 0) { event.stopPropagation(); onEvent?.(e.id, event) } }} style={{ cursor: onEvent ? 'move' : undefined }}>
      <circle r="27" fill="#ffffff" stroke={selected.includes(e.id) ? '#df7748' : '#526879'} strokeWidth={selected.includes(e.id) ? 3 : 2} />
      <text textAnchor="middle" dominantBaseline="central" fontSize="16" fontWeight="600" fill="#334553">{e.number}</text>
    </g>)}
    {diagram.edges.filter(e => e.label.text).map(e => { const l = labelLayout(e, diagram); return <g key={e.id} transform={`translate(${l.x} ${l.y}) rotate(${l.angle})`} onPointerDown={event => { if (event.button === 0) { event.stopPropagation(); onLabel?.(e.id, event) } }} style={{ cursor: onLabel ? 'move' : undefined }}>
      <rect x={-l.width / 2} y={-l.height / 2} width={l.width} height={l.height} rx="3" fill={transparentLabels ? 'none' : '#fafaf8'} stroke={selected.includes(e.id) ? '#df7748' : 'none'} />
      <text textAnchor="middle" dominantBaseline="central" fontSize={e.label.font.fontSize} fontWeight="700" fill={critical.has(e.id) ? '#a74431' : '#334553'}>{l.lines.map((line, i) => <tspan key={i} x="0" y={(i - (l.lines.length - 1) / 2) * e.label.font.fontSize * 1.35}>{line}</tspan>)}</text>
    </g> })}
  </g>
}
