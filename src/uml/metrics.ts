import type { UmlTable } from '../model'
export const HEADER_HEIGHT=38
export const ROW_HEIGHT=24
export const COLUMN_TEXT_X=78
export const columnCenter=(index:number)=>HEADER_HEIGHT+(index+.5)*ROW_HEIGHT
let context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null | undefined
function width(text:string,font:string) {
  if(context===undefined) context=typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(1,1).getContext('2d'):typeof document!=='undefined'?document.createElement('canvas').getContext('2d'):null
  if(!context)return text.length*15
  context.font=font
  return Math.ceil(context.measureText(text).width)
}
export const tableSize=(t:UmlTable)=>({width:Math.max(260,width(t.name,'700 15px Arial')+32,...t.columns.map(c=>width(c.name,c.primary?'700 14px Arial':'600 14px Arial')+COLUMN_TEXT_X+18)),height:HEADER_HEIGHT+t.columns.length*ROW_HEIGHT+4})
