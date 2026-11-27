import { Parser } from '@dbml/core'
import type { UmlSchema, UmlTable, UmlRelation } from '../model'
import { uid } from '../model'

// Lexical statement gate only. SQL grammar and binding belong to @dbml/core.
function statements(sql: string) {
  const result: { sql: string; words: string[]; maxDepth:number }[] = []
  let text = '', words: string[] = [], word = '', quote = '', comment = '', depth = 0, maxDepth=0
  const flushWord = () => { if (word) words.push(word.toUpperCase()); word = '' }
  const finish = () => { flushWord(); if (text.trim()) result.push({ sql: text, words, maxDepth }); maxDepth=0; text = ''; words = [] }
  for (let i=0;i<sql.length;i++) {
    const c=sql[i], n=sql[i+1]
    if (comment) {
      if (comment==='line' && c==='\n') { comment=''; text+='\n' }
      else if (comment==='block' && c==='*' && n==='/') { comment='';i++;text+=' ' }
      continue
    }
    if (quote) {
      text+=c
      if(c==='\\' && quote!=='`') { text+=sql[++i]??'';continue }
      if(c===quote) { if(n===quote) {text+=n;i++} else quote='' }
      continue
    }
    if(c==='/' && n==='*') {
      if(sql[i+2]==='!') throw new Error('Quitá los comentarios ejecutables /*! … */ del archivo. Exportá solo estructura MySQL sin rutinas ni instrucciones especiales.')
      flushWord();comment='block';i++;continue
    }
    if(c==='#' || (c==='-'&&n==='-'&&/\s/.test(sql[i+2]??' '))) {flushWord();comment='line';continue}
    if(c==="'"||c==='"'||c==='`') {flushWord();quote=c;text+=c;continue}
    if(c==='(') {depth++;maxDepth=Math.max(maxDepth,depth)}
    if(c===')') depth--
    if(depth<0) throw new Error('Hay un paréntesis de cierre sin apertura.')
    if(c===';' && depth===0) {finish();continue}
    text+=c
    if(/[a-zA-Z_]/.test(c)) word+=c; else flushWord()
  }
  if(quote || comment==='block' || depth) throw new Error('El SQL contiene una cadena, comentario o paréntesis sin cerrar.')
  finish();return result
}

export function importMysql(sql: string): { schema: UmlSchema; warnings: string[] } {
  if(new TextEncoder().encode(sql).length>2_000_000) throw new Error('El SQL supera 2 MB. Exportá solo la estructura, sin registros.')
  const parts=statements(sql.replace(/^\uFEFF/,'')), ddl: string[]=[], warnings: string[]=[]
  let creates=0, foreignKeys=0, primaryKeys=0, uniqueKeys=0
  for(const part of parts) {
    const w=part.words, head=w[0]
    if(head==='CREATE'&&w[1]==='TABLE') {
      if(w.includes('SELECT')||w.includes('LIKE')||!part.sql.includes('(')) throw new Error('Usá CREATE TABLE con sus columnas; CREATE TABLE SELECT/LIKE no está admitido.')
      if(part.maxDepth>2) throw new Error('No se admiten índices por prefijo, claves por expresión ni expresiones anidadas en CREATE TABLE.')
      creates++
    } else if(head==='ALTER'&&w[1]==='TABLE') {
      if(!w.includes('ADD')||w.some(t=>['DROP','MODIFY','CHANGE','RENAME','ALTER'].includes(t)&&t!==head)||w.filter(t=>t==='ALTER').length>1) throw new Error('Solo se admite ALTER TABLE para añadir claves PRIMARY, UNIQUE y FOREIGN KEY, o índices. Exportá la estructura final, no una secuencia de migraciones.')
      if(w.includes('UNIQUE')) throw new Error('Incluí las claves UNIQUE dentro de CREATE TABLE. Esta versión admite por ALTER solo PRIMARY KEY y FOREIGN KEY.')
      for(let i=0;i<w.length;i++) if(w[i]==='ADD') {let j=i+1;if(w[j]==='CONSTRAINT'){j++;if(!['PRIMARY','FOREIGN'].includes(w[j]))j++}if(!['PRIMARY','FOREIGN','INDEX','KEY'].includes(w[j])) throw new Error('ALTER TABLE solo puede añadir claves o índices; incluí las columnas en CREATE TABLE.')}
      if(part.maxDepth>1) throw new Error('No se admiten índices por prefijo o expresión en ALTER TABLE.')
      if(!w.some(t=>['FOREIGN','PRIMARY','INDEX','KEY'].includes(t))) throw new Error('No se admite ALTER TABLE ADD COLUMN. Incluí las columnas en CREATE TABLE.')
    } else if(['SET','USE','INSERT','LOCK','UNLOCK'].includes(head) || (head==='DROP'&&w[1]==='TABLE') || (head==='CREATE'&&w[1]==='DATABASE')) {
      if(!warnings.length) warnings.push('Se omitieron instrucciones auxiliares o datos. Solo se importó la estructura declarada.')
      continue
    } else throw new Error(head==='SELECT' ? 'Necesitamos CREATE TABLE y sus claves, no una consulta SELECT.' : `Sentencia ${head??'desconocida'} no admitida. Usá un archivo de estructura MySQL, sin rutinas, vistas ni migraciones.`)
    foreignKeys+=w.filter((v,i)=>v==='FOREIGN'&&w[i+1]==='KEY').length
    primaryKeys+=w.filter((v,i)=>v==='PRIMARY'&&w[i+1]==='KEY').length
    uniqueKeys+=w.filter(v=>v==='UNIQUE').length
    ddl.push(part.sql+';')
  }
  if(!creates) throw new Error('No se encontraron tablas. Incluí CREATE TABLE con sus columnas.')
  if(creates>200) throw new Error('Esta importación admite hasta 200 tablas.')
  const ordered=[...ddl.filter(s=>/^\s*CREATE/i.test(s)),...ddl.filter(s=>!/^\s*CREATE/i.test(s))]
  const db=new Parser().parse(ordered.join('\n'),'mysql')
  const raw=db.schemas.flatMap(s=>s.tables), tables: UmlTable[]=[], map=new Map<number,UmlTable>()
  if(raw.length!==creates) throw new Error('El importador no pudo conservar todas las tablas. Revisá nombres duplicados o sintaxis no admitida.')
  const parsedPrimary=raw.filter(t=>t.fields.some(f=>f.pk)||t.indexes.some(k=>k.pk)).length
  const parsedUnique=raw.reduce((n,t)=>n+t.fields.filter(f=>f.unique).length+t.indexes.filter(k=>k.unique&&!k.pk).length,0)
  if(parsedPrimary<primaryKeys || parsedUnique<uniqueKeys) throw new Error('El parser no pudo conservar todas las claves PRIMARY/UNIQUE. Revisá restricciones y nombres de tabla antes de importar.')
  for(const t of raw) {
    const primary=new Set(t.fields.filter(f=>f.pk).map(f=>f.name))
    for(const k of t.indexes.filter(k=>k.pk)) for(const c of k.columns) { if(c.type!=='column') throw new Error('No se admiten claves primarias por expresión.');primary.add(String(c.value)) }
    const columns=t.fields.map(f=>({id:uid(),name:f.name,primary:primary.has(f.name),foreign:false,nullable:!f.not_null&&!f.increment&&!primary.has(f.name)}))
    if(!columns.length||columns.length>500) throw new Error('Cada tabla debe tener entre 1 y 500 columnas.')
    const keys: string[][]=[]
    const key=(names:string[])=>{ const ids=names.map(n=>columns.find(c=>c.name===n)?.id);if(ids.some(id=>!id)) throw new Error(`Clave no admitida en ${t.name}. Revisá índices por prefijo o expresión.`);keys.push(ids as string[]) }
    if(primary.size) key([...primary])
    for(const f of t.fields.filter(f=>f.unique)) key([f.name])
    for(const k of t.indexes.filter(k=>k.unique&&!k.pk)) { if(k.columns.some(c=>c.type!=='column')) throw new Error(`Índice único por expresión no admitido en ${t.name}.`);key(k.columns.map(c=>String(c.value))) }
    const table:UmlTable={id:uid(),name:(t.schema.name&&t.schema.name!=='public'?t.schema.name+'.':'')+t.name,columns,uniqueKeys:keys,x:0,y:0,headerColor:'#eaf0e7',borderColor:'#8b9e88'}
    map.set(t.id,table);tables.push(table)
  }
  const refs=db.schemas.flatMap(s=>s.refs), relations:UmlRelation[]=[]
  if(refs.length!==foreignKeys) throw new Error('El parser no pudo conservar todas las FOREIGN KEY. Revisá las relaciones antes de importar.')
  for(const ref of refs) {
    // MySQLASTGen.visitReferenceDefinition emits the referencing endpoint first.
    const childEnd=ref.endpoints[0]
    const parentEnd=ref.endpoints.find(e=>e!==childEnd)!
    const child=map.get(childEnd.fields[0]?.table.id),parent=map.get(parentEnd.fields[0]?.table.id)
    if(!child||!parent) throw new Error('Una FOREIGN KEY apunta a una tabla no incluida.')
    const resolve=(table:UmlTable,names:string[])=>names.map(name=>{const c=table.columns.find(c=>c.name===name);if(!c)throw new Error(`Falta la columna ${name} en ${table.name}.`);return c.id})
    const childColumns=resolve(child,childEnd.fieldNames),parentColumns=resolve(parent,parentEnd.fieldNames)
    if(!parent.uniqueKeys.some(k=>k.every(id=>parentColumns.includes(id)))) throw new Error(`La clave de destino en ${parent.name} debe ser PRIMARY o UNIQUE.`)
    child.columns.filter(c=>childColumns.includes(c.id)).forEach(c=>{c.foreign=true})
    relations.push({id:uid(),childTable:child.id,parentTable:parent.id,childColumns,parentColumns,parentOptional:child.columns.some(c=>childColumns.includes(c.id)&&c.nullable),childUnique:child.uniqueKeys.some(k=>k.every(id=>childColumns.includes(id))),mode:child.id===parent.id?'curve':'orthogonal',orthogonal:{axis:'x',offset:0,kind:'multi'},cornerRadius:12,controls:child.id===parent.id?{source:{x:160,y:-80},target:{x:160,y:80}}:{source:{x:-120,y:0},target:{x:120,y:0}},stroke:'#526675',strokeWidth:1.6})
  }
  if(relations.length>1000) throw new Error('Esta importación admite hasta 1000 relaciones.')
  if(!relations.length) warnings.push('No hay claves foráneas declaradas: se generarán tablas sin conexiones.')
  return {schema:{tables,relations},warnings}
}
