import { useState, useEffect, useRef, memo, useMemo } from 'react'
import { t } from '@/i18n'
import { useStore } from '@/store'
import { VECTOR_SHAPES, type Layer } from '@/types'
import { ColorPalette } from './ColorPalette'
import { GradientPickerInline } from './GradientPicker'

// ── Modern primitives ──────────────────────────────────────────────────

const Switch = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 shrink-0 ${checked ? 'bg-[var(--accent)]' : 'bg-zinc-600/60'}`}
    aria-pressed={checked}
  >
    <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform" style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }} />
  </button>
)

const safeNum = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

const ModernSlider = memo(function ModernSlider({ label, value, min, max, step, onChange, suffix, defaultValue }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; suffix?: string; defaultValue?: number
}) {
  const safeVal = safeNum(value, min)
  const isPct = suffix === '%' && max <= 2
  const displayVal = isPct ? Math.round(safeVal * 100) : Math.round(safeVal * 100) / 100
  const pct = ((safeVal - min) / Math.max(0.001, max - min)) * 100
  const dragging = useRef(false)
  const store = useStore
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(displayVal))

  useEffect(() => { if (!editing) setDraft(String(displayVal)) }, [displayVal, editing])

  const commit = (rawStr: string) => {
    let raw = parseFloat(rawStr)
    if (isNaN(raw)) return
    if (isPct) raw /= 100
    raw = Math.max(min, Math.min(max, raw))
    const snapped = Math.round(raw / step) * step
    onChange(Math.round(snapped * 1000) / 1000)
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-zinc-300 tracking-tight">{label}</span>
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-full bg-zinc-800 border border-zinc-700/60 overflow-hidden">
            <button
              onClick={() => onChange(Math.max(min, Math.round((safeVal - step) * 1000) / 1000))}
              className="w-5 h-5 flex items-center justify-center text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
            >−</button>
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onBlur={() => { commit(draft); setEditing(false) }}
                onKeyDown={e => { if (e.key === 'Enter') { commit(draft); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
                className="w-10 text-center text-[11px] font-medium bg-transparent text-white outline-none"
              />
            ) : (
              <button onClick={() => setEditing(true)} className="min-w-[36px] px-1 text-[11px] font-medium text-white hover:text-[var(--accent)] tabular-nums">
                {displayVal}{isPct ? '%' : (suffix ?? '')}
              </button>
            )}
            <button
              onClick={() => onChange(Math.min(max, Math.round((safeVal + step) * 1000) / 1000))}
              className="w-5 h-5 flex items-center justify-center text-[11px] text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
            >+</button>
          </div>
          {defaultValue !== undefined && safeVal !== defaultValue && (
            <button onClick={() => onChange(defaultValue)} className="text-[9px] text-zinc-500 hover:text-zinc-300" title={t('panel.reset')}>↺</button>
          )}
        </div>
      </div>
      <div className="relative h-1.5 rounded-full bg-zinc-700/60 overflow-hidden">
        <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] transition-all" style={{ width: `${pct}%` }} />
        <input
          type="range" min={min} max={max} step={step} value={safeVal}
          onChange={e => onChange(parseFloat(e.target.value))}
          onPointerDown={() => { dragging.current = true; store.getState().startBatch() }}
          onPointerUp={() => { dragging.current = false; try { const s = store.getState(); s.endBatch(); s.pushHistory() } catch {} }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  )
})

function Card({ title, icon, badge, defaultOpen, children, hint, onReset }: {
  title: string; icon: string; badge?: number | string; defaultOpen?: boolean; children: React.ReactNode; hint?: string; onReset?: () => void
}) {
  const storageKey = `panel.open.${title}`
  const [open, setOpen] = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null
    if (saved !== null) return saved === 'true'
    return defaultOpen ?? true
  })
  useEffect(() => {
    const handler = () => {
      const isTypography = ['Tipografia','Typography','Tipografía','Estilos','Styles','Estilo','Style'].includes(title)
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
    <div className={`rounded-2xl border overflow-hidden transition-colors ${open ? 'bg-zinc-800/60 border-zinc-700/60 backdrop-blur' : 'bg-zinc-800/30 border-zinc-800/40'}`}>
      <button onClick={toggle} className="w-full flex items-center gap-2.5 px-3 py-2 text-left group">
        <span className="w-7 h-7 rounded-xl bg-zinc-700/50 border border-zinc-600/30 flex items-center justify-center text-[13px] group-hover:bg-zinc-700 transition-colors">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="text-[11px] font-semibold tracking-wide text-zinc-200 block leading-none">{title}</span>
        </span>
        {badge !== undefined && badge !== 0 && (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center">{badge}</span>
        )}
        {onReset && (
          <span onClick={e => { e.stopPropagation(); onReset() }} className="text-[10px] text-zinc-500 hover:text-zinc-200 px-1">↺</span>
        )}
        <span className={`text-zinc-500 text-[11px] transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && <div className="px-3 pb-3 pt-2 space-y-3">{children}</div>}
    </div>
  )
}

function EffectRow({ title, icon, enabled, onToggle, presetChips, children }: {
  title: string; icon: string; enabled: boolean; onToggle: (v: boolean) => void; presetChips?: { label: string; action: () => void }[]; children?: React.ReactNode
}) {
  const storageKey = `effectrow.open.${title}`
  const [open, setOpen] = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null
    if (saved !== null) return saved === 'true'
    return true
  })
  const toggleOpen = () => {
    const next = !open
    setOpen(next)
    try { localStorage.setItem(storageKey, String(next)) } catch {}
  }
  useEffect(() => {
    const handler = () => { setOpen(false); try { localStorage.setItem(storageKey,'false')} catch {} }
    window.addEventListener('lovert:reset-text-panels', handler)
    return () => window.removeEventListener('lovert:reset-text-panels', handler)
  }, [storageKey])
  return (
    <div className={`rounded-xl border p-2.5 transition-all ${enabled ? 'bg-zinc-900/60 border-[var(--accent)]/20 shadow-sm' : 'bg-zinc-900/20 border-zinc-700/30'}`}>
      <div className="flex items-center gap-2 min-w-0">
        {icon ? <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[11px] border shrink-0 ${enabled ? 'bg-[var(--accent)]/15 border-[var(--accent)]/20 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400'}`}>{icon}</span> : null}
        <button onClick={() => enabled && toggleOpen()} disabled={!enabled} className={`flex-1 text-left text-[11px] font-medium min-w-0 overflow-hidden ${enabled ? 'text-zinc-200 hover:text-white cursor-pointer' : 'text-zinc-400 cursor-default'} flex items-center gap-1`}>
          <span className="whitespace-nowrap truncate">{title}</span>
          {enabled && children && <span className={`text-zinc-500 text-[10px] transition-transform shrink-0 ${open ? 'rotate-90' : ''}`}>›</span>}
        </button>
        <Switch checked={enabled} onChange={onToggle} />
      </div>
      {enabled && open && presetChips && (
        <div className="flex gap-1 mt-2.5 flex-wrap ml-8">
          {presetChips.map(c => (
            <button key={c.label} onClick={c.action} className="text-[9px] px-2 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700/40 transition-colors">{c.label}</button>
          ))}
        </div>
      )}
      {enabled && open && children && <div className="mt-2.5 space-y-2.5">{children}</div>}
    </div>
  )
}

function CollapsibleRow({ title, icon, defaultOpen = false, children }: { title: string; icon?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const storageKey = `collapsible.open.${title}`
  const [open, setOpen] = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null
    if (saved !== null) return saved === 'true'
    return defaultOpen
  })
  useEffect(() => {
    const handler = () => { setOpen(false); try { localStorage.setItem(storageKey,'false')} catch {} }
    window.addEventListener('lovert:reset-text-panels', handler)
    return () => window.removeEventListener('lovert:reset-text-panels', handler)
  }, [storageKey])
  const toggle = () => { const n = !open; setOpen(n); try { localStorage.setItem(storageKey, String(n)) } catch {} }
  return (
    <div className={`rounded-xl border p-2.5 transition-all ${open ? 'bg-zinc-900/40 border-zinc-700/40' : 'bg-zinc-900/20 border-zinc-700/30'}`}>
      <button onClick={toggle} className="w-full flex items-center gap-2 text-left">
        {icon && <span className="w-6 h-6 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[11px] text-zinc-400">{icon}</span>}
        <span className="flex-1 text-[11px] font-medium text-zinc-200">{title}</span>
        <span className={`text-zinc-500 text-[10px] transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>
      {open && <div className="mt-2.5 space-y-2.5">{children}</div>}
    </div>
  )
}

function PerspectivePad({ px, py, onChange }: { px: number; py: number; onChange: (x: number, y: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const storeRef = useStore as any
  const handle = (e: PointerEvent | React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const nx = ((e.clientX - r.left) / r.width) * 120 - 60
    const ny = ((e.clientY - r.top) / r.height) * 120 - 60
    onChange(Math.max(-60, Math.min(60, Math.round(nx))), Math.max(-60, Math.min(60, Math.round(ny))))
  }
  return (
    <div
      ref={ref}
      onPointerDown={e => { dragging.current = true; try{storeRef.getState().startBatch()}catch{}; (e.target as HTMLElement).setPointerCapture(e.pointerId); handle(e as any) }}
      onPointerMove={e => { if (dragging.current) handle(e as any) }}
      onPointerUp={e => { dragging.current = false; try { (e.target as HTMLElement).releasePointerCapture(e.pointerId) } catch {}; try{ const s=storeRef.getState(); s.endBatch(); s.pushHistory()}catch{}}}
      className="relative w-full aspect-square max-w-[140px] mx-auto rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/50 overflow-hidden cursor-crosshair select-none"
    >
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(to right, #3a3a5a 1px, transparent 1px), linear-gradient(to bottom, #3a3a5a 1px, transparent 1px)', backgroundSize: '14px 14px' }} />
      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/10" />
      <div className="absolute top-1/2 left-0 right-0 h-px bg-white/10" />
      <div
        className="absolute w-3 h-3 rounded-full bg-[var(--accent)] border-2 border-white shadow-lg -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ left: `${((px + 60) / 120) * 100}%`, top: `${((py + 60) / 120) * 100}%` }}
      />
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] text-zinc-500 tracking-widest">{t('transform.tiltPad')}</span>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────

type QuickTab = 'transform' | 'style' | 'adjust' | 'effects'

export function EffectsControls() {
  const selectedLayerId = useStore(s => s.selectedLayerId)
  const selectedLayerIds = useStore(s => s.selectedLayerIds)
  const background = useStore(s => s.background)
  const setBackgroundEffects = useStore(s => s.setBackgroundEffects)
  const updateLayer = useStore(s => s.updateLayer)
  const updateLayers = useStore(s => s.updateLayers)
  const updateVectorPath = useStore(s => s.updateVectorPath)
  const alignLayer = useStore(s => s.alignLayer)
  const alignLayers = useStore(s => s.alignLayers)
  const layer = useStore(s => s.layers.find(l => l.id === s.selectedLayerId) ?? null)
  const layers = useStore(s => s.layers)
  const nonBgLayers = layers.filter(l => !l.isBackground && l.id !== layer?.id && l.type !== 'group' && (l.type === 'image' || l.type === 'vector' || l.type === 'text' || l.type === 'element') && l.source !== background.imagePath && !(Math.abs(l.x) < 0.01 && Math.abs(l.y) < 0.01 && Math.abs(l.width - 1) < 0.01 && Math.abs(l.height - 1) < 0.01))
  const findLayer = (id: string) => useStore.getState().layers.find(l => l.id === id)
  const prevStrokeRef = useRef(3)

  const isBackground = !!layer?.isBackground
  const [quickTab, setQuickTab] = useState<QuickTab>(() => {
    try {
      const v = localStorage.getItem('lovert.quickTab.last')
      if (v === 'transform' || v === 'style' || v === 'adjust' || v === 'effects') return v
    } catch {}
    return 'transform'
  })
  const [alignPadding, setAlignPadding] = useState(5)
  const [scalePct, setScalePct] = useState(100)
  const [chain, setChain] = useState(true)

  useEffect(() => { setScalePct(100) }, [selectedLayerId])
  // Aba globalmente fixa: o painel fica sempre onde o utilizador estava,
  // independentemente da camada (texto, imagem, vetor…). Só o fundo força
  // 'adjust' (é a única aba que existe para ele), sem destruir a preferência.
  const chooseTab = (tab: QuickTab) => {
    setQuickTab(tab)
    try { localStorage.setItem('lovert.quickTab.last', tab) } catch {}
  }
  const effectiveTab: QuickTab = isBackground ? 'adjust' : quickTab

  const isBg = layer?.isBackground ?? false
  const showBg = (!layer || isBg) && background.type === 'image' && background.imagePreview
  if (!layer && !showBg) return null
  if (!layer) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <span className="w-7 h-7 rounded-xl bg-zinc-700 flex items-center justify-center text-xs">🖼️</span>
          <div><p className="text-[11px] font-semibold text-white leading-none">Fundo</p><p className="text-[10px] text-zinc-500">Ajustes globais da imagem de fundo</p></div>
        </div>
        <Card title="Filtros" icon="🎨" defaultOpen hint="Brilho, contraste e cor">
          <ModernSlider label={t('filter.brightness')} value={background.brightness} min={0} max={2} step={0.05} onChange={v => setBackgroundEffects({ brightness: v })} suffix="%" defaultValue={1} />
          <ModernSlider label={t('filter.contrast')} value={background.contrast} min={0} max={2} step={0.05} onChange={v => setBackgroundEffects({ contrast: v })} suffix="%" defaultValue={1} />
          <ModernSlider label={t('filter.saturation')} value={background.saturation ?? 1} min={0} max={2} step={0.05} onChange={v => setBackgroundEffects({ saturation: v })} suffix="%" defaultValue={1} />
          <ModernSlider label={t('filter.hue')} value={background.hueRotate ?? 0} min={0} max={360} step={1} onChange={v => setBackgroundEffects({ hueRotate: v })} suffix="°" defaultValue={0} />
          <ModernSlider label={t('filter.sepia')} value={background.sepia ?? 0} min={0} max={1} step={0.05} onChange={v => setBackgroundEffects({ sepia: v })} suffix="%" defaultValue={0} />
          <ModernSlider label={t('filter.blur')} value={background.blur} min={0} max={20} step={0.5} onChange={v => setBackgroundEffects({ blur: v })} suffix={t('effect.px')} defaultValue={0} />
          <div>
            <p className="text-[11px] font-medium text-zinc-300 mb-1">{t('bg.scale')}</p>
            <select value={background.bgSize} onChange={e => setBackgroundEffects({ bgSize: e.target.value })} className="w-full bg-zinc-800 rounded-xl px-2.5 py-2 text-[11px] text-white border border-zinc-700 focus:outline-none focus:border-[var(--accent)]">
              <option value="cover">{t('bg.scaleCover')}</option>
              <option value="contain">{t('bg.scaleContain')}</option>
              <option value="100% 100%">{t('bg.scaleStretch')}</option>
              <option value="auto">{t('bg.scaleOriginal')}</option>
            </select>
          </div>
        </Card>
      </div>
    )
  }

  const isMulti = selectedLayerIds.length > 1
  const applyOne = <K extends keyof Layer>(key: K, value: Layer[K], saveHistory = true) => {
    const l = layer
    if (!l) return
    if (isMulti) updateLayers(selectedLayerIds, { [key]: value } as Partial<Layer>, saveHistory)
    else updateLayer(l.id, { [key]: value } as Partial<Layer>, saveHistory)
  }
  const applyVector = (updater: (v: NonNullable<Layer['vector']>) => NonNullable<Layer['vector']>, saveHistory = true) => {
    if (isMulti) { for (const id of selectedLayerIds) { const ll = findLayer(id); if (!ll || !ll.vector) continue; updateLayer(id, { vector: updater(ll.vector) }, saveHistory) } }
    else if (layer?.vector) updateLayer(layer.id, { vector: updater(layer.vector) }, saveHistory)
  }
  const applyOutline = (next: Layer['outline'] | ((cur: NonNullable<Layer['outline']>) => NonNullable<Layer['outline']>), saveHistory = true) => {
    const l = layer; if (!l) return
    if (isMulti) { for (const id of selectedLayerIds) { const ll = findLayer(id); if (!ll) continue; const outline = typeof next === 'function' ? (ll.outline ? next(ll.outline) : null) : next; updateLayer(id, { outline }, saveHistory) } }
    else { const outline = typeof next === 'function' ? (l.outline ? next(l.outline) : null) : next; updateLayer(l.id, { outline }, saveHistory) }
  }
  const applyShadow = (next: Layer['shadow'] | ((cur: NonNullable<Layer['shadow']>) => NonNullable<Layer['shadow']>), saveHistory = true) => {
    const l = layer; if (!l) return
    if (isMulti) { for (const id of selectedLayerIds) { const ll = findLayer(id); if (!ll) continue; const shadow = typeof next === 'function' ? (ll.shadow ? next(ll.shadow) : null) : next; updateLayer(id, { shadow }, saveHistory) } }
    else { const shadow = typeof next === 'function' ? (l.shadow ? next(l.shadow) : null) : next; updateLayer(l.id, { shadow }, saveHistory) }
  }
  const isEffectActive = (effect: 'outline' | 'shadow' | 'innerShadow' | 'bevel') => {
    if (effect === 'bevel') { if (isMulti) return selectedLayerIds.some(id => !!findLayer(id)?.bevel?.enabled); return !!layer.bevel?.enabled }
    if (effect === 'innerShadow') { if (isMulti) return selectedLayerIds.some(id => { const ll=findLayer(id); return !!(ll as any)?.innerShadow || !!(ll as any)?.shadow?.inset }); return !!(layer as any).innerShadow || !!(layer as any).shadow?.inset }
    if (isMulti) return selectedLayerIds.some(id => { const ll = findLayer(id); return ll && (ll as any)[effect] !== null && (ll as any)[effect] !== undefined })
    return (layer as any)[effect] !== null && (layer as any)[effect] !== undefined
  }
  const activeEffectsCount = (['outline','shadow','innerShadow','bevel'] as const).filter(e => isEffectActive(e)).length
  const filterHit = (_: string) => true
  const handleSaveStyle = () => {
    try {
      if (layer.type === 'text') {
        const k='thumbnail-app.style-presets.v1'
        const cur=JSON.parse(localStorage.getItem(k)||'[]')
        const preset={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:`AaBbCc ${cur.length+1}`,font:layer.font,fontSize:layer.fontSize,color:layer.color,textGradient:layer.textGradient,lineHeight:layer.lineHeight,letterSpacing:layer.letterSpacing,textTransform:layer.textTransform,fontStyle:layer.fontStyle,fontWeight:layer.fontWeight,opacity:layer.opacity,outline:layer.outline?{color:layer.outline.color,width:layer.outline.width}:null,shadow:layer.shadow?{...layer.shadow}:null}
        localStorage.setItem(k, JSON.stringify([preset, ...cur]))
      } else {
        const k='thumbnail-app.layer-presets.v1'
        const cur=JSON.parse(localStorage.getItem(k)||'[]')
        const preset={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),name:layer.name||'Estilo',type:layer.type,vector:layer.vector,outline:layer.outline,shadow:layer.shadow,bevel:layer.bevel,borderRadiusPx:layer.borderRadiusPx,brightness:layer.brightness,contrast:layer.contrast,saturation:layer.saturation,blur:layer.blur}
        localStorage.setItem(k, JSON.stringify([preset, ...cur].slice(0,20)))
      }
      // feedback simples via setError se existir, ou console
      const { setError } = useStore.getState() as any
      if(setError) setError('Estilo guardado!')
      setTimeout(()=>{ const s=useStore.getState() as any; if(s.setError) s.setError(null)},1500)
    } catch {}
  }
  const handleResetDefaults = () => {
    const base: Partial<Layer> = { opacity:1, rotation:0, perspectiveX:0, perspectiveY:0, brightness:1, contrast:1, saturation:1, hueRotate:0, sepia:0, blur:0, negative:false as any, borderRadiusPx:0, outline:null as any, outlineWidthPx:0, shadow:null as any, bevel:null as any }
    if (layer.type==='text') { Object.assign(base,{ lineHeight:1.2, letterSpacing:0, textTransform:'none' as any, textGradient:null as any, fontStyle:'normal' as any, fontWeight:700 }) }
    if (layer.type==='vector' && layer.vector) { Object.assign(base,{ vector:{...layer.vector, filled:true, strokeWidth: layer.vector.shape==='bloom'?0:3, strokeDash:'solid' as any} as any })}
    const st = useStore.getState()
    st.startBatch()
    if (isMulti) st.updateLayers(selectedLayerIds, base, false)
    else st.updateLayer(layer.id, base, false)
    st.endBatch()
    st.pushHistory()
  }

  // ── Guard: captura qualquer exceção de render para não quebrar a app inteira
  try {
  return (
    <div className="space-y-3">
      {/* Filtro de funcionalidades — categorias definitivas sem sobreposição */}
      <div className="sticky -top-2.5 z-10 bg-zinc-900/80 backdrop-blur supports-[backdrop-filter]:bg-zinc-900/60 -mx-2.5 px-2.5 pt-1 pb-2 border-b border-zinc-800/50">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-0.5">
          {(isBackground ? (['adjust'] as QuickTab[]) : (['transform','style','adjust','effects'] as QuickTab[])).map(tab => (
            <button key={tab} onClick={() => chooseTab(tab)} className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${effectiveTab===tab ? 'bg-white text-zinc-900 border-white' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'}`}>
              {tab==='transform'?t('panel.transform'):tab==='style'?t('panel.style'):tab==='adjust'?t('panel.adjust'):t('panel.effects')}{tab==='effects' && activeEffectsCount>0 ? ` · ${activeEffectsCount}` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Transformar — sem sobreposição: Opacidade, Tamanho, Inclinação, Alinhamento */}
      {!isBackground && effectiveTab==='transform' && (
        <>
          <Card title={t('panel.opacity')} icon="◐" defaultOpen hint={t('panel.hintOpacity')} onReset={() => applyOne('opacity',1)}>
            <ModernSlider label={t('transform.opacity')} value={layer.opacity} min={0} max={1} step={0.01} onChange={v => applyOne('opacity', v)} suffix="%" defaultValue={1} />
          </Card>
          {filterHit('dimension tamanho width height escala scale') && (
            <Card title={t('panel.sizePos')} icon="⤢" defaultOpen hint={t('panel.hintTransform')}>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] text-zinc-400">{t('transform.x')} %</span>
                  <input type="number" value={Math.round(layer.x * 10000)/100} onChange={e => applyOne('x', (parseFloat(e.target.value)||0)/100)} className="w-full bg-zinc-900 rounded-xl px-2 py-1.5 text-[11px] text-white border border-zinc-700 focus:border-[var(--accent)] outline-none" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-zinc-400">{t('transform.y')} %</span>
                  <input type="number" value={Math.round(layer.y * 10000)/100} onChange={e => applyOne('y', (parseFloat(e.target.value)||0)/100)} className="w-full bg-zinc-900 rounded-xl px-2 py-1.5 text-[11px] text-white border border-zinc-700 focus:border-[var(--accent)] outline-none" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-zinc-400">{t('transform.width')} %</span>
                  <div className="flex gap-1">
                    <input type="number" value={Math.round(layer.width*10000)/100} onChange={e => {
                      const w = Math.max(0.02, (parseFloat(e.target.value)||0.02)/100)
                      if (chain && layer.width>0) { const asp = layer.width/layer.height; applyOne('width', w); applyOne('height', Math.max(0.02, w/asp)) }
                      else applyOne('width', w)
                    }} className="flex-1 bg-zinc-900 rounded-xl px-2 py-1.5 text-[11px] text-white border border-zinc-700 focus:border-[var(--accent)] outline-none" />
                    <button onClick={() => setChain(!chain)} className={`w-7 rounded-xl border flex items-center justify-center text-[11px] ${chain?'bg-[var(--accent)] text-white border-[var(--accent)]':'bg-zinc-800 text-zinc-500 border-zinc-700'}`} title={chain?t('transform.proportionLocked'):t('transform.proportionFree')}>🔗</button>
                  </div>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-zinc-400">{t('transform.height')} %</span>
                  <input type="number" value={Math.round(layer.height*10000)/100} onChange={e => {
                    const h = Math.max(0.02, (parseFloat(e.target.value)||0.02)/100)
                    if (chain && layer.height>0) { const asp = layer.width/layer.height; applyOne('height', h); applyOne('width', Math.max(0.02, h*asp)) }
                    else applyOne('height', h)
                  }} className="w-full bg-zinc-900 rounded-xl px-2 py-1.5 text-[11px] text-white border border-zinc-700 focus:border-[var(--accent)] outline-none" />
                </label>
              </div>
              <ModernSlider label={t('transform.rotation')} value={Math.round(layer.rotation)} min={-180} max={180} step={1} onChange={v => applyOne('rotation', v)} suffix="°" defaultValue={0} />
              <ModernSlider label={t('transform.scale')} value={scalePct} min={10} max={500} step={1} onChange={v => { const f=v/scalePct; setScalePct(v); if(isMulti){ for(const id of selectedLayerIds){ const ll=findLayer(id); if(!ll)continue; updateLayer(id,{width:Math.max(0.02,ll.width*f),height:Math.max(0.02,ll.height*f), ...(ll.type!=='image'?{fontSize:Math.max(8,Math.round(ll.fontSize*f))}:{})},true)}} else updateLayer(layer.id,{width:Math.max(0.02,layer.width*f),height:Math.max(0.02,layer.height*f), ...(layer.type!=='image'?{fontSize:Math.max(8,Math.round(layer.fontSize*f))}:{})},true)}} suffix="%" defaultValue={100} />
              <div className="flex gap-1.5">
                <button onClick={() => applyOne('mirrorX', !layer.mirrorX)} className={`flex-1 py-1.5 rounded-xl text-[11px] font-medium border transition-colors ${layer.mirrorX?'bg-white text-zinc-900 border-white':'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'}`}>{t('transform.mirrorH')}</button>
                <button onClick={() => applyOne('mirrorY', !layer.mirrorY)} className={`flex-1 py-1.5 rounded-xl text-[11px] font-medium border transition-colors ${layer.mirrorY?'bg-white text-zinc-900 border-white':'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'}`}>{t('transform.mirrorV')}</button>
              </div>
            </Card>
          )}

          {filterHit('perspect inclina tilt 3d') && (
            <Card title={t('panel.tilt')} icon="⬔" hint={t('panel.hintTilt')}>
              <div className="grid grid-cols-[1fr_140px] gap-3 items-start">
                <div className="space-y-2">
                  <ModernSlider label={t('transform.perspectiveH')} value={layer.perspectiveX} min={-60} max={60} step={1} onChange={v => applyOne('perspectiveX', v)} suffix="°" defaultValue={0} />
                  <ModernSlider label={t('transform.perspectiveV')} value={layer.perspectiveY} min={-60} max={60} step={1} onChange={v => applyOne('perspectiveY', v)} suffix="°" defaultValue={0} />
                  <button onClick={() => { applyOne('perspectiveX',0); applyOne('perspectiveY',0)}} className="text-[10px] text-zinc-500 hover:text-white">⟲ {t('transform.perspectiveReset')}</button>
                </div>
                <PerspectivePad px={layer.perspectiveX} py={layer.perspectiveY} onChange={(x,y)=>{ applyOne('perspectiveX', x); applyOne('perspectiveY', y)}} />
              </div>
            </Card>
          )}
        </>
      )}

      {/* STYLE / TEXT — painel propriedades enriquecido e categorizado */}
      {(effectiveTab==='style') && layer.type==='text' && (
        <>
          <Card title={t('panel.content')} icon="📝" defaultOpen>
            <textarea value={layer.text} onChange={e=>applyOne('text', e.target.value)} placeholder={t('text.defaultText')} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-2 text-[11px] text-white focus:outline-none focus:border-[var(--accent)] resize-none" rows={3} />
            <div className="flex items-center justify-between rounded-xl bg-zinc-900/30 border border-zinc-700/30 px-2.5 py-2">
              <span className="text-[11px] font-medium text-zinc-300">{t('text.autoFit')}</span>
              <Switch checked={(layer as any).autoFit !== false} onChange={v=>applyOne('autoFit', v as any)} />
            </div>
          </Card>
          <Card title={t('panel.typography')} icon="Aa" defaultOpen hint="Fonte, tamanho e estilo">
            {(() => {
              const sysFonts = (useStore.getState() as any).systemFonts as string[]
              const FALLBACK_FONTS=['Arial','Arial Black','Calibri','Georgia','Impact','Segoe UI','Times New Roman','Verdana']
              const fontList = sysFonts?.length ? sysFonts : FALLBACK_FONTS
              const FONT_SIZES=[16,20,24,28,32,36,40,48,56,64,72,80,96,100,120,150,200,250,300]
              return (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-[10px] text-zinc-400">{t('text.font')}</span>
                      <select value={fontList.includes(layer.font)?layer.font:''} onChange={e=>e.target.value&&applyOne('font', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1.5 text-[11px] text-white outline-none" style={{fontFamily: layer.font}}>
                        {!fontList.includes(layer.font) && <option value="" disabled>{layer.font}</option>}
                        {fontList.map(f=> <option key={f} value={f} style={{fontFamily:f}}>{f}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] text-zinc-400">{t('text.size')}</span>
                      <div className="flex gap-1">
                        <input type="number" min={8} max={500} value={layer.fontSize} onChange={e=>applyOne('fontSize', parseInt(e.target.value)||48)} className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1.5 text-[11px] text-white outline-none" />
                        <select value={FONT_SIZES.includes(layer.fontSize)? String(layer.fontSize): ''} onChange={e=>{ const v=parseInt(e.target.value); if(v) applyOne('fontSize', v)}} className="w-[56px] bg-zinc-800 border border-zinc-700 rounded-xl px-1 py-1 text-[11px] text-white">
                          <option value="">⋯</option>
                          {FONT_SIZES.map(n=> <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    </label>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={()=>applyOne('fontWeight', layer.fontWeight>=600 ? 400 : 700)} className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border ${layer.fontWeight>=600?'bg-white text-zinc-900 border-white':'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'}`}>B</button>
                    <button onClick={()=>applyOne('fontStyle', layer.fontStyle==='italic'?'normal':'italic')} className={`flex-1 py-1.5 rounded-xl text-[11px] italic border ${layer.fontStyle==='italic'?'bg-white text-zinc-900 border-white':'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'}`}>I</button>
                    <div className="flex-1 flex gap-1">
                      {(['left','center','right'] as const).map(a=> (
                        <button key={a} onClick={()=>applyOne('textAlign', a)} className={`flex-1 rounded-xl border flex items-center justify-center py-1 ${layer.textAlign===a?'bg-white text-zinc-900 border-white':'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-white'}`}>{a==='left'?'⯇':a==='center'?'≡':'⯈'}</button>
                      ))}
                    </div>
                  </div>
                </>
              )
            })()}
            <ModernSlider label={t('text.lineHeight')} value={layer.lineHeight} min={0.8} max={3} step={0.05} onChange={v => applyOne('lineHeight', v)} defaultValue={1.2} />
            <ModernSlider label={t('text.letterSpacing')} value={layer.letterSpacing} min={-5} max={20} step={0.5} onChange={v => applyOne('letterSpacing', v)} suffix={t('effect.px')} defaultValue={0} />
            <div>
              <p className="text-[11px] font-medium text-zinc-300 mb-1.5">{t('text.transform')}</p>
              <div className="grid grid-cols-3 gap-1">
                {(['none','uppercase','lowercase'] as const).map(v => (
                  <button key={v} onClick={() => applyOne('textTransform', v as any)} className={`py-1.5 rounded-xl text-[11px] font-medium border ${layer.textTransform===v ? 'bg-white text-zinc-900 border-white' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'}`}>{v==='none'?t('text.transformNone'):v==='uppercase'?t('text.transformUpper'):t('text.transformLower')}</button>
                ))}
              </div>
            </div>
            <ModernSlider label={t('transform.opacity')} value={layer.opacity} min={0} max={1} step={0.01} onChange={v=>applyOne('opacity', v)} suffix="%" defaultValue={1} />
          </Card>
          <Card title={t('panel.color')} icon="🎨" hint={layer.textGradient ? t('text.gradient') : 'Cor sólida'}>
            <div className="flex items-center justify-between rounded-xl bg-zinc-900/30 border border-zinc-700/30 px-2.5 py-2">
              <span className="text-[11px] font-medium text-zinc-300">{t('text.gradient')}</span>
              <Switch checked={!!layer.textGradient} onChange={v => applyOne('textGradient', v ? 'linear-gradient(135deg, #00d2ff, #3a7bd5)' : null)} />
            </div>
            {layer.textGradient ? <GradientPickerInline selectedGradient={layer.textGradient} onSelect={g=>applyOne('textGradient', g)} /> : <div className="flex items-center gap-2"><ColorPalette value={layer.color} onChange={c=>applyOne('color', c)} /><span className="text-[11px] font-mono text-zinc-400">{layer.color}</span></div>}
            {((layer as any).textSpans?.length ?? 0) > 0 && (
              <div className="rounded-xl bg-zinc-900/30 border border-zinc-700/30 px-2.5 py-2 space-y-1.5">
                <p className="text-[10px] text-zinc-400 leading-tight">{t('rich.spansActive', { n: (layer as any).textSpans.length })}</p>
                <button onClick={() => applyOne('textSpans', null as any)} className="w-full py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] border border-zinc-700 transition-colors">{t('rich.clearAll')}</button>
              </div>
            )}
          </Card>
        </>
      )}

      {layer.type==='vector' && layer.vector && (effectiveTab==='style') && filterHit('vector forma shape') && (
        <Card title={t('panel.vector')} icon="⬢" defaultOpen hint={t('panel.hintVector')}>
          <select value={layer.vector.shape} onChange={e => {
            const ns=e.target.value as any
            if(ns==='bloom'){ applyVector(v=>({...v,shape:ns,filled:true,fillGradient:null,strokeWidth:0,strokeDash:'solid' as const})); updateLayer(layer.id,{outline:null,outlineWidthPx:0,shadow:null},false)}
            else applyVector(v=>({...v,shape:ns}))
          }} className="w-full bg-zinc-900 rounded-xl px-2.5 py-2 text-[11px] text-white border border-zinc-700 focus:border-[var(--accent)] outline-none">
            {VECTOR_SHAPES.map(s => <option key={s.id} value={s.id}>{s.icon} {t(`vectorShapes.${s.id}`)}</option>)}
          </select>
          {layer.vector.shape==='bloom' ? (
            <div className="rounded-xl bg-zinc-900/40 border border-zinc-700/30 p-2.5 space-y-2">
              <p className="text-[11px] font-medium text-zinc-300">{t('vector.bloomColor')}</p>
              <div className="flex items-center gap-2"><ColorPalette value={layer.vector.color} onChange={c=>applyVector(v=>({...v,color:c}))} /><span className="text-[11px] font-mono text-zinc-400">{layer.vector.color}</span></div>
              <p className="text-[10px] text-zinc-500 leading-tight">{t('vector.bloomDesc')}</p>
            </div>
          ) : (
            <>
              <div className={`rounded-xl border p-2.5 ${layer.vector.filled ? 'bg-zinc-900/60 border-zinc-700/40' : 'bg-zinc-900/20 border-zinc-700/30'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-200">{t('vector.fill')}</span>
                  <Switch checked={layer.vector.filled} onChange={v=>applyVector(x=>({...x,filled:v}))} />
                </div>
                {layer.vector.filled && (
                  <div className="mt-2.5 space-y-2">
                    <div className="flex items-center justify-between"><span className="text-[10px] text-zinc-400">{t('text.gradient')}</span><Switch checked={!!layer.vector.fillGradient} onChange={v=>applyVector(x=>({...x,fillGradient: v ? 'linear-gradient(135deg, #00d2ff, #3a7bd5)' : null}))} /></div>
                    {layer.vector.fillGradient ? (
                      <div className="space-y-2"><GradientPickerInline selectedGradient={layer.vector.fillGradient} onSelect={g=>applyVector(v=>({...v,fillGradient:g}))} /><button onClick={()=>applyVector(v=>({...v,fillGradient:null}))} className="w-full py-1 rounded-xl bg-zinc-800 text-zinc-400 text-[11px] border border-zinc-700">{t('text.gradientClear')}</button></div>
                    ) : (
                      <div className="flex items-center gap-2"><ColorPalette value={layer.vector.color} onChange={c=>applyVector(v=>({...v,color:c}))} /><span className="text-[11px] font-mono text-zinc-400">{layer.vector.color}</span></div>
                    )}
                  </div>
                )}
              </div>
              <CollapsibleRow title={t('vector.outline')} icon="⬜" defaultOpen={layer.vector.strokeWidth>0}>
                <div className="flex items-center justify-between"><span className="text-[11px] font-medium text-zinc-200">{t('effect.thickness')}</span><Switch checked={layer.vector.strokeWidth>0} onChange={v=>{ if(v) applyVector(cv=>({...cv,strokeWidth: prevStrokeRef.current||3})); else { prevStrokeRef.current=layer.vector!.strokeWidth; applyVector(cv=>({...cv,strokeWidth:0})) }}} /></div>
                <div className="flex items-center gap-2"><ColorPalette value={layer.vector.strokeColor||layer.vector.color} onChange={c=>applyVector(v=>({...v,strokeColor:c}))} /><span className="text-[11px] font-mono text-zinc-400">{layer.vector.strokeColor||layer.vector.color}</span></div>
                <ModernSlider label={t('vector.strokeWidth')} value={layer.vector.strokeWidth} min={0.5} max={40} step={0.5} onChange={v=>applyVector(cv=>({...cv,strokeWidth:v}))} suffix={t('effect.px')} />
              </CollapsibleRow>
              <CollapsibleRow title={t('vector.dash')} icon="〰️" defaultOpen={false}>
                <div className="grid grid-cols-4 gap-1">
                  {(['solid','dashed','dotted','dash-dot'] as const).map(d=>(
                    <button key={d} onClick={()=>applyVector(cv=>({...cv,strokeDash:d}))} className={`py-1.5 rounded-xl text-[11px] border ${layer.vector!.strokeDash===d ? 'bg-white text-zinc-900 border-white' : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-white'}`}>{d==='solid'?'━━━':d==='dashed'?'╌╌╌':d==='dotted'?'┈┈┈':'╌┈'}</button>
                  ))}
                </div>
              </CollapsibleRow>
              {layer.vector.shape==='rounded-rect' && <ModernSlider label={t('vector.cornerRadius')} value={layer.vector.cornerRadius} min={0} max={50} step={1} onChange={v=>applyVector(cv=>({...cv,cornerRadius:v}))} suffix="%" />}
              <ModernSlider label={t('vector.skew')} value={layer.vector.skewX ?? 0} min={-45} max={45} step={1} onChange={v=>applyVector(cv=>({...cv,skewX:v}))} suffix={t('effect.deg')} defaultValue={0} />
            </>
          )}
        </Card>
      )}

      {layer.type==='vector' && (layer as any).vectorPath && filterHit('bezier path curva') && (
        <Card title={t('panel.bezier')} icon="✏️" defaultOpen hint={t('panel.hintBezier')}>
          <div className="rounded-xl bg-zinc-900/20 border border-zinc-700/30 p-2.5 space-y-2">
            <div className="flex items-center justify-between"><span className="text-[11px] font-medium text-zinc-200">{t('vector.fill')}</span><Switch checked={!!(layer as any).vectorPath.closed} onChange={v=>updateVectorPath(layer.id,(vp:any)=>({...vp,closed:v}))} /></div>
            {(layer as any).vectorPath.closed && <div className="flex items-center gap-2"><ColorPalette value={(layer as any).vectorPath.fillColor} onChange={c=>updateVectorPath(layer.id,(vp:any)=>({...vp,fillColor:c}))} /><span className="text-[11px] font-mono text-zinc-400">{(layer as any).vectorPath.fillColor}</span></div>}
            <div className="flex items-center gap-2"><span className="text-[10px] text-zinc-400 w-10">{t('vector.stroke')}</span><ColorPalette value={(layer as any).vectorPath.strokeColor} onChange={c=>updateVectorPath(layer.id,(vp:any)=>({...vp,strokeColor:c}))} /><span className="text-[11px] font-mono text-zinc-400">{(layer as any).vectorPath.strokeColor}</span></div>
            <ModernSlider label={t('vector.strokeWidth')} value={(layer as any).vectorPath.strokeWidth} min={0.5} max={40} step={0.5} onChange={v=>updateVectorPath(layer.id,(vp:any)=>({...vp,strokeWidth:v}))} suffix="px" />
            <div className="grid grid-cols-4 gap-1">
              {(['solid','dashed','dotted','dash-dot'] as const).map(d=>(
                <button key={d} onClick={()=>updateVectorPath(layer.id,(vp:any)=>({...vp,strokeDash:d}))} className={`py-1 rounded-xl text-[10px] border ${((layer as any).vectorPath.strokeDash||'solid')===d ? 'bg-white text-zinc-900 border-white':'bg-zinc-800 text-zinc-500 border-zinc-700'}`}>{d}</button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['startCap','endCap'] as const).map(k=>(
                <label key={k} className="space-y-1">
                  <span className="text-[10px] text-zinc-400">{k==='startCap'?t('vector.startCap'):t('vector.endCap')}</span>
                  <select value={(layer as any).vectorPath[k]||'none'} onChange={e=>{ const v=e.target.value as any; updateVectorPath(layer.id,(vp:any)=>({...vp,[k]:v, [k+'Size']: v!=='none'?(vp[k+'Size']||10):vp[k+'Size'], strokeWidth: v!=='none' && (!vp.strokeWidth||vp.strokeWidth<20)?20:vp.strokeWidth}))}} className="w-full bg-zinc-800 rounded-xl px-2 py-1.5 text-[11px] text-white border border-zinc-700">
                    <option value="none">{t('vector.capNone')}</option><option value="arrow">{t('vector.capArrow')}</option><option value="round">{t('vector.capRound')}</option>
                  </select>
                  {(layer as any).vectorPath[k]!=='none' && <ModernSlider label={t('vector.capSize')} value={(layer as any).vectorPath[k+'Size']||10} min={4} max={60} step={1} onChange={v=>updateVectorPath(layer.id,(vp:any)=>({...vp,[k+'Size']:v}))} suffix="px" />}
                </label>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Ajustes — categoria definitiva */}
      {effectiveTab==='adjust' && (
        <>
          {!isBackground && (
            <Card title={t('panel.filters')} icon="🎛️" defaultOpen={false} hint={t('panel.hintFilters')} onReset={() => { applyOne('brightness',1); applyOne('contrast',1); applyOne('saturation',1); applyOne('hueRotate',0); applyOne('sepia',0); applyOne('blur',0); applyOne('negative',false as any); }}>
              {(layer.type==='image' || layer.type==='element') && (
                <div className="space-y-2">
                  <ModernSlider label={t('filter.brightness')} value={layer.brightness} min={0} max={2} step={0.05} onChange={v=>applyOne('brightness',v)} suffix="%" defaultValue={1} />
                  <ModernSlider label={t('filter.contrast')} value={layer.contrast} min={0} max={2} step={0.05} onChange={v=>applyOne('contrast',v)} suffix="%" defaultValue={1} />
                  <ModernSlider label={t('filter.saturation')} value={layer.saturation} min={0} max={2} step={0.05} onChange={v=>applyOne('saturation',v)} suffix="%" defaultValue={1} />
                  <ModernSlider label={t('filter.hue')} value={Math.round(layer.hueRotate)} min={0} max={360} step={1} onChange={v=>applyOne('hueRotate',v)} suffix="°" defaultValue={0} />
                  <ModernSlider label={t('filter.sepia')} value={layer.sepia} min={0} max={1} step={0.05} onChange={v=>applyOne('sepia',v)} suffix="%" defaultValue={0} />
                  <div className="flex items-center justify-between rounded-xl bg-zinc-900/30 border border-zinc-700/30 px-2.5 py-2">
                    <span className="text-[11px] font-medium text-zinc-300">{t('filter.negative')}</span>
                    <Switch checked={!!layer.negative} onChange={v=>applyOne('negative',v as any)} />
                  </div>
                </div>
              )}
              <ModernSlider label={t('filter.blur')} value={layer.blur} min={0} max={20} step={0.5} onChange={v=>applyOne('blur',v)} suffix={t('effect.px')} defaultValue={0} />
            </Card>
          )}
          {background.type==='image' && background.imagePreview && (
            <Card title={t('panel.backgroundFilters') || 'Fundo — Filtros'} icon="🖼️" defaultOpen={isBackground} hint={t('panel.hintFilters')} onReset={() => setBackgroundEffects({ brightness:1, contrast:1, saturation:1, hueRotate:0, sepia:0, blur:0 })}>
              <ModernSlider label={t('filter.brightness')} value={background.brightness} min={0} max={2} step={0.05} onChange={v=>setBackgroundEffects({ brightness:v })} suffix="%" defaultValue={1} />
              <ModernSlider label={t('filter.contrast')} value={background.contrast} min={0} max={2} step={0.05} onChange={v=>setBackgroundEffects({ contrast:v })} suffix="%" defaultValue={1} />
              <ModernSlider label={t('filter.saturation')} value={background.saturation ?? 1} min={0} max={2} step={0.05} onChange={v=>setBackgroundEffects({ saturation:v })} suffix="%" defaultValue={1} />
              <ModernSlider label={t('filter.hue')} value={background.hueRotate ?? 0} min={0} max={360} step={1} onChange={v=>setBackgroundEffects({ hueRotate:v })} suffix="°" defaultValue={0} />
              <ModernSlider label={t('filter.sepia')} value={background.sepia ?? 0} min={0} max={1} step={0.05} onChange={v=>setBackgroundEffects({ sepia:v })} suffix="%" defaultValue={0} />
              <ModernSlider label={t('filter.blur')} value={background.blur} min={0} max={20} step={0.5} onChange={v=>setBackgroundEffects({ blur:v })} suffix={t('effect.px')} defaultValue={0} />
              <div>
                <p className="text-[11px] font-medium text-zinc-300 mb-1">{t('bg.scale')}</p>
                <select value={background.bgSize} onChange={e=>setBackgroundEffects({ bgSize: e.target.value as any })} className="w-full bg-zinc-800 rounded-xl px-2.5 py-2 text-[11px] text-white border border-zinc-700 focus:outline-none focus:border-[var(--accent)]">
                  <option value="cover">{t('bg.scaleCover')}</option>
                  <option value="contain">{t('bg.scaleContain')}</option>
                  <option value="100% 100%">{t('bg.scaleStretch')}</option>
                  <option value="auto">{t('bg.scaleOriginal')}</option>
                </select>
              </div>
            </Card>
          )}
        </>
      )}
      {/* Estilo — Cantos para imagem (movido de Ajustes para não duplicar) */}
      {!isBackground && effectiveTab==='style' && layer.type==='image' && (
        <Card title={t('panel.appearance')} icon="▢" hint={t('panel.hintAppearance')}>
          <ModernSlider label={t('image.cornerRadius')} value={Math.round(layer.borderRadiusPx ?? 0)} min={0} max={300} step={1} onChange={v=>applyOne('borderRadiusPx',v)} suffix={t('effect.px')} defaultValue={0} />
        </Card>
      )}

      {/* Efeitos — categoria definitiva */}
      {!isBackground && effectiveTab==='effects' && layer.vector?.shape !== 'bloom' && (
        <Card title={t('panel.effects')} icon="✨" defaultOpen badge={activeEffectsCount||undefined} hint={t('panel.hintEffects')}>
          {layer.type!=='vector' && (
            <EffectRow
              title={t('effect.outline')} icon="" enabled={!!layer.outline}
              onToggle={v=> v ? (applyOutline({color:'#FFFFFF',width:3}), applyOne('outlineWidthPx',3)) : (applyOutline(null), applyOne('outlineWidthPx',0))}
            >
              <div className="flex items-center gap-2"><ColorPalette value={layer.outline?.color ?? '#FFFFFF'} onChange={c=>applyOutline(cur=>({...cur,color:c}))} /><span className="text-[11px] font-mono text-zinc-400">{layer.outline?.color ?? '#FFFFFF'}</span></div>
              <ModernSlider label={t('effect.thickness')} value={Math.round(layer.outlineWidthPx ?? 0)} min={0} max={50} step={1} onChange={v=>applyOne('outlineWidthPx',v)} suffix={t('effect.px')} />
            </EffectRow>
          )}
          <EffectRow
            title={t('effect.shadowOuter')} icon="" enabled={!!layer.shadow && !(layer.shadow as any).inset}
            onToggle={v=>applyShadow(v ? {color:'#000000',blur:8,offsetX:0,offsetY:0,intensity:0.6,inset:false}:null)}
            presetChips={[
              {label:t('effect.shadowSoft'), action:()=>applyShadow({color:'#000000',blur:12,offsetX:0,offsetY:8,intensity:0.35,inset:false})},
              {label:t('effect.shadowCenter'), action:()=>applyShadow({color:'#000000',blur:10,offsetX:0,offsetY:0,intensity:0.6,inset:false})},
              {label:t('effect.shadowLong'), action:()=>applyShadow({color:'#000000',blur:2,offsetX:8,offsetY:8,intensity:0.6,inset:false})},
            ]}
          >
            <div className="flex items-center gap-2"><ColorPalette value={layer.shadow?.color ?? '#000000'} onChange={c=>applyShadow(cur=>({...cur,color:c}))} /><span className="text-[11px] font-mono text-zinc-400">{layer.shadow?.color ?? '#000000'}</span></div>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className="text-[10px] text-zinc-400">{t('effect.offsetX')}</span><input type="number" value={layer.shadow?.offsetX ?? 0} onChange={e=>{ const v=e.target.valueAsNumber; if(!isNaN(v)) applyShadow(cur=>({...cur,offsetX:v}))}} className="w-full bg-zinc-900 rounded-xl px-2 py-1 text-[11px] text-white border border-zinc-700" /></label>
              <label className="space-y-1"><span className="text-[10px] text-zinc-400">{t('effect.offsetY')}</span><input type="number" value={layer.shadow?.offsetY ?? 0} onChange={e=>{ const v=e.target.valueAsNumber; if(!isNaN(v)) applyShadow(cur=>({...cur,offsetY:v}))}} className="w-full bg-zinc-900 rounded-xl px-2 py-1 text-[11px] text-white border border-zinc-700" /></label>
            </div>
            <ModernSlider label={t('filter.blur')} value={layer.shadow?.blur ?? 8} min={0} max={50} step={1} onChange={v=>applyShadow(cur=>({...cur,blur:v}))} suffix={t('effect.px')} />
            <ModernSlider label={t('effect.intensity')} value={Math.round(((layer.shadow as any)?.intensity ?? 0.6)*100)} min={0} max={100} step={5} onChange={v=>applyShadow(cur=>({...cur,intensity:v/100}))} suffix="%" defaultValue={60} />
          </EffectRow>
          <EffectRow
            title={t('effect.innerShadow')} icon="" enabled={!!(layer as any).innerShadow || !!(layer.shadow as any)?.inset}
            onToggle={v=>{
              if(v) {
                const base = (layer as any).innerShadow || {color:'#000000',blur:12,offsetX:0,offsetY:0,intensity:0.5,inset:true}
                applyOne('innerShadow', {...base, inset:true} as any)
                if((layer.shadow as any)?.inset) applyShadow(null)
              } else {
                applyOne('innerShadow', null as any)
                if((layer.shadow as any)?.inset) applyShadow(null)
              }
            }}
            presetChips={[
              {label:t('effect.shadowSoft'), action:()=>applyOne('innerShadow', {color:'#000000',blur:12,offsetX:0,offsetY:4,intensity:0.35,inset:true} as any)},
              {label:t('effect.shadowStrong'), action:()=>applyOne('innerShadow', {color:'#000000',blur:6,offsetX:0,offsetY:0,intensity:0.6,inset:true} as any)},
              {label:t('effect.shadowLong'), action:()=>applyOne('innerShadow', {color:'#000000',blur:20,offsetX:0,offsetY:0,intensity:0.45,inset:true} as any)},
            ]}
          >
            {(() => {
              const eff = (layer as any).innerShadow || (layer.shadow?.inset ? layer.shadow : {color:'#000000',blur:8,offsetX:0,offsetY:0,intensity:0.5,inset:true})
              const upd = (patch: Partial<any>) => {
                const cur = (layer as any).innerShadow || eff
                applyOne('innerShadow', {...cur, ...patch, inset:true} as any)
              }
              return (
                <>
                  <div className="flex items-center gap-2"><ColorPalette value={eff.color} onChange={c=>upd({color:c})} /><span className="text-[11px] font-mono text-zinc-400">{eff.color}</span></div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1"><span className="text-[10px] text-zinc-400">{t('effect.offsetX')}</span><input type="number" value={eff.offsetX ?? 0} onChange={e=>{ const v=e.target.valueAsNumber; if(!isNaN(v)) upd({offsetX:v})}} className="w-full bg-zinc-900 rounded-xl px-2 py-1 text-[11px] text-white border border-zinc-700" /></label>
                    <label className="space-y-1"><span className="text-[10px] text-zinc-400">{t('effect.offsetY')}</span><input type="number" value={eff.offsetY ?? 0} onChange={e=>{ const v=e.target.valueAsNumber; if(!isNaN(v)) upd({offsetY:v})}} className="w-full bg-zinc-900 rounded-xl px-2 py-1 text-[11px] text-white border border-zinc-700" /></label>
                  </div>
                  <ModernSlider label={t('filter.blur')} value={eff.blur ?? 8} min={0} max={50} step={1} onChange={v=>upd({blur:v})} suffix={t('effect.px')} />
                  <ModernSlider label={t('effect.intensity')} value={Math.round((eff.intensity ?? 0.5)*100)} min={0} max={100} step={5} onChange={v=>upd({intensity:v/100})} suffix="%" defaultValue={50} />
                </>
              )
            })()}
          </EffectRow>
          {(layer as any).type!=='group' && (layer as any).type!=='mask' && (
            <EffectRow
              title={t('effect.bevelTitle')} icon="" enabled={!!layer.bevel?.enabled}
              onToggle={v=>applyOne('bevel', v ? {enabled:true,size:8,smoothing:3,strength:0.7,lightAngle:135,highlightColor:'rgba(255,255,255,0.9)',shadowColor:'rgba(0,0,0,0.6)'} as any : null as any)}
              presetChips={[
                {label:t('effect.bevelSubtle'), action:()=>applyOne('bevel', {...(layer.bevel ?? {enabled:true,size:8,smoothing:3,strength:0.7,lightAngle:135,highlightColor:'rgba(255,255,255,0.9)',shadowColor:'rgba(0,0,0,0.6)'}), size:4,smoothing:2,strength:0.45} as any)},
                {label:t('effect.bevelMedium'), action:()=>applyOne('bevel', {...(layer.bevel ?? {enabled:true,size:8,smoothing:3,strength:0.7,lightAngle:135,highlightColor:'rgba(255,255,255,0.9)',shadowColor:'rgba(0,0,0,0.6)'}), size:8,smoothing:3,strength:0.7} as any)},
                {label:t('effect.bevelStrong'), action:()=>applyOne('bevel', {...(layer.bevel ?? {enabled:true,size:8,smoothing:3,strength:0.7,lightAngle:135,highlightColor:'rgba(255,255,255,0.9)',shadowColor:'rgba(0,0,0,0.6)'}), size:14,smoothing:4,strength:0.85} as any)},
              ]}
            >
              <ModernSlider label={t('bevel.size')} value={safeNum(layer.bevel?.size,8)} min={0} max={20} step={1} onChange={v=>applyOne('bevel',{...(layer.bevel as any),size:v} as any)} suffix="px" />
              <ModernSlider label={t('bevel.smoothing')} value={safeNum(layer.bevel?.smoothing,3)} min={0} max={10} step={0.5} onChange={v=>applyOne('bevel',{...(layer.bevel as any),smoothing:v} as any)} />
              <ModernSlider label={t('bevel.strength')} value={safeNum(layer.bevel?.strength,0.7)} min={0} max={1} step={0.05} onChange={v=>applyOne('bevel',{...(layer.bevel as any),strength:v} as any)} />
              <ModernSlider label={t('bevel.angle')} value={safeNum(layer.bevel?.lightAngle,135)} min={0} max={360} step={5} onChange={v=>applyOne('bevel',{...(layer.bevel as any),lightAngle:v} as any)} suffix="°" />
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center gap-1.5 rounded-xl bg-zinc-900 border border-zinc-700 px-2 py-1.5"><span className="text-[10px] text-zinc-500">{t('bevel.light')}</span><ColorPalette value={layer.bevel?.highlightColor ?? 'rgba(255,255,255,0.9)'} onChange={c=>applyOne('bevel',{...(layer.bevel as any),highlightColor:c} as any)} /><span className="text-[10px] font-mono text-zinc-400 truncate">{layer.bevel?.highlightColor ?? 'rgba(255,255,255,0.9)'}</span></div>
                <div className="flex items-center gap-1.5 rounded-xl bg-zinc-900 border border-zinc-700 px-2 py-1.5"><span className="text-[10px] text-zinc-500">{t('bevel.shadow')}</span><ColorPalette value={layer.bevel?.shadowColor ?? 'rgba(0,0,0,0.6)'} onChange={c=>applyOne('bevel',{...(layer.bevel as any),shadowColor:c} as any)} /><span className="text-[10px] font-mono text-zinc-400 truncate">{layer.bevel?.shadowColor ?? 'rgba(0,0,0,0.6)'}</span></div>
              </div>
            </EffectRow>
          )}
        </Card>
      )}

      {/* Máscaras — agora universal: qualquer objeto (imagem, texto, emoji, vetor, balão) vira máscara com alpha preciso */}
      {effectiveTab==='effects' && (
        <Card title={t('panel.masks')} icon="🎭" hint={t('panel.hintMasks')}>
          {(() => {
            const masks = layer.masks ?? (layer.mask ? [layer.mask] : [])
            const uid = () => 'mask_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)
            const perMaskOptions = (maskId: string) => { const others=new Set(masks.filter(x=>x.id!==maskId).map(x=>x.sourceId)); return layers.filter(l=> l.id!==layer.id && l.type!=='group' && l.type!=='mask' && !others.has(l.id)) }
            const hasVectorSource = nonBgLayers.some(l=> l.id!==layer.id)
            const addVectorMaskShape = (shape: any) => {
              const st = useStore.getState()
              // cria vetor no centro da camada alvo, ligeiramente menor para máscara visível
              const w = Math.max(0.15, layer.width * 0.7)
              const h = Math.max(0.15, layer.height * 0.7)
              const x = layer.x + (layer.width - w)/2
              const y = layer.y + (layer.height - h)/2
              // addVectorLayer usa posição central padrão; vamos ajustar após criar
              st.addVectorLayer(shape, '#ffffff', '#000000', 0, true)
              // corrige posição para ficar alinhado com a imagem alvo
              setTimeout(()=>{
                const s = useStore.getState()
                const last = s.layers[s.layers.length-1]
                if(last && last.type==='vector'){
                  s.updateLayer(last.id, { x, y, width: w, height: h }, true)
                  // auto-adiciona como máscara
                  const curMasks = useStore.getState().layers.find(l=>l.id===layer.id)?.masks ?? masks
                  useStore.getState().updateLayer(layer.id, { masks: [...curMasks, { id: uid(), sourceId: last.id, mode: 'intersection' }] }, true)
                }
              }, 50)
            }
            const vectorOptions = nonBgLayers.filter(l=> l.type==='vector')
            return (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-zinc-400">{masks.length ? t('effect.maskCount', {n: masks.length}) : t('effect.maskNone')}</span>
                  <button disabled={perMaskOptions('').length===0} onClick={()=>updateLayer(layer.id,{masks:[...masks,{id:uid(),sourceId:perMaskOptions('')[0]?.id||'',mode:'intersection'}]},true)} className="text-[11px] px-2.5 py-1 rounded-full bg-white text-zinc-900 font-medium disabled:opacity-40">+ {t('effect.maskAdd')}</button>
                </div>

                {masks.map(m=>(
                  <div key={m.id} className="rounded-xl bg-zinc-900 border border-zinc-700 p-2.5 space-y-2">
                    <div className="flex items-center justify-between"><span className="text-[10px] text-zinc-400">{t('effect.maskSource')}</span><button onClick={()=>updateLayer(layer.id,{masks:masks.filter(x=>x.id!==m.id)},true)} className="text-zinc-500 hover:text-red-400 text-[11px]">✕</button></div>
                    <select value={m.sourceId} onChange={e=>updateLayer(layer.id,{masks:masks.map(x=>x.id===m.id?{...x,sourceId:e.target.value}:x)},true)} className="w-full bg-zinc-800 rounded-xl px-2 py-1.5 text-[11px] text-white border border-zinc-700">
                      <option value="" disabled>{t('effect.maskSelect')}</option>
                      {perMaskOptions(m.id).map(l=>(
                        <option key={l.id} value={l.id}>{l.name} — {l.type==='vector' ? (l.vector?.shape ?? 'bezier') : l.type==='text' ? 'texto' : l.type==='element' ? 'emoji' : 'imagem'}</option>
                      ))}
                      {m.sourceId && !layers.some(l=>l.id===m.sourceId) && <option value={m.sourceId}>{t('effect.maskMissing')}</option>}
                    </select>
                    <div className="grid grid-cols-2 gap-1">
                      {(['intersection','difference'] as const).map(mode=>(
                        <button key={mode} onClick={()=>updateLayer(layer.id,{masks:masks.map(x=>x.id===m.id?{...x,mode}:x)},true)} className={`py-1.5 rounded-xl text-[11px] font-medium border ${ (m.mode??'intersection')===mode ? 'bg-white text-zinc-900 border-white':'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>{mode==='intersection'?t('effect.maskIntersection'):t('effect.maskDifference')}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </Card>
      )}

      {/* Alinhamento — Transformar (definitivo) */}
      {effectiveTab==='transform' && (
        <Card title={t('panel.align')} icon="⊞" hint={t('effects.align')}>
          <div className="grid grid-cols-3 gap-1.5 max-w-[160px] mx-auto">
            {[
              {a:'top' as const, label:'↑', x:1,y:0}, {a:'center-v' as const,label:'↕', x:1,y:1}, {a:'bottom' as const,label:'↓', x:1,y:2},
              {a:'left' as const,label:'←', x:0,y:1}, {a:'center-h' as const,label:'◎', x:1,y:1}, {a:'right' as const,label:'→', x:2,y:1},
            ].map(({a,label})=>(
              <button key={a} onClick={()=> isMulti ? alignLayers(selectedLayerIds,a,alignPadding) : alignLayer(layer.id,a,alignPadding)} className="aspect-square rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 flex items-center justify-center text-[13px] hover:border-zinc-600 transition-colors" title={a}>{label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 justify-center">
            <span className="text-[11px] text-zinc-500">{t('effect.padding')}</span>
            <input type="number" min={0} max={50} value={alignPadding} onChange={e=>setAlignPadding(parseInt(e.target.value)||0)} className="w-14 bg-zinc-900 rounded-xl px-2 py-1 text-[11px] text-white border border-zinc-700 text-center" />
            <span className="text-[10px] text-zinc-500">{t('effect.px')}</span>
          </div>
          <p className="text-[10px] text-zinc-500 text-center leading-tight">{t('layers.alignHint')}</p>
        </Card>
      )}

      {layer.type==='text' && (
        <div className="flex gap-1.5 pt-1">
          <button onClick={handleSaveStyle} className="flex-1 py-1.5 rounded-xl bg-white text-zinc-900 border border-white text-[11px] font-semibold hover:bg-zinc-100 transition-colors">{t('panel.save')}</button>
          <button onClick={handleResetDefaults} className="flex-1 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[11px] text-zinc-400 hover:text-white transition-colors">{t('panel.reset')}</button>
        </div>
      )}
    </div>
  )
  } catch (err: any) {
    console.error('[EffectsControls] render crash', err)
    return (
      <div className="p-3 rounded-xl bg-red-900/20 border border-red-800 text-[11px] text-red-300">
        <p className="font-semibold">Erro no painel de propriedades</p>
        <p className="text-[10px] text-red-400/80 mt-1 break-words">{String(err?.message || err)}</p>
        <button onClick={() => window.location.reload()} className="mt-2 px-2 py-1 rounded bg-red-800 text-white text-[10px]">Recarregar</button>
      </div>
    )
  }
}
