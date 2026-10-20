import { useRef, useState, useCallback, useMemo, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { t } from '@/i18n'
import { useStore } from '@/store'
import type { Layer } from '@/types'
import { cropBackgroundCss } from '@/cropCss'
import { IconBackground } from './Icons'

type DropState =
  | { type: 'gap'; index: number; groupId: string | null }
  | { type: 'group'; groupId: string }
  | null

export function LayerPanel() {
  const layers = useStore((s) => s.layers)
  const selectedLayerIds = useStore((s) => s.selectedLayerIds)
  const selectLayer = useStore((s) => s.selectLayer)
  const toggleLayerSelection = useStore((s) => s.toggleLayerSelection)
  const toggleVisibility = useStore((s) => s.toggleVisibility)
  const removeLayer = useStore((s) => s.removeLayer)
  const duplicateLayer = useStore((s) => s.duplicateLayer)
  const moveLayerToIndex = useStore((s) => s.moveLayerToIndex)
  const updateLayer = useStore((s) => s.updateLayer)
  const moveLayerToGroup = useStore((s) => s.moveLayerToGroup)
  const ungroupGroup = useStore((s) => s.ungroupGroup)
  const createGroup = useStore((s) => s.createGroup)
  const mergeVectors = useStore((s) => s.mergeVectors)
  const selectLayers = useStore((s) => s.selectLayers)
  const startBatch = useStore((s) => s.startBatch)
  const endBatch = useStore((s) => s.endBatch)
  const pushHistory = useStore((s) => s.pushHistory)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [groupNameInput, setGroupNameInput] = useState('')
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [layerNameInput, setLayerNameInput] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; id: string; isGroup: boolean } | null>(null)
  const isolatedGroupId = useStore((s) => s.isolatedGroupId)
  const setIsolatedGroupId = useStore((s) => s.setIsolatedGroupId)
  const enterGroupIsolate = useStore((s) => s.enterGroupIsolate)
  const exitGroupIsolate = useStore((s) => s.exitGroupIsolate)

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    const onDown = (e: MouseEvent) => {
      const menu = document.getElementById('layer-ctx-menu')
      if (menu && menu.contains(e.target as Node)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('click', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', close, true)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('click', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', close, true)
      window.removeEventListener('scroll', close, true)
    }
  }, [ctxMenu])

  const dragDataRef = useRef<{ ids: string[]; pointerId: number; startX: number; startY: number; moved: boolean } | null>(null)
  const [draggingIds, setDraggingIds] = useState<string[]>([])
  const [dropState, setDropState] = useState<DropState>(null)
  const dropStateRef = useRef<DropState>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => [...layers].filter((l) => !l.isBackground).sort((a, b) => b.zIndex - a.zIndex), [layers])
  const displaySorted = useMemo(() => {
    if (!isolatedGroupId) return sorted
    return sorted.filter((l) => l.id === isolatedGroupId || l.groupId === isolatedGroupId)
  }, [sorted, isolatedGroupId])

  // Flat visual order top -> bottom for gap calculations and single-line indicator
  const flatRows = useMemo(() => {
    const rows: { id: string; kind: 'group-header' | 'standalone' | 'child'; groupId: string | null }[] = []
    const groups = displaySorted.filter((l) => l.type === 'group')
    const groupIds = new Set(groups.map((g) => g.id))
    // need to preserve visual order as rendered: iterate sorted top->bottom, but children are rendered inside group not in global order
    // So build top-level order first
    const topLevel: Layer[] = []
    for (const l of displaySorted) {
      if (l.type === 'group') topLevel.push(l)
      else if (!l.groupId || !groupIds.has(l.groupId)) topLevel.push(l)
    }
    for (const l of topLevel) {
      if (l.type === 'group') {
        rows.push({ id: l.id, kind: 'group-header', groupId: l.id })
        if (expandedGroups.has(l.id)) {
          const children = displaySorted.filter((c) => c.groupId === l.id)
          for (const ch of children) rows.push({ id: ch.id, kind: 'child', groupId: l.id })
        }
      } else {
        rows.push({ id: l.id, kind: 'standalone', groupId: null })
      }
    }
    return rows
  }, [displaySorted, expandedGroups])

  const toggleGroupExpanded = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // seek: when selection changes on canvas, scroll panel to show at least one selected object
  useEffect(() => {
    if (selectedLayerIds.length === 0) return
    // auto-expand groups that contain a selected child
    const groupsToExpand = new Set<string>()
    for (const sid of selectedLayerIds) {
      const l = layers.find((x) => x.id === sid)
      if (l?.groupId) groupsToExpand.add(l.groupId)
    }
    if (groupsToExpand.size > 0) {
      setExpandedGroups((prev) => {
        const next = new Set(prev)
        let changed = false
        for (const gid of groupsToExpand) if (!next.has(gid)) { next.add(gid); changed = true }
        return changed ? next : prev
      })
    }
    // after expansion, scroll to first selected visible row
    const targetId = selectedLayerIds[0]
    // defer to next frame so DOM after expansion is ready
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const panel = panelRef.current
        if (!panel) return
        // try data-layer-id first, then group header
        let el = panel.querySelector<HTMLElement>(`[data-layer-id="${targetId}"]`)
        if (!el) el = document.querySelector<HTMLElement>(`[data-group-header="${targetId}"]`)
        if (!el) {
          // fallback: any selected
          for (const sid of selectedLayerIds) {
            el = panel.querySelector<HTMLElement>(`[data-layer-id="${sid}"]`)
            if (el) break
            el = document.querySelector<HTMLElement>(`[data-group-header="${sid}"]`)
            if (el) break
          }
        }
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          // brief highlight flash to indicate location (optional)
          el.classList.add('ring-1', 'ring-blue-400')
          setTimeout(() => el!.classList.remove('ring-1', 'ring-blue-400'), 800)
        }
      })
    })
  }, [selectedLayerIds])

  const layerThumb = (layer: Layer) => {
    if (layer.type === 'image' && layer.preview) {
      const hasCrop = !!layer.crop && (layer.originalPreview || layer.preview)
      if (hasCrop) {
        const crop = layer.crop!
        const fullSrc = layer.originalPreview || layer.preview
        const { backgroundSize, backgroundPosition } = cropBackgroundCss(crop)
        return (
          <div
            className="w-7 h-7 rounded bg-zinc-800 bg-no-repeat"
            style={{ backgroundImage: `url("${fullSrc}")`, backgroundSize, backgroundPosition }}
          />
        )
      }
      return <img src={layer.preview} alt="" className="w-7 h-7 rounded object-cover" />
    }
    if (layer.type === 'text') {
      return (
        <div className="w-7 h-7 rounded bg-zinc-700 flex items-center justify-center text-xs font-bold" style={{ color: layer.color }}>
          A
        </div>
      )
    }
    if (layer.type === 'vector' && layer.vector) {
      const shape = layer.vector.shape
      const icon = shape === 'circle' ? '●' : shape === 'rounded-rect' ? '▭' : shape === 'triangle' ? '▲' : shape === 'hexagon' ? '⬡' : shape === 'star' ? '★' : shape === 'plus' ? '✚' : shape === 'line' ? '━' : shape === 'arrow-right' ? '➡' : '●'
      return (
        <div className="w-7 h-7 rounded bg-zinc-700 flex items-center justify-center text-xs" style={{ color: layer.vector.color }}>
          {icon}
        </div>
      )
    }
    if (layer.type === 'element') {
      return (
        <div className="w-7 h-7 rounded bg-zinc-700 flex items-center justify-center text-sm">
          {[...(layer.elementContent || '⭐')][0] || '⭐'}
        </div>
      )
    }
    return <div className="w-7 h-7 rounded bg-zinc-700 flex items-center justify-center text-xs">?</div>
  }

  const computeDropState = useCallback((clientX: number, clientY: number, draggedIds: string[]): DropState => {
    const panel = panelRef.current
    if (!panel) return null
    const rows = Array.from(panel.querySelectorAll<HTMLElement>('[data-row]'))
    if (rows.length === 0) return { type: 'gap', index: 0, groupId: null }

    // Priority: into-group if hovering centered over a group header
    const groupHeaders = Array.from(panel.querySelectorAll<HTMLElement>('[data-group-header]'))
    for (const gh of groupHeaders) {
      const gid = gh.dataset.groupHeader!
      if (draggedIds.includes(gid)) continue
      const r = gh.getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        const top = r.top + r.height * 0.28
        const bottom = r.top + r.height * 0.72
        if (clientY >= top && clientY <= bottom) return { type: 'group', groupId: gid }
      }
    }

    // Find nearest gap 0..n
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i <= rows.length; i++) {
      let gapY: number
      if (i === 0) gapY = rows[0].getBoundingClientRect().top
      else if (i === rows.length) gapY = rows[rows.length - 1].getBoundingClientRect().bottom
      else gapY = (rows[i - 1].getBoundingClientRect().bottom + rows[i].getBoundingClientRect().top) / 2
      const d = Math.abs(clientY - gapY)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }

    // Infer groupId for this gap: inside group if both neighbors belong to same group
    let groupId: string | null = null
    const prev = bestIdx > 0 ? rows[bestIdx - 1] : null
    const next = bestIdx < rows.length ? rows[bestIdx] : null
    const prevChildGid = prev?.dataset.childGroup || null
    const nextChildGid = next?.dataset.childGroup || null
    const prevKind = prev?.dataset.rowKind || null
    const nextKind = next?.dataset.rowKind || null
    const prevHeaderGid = prev?.dataset.groupHeader || null
    if (prevChildGid && nextChildGid && prevChildGid === nextChildGid) groupId = prevChildGid
    else if (prevKind === 'group-header' && nextKind === 'child' && prevHeaderGid && prevHeaderGid === nextChildGid) groupId = prevHeaderGid
    else groupId = null

    return { type: 'gap', index: bestIdx, groupId }
  }, [])

  const handlePointerDown = (e: React.PointerEvent, id: string) => {
    const targetEl = e.target as HTMLElement
    if (targetEl.closest('button, input, select, textarea, label, [data-no-drag]')) return
    const layer = layers.find((l) => l.id === id)
    if (!layer || layer.locked) return
    if (e.button !== 0) return
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey && !selectedLayerIds.includes(id)) selectLayer(id)
    const ids = selectedLayerIds.includes(id) ? [...selectedLayerIds] : [id]
    const expanded = new Set(ids)
    for (const xid of ids) {
      const l = layers.find((x) => x.id === xid)
      if (l?.type === 'group') {
        for (const c of layers) if (c.groupId === xid) expanded.add(c.id)
      }
    }
    dragDataRef.current = { ids: Array.from(expanded), pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false }
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
    // install global listeners
    const onMove = (ev: PointerEvent) => handlePointerMoveGlobal(ev)
    const onUp = (ev: PointerEvent) => handlePointerUpGlobal(ev)
    ;(window as any)._lpMove = onMove
    ;(window as any)._lpUp = onUp
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const handlePointerMoveGlobal = (e: PointerEvent) => {
    const dd = dragDataRef.current
    if (!dd) return
    if (!dd.moved) {
      if (Math.hypot(e.clientX - dd.startX, e.clientY - dd.startY) < 4) return
      dd.moved = true
      setDraggingIds(dd.ids)
    }
    const ds = computeDropState(e.clientX, e.clientY, dd.ids)
    dropStateRef.current = ds
    setDropState(ds)
  }

  const handlePointerUpGlobal = (e: PointerEvent) => {
    const dd = dragDataRef.current
    const ds = dropStateRef.current
    // cleanup listeners first
    const onMove = (window as any)._lpMove
    const onUp = (window as any)._lpUp
    if (onMove) window.removeEventListener('pointermove', onMove)
    if (onUp) window.removeEventListener('pointerup', onUp)
    if (!dd) { setDraggingIds([]); setDropState(null); dropStateRef.current = null; return }
    // release capture if any
    try { (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement)?.releasePointerCapture?.(e.pointerId) } catch {}
    if (dd.moved && ds) {
      if (ds.type === 'group') {
        startBatch()
        for (const id of dd.ids) {
          const l = layers.find((x) => x.id === id)
          if (!l || l.type === 'group') continue
          moveLayerToGroup(id, ds.groupId)
        }
        endBatch(); pushHistory()
      } else if (ds.type === 'gap') {
        const gapIndex = ds.index
        let targetGroupId: string | null = ds.groupId
        if (targetGroupId === null) {
          const dragged = dd.ids.map((id) => useStore.getState().layers.find((l) => l.id === id)).filter(Boolean) as Layer[]
          const origGroups = new Set(dragged.map((l) => l.groupId).filter(Boolean) as string[])
          if (origGroups.size === 1) {
            const origGid = Array.from(origGroups)[0]
            const shouldUngroup = (e as any).altKey || gapIndex === 0 || gapIndex === flatRows.length
            if (!shouldUngroup) targetGroupId = origGid
          }
        }
        const panel = panelRef.current
        const rows = panel ? Array.from(panel.querySelectorAll<HTMLElement>('[data-row]')) : []
        let targetId: string | null = null
        let pos: 'above' | 'below' = 'above'
        if (rows.length > 0) {
          if (gapIndex === 0) { targetId = rows[0].dataset.layerId || rows[0].dataset.groupHeader || null; pos = 'above' }
          else if (gapIndex >= rows.length) { targetId = rows[rows.length - 1].dataset.layerId || rows[rows.length - 1].dataset.groupHeader || null; pos = 'below' }
          else { targetId = rows[gapIndex].dataset.layerId || rows[gapIndex].dataset.groupHeader || null; pos = 'above' }
        }
        startBatch()
        if (targetGroupId !== null) {
          for (const id of dd.ids) {
            const l = useStore.getState().layers.find((x) => x.id === id)
            if (!l || l.type === 'group') continue
            if (l.groupId !== targetGroupId) moveLayerToGroup(id, targetGroupId)
          }
          setExpandedGroups((prev) => { const n = new Set(prev); n.add(targetGroupId); return n })
        } else {
          const shouldUngroup = (e as any).altKey || gapIndex === 0 || gapIndex === flatRows.length
          if (shouldUngroup) {
            for (const id of dd.ids) {
              const l = useStore.getState().layers.find((x) => x.id === id)
              if (!l || l.type === 'group') continue
              if (l.groupId) moveLayerToGroup(id, null)
            }
          }
        }
        // Reordenação global unificada — evita perda de layers quando grupo está colapsado
        {
          const fresh = useStore.getState().layers
          const bg = fresh.find((l) => l.isBackground)
          const nonBgDesc = fresh.filter((l) => !l.isBackground).sort((a, b) => b.zIndex - a.zIndex)
          const taken = new Set<string>(dd.ids)
          for (const id of Array.from(taken)) {
            const l = fresh.find((x) => x.id === id)
            if (l?.type === 'group') for (const c of fresh) if (c.groupId === id) taken.add(c.id)
          }
          const remainingDesc = nonBgDesc.filter((l) => !taken.has(l.id))
          const movingDesc = nonBgDesc.filter((l) => taken.has(l.id))
          let targetIdx = targetId ? remainingDesc.findIndex((l) => l.id === targetId) : -1
          if (targetIdx === -1) targetIdx = pos === 'below' ? remainingDesc.length : 0
          else if (pos === 'below') targetIdx += 1
          const insertAt = Math.max(0, Math.min(remainingDesc.length, targetIdx))
          const reorderedDesc = [...remainingDesc.slice(0, insertAt), ...movingDesc, ...remainingDesc.slice(insertAt)]
          const asc = [...reorderedDesc].reverse()
          // atribuição atômica via updateLayersBatch para não perder layers
          const patches: Record<string, Partial<Layer>> = {}
          for (let i = 0; i < asc.length; i++) {
            const l = asc[i]
            const targetZ = i
            if (l.zIndex !== targetZ) patches[l.id] = { zIndex: targetZ }
          }
          if (Object.keys(patches).length > 0) {
            const { updateLayersBatch } = useStore.getState() as any
            if (updateLayersBatch) {
              // usar batch para aplicar todas zIndex de uma vez
              const s = useStore.getState() as any
              // construir patches para batch
              const batch: Record<string, Partial<Layer>> = {}
              for (const k in patches) batch[k] = patches[k]
              s.updateLayersBatch(batch)
            } else {
              for (const id in patches) updateLayer(id, patches[id], false)
            }
          }
          if (bg && (bg as any).zIndex !== -1) updateLayer(bg.id, { zIndex: -1 } as any, false)
        }
        endBatch(); pushHistory()
      }
    }
    dragDataRef.current = null
    dropStateRef.current = null
    setDraggingIds([])
    setDropState(null)
  }

  // keep refs synced
  useEffect(() => { dropStateRef.current = dropState }, [dropState])

  const renderLayerItem = (layer: Layer, flatIndex: number, childOfGroup = false, groupState?: { visible: boolean; locked: boolean }) => {
    const isSelected = selectedLayerIds.includes(layer.id)
    const isDragging = draggingIds.includes(layer.id)
    const showGapAbove = dropState?.type === 'gap' && dropState.index === flatIndex
    const parentHidden = childOfGroup && !!groupState && !groupState.visible
    const parentLocked = childOfGroup && !!groupState && groupState.locked
    const effHidden = !layer.visible || parentHidden
    const effLocked = layer.locked || parentLocked

    return (
      <div key={layer.id} className="relative">
        {showGapAbove && <div className="h-[2px] bg-blue-400 rounded-full z-10 pointer-events-none shadow-[0_0_6px_rgba(96,165,250,0.6)] mx-2 -mb-[1px] -mt-[1px]" />}
        <div
          data-row
          data-row-index={flatIndex}
          data-row-kind={childOfGroup ? 'child' : 'standalone'}
          data-layer-id={layer.id}
          {...(childOfGroup ? { 'data-child-group': layer.groupId } : {})}
          className={`flex items-center gap-1.5 px-1.5 py-1 rounded-lg cursor-pointer transition-all duration-100
            ${isSelected ? 'bg-blue-600/15 ring-1 ring-blue-500/40 shadow-sm shadow-blue-500/5' : childOfGroup ? 'hover:bg-zinc-700/20' : 'hover:bg-zinc-700/40'}
            ${isDragging ? 'opacity-30 scale-[0.96] ring-1 ring-blue-500/30' : ''}
            ${parentHidden ? 'opacity-50' : ''}
            ${draggingIds.length > 0 && !isDragging ? 'cursor-grabbing' : ''}
            ${draggingIds.length === 0 ? 'cursor-grab' : ''}
            ${childOfGroup ? 'border-l-2 border-zinc-700/30 ml-1' : ''}`}
          onClick={(e) => {
            if (draggingIds.length > 0) return
            if (e.shiftKey || e.ctrlKey || e.metaKey) toggleLayerSelection(layer.id)
            else if (layer.type === 'group') {
              const childIds = layers.filter((l) => l.groupId === layer.id).map((l) => l.id)
              if (childIds.length > 0) selectLayers(Array.from(new Set([layer.id, ...childIds])))
              else selectLayer(layer.id)
            } else selectLayer(layer.id)
          }}
          onDoubleClick={(e) => {
            // renomeio por duplo clique no nome — funciona para qualquer objeto ou grupo
            const target = e.target as HTMLElement
            if (target.closest('button, [data-no-drag]')) return
            e.stopPropagation()
            setEditingLayerId(layer.id)
            setLayerNameInput(layer.name)
          }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, id: layer.id, isGroup: layer.type === 'group' }) }}
          onPointerDown={(e) => handlePointerDown(e, layer.id)}
        >
          {!childOfGroup && <span className="text-zinc-500 text-[10px] select-none cursor-grab" aria-hidden>⠿</span>}
          <div className="relative shrink-0">
            {effHidden ? (
              <div className="w-7 h-7 rounded bg-zinc-700/50 flex items-center justify-center">
                <span className="text-[8px] opacity-50">{layerThumb(layer)}</span>
              </div>
            ) : layerThumb(layer)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              {editingLayerId === layer.id ? (
                <input
                  value={layerNameInput}
                  onChange={(e) => setLayerNameInput(e.target.value)}
                  onBlur={() => { updateLayer(layer.id, { name: layerNameInput || layer.name }, true); setEditingLayerId(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { updateLayer(layer.id, { name: layerNameInput || layer.name }, true); setEditingLayerId(null) } if (e.key === 'Escape') setEditingLayerId(null) }}
                  className="flex-1 bg-zinc-700/50 rounded px-1 py-0.5 text-[10px] text-white border border-zinc-600 focus:outline-none focus:border-blue-500"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className={`text-[11px] truncate ${isSelected ? 'text-white font-medium' : 'text-zinc-300'}`} onDoubleClick={(e) => { e.stopPropagation(); setEditingLayerId(layer.id); setLayerNameInput(layer.name) }}>
                  {layer.name}
                </span>
              )}
              {effLocked && <span className="text-[8px] text-zinc-500">🔒</span>}
            </div>
            <div className="text-[8px] text-zinc-500">
              {Math.round(layer.x * 100)}%, {Math.round(layer.y * 100)}% · {Math.round(layer.width * 100)}×{Math.round(layer.height * 100)}%
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0" data-no-drag>
            <button onClick={(e) => { e.stopPropagation(); toggleVisibility(layer.id) }} className={`text-[10px] w-4 text-center ${effHidden ? 'text-zinc-600' : 'text-zinc-400 hover:text-white'}`} title={effHidden ? t('layers.show') : t('layers.hide')}>
              {effHidden ? '🚫' : '👁'}
            </button>
            <button onClick={(e) => { e.stopPropagation(); updateLayer(layer.id, { locked: !effLocked }, true) }} className={`text-[9px] w-4 text-center ${effLocked ? 'text-zinc-400' : 'text-zinc-600 hover:text-zinc-300'}`} title={effLocked ? t('layers.unlock') : t('layers.lock')}>
              {effLocked ? '🔒' : '🔓'}
            </button>
            <button disabled={effLocked} onClick={(e) => { e.stopPropagation(); moveLayerToIndex(layer.id, Math.min(layers.length - 1, layer.zIndex + 1)) }} className="text-zinc-500 hover:text-white disabled:opacity-20 text-[10px] px-0.5" title={t('layers.moveUp')}>↑</button>
            <button disabled={effLocked} onClick={(e) => { e.stopPropagation(); moveLayerToIndex(layer.id, Math.max(0, layer.zIndex - 1)) }} className="text-zinc-500 hover:text-white disabled:opacity-20 text-[10px] px-0.5" title={t('layers.moveDown')}>↓</button>
            <button disabled={effLocked} onClick={(e) => { e.stopPropagation(); duplicateLayer(layer.id) }} className="text-zinc-500 hover:text-white disabled:opacity-20 text-[10px] px-0.5" title={t('layers.duplicate')}>⧉</button>
            <button disabled={effLocked} onClick={(e) => { e.stopPropagation(); removeLayer(layer.id) }} className="text-zinc-500 hover:text-red-400 disabled:opacity-20 text-[10px] px-0.5" title={t('layers.remove')}>✕</button>
          </div>
        </div>
      </div>
    )
  }

  const renderGroupItem = (group: Layer, flatIndex: number) => {
    const children = sorted.filter((l) => l.groupId === group.id)
    const isExpanded = expandedGroups.has(group.id)
    const isSelected = selectedLayerIds.includes(group.id)
    const isGroupDrop = dropState?.type === 'group' && dropState.groupId === group.id
    const showGapAbove = dropState?.type === 'gap' && dropState.index === flatIndex

    return (
      <div key={group.id} className="mb-1 relative">
        {showGapAbove && <div className="h-[2px] bg-blue-400 rounded-full z-10 pointer-events-none shadow-[0_0_6px_rgba(96,165,250,0.6)] mx-2 -mb-[1px] -mt-[1px]" />}
        <div
          data-row
          data-row-index={flatIndex}
          data-row-kind="group-header"
          data-group-header={group.id}
          data-layer-id={group.id}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-all duration-100
            ${isSelected ? 'bg-blue-600/15 ring-1 ring-blue-500/40' : 'text-zinc-400'}
            ${group.locked ? 'opacity-60' : ''} ${!group.visible ? 'opacity-50' : ''}
            ${isGroupDrop ? 'ring-2 ring-blue-400 bg-blue-500/15 shadow-[0_0_8px_rgba(96,165,250,0.3)]' : ''}
            ${draggingIds.includes(group.id) ? 'opacity-30 scale-[0.96]' : ''}`}
          onClick={(e) => {
            if (draggingIds.length > 0) return
            if (e.shiftKey || e.ctrlKey || e.metaKey) toggleLayerSelection(group.id)
            else {
              const childIds = layers.filter((l) => l.groupId === group.id).map((l) => l.id)
              if (childIds.length > 0) selectLayers(Array.from(new Set([group.id, ...childIds])))
              else selectLayer(group.id)
            }
          }}
          onDoubleClick={(e) => {
            const target = e.target as HTMLElement
            if (target.closest('button, [data-no-drag]')) return
            e.stopPropagation()
            // duplo clique entra no modo isolado do grupo
            if (isolatedGroupId !== group.id) {
              enterGroupIsolate(group.id)
            } else {
              exitGroupIsolate()
            }
          }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, id: group.id, isGroup: true }) }}
          onPointerDown={(e) => handlePointerDown(e, group.id)}
        >
          <button onClick={(e) => { e.stopPropagation(); toggleGroupExpanded(group.id) }} className="text-zinc-500 hover:text-white transition-colors">
            {isExpanded ? '▼' : '▶'}
          </button>
          {editingGroupId === group.id ? (
            <input
              value={groupNameInput}
              onChange={(e) => setGroupNameInput(e.target.value)}
              onBlur={() => { updateLayer(group.id, { name: groupNameInput || group.name }, true); setEditingGroupId(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { updateLayer(group.id, { name: groupNameInput || group.name }, true); setEditingGroupId(null) } if (e.key === 'Escape') setEditingGroupId(null) }}
              className="flex-1 bg-zinc-700/50 rounded px-1 py-0.5 text-[10px] text-white border border-zinc-600 focus:outline-none focus:border-blue-500"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 cursor-pointer hover:text-white">
              📁 {group.name}
            </span>
          )}
          <span className={`${isGroupDrop ? 'text-blue-400' : 'text-zinc-600'}`}>{isGroupDrop && draggingIds.length > 0 ? `+${draggingIds.filter((id) => !layers.find((l) => l.id === id)?.type.includes('group')).length}` : children.length}</span>
          <div className="flex items-center gap-0.5 shrink-0" data-no-drag>
            <button onClick={(e) => { e.stopPropagation(); toggleVisibility(group.id) }} className={`text-[10px] w-4 text-center ${group.visible ? 'text-zinc-400 hover:text-white' : 'text-zinc-600'}`} title={group.visible ? t('layers.hide') : t('layers.show')}>{group.visible ? '👁' : '🚫'}</button>
            <button onClick={(e) => { e.stopPropagation(); updateLayer(group.id, { locked: !group.locked }, true) }} className={`text-[9px] w-4 text-center ${group.locked ? 'text-zinc-400' : 'text-zinc-600 hover:text-zinc-300'}`} title={group.locked ? t('layers.unlock') : t('layers.lock')}>{group.locked ? '🔒' : '🔓'}</button>
            <button onClick={(e) => { e.stopPropagation(); moveLayerToIndex(group.id, Math.min(layers.length - 1, group.zIndex + 1)) }} className="text-zinc-500 hover:text-white disabled:opacity-20 text-[10px] px-0.5">↑</button>
            <button onClick={(e) => { e.stopPropagation(); moveLayerToIndex(group.id, Math.max(0, group.zIndex - 1)) }} className="text-zinc-500 hover:text-white disabled:opacity-20 text-[10px] px-0.5">↓</button>
            <button onClick={(e) => { e.stopPropagation(); duplicateLayer(group.id) }} className="text-zinc-500 hover:text-white disabled:opacity-20 text-[10px] px-0.5">⧉</button>
            <button onClick={(e) => { e.stopPropagation(); removeLayer(group.id) }} className="text-zinc-500 hover:text-red-400 disabled:opacity-20 text-[10px] px-0.5">✕</button>
          </div>
        </div>
        {isExpanded && children.length > 0 && (
          <div data-group-container={group.id} className="ml-2 pl-2 border-l border-zinc-700/50 space-y-0.5 mt-0.5">
            {children.map((child) => {
              const idx = flatRows.findIndex((r) => r.id === child.id)
              return renderLayerItem(child, idx, true, { visible: group.visible, locked: group.locked })
            })}
          </div>
        )}
      </div>
    )
  }

  const bgLayer = layers.find((l) => l.isBackground)
  let flatCursor = 0
  const items: React.ReactNode[] = []

  if (bgLayer) {
    const isSelected = selectedLayerIds.includes(bgLayer.id)
    items.push(
      <div key={bgLayer.id} data-no-drag className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer text-xs transition-colors ${isSelected ? 'bg-blue-600/20 ring-1 ring-blue-500' : 'hover:bg-zinc-700/40'}`} onClick={() => selectLayer(bgLayer.id)}>
        <div className="w-7 h-7 rounded bg-zinc-700 flex items-center justify-center text-xs overflow-hidden">
          {bgLayer.preview ? <img src={bgLayer.preview} alt="" className="w-full h-full object-cover" /> : <span className="text-xs"><IconBackground size={14} /></span>}
        </div>
        <span className="flex-1 truncate text-zinc-400">{t('layers.background')}</span>
      </div>
    )
  }

  // Build top-level order for rendering (same as flatRows generation) — respeita modo isolado
  const topLevel: Layer[] = []
  const groupIdsSet = new Set(displaySorted.filter((l) => l.type === 'group').map((g) => g.id))
  for (const l of displaySorted) {
    if (l.type === 'group') topLevel.push(l)
    else if (!l.groupId || !groupIdsSet.has(l.groupId)) topLevel.push(l)
  }
  for (const layer of topLevel) {
    if (layer.type === 'group') {
      const idx = flatRows.findIndex((r) => r.id === layer.id)
      items.push(renderGroupItem(layer, idx))
    } else {
      const idx = flatRows.findIndex((r) => r.id === layer.id)
      items.push(renderLayerItem(layer, idx))
    }
  }

  const showFinalGap = dropState?.type === 'gap' && dropState.index === flatRows.length

  return (
    <div ref={panelRef} className="space-y-1 relative">
      {isolatedGroupId && (() => {
        const grp = layers.find((l) => l.id === isolatedGroupId)
        return (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-[11px]">
            <span className="flex-1 truncate text-blue-300">📁 {grp?.name || t('header.defaultGroupName')} — {t('layers.isolatedHint')}</span>
            <button onClick={() => exitGroupIsolate()} className="shrink-0 px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] hover:bg-blue-500">{t('layers.exitIsolated')}</button>
          </div>
        )
      })()}
      {displaySorted.length === 0 && !isolatedGroupId && <p className="text-zinc-500 text-xs text-center py-4">{t('layers.empty')}</p>}
      {displaySorted.length === 0 && isolatedGroupId && <p className="text-zinc-500 text-xs text-center py-4">{t('layers.emptyGroup')}</p>}
      {displaySorted.length > 0 && selectedLayerIds.length > 1 && <p className="text-[10px] text-blue-400 text-center py-1">{t('layers.selected', { n: selectedLayerIds.length })}</p>}
      {items}
      {showFinalGap && <div className="h-[2px] bg-blue-400 rounded-full z-10 pointer-events-none shadow-[0_0_6px_rgba(96,165,250,0.6)] mx-2" />}
      <div className="flex gap-1 pt-1">
        <button
          onClick={() => { useStore.getState().setGroupNameCallback((name: string) => { if (name) createGroup(name) }) }}
          className="flex-1 text-[10px] text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-700/50 rounded py-1 transition-colors"
        >
          {t('layers.addGroup')}
        </button>
      </div>
      {ctxMenu && createPortal((() => {
        const s = useStore.getState()
        const layer = s.layers.find((l) => l.id === ctxMenu.id)
        if (!layer) return null
        const isGroup = layer.type === 'group'
        const inGroup = !!layer.groupId
        const isExpanded = expandedGroups.has(layer.id)
        const childCount = s.layers.filter((l) => l.groupId === layer.id).length
        const maxZ = Math.max(0, ...s.layers.map((l) => l.zIndex))
        const minZ = Math.min(0, ...s.layers.map((l) => l.zIndex))
        const menuW = 190, menuH = 300
        const vx = Math.min(ctxMenu.x, window.innerWidth - menuW)
        const vy = Math.min(ctxMenu.y, window.innerHeight - menuH)
        const isBezierLayer = !!(layer as any).vectorPath
        const itemsCtx: { label: string; action: () => void; danger?: boolean; disabled?: boolean; divider?: boolean }[] = [
          { label: t('layers.duplicate'), action: () => duplicateLayer(layer.id), disabled: layer.locked },
          { label: isGroup ? t('layers.renameGroup') : t('layers.rename'), action: () => { if (isGroup) { setEditingGroupId(layer.id); setGroupNameInput(layer.name) } else { setEditingLayerId(layer.id); setLayerNameInput(layer.name) } } },
          { label: layer.visible ? t('layers.hide') : t('layers.show'), action: () => toggleVisibility(layer.id) },
          { label: layer.locked ? t('layers.unlock') : t('layers.lock'), action: () => updateLayer(layer.id, { locked: !layer.locked }, true), disabled: layer.isBackground },
          ...(isBezierLayer ? [{ label: t('vector.saveVector') || 'Guardar vetor', action: () => { const s = useStore.getState(); const l = s.layers.find((x) => x.id === layer.id) as any; if (l?.vectorPath) s.saveCustomVector(l.vectorPath as any) } } as const] : []),
          ...(isGroup && s.layers.some((l) => l.groupId === layer.id && l.type === 'vector') ? [{ label: t('vector.saveVector') || 'Guardar vetor', action: () => { const st = useStore.getState(); st.saveCustomVectorGroup(layer.id) } } as const] : []),
          { divider: true, label: '', action: () => {} },
          { label: '↑ ' + t('layers.moveUp'), action: () => moveLayerToIndex(layer.id, Math.min(s.layers.length - 1, layer.zIndex + 1)), disabled: layer.locked || layer.zIndex >= maxZ },
          { label: '↓ ' + t('layers.moveDown'), action: () => moveLayerToIndex(layer.id, Math.max(0, layer.zIndex - 1)), disabled: layer.locked || layer.zIndex <= minZ },
          ...(isGroup ? [{ label: isExpanded ? t('layers.collapse') : t('layers.expand'), action: () => toggleGroupExpanded(layer.id), disabled: childCount === 0 } as const, { divider: true, label: '', action: () => {} } as const, { label: t('layers.ungroup'), action: () => ungroupGroup(layer.id), disabled: layer.locked } as const] : inGroup ? [{ divider: true, label: '', action: () => {} } as const, { label: t('layers.ungroup'), action: () => moveLayerToGroup(layer.id, null), disabled: layer.locked } as const] : []),
          ...(selectedLayerIds.length > 1 && !isGroup ? [{ label: t('layers.group'), action: () => { const st = useStore.getState(); const ids = st.selectedLayerIds.length > 1 ? st.selectedLayerIds : [layer.id]; st.setGroupNameCallback((name: string) => { if (!name) return; st.createGroup(name); const curr = useStore.getState(); const group = curr.layers.find((l: Layer) => l.type === 'group' && l.name === name); if (group) { for (const id of ids) curr.moveLayerToGroup(id, group.id) } }) }, disabled: layer.locked } as const] : []),
          ...(() => {
            const vectorIds = selectedLayerIds.filter(id => layers.find(l => l.id === id)?.type === 'vector')
            if (vectorIds.length >= 2) return [{ label: t('vector.mergeVectors'), action: () => mergeVectors(vectorIds) } as const]
            return []
          })(),
          { divider: true, label: '', action: () => {} },
          { label: t('layers.remove'), action: () => removeLayer(layer.id), danger: true, disabled: layer.locked || layer.isBackground },
        ]
        return (
          <div id="layer-ctx-menu" data-no-deselect="true" className="fixed z-[200000] bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl py-1 min-w-[190px]" style={{ left: Math.max(0, vx), top: Math.max(0, vy) }} onContextMenu={(e) => e.preventDefault()} onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            {itemsCtx.map((item, i) => item.divider ? <div key={i} className="h-px bg-zinc-700 my-1" /> : (
              <button key={i} disabled={item.disabled} className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between transition-colors ${item.danger ? 'text-red-400 hover:bg-red-500/15' : 'text-zinc-300 hover:bg-zinc-700'} ${item.disabled ? 'opacity-30 cursor-default' : 'cursor-pointer'}`} onClick={() => { if (!item.disabled) { item.action(); setCtxMenu(null) } }}>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )
      })(), document.body)}
    </div>
  )
}
