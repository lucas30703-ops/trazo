import { renderToStaticMarkup } from 'react-dom/server'
import type { PertData } from '../model'
import { defaultFont } from '../model'
import { wrapText } from '../geometry'
import PertArt from './PertArt'
import SlackBlock, { slackMetrics } from './SlackBlock'
import { activityColumns } from './ActivityTable'
import { analyze, estimates, formatTime } from './logic'
import { pertBounds, pertDiagram, criticalArrowIds } from './geometry'

export type PertView = 'table' | 'diagram' | 'slack'
export function renderPertSvg(data: PertData, name: string, view: PertView, highlight: boolean, pathIndex: number | null, showTime = true, transparent = false, slackColumns = 3, includeTitle = true, includeInfo = true, includePaths = true) {
  const f = (n: number) => formatTime(n, data.decimals), analysis = analyze(data.activities)
  if (analysis.issues.length || !data.activities.length) throw new Error('Corregí la tabla antes de exportar resultados.')
  if (view === 'diagram') {
    if (!data.network || data.network.signature !== analysis.signature) throw new Error('Actualizá el diagrama antes de exportarlo.')
    const network = { ...data.network, source: data.activities }, b = pertBounds(network, data.decimals, showTime), width = Math.ceil(b.width), title = wrapText(`${name} · PERT (${data.unit})`, width - 40, { ...defaultFont, fontSize: 18 }), header = includeTitle ? title.length * 24 + 25 : 0, height = Math.ceil(b.height + header)
    return { width, height, svg: renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`${b.x} ${b.y - header} ${width} ${height}`}>{!transparent && <rect x={b.x} y={b.y - header} width={width} height={height} fill="#fafaf8" />}{includeTitle && <text x={b.x + 20} y={b.y - header + 27} fontFamily="Arial" fontSize="18" fill="#334553">{title.map((line, i) => <tspan key={i} x={b.x + 20} dy={i ? 24 : 0}>{line}</tspan>)}</text>}<PertArt network={network} diagram={pertDiagram(network, data.decimals, showTime)} transparentLabels={transparent} critical={highlight ? criticalArrowIds(network, analysis, pathIndex === null ? undefined : analysis.paths[pathIndex]) : undefined} /></svg>) }
  }
  if (view === 'table') {
    const widths = [140, 250, 120, 120, 120, 130, 130], offsets = widths.map((_, i) => 25 + widths.slice(0, i).reduce((a, b) => a + b, 0)), width = widths.reduce((a, b) => a + b, 0) + 50
    const rows = data.activities.map(a => { const result = estimates(a)!; return [a.code, a.predecessors || 'Ninguno', a.pessimistic, a.normal, a.optimistic, f(result.expected), formatTime(result.variance, Math.min(8, data.decimals + 2))].map((text, i) => wrapText(text, widths[i] - 20, { ...defaultFont, fontSize: 14 })) })
    const heights = rows.map(cells => Math.max(38, Math.max(...cells.map(lines => lines.length)) * 19 + 16)), height = 120 + heights.reduce((a, b) => a + b, 0)
    return { width, height, svg: renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} fontFamily="Arial" fontSize="14" fill="#334553"><rect width={width} height={height} fill="white" /><text x="25" y="32" fontSize="20">{name} · Tabla de actividades</text><text x="25" y="55">Tiempos en {data.unit} · Varianza en {data.unit}²</text>{activityColumns.map((c, i) => <g key={c}><rect x={offsets[i]} y="70" width={widths[i]} height="42" fill="#eaf0e7" stroke="#b9c5b6" /><text x={offsets[i] + 10} y="96" fontWeight="bold">{c}</text></g>)}{rows.map((cells, r) => { const y = 112 + heights.slice(0, r).reduce((a, b) => a + b, 0); return <g key={r}>{cells.map((lines, c) => <g key={c}><rect x={offsets[c]} y={y} width={widths[c]} height={heights[r]} fill={r % 2 ? '#f7f8f5' : '#fff'} stroke="#d8dfd4" />{lines.map((line, l) => <text key={l} x={offsets[c] + 10} y={y + 23 + l * 19}>{line}</text>)}</g>)}</g>})}</svg>) }
  }
  const metrics = slackMetrics(analysis.results, data.decimals), gap = 40, columns = Math.max(1, Math.min(analysis.results.length, Math.floor(slackColumns) || 1))
  const width = Math.max(includeTitle || includeInfo || includePaths ? 1000 : 0, 50 + columns * metrics.width + (columns - 1) * gap), title = wrapText(name + ' · Holguras y caminos críticos', width - 50, { ...defaultFont, fontSize: 20 })
  const titleHeight = includeTitle ? title.length * 26 : 0, gridY = 25 + titleHeight + (includeInfo ? 65 : 0), blocksHeight = Math.ceil(analysis.results.length / columns) * (metrics.height + 40) - 40
  const paths = includePaths ? analysis.paths.map(path => wrapText(path.map(id => analysis.results.find(r => r.id === id)!.code).join(' → '), width - 50, defaultFont)) : []
  const pathsY = gridY + blocksHeight + 40, height = includePaths ? pathsY + 50 + paths.reduce((n, lines) => n + lines.length * 19 + 12, 0) : gridY + blocksHeight + 25
  let pathY = pathsY + 35
  return { width, height, svg: renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} fontFamily="Arial" fill="#334553">
    {!transparent && <rect width={width} height={height} fill="#fafaf8" />}
    {includeTitle && <text x="25" y="32" fontSize="20">{title.map((line, i) => <tspan key={i} x="25" dy={i ? 26 : 0}>{line}</tspan>)}</text>}
    {includeInfo && <><text x="25" y={titleHeight + 30} fontSize="14">Duración esperada: {f(analysis.duration)} {data.unit} · Holgura total = inicio tardío - inicio temprano</text>
    <text x="25" y={titleHeight + 56} fontSize="12">Arriba: inicio / fin temprano. Abajo: inicio / fin tardío. A la derecha: = holgura ({data.unit}).</text></>}
    {analysis.results.map((r, i) => <g key={r.id} transform={`translate(${25 + i % columns * (metrics.width + gap)} ${gridY + Math.floor(i / columns) * (metrics.height + 40)})`}><SlackBlock result={r} decimals={data.decimals} metrics={metrics} /></g>)}
    {includePaths && <text x="25" y={pathsY} fontSize="16">Caminos críticos: {analysis.pathCount}{BigInt(analysis.pathCount) > BigInt(paths.length) ? ` (primeros ${paths.length})` : ''}</text>}
    {paths.map((lines, i) => { const y = pathY; pathY += lines.length * 19 + 12; return <text key={i} x="25" y={y} fontSize="14">{lines.map((line, j) => <tspan key={j} x="25" dy={j ? 19 : 0}>{line}</tspan>)}</text> })}
  </svg>) }
}
export async function pertBlob(art: ReturnType<typeof renderPertSvg>, format: 'svg' | 'png' | 'jpg') {
  const blob = new Blob([art.svg], { type: 'image/svg+xml' })
  if (format === 'svg') return blob
  if (art.width > 16384 || art.height > 16384 || art.width * art.height > 64000000) throw new Error('El resultado es demasiado grande para PNG/JPG. Exportalo como SVG.')
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image(); image.src = url; await image.decode()
    const scale = art.width * 2 <= 16384 && art.height * 2 <= 16384 && art.width * art.height * 4 <= 64000000 ? 2 : 1
    const canvas = document.createElement('canvas'); canvas.width = art.width * scale; canvas.height = art.height * scale
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('No se pudo crear la imagen.'); ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo exportar.')), format === 'png' ? 'image/png' : 'image/jpeg', .95))
  } finally { URL.revokeObjectURL(url) }
}
