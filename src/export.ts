import { diagramBounds, edgeVisual, headingLayout, labelLayout, nodeTextLayout, polygonPoints, processNumberStyle, screenLines } from './geometry'
import type { Diagram, TextStyle } from './model'
import { nodeForDiagram } from './model'
import { downloadBlob, safeFilename } from './persistence'
import { analyzeFlowReadability } from './flowReadability'
import { flowEndMark, flowEndMarkPath } from './geometry'

export interface ExportOptions { format: 'png' | 'jpg' | 'svg'; scale: number; padding: number; background: 'diagram' | 'white' | 'transparent'; grid: boolean; includeTitle?: boolean; selection?: string[] }
export const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
function renderText(lines: string[], x: number, y: number, f: TextStyle) {
  return `<text fill="${f.color}" font-family="${escapeXml(f.fontFamily)}" font-size="${f.fontSize}" font-weight="${f.bold ? 'bold' : 'normal'}" font-style="${f.italic ? 'italic' : 'normal'}" text-anchor="${f.align === 'left' ? 'start' : f.align === 'right' ? 'end' : 'middle'}" dominant-baseline="central">${lines.map((line, i) => `<tspan x="${x}" y="${y + (i - (lines.length - 1) / 2) * f.fontSize * 1.35}">${escapeXml(line)}</tspan>`).join('')}</text>`
}
export function renderDiagramSvg(d: Diagram, options: ExportOptions) {
  const bounds = diagramBounds(d, options.selection, options.includeTitle !== false), pad = options.padding, x = bounds.x - pad, y = bounds.y - pad, width = Math.ceil(bounds.width + pad * 2), height = Math.ceil(bounds.height + pad * 2)
  const ids = options.selection ? new Set(options.selection) : null
  const nodes = d.nodes.filter(n => !ids || ids.has(n.id)), edges = d.edges.filter(e => !ids || ids.has(e.id) || (ids.has(e.source.nodeId) && ids.has(e.target.nodeId)))
  let background = options.background === 'diagram' ? d.background : options.background === 'white' ? '#ffffff' : 'transparent'
  if (options.format === 'jpg' && background === 'transparent') background = '#ffffff'
  const cuts = d.flowCrossings === false ? undefined : analyzeFlowReadability({ ...d, edges }).paths
  const visuals = edges.map(e => ({ e, visual: edgeVisual(e, d) }))
  const edgeSvg = visuals.map(({ e, visual }) => `<path d="${cuts?.get(e.id) ?? visual.path}" fill="none" stroke="${e.stroke}" stroke-width="${e.strokeWidth}" stroke-linecap="round"/>`).join('')
  const arrows = visuals.map(({ e, visual }) => {
    const mark = flowEndMarkPath(flowEndMark(e, d, visual))
    return `<polygon points="${polygonPoints(visual.head)}" fill="${e.stroke}"/>` +
      (mark ? `<path d="${mark}" fill="none" stroke="${e.stroke}" stroke-width="${e.strokeWidth}" stroke-linecap="round"/>` : '')
  }).join('')
  const nodeSvg = nodes.map(raw => {
    const n = nodeForDiagram(raw, d)
    const body = n.kind === 'process' ? `<circle cx="${n.width / 2}" cy="${n.height / 2}" r="${n.width / 2}" fill="${n.fill}" stroke="${n.stroke}" stroke-width="${n.strokeWidth}"/>` : `<rect width="${n.width}" height="${n.height}" fill="${n.fill}" stroke="${n.kind === 'entity' ? n.stroke : 'none'}" stroke-width="${n.strokeWidth}"/>`
    const bars = n.kind === 'store' ? `<path d="M0 0 H${n.width} M0 ${n.height} H${n.width}" fill="none" stroke="${n.stroke}" stroke-width="${n.strokeWidth}" stroke-linecap="round"/>` : ''
    const separators = d.mode === 'design' && n.kind === 'entity' ? `<path d="${screenLines(n.width, n.height)}" fill="none" stroke="${n.stroke}" stroke-width="${n.strokeWidth}"/>` : ''
    const t = nodeTextLayout(n, d.mode), number = n.kind === 'process' && n.number ? renderText([n.number], n.width / 2, n.height * .28, processNumberStyle(n)) : ''
    return `<g transform="translate(${n.x} ${n.y})">${body}${bars}${separators}${number}${renderText(t.lines, t.x, t.centerY, n.font)}</g>`
  }).join('')
  const labels = edges.filter(e => e.label.text).map(e => {
    const l = labelLayout(e, d), f=e.label.font
    const frameStyle=`fill="${e.label.background ? background==='transparent'?'#ffffff':background : 'none'}" stroke="${e.label.borderWidth ? e.stroke : 'none'}" stroke-width="${e.label.borderWidth??0}" stroke-linejoin="round"`
    const frame = e.label.background || e.label.borderWidth ? l.framePath ? `<path d="${l.framePath}" ${frameStyle}/>` : `<rect x="${-l.width/2}" y="${-l.height/2}" width="${l.width}" height="${l.height}" rx="3" ${frameStyle}/>` : ''
    const text = l.glyphs.length ? `<g fill="${f.color}" font-family="${escapeXml(f.fontFamily)}" font-size="${f.fontSize}" font-weight="${f.bold?'bold':'normal'}" font-style="${f.italic?'italic':'normal'}" text-anchor="middle" dominant-baseline="central">${l.glyphs.map(g=>`<text xml:space="preserve" transform="translate(${g.x} ${g.y}) rotate(${g.angle})">${escapeXml(g.text)}</text>`).join('')}</g>` : renderText(l.lines, f.align==='left'?-l.width/2+8:f.align==='right'?l.width/2-8:0,0,f)
    return `<g transform="translate(${l.x} ${l.y}) rotate(${l.angle})">${frame}${text}</g>`
  }).join('')
  const h = options.selection || options.includeTitle === false ? null : headingLayout(d), heading = h ? renderText(h.lines, h.x + h.width / 2, h.y + h.height / 2, h.font) : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}"><title>${escapeXml(d.name)}</title><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${background}"/>${options.grid ? `<defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r=".8" fill="#abb3b9" opacity=".4"/></pattern></defs><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#grid)"/>` : ''}<g data-diagram-content="">${edgeSvg}${nodeSvg}${arrows}${labels}${heading}</g></svg>`
  return { svg, width, height }
}
export async function diagramBlob(d: Diagram, options: ExportOptions): Promise<Blob> {
  await document.fonts.ready
  const { svg, width, height } = renderDiagramSvg(d, options)
  if (options.format === 'svg') return new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const w = Math.round(width * options.scale), h = Math.round(height * options.scale)
  if (w > 16384 || h > 16384 || w * h > 64_000_000) throw new Error('La imagen es muy grande para exportarla. Elegí una escala menor o exportá como SVG.')
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const img = new Image(); img.src = url; await img.decode()
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('No se pudo crear la imagen. Probá exportar como SVG.')
    if (options.format === 'jpg') { ctx.fillStyle = options.background === 'diagram' && d.background !== 'transparent' ? d.background : '#ffffff'; ctx.fillRect(0, 0, w, h) }
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('No se pudo generar la imagen.')), options.format === 'png' ? 'image/png' : 'image/jpeg', .95))
    return blob
  } finally { URL.revokeObjectURL(url) }
}
export async function exportDiagram(d: Diagram, options: ExportOptions, name: string) { downloadBlob(await diagramBlob(d, options), `${safeFilename(name)}.${options.format}`) }
