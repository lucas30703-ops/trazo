import type { AlignmentGuide } from './alignment'

export default function AlignmentGuides({ guides, scale, background }: { guides: AlignmentGuide; scale: number; background: string }) {
  return <g aria-hidden="true" pointerEvents="none">
    {guides.spacing?.flatMap((guide, i) => guide.gaps.map((gap, j) => {
      const horizontal = guide.axis === 'x', middle = { x: (gap.from.x + gap.to.x) / 2, y: (gap.from.y + gap.to.y) / 2 }, tick = 3 / scale
      const text = guide.distance * scale < 38 ? '=' : guide.distance.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' px'
      return <g className="motion-guide" key={`${i}-${j}`} stroke="#398977" strokeWidth={1 / scale}>
        <line x1={gap.from.x} y1={gap.from.y} x2={gap.to.x} y2={gap.to.y} />
        {[gap.from, gap.to].map((p, k) => <line key={k} x1={p.x - (horizontal ? 0 : tick)} y1={p.y - (horizontal ? tick : 0)} x2={p.x + (horizontal ? 0 : tick)} y2={p.y + (horizontal ? tick : 0)} />)}
        <text x={middle.x + (horizontal ? 0 : 6 / scale)} y={middle.y - (horizontal ? 5 / scale : 0)} textAnchor={horizontal ? 'middle' : 'start'} dominantBaseline={horizontal ? 'auto' : 'central'} fontSize={10 / scale} fill="#26745f" stroke={background === 'transparent' ? '#fff' : background} strokeWidth={3 / scale} paintOrder="stroke">{text}</text>
      </g>
    }))}
    {guides.x !== undefined && <g className="motion-guide"><line x1={guides.x} x2={guides.x} y1={guides.yStart} y2={guides.yEnd} stroke="#8d5cb0" strokeDasharray={`${4 / scale} ${3 / scale}`} strokeWidth={1 / scale} /><text x={guides.x + 5 / scale} y={(guides.yStart ?? 0) - 5 / scale} fontSize={11 / scale} fill="#70428e">{guides.xLabel}</text></g>}
    {guides.y !== undefined && <g className="motion-guide"><line y1={guides.y} y2={guides.y} x1={guides.xStart} x2={guides.xEnd} stroke="#8d5cb0" strokeDasharray={`${4 / scale} ${3 / scale}`} strokeWidth={1 / scale} /><text x={guides.xStart} y={guides.y - 5 / scale} fontSize={11 / scale} fill="#70428e">{guides.yLabel}</text></g>}
  </g>
}
