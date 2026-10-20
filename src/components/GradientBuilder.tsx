import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { t } from '@/i18n'
import { addCustomGradient } from '@/store'
import { ColorPalette } from './ColorPalette'

const DIRECTIONS = [
  { label: '0°', value: 0 },
  { label: '45°', value: 45 },
  { label: '90°', value: 90 },
  { label: '135°', value: 135 },
  { label: '180°', value: 180 },
  { label: '225°', value: 225 },
  { label: '270°', value: 270 },
  { label: '315°', value: 315 },
]

type GradientType = 'linear' | 'radial'

function makeGradient(angle: number, stops: string[], type: GradientType = 'linear'): string {
  const parts = stops.map((c, i) => {
    const pos = stops.length === 1 ? '' : ` ${Math.round((i / (stops.length - 1)) * 100)}%`
    return c + pos
  })
  if (type === 'radial') return `radial-gradient(circle, ${parts.join(', ')})`
  return `linear-gradient(${angle}deg, ${parts.join(', ')})`
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

export function GradientBuilderPopup({
  anchorX, anchorY,
  onPreview, onAdd, onClose,
  initialAngle, initialStops, initialType, editId,
}: {
  anchorX: number; anchorY: number
  onPreview: (value: string) => void
  onAdd: () => void
  onClose: () => void
  initialAngle?: number
  initialStops?: string[]
  initialType?: GradientType
  editId?: string
}) {
  const [gradientType, setGradientType] = useState<GradientType>(initialType ?? 'linear')
  const [angle, setAngle] = useState(initialAngle ?? 135)
  const [stops, setStops] = useState<string[]>(initialStops ?? ['#00d2ff', '#3a7bd5'])
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const popupRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null)

  const preview = makeGradient(angle, stops, gradientType)

  // Send preview on every change
  useEffect(() => { onPreview(preview) }, [preview])

  // Position near anchor, keeping within viewport
  useEffect(() => {
    if (popupRef.current) {
      const pr = popupRef.current.getBoundingClientRect()
      let x = Math.max(4, anchorX - pr.width / 2)
      let y = anchorY + 10
      if (y + pr.height > window.innerHeight - 4) y = anchorY - pr.height - 10
      x = Math.max(4, Math.min(x, window.innerWidth - pr.width - 4))
      y = Math.max(4, Math.min(y, window.innerHeight - pr.height - 4))
      setPos({ x, y })
    }
  }, [anchorX, anchorY])

  const addStop = () => {
    if (stops.length >= 6) return
    setStops([...stops, stops[stops.length - 1] || '#000000'])
  }

  const removeStop = (i: number) => {
    if (stops.length <= 2) return
    setStops(stops.filter((_, idx) => idx !== i))
  }

  const updateStop = (i: number, color: string) => {
    const next = [...stops]
    next[i] = color
    setStops(next)
  }

  const handleAdd = () => {
    if (editId) {
      import('@/store').then(({ writeCustomGradients, readCustomGradients }) => {
        const all = readCustomGradients()
        const idx = all.findIndex(g => g.id === editId)
        if (idx >= 0) {
          all[idx] = { ...all[idx], value: preview, angle, stops: [...stops], type: gradientType }
          writeCustomGradients(all)
        }
      })
    } else {
      addCustomGradient({
        id: 'grad_' + makeId(),
        name: '',
        value: preview,
        angle,
        stops: [...stops],
        type: gradientType,
      })
    }
    onAdd()
  }

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragStart.current = { sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const onMouseMove = (e: MouseEvent) => {
    if (!dragStart.current || !popupRef.current) return
    const dx = e.clientX - dragStart.current.sx
    const dy = e.clientY - dragStart.current.sy
    const pr = popupRef.current.getBoundingClientRect()
    setPos({
      x: Math.max(4, Math.min(dragStart.current.px + dx, window.innerWidth - pr.width - 4)),
      y: Math.max(4, Math.min(dragStart.current.py + dy, window.innerHeight - pr.height - 4)),
    })
  }

  const onMouseUp = () => {
    dragStart.current = null
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }

  const content = (
    <div className="fixed inset-0 z-[10000]" data-no-deselect="true" onClick={onClose} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <div
        ref={popupRef}
        className="absolute bg-zinc-800 border border-zinc-600 rounded-xl shadow-2xl p-3 w-64"
        style={{ left: pos.x, top: pos.y, zIndex: 10001 }}
        data-no-deselect="true"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between mb-2 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={onMouseDown}
        >
          <span className="text-[10px] text-zinc-400 font-medium">{t('gradient.create')}</span>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xs">✕</button>
        </div>

        <div className="h-8 rounded-lg border border-zinc-700 mb-2" style={{ background: preview }} />

        <div className="flex items-center justify-between mb-1">
          <p className="text-[9px] text-zinc-500">{gradientType === 'linear' ? t('gradient.direction') : 'Radial'}</p>
          <button
            onClick={() => setGradientType(gradientType === 'linear' ? 'radial' : 'linear')}
            className={`text-[9px] px-2 py-0.5 rounded transition-colors ${gradientType === 'radial' ? 'bg-blue-600/30 text-blue-300' : 'bg-zinc-700/30 text-zinc-500 hover:text-zinc-300'}`}
          >
            {gradientType === 'linear' ? '◯ Radial' : '↗ Linear'}
          </button>
        </div>
        {gradientType === 'linear' && (
          <div className="grid grid-cols-4 gap-1 mb-2">
            {DIRECTIONS.map((d) => (
              <button key={d.value}
                onClick={() => setAngle(d.value)}
                className={`text-[9px] py-1 rounded transition-colors ${angle === d.value ? 'bg-blue-600/30 text-blue-300' : 'bg-zinc-700/30 text-zinc-500 hover:text-zinc-300'}`}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between mb-1">
          <p className="text-[9px] text-zinc-500">{t('gradient.colors')}</p>
          {stops.length < 6 && (
            <button onClick={addStop} className="text-[9px] text-blue-400 hover:text-blue-300">+ {t('gradient.addStop')}</button>
          )}
        </div>

        <div className="flex gap-0.5 mb-1.5" style={{ height: 20 }}>
          {stops.map((c, i) => (
            <div key={i} className="flex-1 relative group">
              <ColorPalette value={c} onChange={(color) => updateStop(i, color)}
                buttonClassName={`w-full h-full rounded border-0 cursor-pointer block`} />
              {stops.length > 2 && (
                <button
                  onClick={() => removeStop(i)}
                  className="absolute -top-1.5 -right-0.5 text-[6px] text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100 bg-zinc-900/80 rounded-full w-3 h-3 flex items-center justify-center"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-1 mb-3">
          {stops.map((c, i) => (
            <div key={i} className="flex items-center gap-1">
              <ColorPalette value={c} onChange={(color) => updateStop(i, color)} />
              <input value={c}
                onChange={(e) => updateStop(i, e.target.value)}
                className="flex-1 bg-zinc-700/50 rounded px-1 py-0.5 text-[9px] text-white font-mono border border-zinc-600 focus:outline-none focus:border-blue-500" />
            </div>
          ))}
        </div>

        <button onClick={handleAdd}
          className="w-full text-[10px] bg-blue-600 hover:bg-blue-500 text-white py-1.5 rounded-lg transition-colors">
          ✚ {t('gradient.add')}
        </button>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
