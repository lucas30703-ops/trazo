import { defaultFont } from '../model'
import { textWidth } from '../geometry'
import { formatTime, type ActivityResult } from './logic'

export interface SlackMetrics { width: number; height: number; matrixX: number; cell: number; resultX: number }
export function slackMetrics(results: ActivityResult[], decimals: number): SlackMetrics {
  const font = { ...defaultFont, fontSize: 20 }, codes = results.map(r => textWidth(r.code, { ...font, bold: true }))
  const numbers = results.flatMap(r => [r.earlyStart, r.earlyFinish, r.lateStart, r.lateFinish]).map(n => textWidth(formatTime(n, decimals), font))
  const floats = results.map(r => textWidth('= ' + formatTime(r.float, decimals), font))
  const matrixX = Math.max(24, ...codes) + 14, cell = Math.max(44, ...numbers.map(w => w + 18)), resultX = matrixX + cell * 2 + 16
  return { width: Math.ceil(resultX + Math.max(40, ...floats) + 6), height: 76, matrixX, cell, resultX }
}
// The same drawing is used in the workspace and SVG/raster exports.
export default function SlackBlock({ result: r, decimals, metrics: m }: { result: ActivityResult; decimals: number; metrics: SlackMetrics }) {
  return <g fontFamily="Arial" fontSize="20" fill="#334553" fontVariant="tabular-nums">
    <text x="0" y="23" fontWeight="700" fill={r.critical ? '#a44e38' : '#334553'}>{r.code}</text>
    <path d={`M ${m.matrixX} 37 H ${m.matrixX + m.cell * 2} M ${m.matrixX + m.cell} 3 V 71`} stroke="#84957c" strokeWidth="1.2" fill="none" />
    {[r.earlyStart, r.earlyFinish, r.lateStart, r.lateFinish].map((n, i) => <text key={i} x={m.matrixX + m.cell * (i % 2 + .5)} y={i < 2 ? 23 : 60} textAnchor="middle">{formatTime(n, decimals)}</text>)}
    <text x={m.resultX} y="23" fill={r.critical ? '#a44e38' : '#334553'}>= {formatTime(r.float, decimals)}</text>
  </g>
}
