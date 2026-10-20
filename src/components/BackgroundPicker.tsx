import { useState } from 'react'
import { t } from '@/i18n'
import { useStore } from '@/store'
import { COLOR_PRESETS, COLOR_SECTIONS } from '@/types'
import { CropModal } from './CropModal'
import { GradientPickerInline } from './GradientPicker'

function parseRGBA(s: string): { r: number; g: number; b: number; a: number } | null {
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  let m = s.match(/^#([0-9a-f]{3,8})$/i)
  if (m) {
    let h = m[1]
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    if (h.length === 6) h += 'ff'
    if (h.length === 8) {
      const r = parseInt(h.slice(0, 2), 16)
      const g = parseInt(h.slice(2, 4), 16)
      const b = parseInt(h.slice(4, 6), 16)
      const a = Math.round((parseInt(h.slice(6, 8), 16) / 255) * 100) / 100
      return { r, g, b, a }
    }
  }
  m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i)
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 }
  return null
}

function fmtRGBA(r: number, g: number, b: number, a: number): string {
  if (a >= 1) return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  return `rgba(${r},${g},${b},${a})`
}

import { PanelCard, PanelSlider } from './Panel'

export function BackgroundPicker() {
  const template = useStore((s) => s.template)
  const background = useStore((s) => s.background)
  const setBackgroundColor = useStore((s) => s.setBackgroundColor)
  const setBackgroundGradient = useStore((s) => s.setBackgroundGradient)
  const setBackgroundImage = useStore((s) => s.setBackgroundImage)
  const setError = useStore((s) => s.setError)

  const [showCrop, setShowCrop] = useState(false)
  const [customHex, setCustomHex] = useState(background.type === 'color' && background.color !== 'transparent' ? background.color : '#FFFFFF')
  const [showColors, setShowColors] = useState(true)

  const parsed = parseRGBA(background.type === 'color' ? background.color : '')
  const bgAlpha = parsed ? parsed.a : 1

  const handleAlpha = (a: number) => {
    if (!parsed) return
    const c = fmtRGBA(parsed.r, parsed.g, parsed.b, a)
    setCustomHex(c)
    setBackgroundColor(c)
  }

  const handleCustomColor = (hex: string) => {
    setCustomHex(hex)
    setBackgroundColor(hex)
  }

  const handleImportImage = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const file = await open({
        filters: [{ name: t('bg.filterImages'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'] }],
        multiple: false,
      })
      if (file) {
        const { readFile } = await import('@tauri-apps/plugin-fs')
        const data = await readFile(file as string)

        // Copy to permanent storage
        const { copyImageToStorage } = await import('@/store')
        const storagePath = await copyImageToStorage(file as string, data)

        const blob = new Blob([data], { type: 'image/png' })
        const url = URL.createObjectURL(blob)
        setBackgroundImage(storagePath, url)
      }
    } catch (e: any) {
      setError(t('bg.error', { msg: e?.message || 'unknown' }))
    }
  }

  const handleRemoveImage = () => {
    setBackgroundImage('', '')
  }

  return (
    <div className="space-y-3">
      <PanelCard title={t('bg.colors')} icon="🎨" defaultOpen>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
          <div>
            <p className="text-[9px] font-medium text-zinc-500 uppercase tracking-wider mb-1">★ {t('color.favorites')}</p>
            <div className="grid grid-cols-8 gap-1">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  className={`h-6 rounded-lg border-2 transition-all hover:scale-105 ${background.type === 'color' && background.color === c ? 'border-white scale-105 shadow' : 'border-zinc-700/30 hover:border-zinc-500'}`}
                  style={{ backgroundColor: c }}
                  onClick={() => handleCustomColor(c)}
                  title={c}
                />
              ))}
            </div>
          </div>
          {COLOR_SECTIONS.map((sec) => (
            <div key={sec.title}>
              <p className="text-[9px] font-medium text-zinc-500 uppercase tracking-wider mb-1">{sec.title}</p>
              <div className="grid grid-cols-8 gap-1">
                {sec.colors.map((c) => (
                  <button
                    key={c}
                    className={`h-6 rounded-lg border-2 transition-all hover:scale-105 ${background.type === 'color' && background.color === c ? 'border-white scale-105 shadow' : 'border-zinc-700/30 hover:border-zinc-500'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => handleCustomColor(c)}
                    title={c}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={background.type === 'color' && background.color !== 'transparent' ? (parsed ? `#${parsed.r.toString(16).padStart(2,'0')}${parsed.g.toString(16).padStart(2,'0')}${parsed.b.toString(16).padStart(2,'0')}` : background.color) : '#FFFFFF'}
            onChange={(e) => {
              const c = e.target.value
              const p = parseRGBA(background.type === 'color' ? background.color : '')
              const out = p ? fmtRGBA(parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16), p.a) : c
              handleCustomColor(out)
            }}
            className="w-9 h-9 rounded-xl cursor-pointer border border-zinc-700 bg-transparent p-0.5"
          />
          <input
            type="text"
            value={background.type === 'color' && background.color !== 'transparent' ? background.color : customHex}
            onChange={(e) => { const v = e.target.value; setCustomHex(v); if (/^#[0-9a-fA-F]{6}$|^rgba?\(/.test(v)) handleCustomColor(v) }}
            onBlur={() => { if (/^#[0-9a-fA-F]{6}$|^rgba?\(/.test(customHex)) handleCustomColor(customHex) }}
            placeholder={t('bg.hexPlaceholder')}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-2 text-[11px] text-zinc-300 font-mono outline-none focus:border-[var(--accent)]"
          />
        </div>
        {background.type === 'color' && background.color !== 'transparent' && parsed && (
          <PanelSlider label={t('color.alpha')} value={bgAlpha} min={0} max={1} step={0.01} onChange={handleAlpha} suffix="%" defaultValue={1} />
        )}
      </PanelCard>

      <PanelCard title={t('bg.gradients')} icon="🌈">
        <GradientPickerInline
          selectedGradient={background.type === 'gradient' ? background.gradient : ''}
          onSelect={(g) => setBackgroundGradient(g)}
          cols={2}
        />
      </PanelCard>

      <PanelCard title={t('bg.custom')} icon="🖼️" defaultOpen>
        <button onClick={handleImportImage} className="w-full py-2.5 rounded-xl bg-white text-zinc-900 text-[11px] font-semibold hover:bg-zinc-100 transition-colors">
          {t('bg.importImage')}
        </button>
        {background.imagePreview && (
          <div className="relative rounded-xl overflow-hidden border border-zinc-700">
            <img
              src={background.imagePreview} alt=""
              className="w-full h-24 object-cover cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setShowCrop(true)}
            />
            <button
              onClick={handleRemoveImage}
              className="absolute top-1.5 right-1.5 bg-black/70 text-white text-[11px] w-6 h-6 rounded-full flex items-center justify-center hover:bg-black/90"
            >
              ✕
            </button>
          </div>
        )}
      </PanelCard>

      {showCrop && background.imagePreview && (
        <CropModal
          imageUrl={background.imagePreview}
          onClose={() => setShowCrop(false)}
          onApply={(dataUrl) => {
            setBackgroundImage(background.imagePath, dataUrl)
          }}
          ratioLock={template ? { w: template.width, h: template.height } : undefined}
        />
      )}
    </div>
  )
}
