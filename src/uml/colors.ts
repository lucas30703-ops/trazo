import type { UmlSchema } from '../model'

function hexColor(hue:number,saturation:number,lightness:number) {
  const s=saturation/100,l=lightness/100,a=s*Math.min(l,1-l)
  const channel=(n:number)=>{const k=(n+hue/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0')}
  return '#'+channel(0)+channel(8)+channel(4)
}
// Distinct header/border pairs; no change to table order, positions or schema.
export function randomizeTableColors(schema:UmlSchema) {
  const n=schema.tables.length,seed=crypto.getRandomValues(new Uint32Array(n+1)),headers=new Set<string>(),borders=new Set<string>()
  const pairs=schema.tables.map((_,i)=>{
    let hue=(seed[0]%3600/10+i*137.507764)%360
    const saturation=52+i%4*6,lightness=76+i%3*3
    for(let attempts=0;attempts<3600;attempts++,hue=(hue+.3)%360) {
      const header=hexColor(hue,saturation,lightness),border=hexColor(hue,saturation*.75,42)
      if(headers.has(header)||borders.has(border))continue
      headers.add(header);borders.add(border);return {header,border}
    }
    throw new Error('No se pudo generar una paleta sin repetir. Reintentá la acción.')
  })
  for(let i=n-1;i>0;i--){const j=seed[i+1]%(i+1);[pairs[i],pairs[j]]=[pairs[j],pairs[i]]}
  schema.tables.forEach((t,i)=>{t.headerColor=pairs[i].header;t.borderColor=pairs[i].border})
}
