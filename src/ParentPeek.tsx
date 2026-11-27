import { focusShortcutSurface } from './keyboard'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Project } from './model'
import { diagramForView, diagramTitle, diagramTrail } from './hierarchy'
import { renderDiagramSvg } from './export'

export default function ParentPeek({ project, disabled, onFocusCanvas }: { project: Project; disabled: boolean; onFocusCanvas: () => void }) {
  const [visible, setVisible] = useState(false), held = useRef(false)
  const [target,setTarget]=useState<'parent'|'uml'>('parent')
  const art = useRef<HTMLDivElement>(null)
  const trail = useMemo(() => diagramTrail(project, project.activeDiagramId), [project])
  const parent = trail.at(-2), currentLevel=trail.at(-1)?.level??1
  const context=useRef({parent,disabled,onFocusCanvas,mode:project.mode,currentLevel})
  useLayoutEffect(()=>{context.current={parent,disabled,onFocusCanvas,mode:project.mode,currentLevel}})
  // One capture listener owns plain Tab/Shift+Tab for the component lifetime.
  // Keeping real focus on a button and hiding its outline was insufficient.
  useLayoutEffect(()=>{
    const release=()=>{held.current=false;setVisible(false)}
    const down=(event:KeyboardEvent)=>{
      if(event.key==='Tab') {
        if(event.ctrlKey||event.metaKey||event.altKey)return
        if([...document.querySelectorAll('.modal-backdrop:not([inert]) [role=dialog]')].some(el=>el.getClientRects().length))return
        event.preventDefault();event.stopImmediatePropagation()
        if(event.repeat)return
        held.current=true
        const current=context.current
        focusShortcutSurface(current.onFocusCanvas,current.disabled)
        const uml=current.mode==='design'&&(current.currentLevel===1||event.shiftKey)
        setTarget(uml?'uml':'parent')
        setVisible((uml||!!current.parent)&&!current.disabled&&!event.isComposing)
        return
      }
      if(!held.current)return
      if(event.ctrlKey||event.metaKey||event.altKey){setVisible(false);return}
      event.preventDefault();event.stopImmediatePropagation()
      if(event.key==='Escape')setVisible(false)
    }
    const up=(event:KeyboardEvent)=>{
      if(event.key!=='Tab'||!held.current)return
      event.preventDefault();event.stopImmediatePropagation();release()
    }
    const hidden=()=>{if(document.visibilityState==='hidden')release()}
    window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true)
    window.addEventListener('blur',release);document.addEventListener('visibilitychange',hidden)
    return()=>{release();window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);window.removeEventListener('blur',release);document.removeEventListener('visibilitychange',hidden)}
  },[])
  useLayoutEffect(()=>{held.current=false;setVisible(false)},[parent?.diagram.id,project.activeDiagramId,project.id,disabled])
  const preview = useMemo(() => visible && target==='parent' && parent ? renderDiagramSvg(diagramForView(parent), { format: 'svg', scale: 1, padding: 28, background: 'diagram', grid: false }).svg : '', [visible, parent,target])
  useLayoutEffect(() => {
    if (!visible || !preview) return
    const svg=art.current?.querySelector('svg'),content=svg?.querySelector<SVGGraphicsElement>('[data-diagram-content]')
    if (!svg || !content) return
    const center=()=>{
      try {
        const box=content.getBBox(),padding=28
        if (![box.x,box.y,box.width,box.height].every(Number.isFinite) || box.width<=0 || box.height<=0) return
        const frame={x:box.x-padding,y:box.y-padding,width:box.width+padding*2,height:box.height+padding*2}
        svg.setAttribute('viewBox',`${frame.x} ${frame.y} ${frame.width} ${frame.height}`)
        svg.setAttribute('preserveAspectRatio','xMidYMid meet')
        const background=svg.querySelector(':scope > rect')
        for(const [key,value] of Object.entries(frame))background?.setAttribute(key,String(value))
      } catch { /* Keep the original safe frame if the browser cannot measure it. */ }
    }
    center()
    let active=true
    void document.fonts?.ready.then(()=>{if(active)center()})
    return ()=>{active=false}
  }, [visible,preview])
  if (!visible || (target==='parent'&&!parent)) return null
  return <section className="parent-peek" aria-label="Vista temporal del nivel anterior">
    <header><div><strong>{target==='uml'?'Referencia UML':`Nivel ${parent!.level} · ${diagramTitle(parent!.diagram)}`}</strong><span>Solo lectura · Tu edición sigue abierta</span></div><p>Soltá <kbd>Tab</kbd> para volver</p></header>
    {target==='uml'?<div className="parent-peek-art uml-peek-art">{project.umlReference?<img src={project.umlReference.data} alt={project.umlReference.name}/>:<p>Cargá tu UML desde Referencia UML → Cargar referencia, en el árbol de diagramas.</p>}</div>:<div ref={art} className="parent-peek-art" aria-label="Diagrama del nivel anterior" dangerouslySetInnerHTML={{ __html: preview }} />}
  </section>
}
