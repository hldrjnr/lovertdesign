import { useState, useMemo } from 'react'
import { t } from '@/i18n'
import { useStore } from '@/store'
import { VECTOR_SHAPES, EMOJI_CATEGORIES } from '@/types'
import type { VectorShape } from '@/types'

function VectorPreview({ shape, size = 32 }: { shape: VectorShape; size?: number }) {
  const s = size
  const h = s / 2
  const sw = 2
  const isOpen = shape === 'line' || shape === 'arrow' || shape === 'cross'
  const isBloom = shape === 'bloom'
  const props = { width: s, height: s, viewBox: `0 0 ${s} ${s}`, fill: isOpen ? 'none' : 'currentColor', stroke: isBloom ? 'none' : 'currentColor', strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (shape) {
    case 'line':
      return <svg {...props}><line x1={sw} y1={h} x2={s - sw} y2={h} /></svg>
    case 'arrow':
      return <svg {...props}><path d={`M ${sw},${h} L ${s - sw},${h} M ${s - sw},${h} L ${s - sw * 2.2},${h - sw * 2} M ${s - sw},${h} L ${s - sw * 2.2},${h + sw * 2}`} /></svg>
    case 'curved-arrow':
      return <svg {...props}><path d={`M ${s*0.035},${s*0.553} C ${s*0.059},${s*0.52} ${s*0.216},${s*0.327} ${s*0.44},${s*0.321} C ${s*0.721},${s*0.314} ${s*0.849},${s*0.508} ${s*0.849},${s*0.508} l ${s*0.09},${-s*0.169} l ${s*0.026},${s*0.389} l ${-s*0.37},${-s*0.064} l ${s*0.174},${-s*0.071} C ${s*0.689},${s*0.492} ${s*0.59},${s*0.413} ${s*0.444},${s*0.411} C ${s*0.314},${s*0.411} ${s*0.178},${s*0.452} ${s*0.035},${s*0.553} Z`} /></svg>
    case 'rounded-rect':
      return <svg {...props}><rect x={sw} y={sw} width={s - sw * 2} height={s - sw * 2} rx={4} /></svg>
    case 'circle':
      return <svg {...props}><circle cx={h} cy={h} r={h - sw} /></svg>
    case 'diamond':
      return <svg {...props}><polygon points={`${h},${sw + 1} ${s - sw - 1},${h} ${h},${s - sw - 1} ${sw + 1},${h}`} /></svg>
    case 'triangle':
      return <svg {...props}><polygon points={`${h},${sw} ${s - sw},${s - sw} ${sw},${s - sw}`} /></svg>
    case 'pentagon': {
      const pts5: string[] = []
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 / 5) * i - Math.PI / 2
        pts5.push(`${h + (h - sw - 1) * Math.cos(a)},${h + (h - sw - 1) * Math.sin(a)}`)
      }
      return <svg {...props}><polygon points={pts5.join(' ')} /></svg>
    }
    case 'hexagon': {
      const pts: string[] = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2
        pts.push(`${h + (h - sw) * Math.cos(a)},${h + (h - sw) * Math.sin(a)}`)
      }
      return <svg {...props}><polygon points={pts.join(' ')} /></svg>
    }
    case 'star': {
      const pts: string[] = []
      for (let i = 0; i < 10; i++) {
        const a = (Math.PI / 5) * i - Math.PI / 2
        const r = i % 2 === 0 ? h - sw : (h - sw) * 0.45
        pts.push(`${h + r * Math.cos(a)},${h + r * Math.sin(a)}`)
      }
      return <svg {...props}><polygon points={pts.join(' ')} /></svg>
    }
    case 'cross':
      return <svg {...props}><path d={`M ${sw + 2},${sw + 2} L ${s - sw - 2},${s - sw - 2} M ${s - sw - 2},${sw + 2} L ${sw + 2},${s - sw - 2}`} /></svg>
    case 'plus':
      return <svg {...props}><path d={`M${h},${sw} v${s - sw * 2} M${sw},${h} h${s - sw * 2}`} /></svg>
    case 'lightning':
      return <svg {...props}><path d={`M ${s * 0.62},${s * 0.02} L ${s * 0.18},${s * 0.55} H ${s * 0.4} L ${s * 0.28},${s * 0.98} L ${s * 0.82},${s * 0.42} H ${s * 0.6} Z`} /></svg>
    case 'heart':
      return <svg {...props}><path d={`M ${s * 0.5},${s * 0.35} C ${s * 0.5},${s * 0.2} ${s * 0.2},${s * 0.2} ${s * 0.2},${s * 0.4} C ${s * 0.2},${s * 0.6} ${s * 0.5},${s * 0.85} ${s * 0.5},${s * 0.85} C ${s * 0.5},${s * 0.85} ${s * 0.8},${s * 0.6} ${s * 0.8},${s * 0.4} C ${s * 0.8},${s * 0.2} ${s * 0.5},${s * 0.2} ${s * 0.5},${s * 0.35} Z`} /></svg>
    case 'arrow-right':
      return <svg {...props}><path d={`M${sw},${h} h${s - sw * 2} M${h + 4},${sw + 4} L${s - sw},${h} L${h + 4},${s - sw - 4}`} /></svg>
    case 'bloom': {
      const gradId = `bloom-prev-${size}`
      return (
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          <defs>
            <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="currentColor" stopOpacity={1} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </radialGradient>
          </defs>
          <circle cx={h} cy={h} r={h - sw} fill={`url(#${gradId})`} stroke="none" />
        </svg>
      )
    }
    case 'speech-bubble-left':
      return <svg width={s} height={s} viewBox="0 0 100 100" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M 12 0 H 88 A 12 12 0 0 1 100 12 V 70 A 12 12 0 0 1 88 82 H 28 L 10 90 L 20 82 H 12 A 12 12 0 0 1 0 70 V 12 A 12 12 0 0 1 12 0 Z" /></svg>
    case 'speech-bubble-right':
      return <svg width={s} height={s} viewBox="0 0 100 100" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M 12 0 H 88 A 12 12 0 0 1 100 12 V 70 A 12 12 0 0 1 88 82 H 80 L 90 90 L 72 82 H 12 A 12 12 0 0 1 0 70 V 12 A 12 12 0 0 1 12 0 Z" /></svg>
    case 'thought-bubble':
      return <svg width={s} height={s} viewBox="0 0 100 100" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><ellipse cx={50} cy={38} rx={42} ry={28} /><ellipse cx={28} cy={72} rx={10} ry={8} /><ellipse cx={14} cy={88} rx={6} ry={5} /></svg>
    case 'speech-bubble-wide':
      return <svg width={s} height={s} viewBox="0 0 100 100" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M 4 0 H 96 A 4 4 0 0 1 100 4 V 64 A 4 4 0 0 1 96 68 H 58 L 50 90 L 42 68 H 4 A 4 4 0 0 1 0 64 V 4 A 4 4 0 0 1 4 0 Z" /></svg>
    case 'speech-bubble-wide-left':
      return <svg width={s} height={s} viewBox="0 0 100 100" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M 4 0 H 96 A 4 4 0 0 1 100 4 V 64 A 4 4 0 0 1 96 68 H 28 L 10 90 L 20 68 H 4 A 4 4 0 0 1 0 64 V 4 A 4 4 0 0 1 4 0 Z" /></svg>
    case 'speech-bubble-wide-right':
      return <svg width={s} height={s} viewBox="0 0 100 100" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M 4 0 H 96 A 4 4 0 0 1 100 4 V 64 A 4 4 0 0 1 96 68 H 80 L 90 90 L 72 68 H 4 A 4 4 0 0 1 0 64 V 4 A 4 4 0 0 1 4 0 Z" /></svg>
    case 'speech-bubble-tall':
      return <svg width={s} height={s} viewBox="0 0 100 100" fill="currentColor" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M 12 0 H 70 A 12 12 0 0 1 82 12 V 40 L 100 50 L 82 60 V 88 A 12 12 0 0 1 70 100 H 12 A 12 12 0 0 1 0 88 V 12 A 12 12 0 0 1 12 0 Z" /></svg>
    default:
      return <svg {...props}><rect x={sw} y={sw} width={s - sw * 2} height={s - sw * 2} /></svg>
  }
}

const HIDDEN_VECTORS_KEY = 'thumbnail-app.hidden-vectors.v1'
function readHiddenVectors(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_VECTORS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return new Set(Array.isArray(arr) ? arr : [])
  } catch { return new Set() }
}
function writeHiddenVectors(ids: Set<string>) {
  try { localStorage.setItem(HIDDEN_VECTORS_KEY, JSON.stringify([...ids])) } catch {}
}

function BezierPathPreview({ vectorPath, size = 28 }: { vectorPath: any; size?: number }) {
  const s = size
  const sw = 2
  if (!vectorPath?.points?.length) return <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}><rect x={sw} y={sw} width={s - sw*2} height={s - sw*2} fill="none" stroke="currentColor" strokeWidth={sw} /></svg>
  const pts = vectorPath.points
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    if (p.handleIn) { minX = Math.min(minX, p.x + p.handleIn.x); maxX = Math.max(maxX, p.x + p.handleIn.x); minY = Math.min(minY, p.y + p.handleIn.y); maxY = Math.max(maxY, p.y + p.handleIn.y) }
    if (p.handleOut) { minX = Math.min(minX, p.x + p.handleOut.x); maxX = Math.max(maxX, p.x + p.handleOut.x); minY = Math.min(minY, p.y + p.handleOut.y); maxY = Math.max(maxY, p.y + p.handleOut.y) }
  }
  const pad = 4
  const w = Math.max(1, maxX - minX)
  const h = Math.max(1, maxY - minY)
  const vbX = minX - pad, vbY = minY - pad, vbW = w + pad*2, vbH = h + pad*2
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i-1], cur = pts[i]
    const isBez = cur.type === 'bezier' || prev.type === 'bezier'
    if (isBez) d += ` C ${prev.x + (prev.handleOut?.x ?? 0)} ${prev.y + (prev.handleOut?.y ?? 0)}, ${cur.x + (cur.handleIn?.x ?? 0)} ${cur.y + (cur.handleIn?.y ?? 0)}, ${cur.x} ${cur.y}`
    else d += ` L ${cur.x} ${cur.y}`
  }
  if (vectorPath.closed) d += ' Z'
  return (
    <svg width={s} height={s} viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} fill="none" stroke="currentColor" strokeWidth={sw * (Math.max(vbW, vbH)/100)} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} fill={vectorPath.closed ? (vectorPath.fillColor || 'currentColor') : 'none'} stroke={vectorPath.strokeColor || 'currentColor'} />
    </svg>
  )
}

export function ElementsPanel() {
  const addElementLayer = useStore((s) => s.addElementLayer)
  const addVectorLayer = useStore((s) => s.addVectorLayer)
  const customVectors = useStore((s) => s.customVectors)
  const removeCustomVector = useStore((s) => s.removeCustomVector)
  const addCustomVectorLayer = useStore((s) => s.addCustomVectorLayer)
  const language = useStore((s) => s.language)
  const [tab, setTab] = useState<'vector' | 'emoji'>('emoji')
  const [emojiCat, setEmojiCat] = useState(0)
  const [query, setQuery] = useState('')
  const [hiddenVectors, setHiddenVectors] = useState<Set<string>>(() => readHiddenVectors())
  const hideVector = (id: string) => {
    const next = new Set(hiddenVectors)
    next.add(id)
    setHiddenVectors(next)
    writeHiddenVectors(next)
  }
  const visibleShapes = useMemo(() => VECTOR_SHAPES.filter((s) => !hiddenVectors.has(s.id)), [hiddenVectors])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    const items: { name: string; content: string; cat: string }[] = []
    for (const c of EMOJI_CATEGORIES) {
      for (const it of c.items) {
        if (it.name.toLowerCase().includes(q) || it.content.includes(q) || c.name.toLowerCase().includes(q)) {
          items.push({ name: it.name, content: it.content, cat: c.name })
        }
      }
    }
    return items
  }, [query])

  const category = EMOJI_CATEGORIES[emojiCat]
  const visibleItems = filtered ?? (category ? category.items : [])

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        <button
          onClick={() => setTab('emoji')}
          className={`tab-btn flex-1 text-xs ${tab === 'emoji' ? 'active' : ''}`}
        >{t('element.emojis')}</button>
        <button
          onClick={() => setTab('vector')}
          className={`tab-btn flex-1 text-xs ${tab === 'vector' ? 'active' : ''}`}
        >{t('element.vectors')}</button>
      </div>

      {tab === 'emoji' && (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('element.search')}
            className="w-full bg-zinc-700/50 rounded-lg px-2 py-1.5 text-xs text-white border border-zinc-600 focus:outline-none focus:border-blue-500"
          />
          {!filtered && (
            <div className="flex gap-1 flex-wrap">
              {EMOJI_CATEGORIES.map((c, i) => (
                <button
                  key={c.name}
                  onClick={() => setEmojiCat(i)}
                  className={`tab-btn text-[10px] ${emojiCat === i ? 'active' : ''}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {visibleItems.length === 0 ? (
            <p className="text-[10px] text-zinc-500 text-center py-4">{t('element.noResults')}</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {visibleItems.map((item, idx) => (
                <button
                  key={`${item.name}-${idx}`}
                  onClick={(e) => { e.stopPropagation(); addElementLayer(item.content, item.name) }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="element-grid-btn"
                  title={item.name}
                >
                  {item.content}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'vector' && (
        <>
          <p className="text-[10px] text-zinc-400 mb-1">{t('element.shapes')}</p>
          <div className="grid grid-cols-4 gap-2">
            {visibleShapes.map((s) => (
              <div key={s.id} className="relative group">
                <button
                  onClick={(e) => { e.stopPropagation(); addVectorLayer(s.id, '#FFFFFF', '#FFFFFF', 3, true) }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="element-grid-btn flex flex-col items-center justify-center py-2 w-full"
                  title={t(`vectorShapes.${s.id}`)}
                >
                  <VectorPreview shape={s.id} size={28} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); hideVector(s.id) }}
                  className="absolute -top-1 -right-1 w-4 h-4 bg-zinc-700 hover:bg-red-600 text-white rounded-full text-[8px] hidden group-hover:flex items-center justify-center border border-zinc-600"
                  title="Eliminar"
                >✕</button>
              </div>
            ))}
          </div>
          {hiddenVectors.size > 0 && (
            <button
              onClick={() => { setHiddenVectors(new Set()); writeHiddenVectors(new Set()) }}
              className="mt-2 text-[9px] text-zinc-500 hover:text-zinc-300 underline"
            >Restaurar vetores ocultos ({hiddenVectors.size})</button>
          )}
          {customVectors.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-zinc-400 mb-1">Meus vetores salvos</p>
              <div className="grid grid-cols-4 gap-2">
                {customVectors.map((v) => {
                  const isGroup = (v as any).isGroup && (v as any).groupLayers
                  return (
                  <div key={v.id} className="relative group">
                    <button
                      onClick={(e) => { e.stopPropagation(); addCustomVectorLayer(v.id) }}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="element-grid-btn flex flex-col items-center justify-center py-1 w-full"
                      title={v.name}
                    >
                      {isGroup ? (
                        <div className="relative flex items-center justify-center">
                          {(() => {
                            const first = (v as any).groupLayers[0]
                            if (first?.vectorPath) return <BezierPathPreview vectorPath={first.vectorPath} size={20} />
                            if (first?.vector) return <VectorPreview shape={first.vector.shape} size={20} />
                            return <BezierPathPreview vectorPath={v.vectorPath} size={20} />
                          })()}
                          <span className="absolute -bottom-1 -right-1 bg-blue-600 text-white text-[6px] px-1 rounded-full">+{(v as any).groupLayers.length - 1}</span>
                        </div>
                      ) : (
                        <BezierPathPreview vectorPath={v.vectorPath} size={28} />
                      )}
                      <span className="text-[7px] truncate w-full text-center mt-1">{v.name}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); if (confirm(`Eliminar "${v.name}"?`)) removeCustomVector(v.id) }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 hover:bg-red-700 text-white rounded-full text-[8px] flex items-center justify-center"
                      title="Eliminar"
                    >✕</button>
                  </div>
                )})}
              </div>
            </div>
          )}
          <div className="mt-4 pt-3 border-t border-zinc-700/50">
            <p className="text-[10px] text-zinc-400 font-medium mb-1">Bezier</p>
            <button
              onClick={(e) => { e.stopPropagation(); useStore.getState().addVectorPathLayer() }}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-full text-xs py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 flex items-center justify-center gap-1.5"
            >
              ＋ Novo traçado
            </button>
          </div>

        </>
       )}
    </div>
  )
}
