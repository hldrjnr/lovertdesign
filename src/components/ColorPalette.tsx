import { useState, useRef, useEffect, memo } from 'react'
import { createPortal } from 'react-dom'
import { t } from '@/i18n'
import { COLOR_PRESETS, COLOR_SECTIONS } from '@/types'
import { CLOSE_COLOR_POPUPS_EVENT } from '@/colorPopup'

function parseRGBA(v: string): { r: number; g: number; b: number; a: number } | null {
  const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/)
  if (m) return { r: Math.min(255, +m[1]), g: Math.min(255, +m[2]), b: Math.min(255, +m[3]), a: m[4] !== undefined ? Math.min(1, +m[4]) : 1 }
  const h = v.match(/^#?([0-9A-Fa-f]{3,8})$/)
  if (h) {
    let hex = h[1]
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('') + 'ff'
    if (hex.length === 4) hex = hex.split('').map(c => c + c).join('')
    if (hex.length === 6) hex = hex + 'ff'
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: parseInt(hex.slice(6, 8), 16) / 255 }
  }
  return null
}

function fmtRGBA(r: number, g: number, b: number, a: number): string {
  const rr = Math.round(r), gg = Math.round(g), bb = Math.round(b)
  if (a >= 0.999) {
    return '#' + [rr, gg, bb].map(c => c.toString(16).padStart(2, '0')).join('')
  }
  return `rgba(${rr}, ${gg}, ${bb}, ${a.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')})`
}

const ColorPalette = memo(function ColorPalette({ value, onChange, buttonClassName }: { value: string; onChange: (c: string) => void; buttonClassName?: string }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const parsed = parseRGBA(value) ?? { r: 0, g: 0, b: 0, a: 1 }
  const [alpha, setAlpha] = useState(parsed.a)
  const [textInput, setTextInput] = useState(value)
  const [pos, setPos] = useState({ left: 0, top: 0 })

  useEffect(() => {
    setAlpha(parsed.a)
  }, [value])

  // Fecho externo (ex.: primeiro clique fora só dispensa o popup, sem desselecionar)
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener(CLOSE_COLOR_POPUPS_EVENT, close)
    return () => window.removeEventListener(CLOSE_COLOR_POPUPS_EVENT, close)
  }, [open])

  useEffect(() => {
    if (!open) return
    const updatePos = () => {
      const btn = buttonRef.current
      if (!btn) return
      const r = btn.getBoundingClientRect()
      const pw = 268, ph = 330
      let left = r.left
      let top = r.bottom + 6
      // clamp dentro da janela
      if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8
      if (left < 8) left = 8
      if (top + ph > window.innerHeight - 8) top = r.top - ph - 6
      if (top < 8) top = 8
      setPos({ left, top })
    }
    updatePos()
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (buttonRef.current && buttonRef.current.contains(t)) return
      if (popupRef.current && popupRef.current.contains(t)) return
      setOpen(false)
    }
    window.addEventListener('pointerdown', handler, true)
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => { window.removeEventListener('pointerdown', handler, true); window.removeEventListener('resize', updatePos); window.removeEventListener('scroll', updatePos, true) }
  }, [open])

  const isSelected = (c: string) =>
    !!parseRGBA(c) && fmtRGBA(parsed.r, parsed.g, parsed.b, 1).toLowerCase() === c.toLowerCase()

  const swatch = (c: string) => (
    <button
      key={c}
      className={`w-5 h-5 rounded-sm border transition-all hover:scale-125 ${
        isSelected(c)
          ? 'border-white ring-1 ring-white scale-110'
          : 'border-zinc-700 hover:border-zinc-400'
      }`}
      style={{ backgroundColor: c }}
      onClick={() => pick(c)}
      title={c}
    />
  )

  const pick = (c: string) => {
    const p = parseRGBA(c) ?? { r: 0, g: 0, b: 0, a: 1 }
    const out = fmtRGBA(p.r, p.g, p.b, alpha)
    onChange(out)
    setTextInput(out)
  }

  const handleAlpha = (a: number) => {
    setAlpha(a)
    const out = fmtRGBA(parsed.r, parsed.g, parsed.b, a)
    onChange(out)
    setTextInput(out)
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => { setOpen(!open); setTextInput(value) }}
        className={buttonClassName ?? "w-6 h-6 rounded border border-zinc-600 hover:border-zinc-400 transition-colors cursor-pointer shrink-0"}
        style={{ backgroundColor: value }}
        title={t('color.palette')}
      />
      {open && createPortal(
        <div ref={popupRef} data-no-deselect="true" data-color-popup="true" className="fixed z-[200000] bg-zinc-800 border border-zinc-600 rounded-lg p-2 shadow-2xl" style={{ left: pos.left, top: pos.top, width: 268 }}
          onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <div className="max-h-56 overflow-y-auto pr-0.5 space-y-2">
            <div>
              <p className="text-[9px] font-medium text-zinc-400 uppercase tracking-wider mb-1">★ {t('color.favorites')}</p>
              <div className="flex flex-wrap gap-0.5">
                {COLOR_PRESETS.map(swatch)}
              </div>
            </div>
            {COLOR_SECTIONS.map((sec) => (
              <div key={sec.title}>
                <p className="text-[9px] font-medium text-zinc-500 uppercase tracking-wider mb-1">{sec.title}</p>
                <div className="flex flex-wrap gap-0.5">
                  {sec.colors.map(swatch)}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-700">
            <input
              type="color"
              value={'#' + [parsed.r, parsed.g, parsed.b].map(c => c.toString(16).padStart(2, '0')).join('')}
              onChange={(e) => { const out = fmtRGBA(parseInt(e.target.value.slice(1,3),16), parseInt(e.target.value.slice(3,5),16), parseInt(e.target.value.slice(5,7),16), alpha); onChange(out); setTextInput(out) }}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 shrink-0"
            />
            <input
              type="text"
              value={textInput}
              onChange={(e) => { setTextInput(e.target.value); const p = parseRGBA(e.target.value); if (p) { setAlpha(p.a); onChange(fmtRGBA(p.r, p.g, p.b, p.a)) } }}
              onBlur={() => setTextInput(value)}
              className="flex-1 bg-zinc-700/50 rounded px-1.5 py-0.5 text-[10px] text-zinc-300 font-mono border border-zinc-600 focus:outline-none focus:border-blue-500"
              placeholder={t('color.placeholder')}
            />
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[9px] text-zinc-500 w-8">{t('color.alpha')}</span>
            <input type="range" min={0} max={1} step={0.01} value={alpha}
              onChange={(e) => handleAlpha(parseFloat(e.target.value))}
              className="flex-1" />
            <span className="text-[9px] text-zinc-500 tabular-nums w-8 text-right">{Math.round(alpha * 100)}%</span>
          </div>
        </div>
      , document.body)}
    </>
  )
})

export { ColorPalette }
