import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { t } from '@/i18n'
import { readCustomGradients, removeCustomGradient, useStore } from '@/store'
import { GRADIENT_PRESETS } from '@/types'
import { GradientBuilderPopup } from './GradientBuilder'

const HIDDEN_PRESETS_KEY = 'thumbnail-app.hidden-gradients.v1'

function readHiddenPresets(): string[] {
  try { return JSON.parse(localStorage.getItem(HIDDEN_PRESETS_KEY) || '[]') } catch { return [] }
}

function writeHiddenPresets(ids: string[]) {
  localStorage.setItem(HIDDEN_PRESETS_KEY, JSON.stringify(ids))
}

function parseGradientArgs(css: string): { angle: number; stops: string[]; type: 'linear' | 'radial' } | null {
  const linearM = css.match(/linear-gradient\(\s*([^,]+)\s*,(.+)\)/)
  if (linearM) {
    let angle = 135
    const rawDir = linearM[1].trim()
    if (rawDir.endsWith('deg')) angle = parseFloat(rawDir)
    const stops = parseStopsIn(linearM[2])
    return stops.length >= 2 ? { angle, stops, type: 'linear' } : null
  }
  const radialM = css.match(/radial-gradient\(\s*(circle)?\s*,?\s*(.+)\)/)
  if (radialM) {
    const stops = parseStopsIn(radialM[2])
    return stops.length >= 2 ? { angle: 135, stops, type: 'radial' } : null
  }
  return null
}

function parseStopsIn(raw: string): string[] {
  const stops: string[] = []
  let depth = 0, cur = ''
  for (const ch of raw) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) { const s = cur.trim(); if (s) stops.push(s.replace(/\s+\d+%$/, '')); cur = '' }
    else cur += ch
  }
  const last = cur.trim()
  if (last) stops.push(last.replace(/\s+\d+%$/, ''))
  return stops
}

export function GradientPickerInline({ selectedGradient, onSelect, onContextMenu, cols = 4 }: {
  selectedGradient: string
  onSelect: (v: string) => void
  onContextMenu?: (e: React.MouseEvent, gradient: { id: string; value: string; name: string; isPreset: boolean }) => void
  cols?: 2 | 4
}) {
  const [customGradients, setCustomGradients] = useState(() => readCustomGradients())
  const [showPopup, setShowPopup] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [popupAnchor, setPopupAnchor] = useState({ x: 0, y: 0 })
  const [editInfo, setEditInfo] = useState<{ id: string; angle: number; stops: string[]; type: 'linear' | 'radial'; isPreset: boolean } | null>(null)
  const [hiddenPresets, setHiddenPresets] = useState(() => readHiddenPresets())
  const savedRef = useRef(selectedGradient)

  const allPresets = GRADIENT_PRESETS.filter(g => !hiddenPresets.includes('preset_' + g.name)).map(g => ({ id: 'preset_' + g.name, value: g.value, name: g.name, isPreset: true }))
  const allGradientsBase = [...allPresets, ...customGradients.map(g => ({ id: g.id, value: g.value, name: g.name, isPreset: false }))]
  // garante que o gradiente actualmente em uso aparece sempre, mesmo que seja custom não listado
  const allGradients = (() => {
    if (!selectedGradient) return allGradientsBase
    const exists = allGradientsBase.some(g => g.value === selectedGradient)
    if (exists) return allGradientsBase
    return [{ id: 'current', value: selectedGradient, name: 'Atual', isPreset: false }, ...allGradientsBase]
  })()
  const visibleGradients = showAll ? allGradients : allGradients.slice(0, 16)
  const remaining = allGradients.length - 16

  // batch live preview para não poluir histórico a cada arraste de cor
  const beginBatch = () => { try{ useStore.getState().startBatch() }catch{} }
  const endBatchCancel = () => { try{ const s=useStore.getState(); s.endBatch(); }catch{}; onSelect(savedRef.current) }
  const endBatchCommit = () => { try{ const s=useStore.getState(); s.endBatch(); s.pushHistory() }catch{} }

  const openPopup = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    savedRef.current = selectedGradient
    setPopupAnchor({ x: e.clientX, y: e.clientY })
    setEditInfo(null)
    beginBatch()
    // Usa setTimeout para garantir que o portal seja montado após o evento de clique não ser interceptado pelo painel
    setTimeout(() => setShowPopup(true), 0)
  }

  const closePopup = () => {
    endBatchCancel()
    setShowPopup(false)
    setEditInfo(null)
  }

  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number; gradient: { id: string; value: string; name: string; isPreset: boolean }
  } | null>(null)

  const handleContext = (e: React.MouseEvent, g: { id: string; value: string; name: string; isPreset: boolean }) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, gradient: g })
  }

  const openEdit = (id: string) => {
    const cg = customGradients.find(g => g.id === id)
    if (cg) {
      const type = cg.type ?? (cg.value.startsWith('radial-gradient') ? 'radial' : 'linear')
      setEditInfo({ id: cg.id, angle: cg.angle, stops: [...cg.stops], type, isPreset: false })
    } else {
      const preset = GRADIENT_PRESETS.find(g => 'preset_' + g.name === id)
      if (!preset) return
      const parsed = parseGradientArgs(preset.value)
      if (!parsed) return
      setEditInfo({ id: '', angle: parsed.angle, stops: parsed.stops, type: parsed.type, isPreset: true })
    }
    setPopupAnchor({ x: ctxMenu!.x, y: ctxMenu!.y })
    setCtxMenu(null)
    savedRef.current = selectedGradient
    beginBatch()
    setShowPopup(true)
  }

  const handleHidePreset = (id: string) => {
    const next = [...hiddenPresets, id]
    writeHiddenPresets(next)
    setHiddenPresets(next)
    setCtxMenu(null)
    if (selectedGradient === ctxMenu!.gradient.value) {
      const first = GRADIENT_PRESETS.find(g => !next.includes('preset_' + g.name))
      onSelect(first?.value || 'linear-gradient(135deg, #00d2ff, #3a7bd5)')
    }
  }

  return (
    <div className="space-y-2" data-no-deselect="true">
      {/* pré-visualização sempre visível do gradiente em uso */}
      {selectedGradient && (
        <div className="space-y-1">
          <div className="h-8 rounded-lg border border-white/10 shadow-inner" style={{ background: selectedGradient }} title={selectedGradient} />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-zinc-400 truncate pr-2 font-mono">{selectedGradient}</span>
            <button
              onClick={(e)=>{
                e.preventDefault(); e.stopPropagation()
                const parsed = parseGradientArgs(selectedGradient)
                if(!parsed) return
                savedRef.current = selectedGradient
                const existingId = customGradients.find(g=>g.value===selectedGradient)?.id ?? ''
                setEditInfo({ id: existingId, angle: parsed.angle, stops: parsed.stops, type: parsed.type, isPreset: false })
                setPopupAnchor({ x: e.clientX, y: e.clientY })
                beginBatch()
                setShowPopup(true)
              }}
              className="shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300"
            >✏️ Editar atual</button>
          </div>
        </div>
      )}
      <div className={cols === 2 ? 'grid grid-cols-2 gap-1' : 'grid grid-cols-4 gap-1'}>
        {visibleGradients.map((g) => (
          <button key={g.id}
            onClick={(e) => { e.stopPropagation(); onSelect(g.value)}}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => handleContext(e, g)}
            className={`h-6 rounded ${selectedGradient === g.value ? 'ring-2 ring-blue-400 ring-offset-1 ring-offset-zinc-900' : 'ring-1 ring-white/10'}`}
            style={{ background: g.value }}
            title={g.name}
          />
        ))}
      </div>
      {remaining > 0 && !showAll && (
        <button onClick={(e) => { e.stopPropagation(); setShowAll(true)}} onPointerDown={(e) => e.stopPropagation()} className="text-[10px] text-blue-400">
          +{remaining} {t('gradient.more')}
        </button>
      )}
      <button onClick={(e) => { e.stopPropagation(); openPopup(e as any)}} onPointerDown={(e) => e.stopPropagation()} className="text-[10px] text-blue-400">
        ✚ {t('gradient.create')}
      </button>
      {hiddenPresets.length > 0 && (
        <button onClick={() => { writeHiddenPresets([]); setHiddenPresets([]) }} className="text-[10px] text-zinc-500">
          {t('gradient.restoreHidden')}
        </button>
      )}
      {showPopup && (
        <GradientBuilderPopup
          anchorX={popupAnchor.x} anchorY={popupAnchor.y}
          onPreview={(v) => onSelect(v)}
          onAdd={() => { setCustomGradients(readCustomGradients()); endBatchCommit(); setShowPopup(false); setEditInfo(null) }}
          onClose={closePopup}
          initialAngle={editInfo?.angle}
          initialStops={editInfo?.stops}
          initialType={editInfo?.type}
          editId={editInfo?.isPreset ? undefined : editInfo?.id}
        />
      )}
      {ctxMenu && createPortal(
        <>
          <div className="fixed inset-0 z-[999]" data-no-deselect="true" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />
          <div
            data-no-deselect="true"
            className="fixed z-[1000] border rounded-lg shadow-xl py-1 text-[10px]"
            style={{ left: ctxMenu.x, top: ctxMenu.y, background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button
              onClick={() => openEdit(ctxMenu.gradient.id)}
              className="w-full text-left px-3 py-1.5 whitespace-nowrap"
              style={{ color: 'var(--text-primary)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              ✏️ {t('gradient.edit')}
            </button>
            {ctxMenu.gradient.isPreset ? (
              <button
                onClick={() => handleHidePreset(ctxMenu.gradient.id)}
                className="w-full text-left px-3 py-1.5 whitespace-nowrap"
                style={{ color: 'var(--text-primary)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                🚫 {t('gradient.hide')}
              </button>
            ) : (
              <button
                onClick={() => {
                  if (selectedGradient === ctxMenu.gradient.value) onSelect('linear-gradient(135deg, #00d2ff, #3a7bd5)')
                  removeCustomGradient(ctxMenu.gradient.id)
                  setCustomGradients(readCustomGradients())
                  setCtxMenu(null)
                }}
                className="w-full text-left px-3 py-1.5 whitespace-nowrap"
                style={{ color: '#f87171' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                🗑️ {t('gradient.delete')}
              </button>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
