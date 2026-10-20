import { useState, useRef, memo, useEffect } from 'react'
import { useStore } from '@/store'

export const PanelCard = ({ title, icon, hint, badge, defaultOpen = true, onReset, children }: { title: string; icon?: string; hint?: string; badge?: string|number; defaultOpen?: boolean; onReset?: () => void; children: React.ReactNode }) => {
  const storageKey = `panel.open.${title}`
  const [open, setOpen] = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null
    if (saved !== null) return saved === 'true'
    return defaultOpen ?? true
  })
  useEffect(() => {
    const handler = () => {
      const isTypography = ['Tipografia','Typography','Tipografía','Estilos','Styles','Predefinições','Presets','Predefiniciones'].includes(title)
      const next = isTypography
      setOpen(next)
      try { localStorage.setItem(storageKey, String(next)) } catch {}
    }
    window.addEventListener('lovert:reset-text-panels', handler)
    return () => window.removeEventListener('lovert:reset-text-panels', handler)
  }, [title, storageKey])
  const toggle = () => {
    const next = !open
    setOpen(next)
    try { localStorage.setItem(storageKey, String(next)) } catch {}
  }
  return (
    <div className={`rounded-2xl border overflow-hidden transition-colors ${open ? 'bg-zinc-800/60 border-zinc-700/60' : 'bg-zinc-800/30 border-zinc-800/40'}`}>
      <button onClick={toggle} className="w-full flex items-center gap-2.5 px-3 py-2 text-left group whitespace-nowrap">
        {icon && <span className="w-7 h-7 rounded-xl bg-zinc-700/50 border border-zinc-600/30 flex items-center justify-center text-[13px] group-hover:bg-zinc-700 transition-colors shrink-0">{icon}</span>}
        <span className="flex-1 min-w-0 overflow-hidden">
          <span className="text-[11px] font-semibold tracking-wide text-zinc-200 block leading-none whitespace-nowrap truncate">{title}</span>
        </span>
        {badge !== undefined && <span className="min-w-5 h-5 px-1.5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center">{badge}</span>}
        {onReset && <span onClick={e=>{e.stopPropagation(); onReset()}} className="text-[10px] text-zinc-500 hover:text-zinc-200 px-1">↺</span>}
        <span className={`text-zinc-500 text-[11px] transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && <div className="px-3 pb-3 pt-2 space-y-3">{children}</div>}
    </div>
  )
}

export const PanelSwitch = ({ checked, onChange }: { checked: boolean; onChange: (v:boolean)=>void }) => (
  <button onClick={()=>onChange(!checked)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${checked ? 'bg-[var(--accent)]' : 'bg-zinc-600/60'}`} aria-pressed={checked}>
    <span className="inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform" style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }} />
  </button>
)

export const PanelSlider = memo(function PanelSlider({ label, value, min, max, step, onChange, suffix, defaultValue }: { label:string; value:number; min:number; max:number; step:number; onChange:(v:number)=>void; suffix?:string; defaultValue?:number }) {
  const safe = (v:unknown, fb:number) => typeof v==='number' && Number.isFinite(v) ? v : fb
  const safeVal = safe(value, min)
  const isPct = suffix==='%' && max<=2
  const displayVal = isPct ? Math.round(safeVal*100) : Math.round(safeVal*100)/100
  const pct = ((safeVal-min)/Math.max(0.001,max-min))*100
  const [editing,setEditing]=useState(false)
  const [draft,setDraft]=useState(String(displayVal))
  const dragging=useRef(false)
  const store=useStore as any
  const commit=(s:string)=>{ let r=parseFloat(s); if(isNaN(r)) return; if(isPct) r/=100; r=Math.max(min,Math.min(max,r)); const sn=Math.round(r/step)*step; onChange(Math.round(sn*1000)/1000)}
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-300">{label}</span>
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-full bg-zinc-800 border border-zinc-700/60 overflow-hidden">
            <button onClick={()=>onChange(Math.max(min,Math.round((safeVal-step)*1000)/1000))} className="w-5 h-5 flex items-center justify-center text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-700">−</button>
            {editing ? <input autoFocus value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>{commit(draft);setEditing(false)}} onKeyDown={e=>{if(e.key==='Enter'){commit(draft);setEditing(false)} if(e.key==='Escape') setEditing(false)}} className="w-10 text-center text-[11px] bg-transparent text-white outline-none"/> : <button onClick={()=>setEditing(true)} className="min-w-[36px] px-1 text-[11px] font-medium text-white hover:text-[var(--accent)] tabular-nums">{displayVal}{isPct?'%':(suffix??'')}</button>}
            <button onClick={()=>onChange(Math.min(max,Math.round((safeVal+step)*1000)/1000))} className="w-5 h-5 flex items-center justify-center text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-700">+</button>
          </div>
          {defaultValue!==undefined && safeVal!==defaultValue && <button onClick={()=>onChange(defaultValue)} className="text-[9px] text-zinc-500 hover:text-zinc-300">↺</button>}
        </div>
      </div>
      <div className="relative h-1.5 rounded-full bg-zinc-700/60 overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)]" style={{width:`${pct}%`}}/>
        <input type="range" min={min} max={max} step={step} value={safeVal} onChange={e=>onChange(parseFloat(e.target.value))} onPointerDown={()=>{dragging.current=true; store.getState().startBatch()}} onPointerUp={()=>{dragging.current=false; try{store.getState().endBatch(); store.getState().pushHistory()}catch{}}} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
      </div>
    </div>
  )
})

export const PanelLabel = ({ children }: { children: React.ReactNode }) => <p className="text-[10px] font-medium text-zinc-400 tracking-wide">{children}</p>
