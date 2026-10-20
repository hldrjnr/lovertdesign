import { useState, useEffect, useRef } from 'react'
import { t } from '@/i18n'
import { useStore } from '@/store'
import { Canvas } from './Canvas'
import { LayerPanel } from './LayerPanel'
import { BackgroundPicker } from './BackgroundPicker'
import { ImageUploader } from './ImageUploader'
import { TextEditor } from './TextEditor'
import { ElementsPanel } from './ElementsPanel'
import { EffectsControls } from './EffectsControls'
import { ShortcutSettings } from './ShortcutSettings'
import { SaveDialog, LicenseDialog } from './SaveDialog'
import { ReportModal } from './ReportModal'
import { GlobalEffects } from './GlobalEffects'
import { ConvertTemplateModal } from './ConvertTemplateModal'
import { APP_VERSION } from '@/version'
import { matchShortcut, getShortcuts } from '@/shortcuts'
import { closeOpenColorPopups } from '@/colorPopup'
import { IconBackground, IconImage, IconText, IconElements } from './Icons'
const PLATFORM_ICON: Record<string, string> = {
  'YouTube': '/icons/youtube.png',
  'Instagram': '/icons/instagram.png',
  'Facebook': '/icons/facebook.png',
  'Unity Asset Store': '/icons/unity.png',
  'Fab': '/icons/fab.png',
  'Gumroad': '/icons/gumroad.png',
  'itch.io': '/icons/itchio.png',
  'LinkedIn': '/icons/linkedin.png',
}

type LeftTab = 'background' | 'images' | 'text' | 'elements'

function GroupNameInput({ initialName, onConfirm, onCancel, prompt, cancelLabel }: {
  initialName: string; onConfirm: (name: string) => void; onCancel: () => void; prompt: string; cancelLabel: string
}) {
  const [val, setVal] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} data-no-deselect="true"
      onMouseDown={onCancel}>
      <div className="rounded-xl shadow-2xl w-64 p-4" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
        <h3 className="text-sm font-bold mb-2" style={{ color: 'var(--text-primary)' }}>{prompt}</h3>
        <input ref={inputRef} value={val} onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { onConfirm(val) }
            if (e.key === 'Escape') { onCancel() }
          }}
          className="w-full bg-zinc-700/50 rounded-lg px-3 py-1.5 text-[13px] text-white border border-zinc-600 focus:outline-none focus:border-blue-500 mb-3" />
        <div className="flex gap-2">
          <button onClick={() => onConfirm(val)}
            className="flex-1 text-[0.6875rem] py-1.5 rounded-lg text-white font-medium" style={{ background: 'var(--accent)' }}>
            OK
          </button>
          <button onClick={onCancel}
            className="flex-1 text-[0.6875rem] py-1.5 rounded-lg" style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function Editor() {
  const template = useStore((s) => s.template)
  const canvasScale = useStore((s) => s.canvasScale)
  const panOffset = useStore((s) => s.panOffset)
  const setPanOffset = useStore((s) => s.setPanOffset)
  const setCanvasScale = useStore((s) => s.setCanvasScale)
  const resetView = useStore((s) => s.resetView)
  const selectedLayerId = useStore((s) => s.selectedLayerId)
  const selectedLayerIds = useStore((s) => s.selectedLayerIds)
  const layers = useStore((s) => s.layers)
  const bezierEditMode = useStore((s) => s.bezierEditMode)
  const selectedBezierPointId = useStore((s) => s.selectedBezierPointId)
  const showSaveDialog = useStore((s) => s.showSaveDialog)
  const setShowSaveDialog = useStore((s) => s.setShowSaveDialog)
  const errorMsg = useStore((s) => s.errorMsg)
  const setError = useStore((s) => s.setError)
  const undo = useStore((s) => s.undo)
  const redo = useStore((s) => s.redo)
  const setSystemFonts = useStore((s) => s.setSystemFonts)
  const saveProject = useStore((s) => s.saveProject)
  const loadProject = useStore((s) => s.loadProject)
  const newProject = useStore((s) => s.newProject)
  const removeLayer = useStore((s) => s.removeLayer)
  const duplicateLayer = useStore((s) => s.duplicateLayer)
  const duplicateLayerExact = useStore((s) => s.duplicateLayerExact)
  const toggleLockMultiple = useStore((s) => s.toggleLockMultiple)
  const saveCurrentAsPreset = useStore((s) => s.saveCurrentAsPreset)
  const exportTemplateToFile = useStore((s) => s.exportTemplateToFile)
  const batchImportTemplates = useStore((s) => s.batchImportTemplates)
  const batchImportFolder = useStore((s) => s.batchImportFolder)
  const language = useStore((s) => s.language)
  const setLanguage = useStore((s) => s.setLanguage)
  const uiScale = useStore((s) => s.uiScale)
  const setUiScale = useStore((s) => s.setUiScale)
  const uiTheme = useStore((s) => s.uiTheme)
  const setUiTheme = useStore((s) => s.setUiTheme)
  const baseTheme = useStore((s) => s.baseTheme)
  const setBaseTheme = useStore((s) => s.setBaseTheme)
  const handleSize = useStore((s) => s.handleSize)
  const setHandleSize = useStore((s) => s.setHandleSize)
  const isPanelResizing = useStore((s) => s.isPanelResizing)
  const setIsPanelResizing = useStore((s) => s.setIsPanelResizing)
  const updateLayer = useStore((s) => s.updateLayer)
  const clearSelection = useStore((s) => s.clearSelection)
  const pushHistory = useStore((s) => s.pushHistory)
  const snapEnabled = useStore((s) => s.snapEnabled)
  const toggleSnap = useStore((s) => s.toggleSnap)
  const showGlobalEffects = useStore((s) => s.showGlobalEffects)
  const groupNameCallback = useStore((s) => s.groupNameCallback)
  const setGroupNameCallback = useStore((s) => s.setGroupNameCallback)
  const setShowGlobalEffects = useStore((s) => s.setShowGlobalEffects)
  const selectLayers = useStore((s) => s.selectLayers)
  const createGroup = useStore((s) => s.createGroup)
  const ungroupGroup = useStore((s) => s.ungroupGroup)
  const moveLayerToGroup = useStore((s) => s.moveLayerToGroup)
  const moveLayerToIndex = useStore((s) => s.moveLayerToIndex)
  const licenseValid = useStore((s) => s.licenseValid)
  const licenseTier = useStore((s) => s.licenseTier)
  const licenseEmail = useStore((s) => s.licenseEmail)
  const licenseKey = useStore((s) => s.licenseKey)
  const setLicenseValid = useStore((s) => s.setLicenseValid)
  const setShowLicenseDialog = useStore((s) => s.setShowLicenseDialog)
  const setShowReportModal = useStore((s) => s.setShowReportModal)
  const showCloseConfirm = useStore((s) => s.showCloseConfirm)
  const setShowCloseConfirm = useStore((s) => s.setShowCloseConfirm)
  const markSaved = useStore((s) => s.markSaved)
  const croppingLayerId = useStore((s) => s.croppingLayerId)
  const setCroppingLayerId = useStore((s) => s.setCroppingLayerId)

  const [leftTab, setLeftTab] = useState<LeftTab>('images')
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const LAYERS_MIN = 22, LAYERS_MAX = 68
  const [layersHeightPct, setLayersHeightPct] = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('lovert.layersHeightPct') : null
    const v = saved ? parseFloat(saved) : 36
    return Math.min(LAYERS_MAX, Math.max(LAYERS_MIN, isNaN(v) ? 36 : v))
  })
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const layersPaneRef = useRef<HTMLDivElement>(null)
  // ── Memória de scroll do painel de propriedades (por camada) ──
  const propsScrollRef = useRef<HTMLDivElement>(null)
  const propsScrollPos = useRef<Record<string, number>>({})
  const propsScrollKey = selectedLayerId ?? 'background'
  const propsScrollSaveTimer = useRef<number>(0)
  const onDividerPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    const panel = rightPanelRef.current
    const layersEl = layersPaneRef.current
    if (!panel || !layersEl) return
    const rect = panel.getBoundingClientRect()
    const startY = e.clientY
    const startPct = layersHeightPct
    let curPct = startPct
    let raf = 0
    let pendingPct = startPct
    setIsPanelResizing(true)
    // mesmo truque do canvas: willChange + contain + atualização direta no DOM via RAF
    panel.style.willChange = 'contents'
    layersEl.style.willChange = 'height'
    layersEl.style.contain = 'strict'
    document.body.style.cursor = 'row-resize'
    ;(document.body.style as any).userSelect = 'none'
    const flush = () => {
      layersEl.style.height = pendingPct + '%'
      raf = 0
    }
    const onMove = (ev: PointerEvent) => {
      const dy = ev.clientY - startY
      const deltaPct = (dy / rect.height) * 100
      curPct = Math.max(LAYERS_MIN, Math.min(LAYERS_MAX, startPct + deltaPct))
      pendingPct = curPct
      if (!raf) raf = requestAnimationFrame(flush)
    }
    const onUp = () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      ;(document.body.style as any).userSelect = ''
      panel.style.willChange = ''
      layersEl.style.willChange = ''
      layersEl.style.contain = ''
      // commit no React só no final — evita churn
      setLayersHeightPct(curPct)
      localStorage.setItem('lovert.layersHeightPct', String(curPct))
      setIsPanelResizing(false)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }
  const [settingsTab, setSettingsTab] = useState<'appearance' | 'shortcuts'>('appearance')
  const [showConvertModal, setShowConvertModal] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState<{ action: 'new' | 'load' | 'back'; pendingAction: () => void } | null>(null)
  const [templateSaveName, setTemplateSaveName] = useState('')
  const [templateSaveCategory, setTemplateSaveCategory] = useState('')
  const [showTemplateSave, setShowTemplateSave] = useState(false)
  const [templateSaveMode, setTemplateSaveMode] = useState<'preset' | 'export'>('preset')

  const handleDeactivateLicense = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('deactivate_license', { licenseKey })
      setLicenseValid(false, 0, '', '')
      setShowLicenseDialog(true)
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || 'Erro ao desativar licença.')
    }
  }

  useEffect(() => {
    if (errorMsg) {
      const t = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(t)
    }
  }, [errorMsg, setError])

  // Capture-phase blocker: impede atalhos do browser e comportamentos indesejados entre áreas
  useEffect(() => {
    const blocker = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || !!target?.isContentEditable
      // SPACE num botão focado não deve re-ativar o botão
      if (e.key === ' ' && target?.tagName === 'BUTTON') {
        e.preventDefault()
        ;(target as HTMLElement).blur()
        return
      }
      // ESC em input deve sair do campo e não propagar para canvas
      if (e.key === 'Escape' && isTyping) {
        ;(target as HTMLElement).blur()
        e.preventDefault()
        e.stopPropagation()
        // não retorna — deixa o segundo handler limpar seleção se necessário, mas já desfocou
      }
      if (!isTyping && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
      }
    }
    const blurButtonsOnClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null
      const btn = t?.closest('button') as HTMLElement | null
      if (btn) setTimeout(()=> btn.blur(), 0)
    }
    window.addEventListener('keydown', blocker, true)
    window.addEventListener('mouseup', blurButtonsOnClick, true)
    return () => { window.removeEventListener('keydown', blocker, true); window.removeEventListener('mouseup', blurButtonsOnClick, true) }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || !!target?.isContentEditable
      const s = getShortcuts()
      if (matchShortcut(e, s.undo)) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (matchShortcut(e, s.redo) || matchShortcut(e, s.redo2)) {
        e.preventDefault()
        redo()
      } else if (!isTyping && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        // Ctrl+arrows pan the canvas (nudge uses plain arrows, so no conflict).
        e.preventDefault()
        const step = e.shiftKey ? 100 : 40
        let dx = 0, dy = 0
        if (e.key === 'ArrowLeft') dx = -step
        else if (e.key === 'ArrowRight') dx = step
        else if (e.key === 'ArrowUp') dy = -step
        else if (e.key === 'ArrowDown') dy = step
        setPanOffset({ x: panOffset.x + dx, y: panOffset.y + dy })
      } else if (!isTyping && matchShortcut(e, s.escape)) {
        e.preventDefault()
        if (showSettings) { setShowSettings(false); return }
        if (selectedLayerIds.length > 0) clearSelection()
      } else if (!isTyping && (matchShortcut(e, s.delete) || matchShortcut(e, s.backspace)) && selectedLayerIds.length > 0) {
        const isBezPointSelected = bezierEditMode && !!selectedBezierPointId && !!layers.find((l) => l.id === selectedLayerId && (l as any).vectorPath)
        if (isBezPointSelected) return
        e.preventDefault()
        for (const id of selectedLayerIds) removeLayer(id)
      } else if (!isTyping && matchShortcut(e, s.duplicate) && selectedLayerIds.length > 0) {
        e.preventDefault()
        duplicateLayerExact(selectedLayerIds)
      } else if (!isTyping && matchShortcut(e, s.lock) && selectedLayerIds.length > 0) {
        e.preventDefault()
        toggleLockMultiple(selectedLayerIds)
      } else if (!isTyping && matchShortcut(e, s.duplicateAlt) && selectedLayerIds.length > 0) {
        e.preventDefault()
        duplicateLayerExact(selectedLayerIds)
      } else if (matchShortcut(e, s.toggleLeftPanel)) {
        e.preventDefault()
        setShowLeftPanel(prev => !prev)
      } else if (matchShortcut(e, s.toggleRightPanel)) {
        e.preventDefault()
        setShowRightPanel(prev => !prev)
      } else if (!isTyping && selectedLayerIds.length > 0 && (matchShortcut(e, s.nudgeUp) || matchShortcut(e, s.nudgeDown) || matchShortcut(e, s.nudgeLeft) || matchShortcut(e, s.nudgeRight) || matchShortcut(e, s.nudgeUpFast) || matchShortcut(e, s.nudgeDownFast) || matchShortcut(e, s.nudgeLeftFast) || matchShortcut(e, s.nudgeRightFast))) {
        e.preventDefault()
        const step = e.shiftKey ? 0.05 : 0.005
        let dx = 0, dy = 0
        if (e.key === 'ArrowLeft') dx = -step
        else if (e.key === 'ArrowRight') dx = step
        else if (e.key === 'ArrowUp') dy = -step
        else if (e.key === 'ArrowDown') dy = +step
        const ids = selectedLayerIds.filter((id) => {
          const l = layers.find((x) => x.id === id)
          return l && !l.locked
        })
        if (ids.length > 0) {
          pushHistory()
          for (const id of ids) {
            const l = layers.find((x) => x.id === id)
            if (l) updateLayer(id, { x: l.x + dx, y: l.y + dy })
          }
        }
      } else if (matchShortcut(e, s.save)) {
        e.preventDefault()
        if (e.shiftKey) {
          setTemplateSaveName(template?.name + ' ' + t('header.exportedSuffix'))
          setTemplateSaveCategory(t('header.defaultCategory'))
          setTemplateSaveMode('export')
          setShowTemplateSave(true)
        } else {
          saveProject()
        }
      } else if (matchShortcut(e, s.saveAs)) {
        e.preventDefault()
        setTemplateSaveName(template?.name + ' ' + t('header.exportedSuffix'))
        setTemplateSaveCategory(t('header.defaultCategory'))
        setTemplateSaveMode('export')
        setShowTemplateSave(true)
      } else if (matchShortcut(e, s.export)) {
        e.preventDefault()
        setShowSaveDialog(true)
      } else if (matchShortcut(e, s.newProject)) {
        e.preventDefault()
        if (useStore.getState().isDirty()) setConfirmLeave({ action: 'new', pendingAction: newProject })
        else newProject()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault()
      } else if (!isTyping && matchShortcut(e, s.selectAll)) {
        e.preventDefault()
        const allIds = layers.filter((l) => !l.isBackground).map((l) => l.id)
        if (allIds.length > 0) selectLayers(allIds)
      } else if (!isTyping && matchShortcut(e, s.group) && selectedLayerIds.length > 0) {
        e.preventDefault()
        setGroupNameCallback((name) => {
          if (!name) return
          createGroup(name)
          const group = useStore.getState().layers.find((l) => l.type === 'group' && l.name === name)
          if (group) {
            for (const id of selectedLayerIds) moveLayerToGroup(id, group.id)
          }
        })
      } else if (!isTyping && matchShortcut(e, s.ungroup) && selectedLayerIds.length > 0) {
        e.preventDefault()
        const gids = new Set<string>()
        for (const id of selectedLayerIds) {
          const l = layers.find((x) => x.id === id)
          if (l?.type === 'group') gids.add(l.id)
          else if (l?.groupId) gids.add(l.groupId)
        }
        for (const gid of gids) ungroupGroup(gid)
      } else if (!isTyping && matchShortcut(e, s.moveDown) && selectedLayerIds.length > 0) {
        e.preventDefault()
        const sorted = [...selectedLayerIds]
          .map((id) => ({ id, idx: layers.findIndex((l) => l.id === id) }))
          .filter((item) => item.idx > 0)
          .sort((a, b) => a.idx - b.idx)
        for (const { id, idx } of sorted) {
          moveLayerToIndex(id, idx - 1)
        }
      } else if (!isTyping && matchShortcut(e, s.moveUp) && selectedLayerIds.length > 0) {
        e.preventDefault()
        const sorted = [...selectedLayerIds]
          .map((id) => ({ id, idx: layers.findIndex((l) => l.id === id) }))
          .filter((item) => item.idx < layers.length - 1)
          .sort((a, b) => b.idx - a.idx)
        for (const { id, idx } of sorted) {
          moveLayerToIndex(id, idx + 1)
        }
      } else if (matchShortcut(e, s.zoomIn)) {
        e.preventDefault()
        const factor = 1.25
        const next = Math.max(0.05, Math.min(10, canvasScale * factor))
        const ratio = next / canvasScale
        const workArea = document.querySelector('[data-canvas-area="true"]')?.parentElement
        const canvasEl = document.getElementById('canvas-export-target')?.parentElement?.parentElement as HTMLElement | null
        if (workArea && canvasEl) {
          const workRect = workArea.getBoundingClientRect()
          const canvasRect = canvasEl.getBoundingClientRect()
          const viewCenterX = workRect.width / 2
          const viewCenterY = workRect.height / 2
          const canvasCenterX = canvasRect.left - workRect.left + canvasRect.width / 2
          const canvasCenterY = canvasRect.top - workRect.top + canvasRect.height / 2
          const dx = -(viewCenterX - canvasCenterX) * (ratio - 1)
          const dy = -(viewCenterY - canvasCenterY) * (ratio - 1)
          setPanOffset({ x: panOffset.x + dx, y: panOffset.y + dy })
        }
        setCanvasScale(next)
      } else if (matchShortcut(e, s.zoomOut)) {
        e.preventDefault()
        const factor = 0.8
        const next = Math.max(0.05, Math.min(10, canvasScale * factor))
        const ratio = next / canvasScale
        const workArea = document.querySelector('[data-canvas-area="true"]')?.parentElement
        const canvasEl = document.getElementById('canvas-export-target')?.parentElement?.parentElement as HTMLElement | null
        if (workArea && canvasEl) {
          const workRect = workArea.getBoundingClientRect()
          const canvasRect = canvasEl.getBoundingClientRect()
          const viewCenterX = workRect.width / 2
          const viewCenterY = workRect.height / 2
          const canvasCenterX = canvasRect.left - workRect.left + canvasRect.width / 2
          const canvasCenterY = canvasRect.top - workRect.top + canvasRect.height / 2
          const dx = -(viewCenterX - canvasCenterX) * (ratio - 1)
          const dy = -(viewCenterY - canvasCenterY) * (ratio - 1)
          setPanOffset({ x: panOffset.x + dx, y: panOffset.y + dy })
        }
        setCanvasScale(next)
      } else if (matchShortcut(e, s.resetZoom)) {
        e.preventDefault()
        resetView()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, selectedLayerId, selectedLayerIds, removeLayer, duplicateLayer, duplicateLayerExact, clearSelection, updateLayer, pushHistory, layers, saveProject, exportTemplateToFile, setShowSaveDialog, newProject, selectLayers, template, createGroup, ungroupGroup, moveLayerToGroup, moveLayerToIndex, canvasScale, setCanvasScale, showSettings, setShowSettings, setShowLeftPanel, setShowRightPanel, panOffset, setPanOffset, bezierEditMode, selectedBezierPointId])

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      // em modo crop, desselecionar deve cancelar o crop (pedido)
      if (croppingLayerId) {
        const target = e.target as HTMLElement | null
        if (!target) return
        if (target.closest('[data-crop-overlay="true"]')) return
        if (target.closest('[data-no-deselect="true"]')) return
        // clique fora do overlay cancela o crop em vez de apenas limpar seleção
        setCroppingLayerId(null)
        return
      }
      if (selectedLayerIds.length === 0) return
      const target = e.target as HTMLElement | null
      if (!target) return
      // Popup de cor aberto: o toque só o dispensa, sem desselecionar
      if (target.closest('[data-color-popup="true"]')) return
      if (closeOpenColorPopups()) return
      if (target.closest('[data-canvas-area="true"]')) return
      if (target.closest('[data-no-deselect="true"]')) return
      clearSelection()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [selectedLayerIds, clearSelection, croppingLayerId, setCroppingLayerId])

  useEffect(() => {
    if (!selectedLayerId) return
    const layer = layers.find((l) => l.id === selectedLayerId)
    if (!layer || layer.isBackground) return
    if (layer.type === 'text') setLeftTab('text')
    else if (layer.type === 'image') setLeftTab('images')
  }, [selectedLayerId])

  // Carrega posições de scroll guardadas (persistem entre sessões)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('lovert.propsScroll.v1')
      if (raw) propsScrollPos.current = JSON.parse(raw) || {}
    } catch {}
  }, [])

  // Restaura o scroll do painel de propriedades ao trocar de camada —
  // o painel "lembra" onde o utilizador estava em cada camada.
  useEffect(() => {
    const el = propsScrollRef.current
    if (!el) return
    const y = propsScrollPos.current[propsScrollKey] ?? 0
    const raf = requestAnimationFrame(() => {
      el.scrollTop = y
      // segunda passagem: o conteúdo muda de altura após o 1.º paint
      requestAnimationFrame(() => { el.scrollTop = propsScrollPos.current[propsScrollKey] ?? y })
    })
    return () => cancelAnimationFrame(raf)
  }, [propsScrollKey])

  useEffect(() => {
    ;(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const result = await invoke<string[]>('get_system_fonts')
        setSystemFonts(result)
        return
      } catch {}
      try {
        const f = await (navigator as any).fonts?.queryLocalFonts?.()
        if (f && f.length > 0) {
          const names: string[] = [...new Set<string>(f.map((e: any) => e.family))].sort()
          if (names.length > 0) { setSystemFonts(names); return }
        }
      } catch {}
      // Last resort: enumerate from document.fonts
      try {
        const loaded: string[] = []
        ;(document as any).fonts?.forEach?.((f: any) => loaded.push(f.family))
        if (loaded.length > 10) { setSystemFonts([...new Set(loaded)].sort()); return }
      } catch {}
    })()
  }, [setSystemFonts])

  if (!template) return null

  const selectedLayer = layers.find((l) => l.id === selectedLayerId)

  const tabs: { id: LeftTab; icon: React.ReactNode }[] = [
    { id: 'background', icon: <IconBackground size={14} /> },
    { id: 'images', icon: <IconImage size={14} /> },
    { id: 'text', icon: <IconText size={14} /> },
    { id: 'elements', icon: <IconElements size={14} /> },
  ]

  return (
    <>
      <div className="flex flex-col flex-1 min-h-0 bg-[#0f0f1a] text-white select-none">
      <header className="h-8 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-2 shrink-0" data-no-deselect="true">
          <div className={`flex items-center gap-0.5 ${uiScale >= 1.3 ? 'max-w-[55%] overflow-hidden' : ''}`}>
            <button onClick={() => { if (useStore.getState().isDirty()) setConfirmLeave({ action: 'new', pendingAction: newProject }); else newProject() }} className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-zinc-700/50 transition-colors shrink-0" title={t('header.newProject')}>📄<span className={uiScale >= 1.3 ? 'hidden' : 'ml-1'}>{t('header.newProjectShort')}</span></button>
            <button onClick={saveProject} className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-zinc-700/50 transition-colors shrink-0" title={t('header.saveProject')}>💾<span className={uiScale >= 1.3 ? 'hidden' : 'ml-1'}>{t('header.saveProjectShort')}</span></button>
            <button onClick={() => { if (useStore.getState().isDirty()) setConfirmLeave({ action: 'load', pendingAction: loadProject }); else loadProject() }} className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-zinc-700/50 transition-colors shrink-0" title={t('header.openProjectShort')}>📂<span className={uiScale >= 1.3 ? 'hidden' : 'ml-1'}>{t('header.openProjectShort')}</span></button>
            <span className="w-px h-4 bg-zinc-700 mx-1 shrink-0" />
            <button onClick={() => undo()} className="text-zinc-400 hover:text-white text-xs px-1.5 py-1 rounded hover:bg-zinc-700/50 transition-colors shrink-0" title={t('header.undo')}>↩</button>
            <button onClick={() => redo()} className="text-zinc-400 hover:text-white text-xs px-1.5 py-1 rounded hover:bg-zinc-700/50 transition-colors shrink-0" title={t('header.redo')}>↪</button>
            {uiScale < 1.1 && (
              <>
                <span className="w-px h-4 bg-zinc-700 mx-1 shrink-0" />
                <button onClick={() => {
                  const factor = 0.8
                  const next = Math.max(0.05, Math.min(10, canvasScale * factor))
                  const ratio = next / canvasScale
                  const workArea = document.querySelector('[data-canvas-area="true"]')?.parentElement
                  const canvasEl = document.getElementById('canvas-export-target')?.parentElement?.parentElement as HTMLElement | null
                  if (workArea && canvasEl) {
                    const workRect = workArea.getBoundingClientRect()
                    const canvasRect = canvasEl.getBoundingClientRect()
                    const viewCenterX = workRect.width / 2
                    const viewCenterY = workRect.height / 2
                    const canvasCenterX = canvasRect.left - workRect.left + canvasRect.width / 2
                    const canvasCenterY = canvasRect.top - workRect.top + canvasRect.height / 2
                    const dx = -(viewCenterX - canvasCenterX) * (ratio - 1)
                    const dy = -(viewCenterY - canvasCenterY) * (ratio - 1)
                    setPanOffset({ x: panOffset.x + dx, y: panOffset.y + dy })
                  }
                  setCanvasScale(next)
                }} className="text-zinc-400 hover:text-white text-xs px-1.5 py-1 rounded hover:bg-zinc-700/50 transition-colors shrink-0">−</button>
                <span className="text-xs text-zinc-400 w-10 text-center shrink-0">{Math.round(canvasScale * 100)}%</span>
                <button onClick={() => {
                  const factor = 1.25
                  const next = Math.max(0.05, Math.min(10, canvasScale * factor))
                  const ratio = next / canvasScale
                  const workArea = document.querySelector('[data-canvas-area="true"]')?.parentElement
                  const canvasEl = document.getElementById('canvas-export-target')?.parentElement?.parentElement as HTMLElement | null
                  if (workArea && canvasEl) {
                    const workRect = workArea.getBoundingClientRect()
                    const canvasRect = canvasEl.getBoundingClientRect()
                    const viewCenterX = workRect.width / 2
                    const viewCenterY = workRect.height / 2
                    const canvasCenterX = canvasRect.left - workRect.left + canvasRect.width / 2
                    const canvasCenterY = canvasRect.top - workRect.top + canvasRect.height / 2
                    const dx = -(viewCenterX - canvasCenterX) * (ratio - 1)
                    const dy = -(viewCenterY - canvasCenterY) * (ratio - 1)
                    setPanOffset({ x: panOffset.x + dx, y: panOffset.y + dy })
                  }
                  setCanvasScale(next)
                }} className="text-zinc-400 hover:text-white text-xs px-1.5 py-1 rounded hover:bg-zinc-700/50 transition-colors shrink-0">+</button>
                <button onClick={() => resetView()} className="text-zinc-500 hover:text-white text-[0.625rem] px-1.5 py-1 rounded hover:bg-zinc-700/50 transition-colors shrink-0">⟲</button>
              </>
            )}
            <span className="w-px h-4 bg-zinc-700 mx-1 shrink-0" />
            <button
              onClick={toggleSnap}
              className={`text-xs px-1.5 py-1 rounded transition-colors shrink-0 ${snapEnabled ? 'bg-blue-600/20 text-blue-300' : 'text-zinc-500 hover:text-white hover:bg-zinc-700/50'}`}
              title={snapEnabled ? t('header.snapOn') : t('header.snapOff')}
            >
              🧲
            </button>
            <div className="relative shrink-0">
              <button
                onClick={() => setShowGlobalEffects(true)}
                className="text-zinc-400 hover:text-white text-xs px-1.5 py-1 rounded hover:bg-zinc-700/50 transition-colors"
                title={t('global.title')}
              >
                🌍
              </button>
              {showGlobalEffects && <GlobalEffects />}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={async () => {
                setTemplateSaveName(template.name + ' ' + t('header.customSuffix'))
                setTemplateSaveCategory(t('header.defaultCategory'))
                setTemplateSaveMode('preset')
                setShowTemplateSave(true)
              }}
              className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-zinc-700/50 transition-colors"
              title={t('header.saveAsTemplate')}
            >
              ⭐
            </button>
            <span className="w-px h-4 bg-zinc-700 mx-1" />
            <button
              onClick={() => setShowSettings(true)}
              className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-zinc-700/50 transition-colors"
              title={t('app.settings')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
            <span className="w-px h-4 bg-zinc-700 mx-1" />
            {!licenseValid && (
              <button onClick={() => setShowLicenseDialog(true)} className="text-amber-400 hover:text-amber-300 text-xs px-2 py-1 rounded hover:bg-amber-500/10 transition-colors" title="Ativar licença">
                🔑
              </button>
            )}
            <button onClick={() => setShowReportModal(true)} className="text-zinc-400 hover:text-red-400 text-xs px-2 py-1 rounded hover:bg-red-500/10 transition-colors" title={t('app.reportComplaint')}>
              🚩
            </button>
            <button onClick={() => setShowSaveDialog(true)} className="btn bg-blue-600/80 hover:bg-blue-600 text-white text-xs px-3 py-1 rounded-lg transition-colors">
              {t('save.export')}
            </button>
          </div>
      </header>

      <div className="flex flex-1 min-h-0 relative">
      {showLeftPanel && (
        <div className="w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0 relative" data-no-deselect="true">
          <div className="p-3 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-1">
              <h1 className="text-sm font-bold truncate flex-1 flex items-center gap-1.5"><img src={PLATFORM_ICON[template.platform] || '/icon.png'} alt="" className="w-4 h-4 object-contain shrink-0" /> {template.name}</h1>
              <button
                onClick={() => setShowConvertModal(true)}
                className="shrink-0 text-zinc-500 hover:text-blue-300 hover:bg-blue-500/10 text-[0.6875rem] px-1.5 py-1 rounded transition-colors"
                title={t('header.convertResolution')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                </svg>
              </button>
            </div>
            <p className="text-[0.625rem] text-zinc-500">{template.width}×{template.height}</p>
          </div>

          <div className="flex border-b border-zinc-800 shrink-0">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setLeftTab(t.id)}
                className={`tab-btn flex-1 flex items-center justify-center ${leftTab === t.id ? 'active' : ''}`}
              >
                {t.icon}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {leftTab === 'background' && <BackgroundPicker />}
            {leftTab === 'images' && <ImageUploader />}
            {leftTab === 'text' && <TextEditor />}
            {leftTab === 'elements' && <ElementsPanel />}
          </div>
          {/* Drag handle — segure e arraste para a esquerda para fechar (Alt+←). Sem redimensionar. Duplo clique também fecha. */}
          <div
            className="absolute top-0 right-0 bottom-0 w-[10px] cursor-ew-resize flex items-center justify-center group/handle z-10"
            title="Arraste para a esquerda para fechar ou duplo clique (Alt+←)"
            onDoubleClick={() => setShowLeftPanel(false)}
            onPointerDown={(e) => {
              if (e.detail === 2) return;
              e.preventDefault(); e.stopPropagation();
              const target = e.currentTarget as HTMLElement;
              target.setPointerCapture(e.pointerId);
              const startX = e.clientX;
              let closed = false;
              const onMove = (ev: PointerEvent) => {
                const dx = ev.clientX - startX;
                if (!closed && dx < -45) { closed = true; setShowLeftPanel(false); cleanup(); }
              };
              const onUp = () => cleanup();
              const cleanup = () => {
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                try { target.releasePointerCapture(e.pointerId); } catch {}
              };
              document.addEventListener('pointermove', onMove);
              document.addEventListener('pointerup', onUp);
            }}
          >
            <div className="w-px h-16 bg-zinc-700 group-hover/handle:bg-blue-500/60 rounded-full transition-colors" />
            <div className="absolute w-[3px] h-8 flex flex-col items-center justify-center gap-1 opacity-40 group-hover/handle:opacity-100 transition-opacity">
              <span className="w-0.5 h-0.5 bg-zinc-500 rounded-full" />
              <span className="w-0.5 h-0.5 bg-zinc-500 rounded-full" />
              <span className="w-0.5 h-0.5 bg-zinc-500 rounded-full" />
            </div>
          </div>
        </div>
      )}
      {!showLeftPanel && (
        <div
          className="w-[14px] shrink-0 bg-zinc-900/80 border-r border-zinc-800 flex flex-col items-center justify-center cursor-ew-resize hover:bg-zinc-800 group/collapsedLeft select-none"
          title="Arraste para a direita para abrir ou duplo clique (Alt+←)"
          onDoubleClick={() => setShowLeftPanel(true)}
          onClick={() => setShowLeftPanel(true)}
          onPointerDown={(e) => {
            e.preventDefault(); e.stopPropagation();
            const target = e.currentTarget as HTMLElement;
            target.setPointerCapture(e.pointerId);
            const startX = e.clientX;
            let opened = false;
            const onMove = (ev: PointerEvent) => {
              const dx = ev.clientX - startX;
              if (!opened && dx > 40) { opened = true; setShowLeftPanel(true); cleanup(); }
            };
            const onUp = (ev: PointerEvent) => {
              const dx = ev.clientX - startX;
              if (!opened && Math.abs(dx) < 6) setShowLeftPanel(true);
              cleanup();
            };
            const cleanup = () => {
              document.removeEventListener('pointermove', onMove);
              document.removeEventListener('pointerup', onUp);
              try { target.releasePointerCapture(e.pointerId); } catch {}
            };
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
          }}
        >
          <div className="flex flex-col items-center gap-1 py-4">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-500 group-hover/collapsedLeft:text-blue-400 transition-colors"><polyline points="9 18 15 12 9 6" /></svg>
            <div className="w-px h-10 bg-zinc-700 group-hover/collapsedLeft:bg-blue-500/40 rounded-full" />
            <div className="flex flex-col gap-1 opacity-30 group-hover/collapsedLeft:opacity-70">
              <span className="w-0.5 h-0.5 bg-zinc-500 rounded-full" /><span className="w-0.5 h-0.5 bg-zinc-500 rounded-full" /><span className="w-0.5 h-0.5 bg-zinc-500 rounded-full" />
            </div>
          </div>
        </div>
      )}

        <Canvas />

      {!showRightPanel && (
        <div
          className="w-[14px] shrink-0 bg-zinc-900/80 border-l border-zinc-800 flex flex-col items-center justify-center cursor-ew-resize hover:bg-zinc-800 group/collapsedRight select-none"
          title="Arraste para a esquerda para abrir ou duplo clique (Alt+→)"
          onDoubleClick={() => setShowRightPanel(true)}
          onClick={() => setShowRightPanel(true)}
          onPointerDown={(e) => {
            e.preventDefault(); e.stopPropagation();
            const target = e.currentTarget as HTMLElement;
            target.setPointerCapture(e.pointerId);
            const startX = e.clientX;
            let opened = false;
            const onMove = (ev: PointerEvent) => {
              const dx = ev.clientX - startX;
              if (!opened && dx < -40) { opened = true; setShowRightPanel(true); cleanup(); }
            };
            const onUp = (ev: PointerEvent) => {
              const dx = ev.clientX - startX;
              if (!opened && Math.abs(dx) < 6) setShowRightPanel(true);
              cleanup();
            };
            const cleanup = () => {
              document.removeEventListener('pointermove', onMove);
              document.removeEventListener('pointerup', onUp);
              try { target.releasePointerCapture(e.pointerId); } catch {}
            };
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
          }}
        >
          <div className="flex flex-col items-center gap-1 py-4">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-zinc-500 group-hover/collapsedRight:text-blue-400 transition-colors"><polyline points="15 18 9 12 15 6" /></svg>
            <div className="w-px h-10 bg-zinc-700 group-hover/collapsedRight:bg-blue-500/40 rounded-full" />
            <div className="flex flex-col gap-1 opacity-30 group-hover/collapsedRight:opacity-70">
              <span className="w-0.5 h-0.5 bg-zinc-500 rounded-full" /><span className="w-0.5 h-0.5 bg-zinc-500 rounded-full" /><span className="w-0.5 h-0.5 bg-zinc-500 rounded-full" />
            </div>
          </div>
        </div>
      )}
      {showRightPanel && (
        <div ref={rightPanelRef} className="w-80 bg-zinc-900/95 backdrop-blur border-l border-zinc-800 flex flex-col shrink-0 relative" data-no-deselect="true">
          <div className="px-3 py-2.5 border-b border-zinc-800/60 shrink-0 flex items-center justify-between">
            <h2 className="text-[11px] font-bold tracking-widest uppercase text-zinc-300 flex items-center gap-2">{t('layers.title')} <span className="min-w-5 h-5 px-1 rounded-full bg-zinc-800 border border-zinc-700 text-[10px] flex items-center justify-center text-zinc-400">{layers.length}</span></h2>
            <span className="text-[10px] text-zinc-600 hidden sm:inline">{t('layers.hint')}</span>
          </div>
          <div ref={layersPaneRef} className="overflow-y-auto p-2.5 shrink-0 scrollbar-thin" style={{ height: `${layersHeightPct}%`, minHeight: 80 }}>
            <LayerPanel />
          </div>
          {/* Divisor arrastável — limite justo 22%–68% para não colapsar 100% */}
          <div
            onPointerDown={onDividerPointerDown}
            className="h-1.5 shrink-0 bg-zinc-800 hover:bg-[var(--accent)]/30 cursor-row-resize flex items-center justify-center group/divider touch-none select-none"
            title={t('layers.dividerHint')}
          >
            <div className="w-10 h-0.5 bg-zinc-600 group-hover/divider:bg-white/60 rounded-full transition-colors" />
          </div>
          {selectedLayer ? (
            <div ref={propsScrollRef} onScroll={(e) => {
              const y = (e.currentTarget as HTMLDivElement).scrollTop
              propsScrollPos.current[propsScrollKey] = y
              window.clearTimeout(propsScrollSaveTimer.current)
              propsScrollSaveTimer.current = window.setTimeout(() => {
                try { localStorage.setItem('lovert.propsScroll.v1', JSON.stringify(propsScrollPos.current)) } catch {}
              }, 300)
            }} className="border-t-0 flex-1 overflow-y-auto p-2.5 min-h-0 bg-gradient-to-b from-zinc-900 to-[#0f0f14] scrollbar-thin" style={{ minHeight: 120, contain: isPanelResizing ? 'strict' as const : undefined, contentVisibility: isPanelResizing ? 'auto' as const : undefined } as any}>
              <EffectsControls />
            </div>
          ) : (
            <div className="border-t border-zinc-800/60 flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xl mb-2">◐</div>
              <p className="text-[12px] font-medium text-zinc-300">{t('layers.noSelection')}</p>
              <p className="text-[11px] text-zinc-500 mt-1 leading-tight" dangerouslySetInnerHTML={{ __html: t('layers.noSelectionDesc') }} />
              <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                <span className="text-[10px] px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500">{t('layers.selectHint1')}</span>
                <span className="text-[10px] px-2 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500">{t('layers.selectHint2')}</span>
              </div>
            </div>
          )}
          {/* Drag handle — segure e arraste para a direita para fechar (Alt+→). Sem redimensionar. Duplo clique também fecha. */}
          <div
            className="absolute top-0 left-0 bottom-0 w-[10px] cursor-ew-resize flex items-center justify-center group/handle z-10"
            title="Arraste para a direita para fechar ou duplo clique (Alt+→)"
            onDoubleClick={() => setShowRightPanel(false)}
            onPointerDown={(e) => {
              if (e.detail === 2) return;
              e.preventDefault(); e.stopPropagation();
              const target = e.currentTarget as HTMLElement;
              target.setPointerCapture(e.pointerId);
              const startX = e.clientX;
              let closed = false;
              const onMove = (ev: PointerEvent) => {
                const dx = ev.clientX - startX;
                if (!closed && dx > 45) { closed = true; setShowRightPanel(false); cleanup(); }
              };
              const onUp = () => cleanup();
              const cleanup = () => {
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                try { target.releasePointerCapture(e.pointerId); } catch {}
              };
              document.addEventListener('pointermove', onMove);
              document.addEventListener('pointerup', onUp);
            }}
          >
            <div className="w-px h-16 bg-zinc-700 group-hover/handle:bg-blue-500/60 rounded-full transition-colors" />
            <div className="absolute w-[3px] h-8 flex flex-col items-center justify-center gap-1 opacity-40 group-hover/handle:opacity-100 transition-opacity">
              <span className="w-0.5 h-0.5 bg-zinc-500 rounded-full" />
              <span className="w-0.5 h-0.5 bg-zinc-500 rounded-full" />
              <span className="w-0.5 h-0.5 bg-zinc-500 rounded-full" />
            </div>
          </div>
        </div>
      )}
      </div>

      <div className="shrink-0 flex items-center justify-between px-3 py-0.5 border-t border-zinc-800/50" style={{ background: 'var(--bg-panel)' }}>
        <span className="text-[10px] text-zinc-600">{t('app.footer')}</span>
        <span className="text-[10px] text-zinc-500">v{APP_VERSION}</span>
      </div>
      </div>

      {showSaveDialog && <SaveDialog />}
      {showConvertModal && <ConvertTemplateModal onClose={() => setShowConvertModal(false)} />}
      <LicenseDialog />
      <ReportModal />

      {confirmLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} data-no-deselect="true">
          <div className="rounded-xl shadow-2xl w-72 p-4" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{t('header.unsavedTitle')}</h3>
            <p className="text-[0.6875rem] mb-3" style={{ color: 'var(--text-secondary)' }}>{t('header.unsavedMessage')}</p>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={async () => { await saveProject(); confirmLeave.pendingAction(); setConfirmLeave(null) }}
                className="text-[0.6875rem] py-2 rounded-lg transition-colors text-white font-medium"
                style={{ background: 'var(--accent)' }}
              >
                {t('save.export')} &amp; {t('header.proceed')}
              </button>
              <button
                onClick={() => { confirmLeave.pendingAction(); setConfirmLeave(null) }}
                className="text-[0.6875rem] py-2 rounded-lg transition-colors"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
              >
                {t('header.discard')}
              </button>
              <button
                onClick={() => setConfirmLeave(null)}
                className="text-[0.6875rem] py-2 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('app.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showTemplateSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} data-no-deselect="true" onClick={() => setShowTemplateSave(false)}>
          <div className="rounded-xl shadow-2xl w-72 p-4" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{t('header.saveAsTemplate')}</h3>
            <div className="space-y-2 mb-3">
              <div>
                <label className="text-[0.625rem] text-zinc-500 block mb-0.5">{t('header.promptTemplateName')}</label>
                <input value={templateSaveName}
                  onChange={(e) => setTemplateSaveName(e.target.value)}
                  className="w-full bg-zinc-700/50 rounded px-2 py-1 text-[0.625rem] text-white border border-zinc-600 focus:outline-none focus:border-blue-500"
                  autoFocus />
              </div>
              <div>
                <label className="text-[0.625rem] text-zinc-500 block mb-0.5">{t('header.promptCategory')}</label>
                <input value={templateSaveCategory}
                  onChange={(e) => setTemplateSaveCategory(e.target.value)}
                  className="w-full bg-zinc-700/50 rounded px-2 py-1 text-[0.625rem] text-white border border-zinc-600 focus:outline-none focus:border-blue-500" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowTemplateSave(false)}
                className="flex-1 text-[0.625rem] py-1.5 rounded-lg transition-colors"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
                {t('text.cancel')}
              </button>
              <button onClick={async () => {
                if (templateSaveMode === 'export') {
                  exportTemplateToFile(templateSaveName || undefined, templateSaveCategory || undefined)
                } else {
                  await saveCurrentAsPreset(templateSaveName, templateSaveCategory)
                }
                setShowTemplateSave(false)
              }}
                className="flex-1 text-[0.625rem] py-1.5 rounded-lg transition-colors text-white font-medium"
                style={{ background: 'var(--accent)' }}>
                {t('save.export')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings popup */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" data-no-deselect="true" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowSettings(false)}>
          <div className="rounded-xl shadow-2xl w-[22.5rem] flex flex-col max-h-[75vh]" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <div className="shrink-0 px-5 pt-5 pb-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{t('app.settings')}</h2>
                <div className="flex gap-1">
                  <button onClick={() => setSettingsTab('appearance')} className={`text-[0.625rem] px-2.5 py-1 rounded-lg transition-all ${settingsTab === 'appearance' ? 'text-accent bg-accent-15' : 'text-zinc-400 hover:text-zinc-200'}`}>{t('settings.tabAppearance')}</button>
                  <button onClick={() => setSettingsTab('shortcuts')} className={`text-[0.625rem] px-2.5 py-1 rounded-lg transition-all ${settingsTab === 'shortcuts' ? 'text-accent bg-accent-15' : 'text-zinc-400 hover:text-zinc-200'}`}>{t('settings.tabShortcuts')}</button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 min-h-0">
              {settingsTab === 'appearance' && (
                <div className="space-y-5 pb-1">
                  <div>
                    <label className="text-[0.625rem] uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>{t('app.settingsTheme')}</label>
                    <div className="flex gap-1.5">
                      {['padrao', 'dark', 'light'].map((th) => (
                        <button
                          key={th}
                          onClick={() => setBaseTheme(th)}
                          className={`flex-1 text-[0.6875rem] py-2 rounded-lg transition-all border ${baseTheme === th ? 'text-accent bg-accent-15 border-accent-30' : ''}`}
                          style={baseTheme !== th ? { color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderColor: 'transparent' } : {}}
                        >
                          {th === 'padrao' ? t('settings.themeDefault') : th.charAt(0).toUpperCase() + th.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[0.625rem] uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>{t('app.settingsAccent')}</label>
                    <div className="flex gap-2">
                      {[
                        { id: 'default', color: '#3b82f6' },
                        { id: 'amber', color: '#f59e0b' },
                        { id: 'emerald', color: '#10b981' },
                        { id: 'violet', color: '#8b5cf6' },
                        { id: 'rose', color: '#f43f5e' },
                        { id: 'cyan', color: '#06b6d4' },
                        { id: 'orange', color: '#f97316' },
                        { id: 'pink', color: '#ec4899' },
                      ].map((ac) => (
                        <button
                          key={ac.id}
                          onClick={() => setUiTheme(ac.id)}
                          className="w-7 h-7 rounded-full transition-all"
                          style={{
                            background: ac.color,
                            outline: uiTheme === ac.id ? `2.5px solid ${ac.color}` : 'none',
                            outlineOffset: 2.5,
                            opacity: uiTheme === ac.id ? 1 : 0.5,
                          }}
                          title={ac.id}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[0.625rem] uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>{t('app.settingsLanguage')}</label>
                    <div className="flex gap-1.5">
                      {(['pt', 'en', 'es'] as const).map((l) => (
                        <button
                          key={l}
                          onClick={() => setLanguage(l)}
                          className={`flex-1 text-[0.6875rem] py-2 rounded-lg transition-all border ${language === l ? 'text-accent bg-accent-15 border-accent-30' : ''}`}
                          style={language !== l ? { color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderColor: 'transparent' } : {}}
                        >
                          {t('settings.lang' + l.charAt(0).toUpperCase() + l.slice(1))}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[0.625rem] uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>{t('app.settingsScale')}</label>
                    <div className="flex items-center gap-3">
                      <span className="text-[0.625rem] w-6 text-center" style={{ color: 'var(--text-secondary)' }}>{t('settings.scaleMin')}</span>
                      <input
                        type="range"
                        min="0.6"
                        max="1.5"
                        step="0.05"
                        value={uiScale}
                        onChange={(e) => setUiScale(parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-[0.625rem] w-6 text-center" style={{ color: 'var(--text-secondary)' }}>{t('settings.scaleMax')}</span>
                    </div>
                    <div className="text-center mt-1" style={{ color: 'var(--text-dim)' }}>
                      <span className="text-[0.6875rem] font-medium" style={{ color: 'var(--text-primary)' }}>{Math.round(uiScale * 100)}%</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-[0.625rem] uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>Tamanho dos handles</label>
                    <div className="flex items-center gap-3">
                      <span className="text-[0.625rem] w-6 text-center" style={{ color: 'var(--text-secondary)' }}>Pequeno</span>
                      <input
                        type="range"
                        min="0.6"
                        max="1.8"
                        step="0.1"
                        value={handleSize}
                        onChange={(e) => setHandleSize(parseFloat(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-[0.625rem] w-6 text-center" style={{ color: 'var(--text-secondary)' }}>Grande</span>
                    </div>
                    <div className="text-center mt-1" style={{ color: 'var(--text-dim)' }}>
                      <span className="text-[0.6875rem] font-medium" style={{ color: 'var(--text-primary)' }}>{Math.round(handleSize * 100)}%</span>
                    </div>
                  </div>

                  {licenseValid && (
                    <div className="pt-3 border-t border-zinc-700/40 space-y-2">
                      <div className="text-[0.625rem] text-zinc-400 font-medium">{t('settings.licenseActive', { tier: licenseTier || '—' })}</div>
                      <p className="text-[0.5625rem] text-zinc-500">{licenseEmail}</p>
                      <button
                        onClick={handleDeactivateLicense}
                        className="text-[0.5625rem] px-2 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 w-full text-left"
                      >
                        {t('settings.deactivateLicense')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {settingsTab === 'shortcuts' && <ShortcutSettings />}
            </div>

            <div className="shrink-0 px-5 pb-5 pt-3">
              <div className="text-right">
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-[0.625rem] px-4 py-1.5 rounded-lg transition-colors"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                >
                  {t('app.close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {groupNameCallback && <GroupNameInput
        initialName={t('header.defaultGroupName') || 'Grupo'}
        onConfirm={(name) => { groupNameCallback(name); setGroupNameCallback(null) }}
        onCancel={() => setGroupNameCallback(null)}
        prompt={t('header.promptGroupName')}
        cancelLabel={t('app.close')}
      />}

      {showCloseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} data-no-deselect="true">
          <div className="rounded-xl shadow-2xl w-72 p-4" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-bold mb-1" style={{ color: 'var(--text-primary)' }}>{t('header.unsavedTitle')}</h3>
            <p className="text-[0.6875rem] mb-3" style={{ color: 'var(--text-secondary)' }}>{t('header.unsavedMessage')}</p>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={async () => {
                  await saveProject()
                  markSaved()
                  setShowCloseConfirm(false)
                  try {
                    const { invoke } = await import('@tauri-apps/api/core')
                    await invoke('allow_close')
                  } catch (e) { console.error(e) }
                }}
                className="text-[0.6875rem] py-2 rounded-lg transition-colors text-white font-medium"
                style={{ background: 'var(--accent)' }}
              >
                {t('save.export')} &amp; {t('header.proceed')}
              </button>
              <button
                onClick={async () => {
                  markSaved()
                  setShowCloseConfirm(false)
                  try {
                    const { invoke } = await import('@tauri-apps/api/core')
                    await invoke('allow_close')
                  } catch (e) { console.error(e) }
                }}
                className="text-[0.6875rem] py-2 rounded-lg transition-colors"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-primary)' }}
              >
                {t('header.discard')}
              </button>
              <button
                onClick={() => setShowCloseConfirm(false)}
                className="text-[0.6875rem] py-2 rounded-lg transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                {t('app.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
