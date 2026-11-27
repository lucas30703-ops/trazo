import type { DfdNode, Point } from './model'

export interface SpacingGuide { axis:'x'|'y'; distance:number; gaps:{from:Point;to:Point}[] }
interface SpacingMatch { coordinate:number; error:number; proximity:number; guide:SpacingGuide }

// Match neighboring figures of the same kind. Distances are clear gaps between
// their bounding edges, so different widths/heights do not distort the spacing.
export function equalSpacingGuides(node:DfdNode,position:Point,nodes:DfdNode[],scale:number,raw=position) {
  const result:{x?:SpacingMatch;y?:SpacingMatch}={},tolerance=7/scale
  if(node.kind==='note')return result
  for(const axis of ['x','y'] as const) {
    const across=axis==='x'?'y':'x',size=axis==='x'?'width':'height',crossSize=axis==='x'?'height':'width'
    let best:SpacingMatch|undefined
    // Igual que las guías de alineación: centros o el mismo borde. Los almacenes
    // pueden compartir borde con anchos/altos distintos y centros desalineados.
    for(const anchor of [.5,0,1]) {
      const crossCoordinate=(n:DfdNode)=>n[across]+n[crossSize]*anchor
      const reference=position[across]+node[crossSize]*anchor
      const row=nodes.filter(n=>n.id!==node.id&&n.kind===node.kind&&Math.abs(crossCoordinate(n)-reference)<=10/scale)
        .sort((a,b)=>a[axis]-b[axis]||a.id.localeCompare(b.id))
      for(let i=0;i<row.length-1;i++) {
        const a=row[i],b=row[i+1],fixedGap=b[axis]-a[axis]-a[size]
        if(Math.abs(crossCoordinate(a)-crossCoordinate(b))>tolerance || fixedGap<=.001)continue
        const between=(fixedGap-node[size])/2
        const candidates=[{coordinate:a[axis]+a[size]+between,gap:between},
          {coordinate:b[axis]+b[size]+fixedGap,gap:fixedGap},
          {coordinate:a[axis]-fixedGap-node[size],gap:fixedGap}]
        for(const candidate of candidates) {
          const error=Math.abs(candidate.coordinate-raw[axis])
          if(candidate.gap<=.001||error>tolerance)continue
          const moved={...node,...position,[axis]:candidate.coordinate}
          if(nodes.some(n=>n.id!==node.id&&n.kind!=='note'&&moved.x<n.x+n.width-.001&&moved.x+moved.width>n.x+.001&&moved.y<n.y+n.height-.001&&moved.y+moved.height>n.y+.001))continue
          const triple=[a,b,moved].sort((a,b)=>a[axis]-b[axis]),left=triple[0][axis],right=triple[2][axis]+triple[2][size]
          // Do not span an intervening figure or snap the dragged one onto it.
          if(row.some(n=>n.id!==a.id&&n.id!==b.id&&n[axis]<right-.001&&n[axis]+n[size]>left+.001))continue
          if(triple.some((n,j)=>j>0&&n[axis]<triple[j-1][axis]+triple[j-1][size]-.001))continue
          const proximity=Math.abs((left+right)/2-(raw[axis]+node[size]/2))
          if(best && (error>best.error+.0001 || Math.abs(error-best.error)<=.0001&&proximity>=best.proximity))continue
          const cross=Math.max(...triple.map(n=>n[across]+n[crossSize]))+16/scale
          const point=(value:number):Point=>axis==='x'?{x:value,y:cross}:{x:cross,y:value}
          const gaps=triple.slice(0,2).map((n,j)=>({from:point(n[axis]+n[size]),to:point(triple[j+1][axis])}))
          best={coordinate:candidate.coordinate,error,proximity,guide:{axis,distance:candidate.gap,gaps}}
        }
      }
    }
    if(best)result[axis]=best
  }
  return result
}
