import { useEffect, useRef, useState } from 'react'
import { t } from '@/i18n'
import { useStore } from '@/store'

export function GlobalEffects() {
  const globalEffects = useStore((s) => s.globalEffects)
  const setGlobalEffects = useStore((s) => s.setGlobalEffects)
  const setShowGlobalEffects = useStore((s) => s.setShowGlobalEffects)
  const language = useStore((s) => s.language)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowGlobalEffects(false)
      }
    }
    document.addEventListener('mousedown', handleClick, true)
    return () => document.removeEventListener('mousedown', handleClick, true)
  }, [setShowGlobalEffects])

  function onDragStart(e: React.MouseEvent) {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: pos.x, posY: pos.y }
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return
      setPos({
        x: dragRef.current.posX + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.posY + (ev.clientY - dragRef.current.startY),
      })
    }
    function onUp() { dragRef.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const sliders = [
    { key: 'brightness' as const, min: 0, max: 2, step: 0.01, label: t('filter.brightness') },
    { key: 'contrast' as const, min: 0, max: 2, step: 0.01, label: t('filter.contrast') },
    { key: 'saturation' as const, min: 0, max: 2, step: 0.01, label: t('filter.saturation') },
    { key: 'blur' as const, min: 0, max: 10, step: 0.1, label: t('filter.blur') },
    { key: 'sepia' as const, min: 0, max: 1, step: 0.01, label: t('filter.sepia') },
    { key: 'hueRotate' as const, min: 0, max: 360, step: 1, label: t('filter.hue') },
  ]

  const displayVal = (key: string, val: number) => {
    if (key === 'blur') return val.toFixed(1) + t('effect.px')
    if (key === 'hueRotate') return Math.round(val) + t('effect.deg')
    if (key === 'sepia') return Math.round(val * 100) + t('effect.percent')
    return Math.round(val * 100) + t('effect.percent')
  }

  return (
    <div className="fixed z-50" style={{ left: pos.x, top: pos.y }} ref={panelRef}>
      <div className="bg-zinc-800 rounded-xl p-5 w-72 shadow-2xl border border-zinc-700/50">
        <div className="flex items-center justify-between mb-4 cursor-grab active:cursor-grabbing select-none" onMouseDown={onDragStart}>
          <h3 className="text-sm font-semibold text-white">{t('global.title')}</h3>
          <button onClick={() => setShowGlobalEffects(false)} className="text-zinc-500 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-zinc-700/50 transition-colors">✕</button>
        </div>
        <div className="space-y-3">
          {sliders.map(({ key, min, max, step, label }) => {
            const val = globalEffects[key]
            const isPct = key !== 'blur' && key !== 'hueRotate' && max <= 2
            const display = isPct ? Math.round(val * 100) : val
            return (
              <div key={key}>
                <div className="flex justify-between text-[10px] text-zinc-400 mb-1">
                  <span>{label}</span>
                  <input
                    type="number"
                    defaultValue={display}
                    key={display}
                    min={isPct ? Math.round(min * 100) : min}
                    max={isPct ? Math.round(max * 100) : max}
                    step={isPct ? 1 : step}
                    onChange={(e) => { let raw = parseFloat(e.target.value); if (isNaN(raw)) return; if (isPct) raw /= 100; raw = Math.max(min, Math.min(max, raw)); setGlobalEffects({ [key]: Math.round(raw * 1000) / 1000 }) }}
                    onBlur={(e) => { let raw = parseFloat(e.target.value); if (isNaN(raw)) return; if (isPct) raw /= 100; raw = Math.max(min, Math.min(max, raw)); const snapped = Math.round(raw / step) * step; setGlobalEffects({ [key]: Math.round(snapped * 1000) / 1000 }) }}
                    className="w-10 text-right text-[9px] text-zinc-400 tabular-nums bg-zinc-800/60 border border-zinc-700/50 rounded px-1 py-0.5 outline-none focus:border-zinc-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <input
                  type="range" min={min} max={max} step={step}
                  value={val}
                  onChange={(e) => setGlobalEffects({ [key]: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
            )
          })}
        </div>
        <button
          onClick={() => setGlobalEffects({ brightness: 1, contrast: 1, saturation: 1, blur: 0, sepia: 0, hueRotate: 0 })}
          className="mt-4 w-full text-[10px] text-zinc-500 hover:text-zinc-300 py-1.5 rounded bg-zinc-700/40 hover:bg-zinc-700/60 transition-colors"
        >
          {t('global.reset')}
        </button>
      </div>
    </div>
  )
}
