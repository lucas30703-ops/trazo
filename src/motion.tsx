import { createContext, useContext, useLayoutEffect, useRef, useState, useSyncExternalStore, useId } from 'react'
import type { ReactNode, RefObject } from 'react'
import { ChevronRight } from 'lucide-react'

const duration=160
const easing='cubic-bezier(.2,.8,.2,1)'
let preference:MediaQueryList|undefined
const media=()=>preference??=window.matchMedia('(prefers-reduced-motion: reduce)')
const subscribe=(listener:()=>void)=>{const query=media();query.addEventListener('change',listener);return()=>query.removeEventListener('change',listener)}
export const useReducedMotion=()=>useSyncExternalStore(subscribe,()=>media().matches,()=>true)
const PresenceContext=createContext(true)
export const usePresenceOpen=()=>useContext(PresenceContext)

export function useMenuMotion(ref:RefObject<HTMLElement|null>,open:boolean) {
  const reduced=useReducedMotion()
  useLayoutEffect(()=>{
    const node=ref.current
    if(!node||reduced||!node.animate)return
    const hidden={opacity:0,translate:'0 -4px'},shown={opacity:1,translate:'0 0'}
    const animation=node.animate(open?[hidden,shown]:[shown,hidden],{duration,easing,fill:'both'})
    return()=>animation.cancel()
  },[ref,open,reduced])
}

export function useChangeMotion(ref:RefObject<HTMLElement|null>,key:string) {
  const reduced=useReducedMotion(),previous=useRef(key)
  useLayoutEffect(()=>{
    const changed=previous.current!==key;previous.current=key
    const node=ref.current
    if(!changed||reduced||!node?.animate||node.closest('[data-motion-running]'))return
    const animation=node.animate([{opacity:.55},{opacity:1}],{duration:120,easing})
    return()=>animation.cancel()
  },[ref,key,reduced])
}

// Keep outgoing UI only long enough to paint its exit. Actions/state change now;
// outgoing controls are inert immediately. No timers delay the caller's action.
export function Presence({show,children,kind='fade'}:{show:boolean;children:ReactNode;kind?:'fade'|'menu'|'modal'|'toast'|'horizontal'|'vertical'}) {
  const reduced=useReducedMotion(),[retained,setRetained]=useState(show),last=useRef(children),root=useRef<HTMLDivElement>(null)
  const mounted=show||retained
  if(show)last.current=children
  useLayoutEffect(()=>{
    if(show){setRetained(true);return}
    if(!retained)return
    if(reduced){setRetained(false);return}
    const timer=setTimeout(()=>setRetained(false),duration)
    return()=>clearTimeout(timer)
  },[show,reduced,retained])
  useLayoutEffect(()=>{
    const node=root.current?.firstElementChild
    if(!(node instanceof HTMLElement)||reduced||!node.animate)return
    const style=getComputedStyle(node),base=style.transform==='none'?'':style.transform
    let hidden:Keyframe={opacity:0},shown:Keyframe={opacity:1}
    if(kind==='horizontal'||kind==='vertical') {
      const horizontal=kind==='horizontal',size=horizontal?'width':'height',minimum=horizontal?'minWidth':'minHeight',maximum=horizontal?'maxWidth':'maxHeight'
      const sides=horizontal?['Left','Right']:['Top','Bottom'],extent=node.getBoundingClientRect()[size]
      hidden={opacity:0,[size]:'0px',[minimum]:'0px',[maximum]:'0px',flexBasis:'0px',overflow:'hidden'}
      shown={opacity:1,[size]:`${extent}px`,[minimum]:'0px',[maximum]:`${extent}px`,flexBasis:style.flexBasis==='auto'?`${extent}px`:style.flexBasis,overflow:'hidden'}
      for(const side of sides)for(const prefix of ['padding','margin','border']) {
        const key=prefix+side+(prefix==='border'?'Width':'')
        hidden[key]='0px';shown[key]=style.getPropertyValue(key.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase()))
      }
    } else if(kind==='menu'||kind==='toast') {
      hidden.transform=`${base} translateY(${kind==='toast'?6:-4}px)`;shown.transform=base||'none'
    }
    node.dataset.motionRunning=''
    const animation=node.animate(show?[hidden,shown]:[shown,hidden],{duration,easing,fill:'both'})
    const card=kind==='modal'?node.querySelector<HTMLElement>('.modal'):null
    const cardAnimation=card?.animate(show?[{transform:'translateY(8px) scale(.99)'},{transform:'none'}]:[{transform:'none'},{transform:'translateY(5px) scale(.99)'}],{duration,easing,fill:'both'})
    void animation.finished.then(()=>{delete node.dataset.motionRunning;if(show){animation.cancel();cardAnimation?.cancel()}node.dispatchEvent(new Event('trazo-motion-end',{bubbles:true}))},()=>{})
    return()=>{animation.cancel();cardAnimation?.cancel();delete node.dataset.motionRunning}
  },[show,mounted,reduced,kind])
  if(!show&&!retained)return null
  return <PresenceContext value={show}><div ref={root} className="motion-presence" data-presence={show?'open':'exit'} inert={!show} aria-hidden={!show||undefined}>{show?children:last.current}</div></PresenceContext>
}

export function Collapse({open,children,id,className=''}:{open:boolean;children:ReactNode;id?:string;className?:string}) {
  return <div id={id} className={`motion-collapse ${className}`} data-open={open} inert={!open} aria-hidden={!open}><div className="motion-clip">{children}</div></div>
}

export function Disclosure({title,children,className='',defaultOpen=false}:{title:string;children:ReactNode;className?:string;defaultOpen?:boolean}) {
  const [open,setOpen]=useState(defaultOpen),id=useId()
  return <section className={className}><button type="button" className="disclosure-toggle" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}><ChevronRight size={12}/><span>{title}</span></button><Collapse open={open} id={id}>{children}</Collapse></section>
}

// Dynamic fields and lists share entry feedback and FLIP reflow. Only HTML UI is
// observed; canvas/SVG updates never animate or trigger layout reads here.
export function useUiMotion() {
  const root=useRef<HTMLDivElement>(null),reduced=useReducedMotion()
  useLayoutEffect(()=>{
    if(!root.current||reduced)return
    const selector='.field,.number-field,.toggle-row,.field-help,.error-message,.locked-message,.result-row,.revision-row,.project-card,.saved-style-entry,.saved-style-application,.delete-confirm,.export-dimensions,.diagram-breadcrumbs li,.inspector-selection,.startup-recovery'
    const positions=new Map<HTMLElement,DOMRect>(),animations=new Map<HTMLElement,Animation>()
    const elements=()=>[...(root.current?.querySelectorAll<HTMLElement>(selector)??[])].filter(node=>!node.closest('[inert],[data-motion-running],.canvas-stage,.parent-peek'))
    const snapshot=()=>{positions.clear();for(const node of elements())positions.set(node,node.getBoundingClientRect())}
    const play=(node:HTMLElement,frames:Keyframe[])=>{
      if(!node.animate||node.closest('[data-motion-running]'))return
      animations.get(node)?.cancel()
      const animation=node.animate(frames,{duration,easing});animations.set(node,animation)
      void animation.finished.then(()=>{if(animations.get(node)===animation)animations.delete(node);if(!animations.size)snapshot()},()=>{})
    }
    snapshot()
    const observer=new MutationObserver(records=>{
      const relevant=records.filter(record=>record.target instanceof Element&&!record.target.closest('.canvas-stage,.parent-peek,.graph-mount'))
      if(!relevant.length)return
      const added=new Set<HTMLElement>()
      for(const record of relevant)for(const node of record.addedNodes)if(node instanceof HTMLElement){if(node.matches(selector))added.add(node);node.querySelectorAll<HTMLElement>(selector).forEach(child=>added.add(child))}
      const next=new Map<HTMLElement,DOMRect>(),wasAnimating=animations.size>0
      for(const node of elements()) {
        const box=node.getBoundingClientRect(),before=positions.get(node);next.set(node,box)
        if(!box.width||!box.height)continue
        if(added.has(node)&&![...added].some(parent=>parent!==node&&parent.contains(node)) || before&&before.width===0)play(node,[{opacity:0,translate:'0 3px'},{opacity:1,translate:'0 0'}])
        else if(!wasAnimating&&before&&Math.abs(before.y-box.y)>1&&Math.abs(before.y-box.y)<350)play(node,[{translate:`0 ${before.y-box.y}px`},{translate:'0 0'}])
      }
      positions.clear();for(const [node,box] of next)positions.set(node,box)
    })
    observer.observe(root.current,{childList:true,subtree:true})
    root.current.addEventListener('scroll',snapshot,true)
    root.current.addEventListener('trazo-motion-end',snapshot)
    return()=>{observer.disconnect();root.current?.removeEventListener('scroll',snapshot,true);root.current?.removeEventListener('trazo-motion-end',snapshot);for(const animation of animations.values())animation.cancel()}
  },[reduced])
  return root
}
