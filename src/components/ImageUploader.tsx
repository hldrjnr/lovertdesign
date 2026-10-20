import { useState, useRef, useCallback } from 'react'
import { t } from '@/i18n'
import { useStore } from '@/store'
import { cropBackgroundCss } from '@/cropCss'
import { CropModal } from './CropModal'
import { ModelDownloadModal } from './ModelDownloadModal'
import { PanelCard, PanelSlider } from './Panel'

const MODELS = [
  { id: 'u2net', label: 'u2net', desc: t('image.modelBalanced') },
  { id: 'u2netp', label: 'u2netp', desc: t('image.modelFast') },
  { id: 'silueta', label: 'silueta', desc: t('image.modelSilhouette') },
  { id: 'u2net_human_seg', label: 'u2net_human_seg', desc: t('image.modelPeople') },
  { id: 'isnet-general-use', label: 'isnet-general-use', desc: t('image.modelAdvanced') },
  { id: 'isnet-anime', label: 'isnet-anime', desc: t('image.modelAnime') },
  { id: 'birefnet-general', label: 'birefnet-general', desc: t('image.modelHighAccuracy') },
] as const

// Shape returned by the Rust `check_python_rembg` command. Kept in sync with
// `bg_removal::AiStatus` in src-tauri/src/bg_removal.rs.
interface AiStatus {
  available: boolean
  reason: 'no_python' | 'python_too_old' | 'rembg_missing' | 'rembg_broken' | 'unknown'
  python?: string | null
  python_version?: string | null
  rembg_version?: string | null
  hint?: string | null
}

// Module-level cache so the probe only fires once ever (across panel
// mounts/unmounts), but NOT at boot — it only runs when the user first
// clicks the AI button.
let aiProbed = false
let aiProbedResult: AiStatus | null = null
let modelStatusCache: Record<string, boolean> = {}
let aiArmed = false

export function ImageUploader() {
  const addImageLayer = useStore((s) => s.addImageLayer)
  const layers = useStore((s) => s.layers)
  const selectedLayerId = useStore((s) => s.selectedLayerId)
  const updateLayer = useStore((s) => s.updateLayer)
  const setProcessing = useStore((s) => s.setProcessing)
  const processingLayers = useStore((s) => s.processingLayers)
  const setError = useStore((s) => s.setError)
  const language = useStore((s) => s.language)

  const selectedLayer = layers.find((l) => l.id === selectedLayerId && l.type === 'image' && !l.isBackground)

  const [mode, setMode] = useState<'chromakey' | 'detection'>('chromakey')
  const [threshold, setThreshold] = useState(60)
  const [chromaColor, setChromaColor] = useState('#00ff00')
  const [aiModel, setAiModel] = useState('u2net')
  const [erodeSize, setErodeSize] = useState(0)
  const croppingLayerId = useStore((s) => s.croppingLayerId)
  const setCroppingLayerId = useStore((s) => s.setCroppingLayerId)

  // AI availability: null = not yet probed, AiStatus = result.
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(aiProbed ? aiProbedResult?.available ?? false : null)
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(aiProbed ? aiProbedResult : null)
  // Model status per model id: undefined = not probed, true/false.
  const [modelStatus, setModelStatus] = useState<Record<string, boolean>>({ ...modelStatusCache })
  const [probingAI, setProbingAI] = useState(false)
  const [initPhase, setInitPhase] = useState<string>('idle')
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [downloadModelId, setDownloadModelId] = useState('')

  // Probe Python+rembg once. Called lazily when the user clicks "IA".
  const probeAI = useCallback(async (force = false) => {
    if (aiProbed && !force) return
    setProbingAI(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const status = await invoke<AiStatus>('check_python_rembg')
      aiProbed = true
      aiProbedResult = status
      setAiStatus(status)
      setAiAvailable(!!status.available)
      if (!status.available && mode === 'detection') setMode('chromakey')
    } catch (e) {
      aiProbed = true
      aiProbedResult = { available: false, reason: 'unknown', hint: String(e) }
      setAiStatus(aiProbedResult)
      setAiAvailable(false)
      if (mode === 'detection') setMode('chromakey')
    } finally {
      setProbingAI(false)
    }
  }, [mode])

  // Probe a specific model's download status (called once per model).
  const probeModel = useCallback(async (model: string) => {
    if (!aiAvailable) return
    if (modelStatusCache[model] !== undefined) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const exists = await invoke<boolean>('check_model_status', { model })
      modelStatusCache[model] = exists
      setModelStatus((prev) => ({ ...prev, [model]: exists }))
    } catch {
      modelStatusCache[model] = false
      setModelStatus((prev) => ({ ...prev, [model]: false }))
    }
  }, [aiAvailable])

  const handleAIToggle = useCallback(async () => {
    if (aiArmed) {
      setMode('detection')
      return
    }

    const { invoke } = await import('@tauri-apps/api/core')
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

    // Phase 1: Check Python + rembg (rich status so we can surface hints)
    setInitPhase('python')
    let status: AiStatus | null = null
    try {
      status = await invoke<AiStatus>('check_python_rembg')
    } catch (e: any) {
      status = { available: false, reason: 'unknown', hint: e?.message || String(e) }
    }
    aiProbed = true
    aiProbedResult = status
    setAiStatus(status)
    setAiAvailable(!!status.available)
    if (!status.available) {
      setInitPhase('python_error')
      // Show an actionable hint instead of a silent failure.
      const hint =
        status.hint ||
        (status.reason === 'no_python'
          ? t('image.aiReasonNoPython')
          : status.reason === 'python_too_old'
          ? t('image.aiReasonPythonTooOld', { version: status.python_version || '?' })
          : status.reason === 'rembg_missing'
          ? t('image.aiReasonRembgMissing')
          : status.reason === 'rembg_broken'
          ? t('image.aiReasonRembgBroken', { msg: status.hint || '' })
          : t('image.aiReasonUnknown'))
      setError(hint)
      return
    }
    setInitPhase('python_ok')
    await delay(400)

    // Phase 2: Check model
    setInitPhase('model')
    let modelExists = false
    try {
      modelExists = await invoke<boolean>('check_model_status', { model: aiModel })
    } catch {
      setInitPhase('model_error')
      return
    }

    if (!modelExists) {
      // Phase 3: Download via async command with progress modal
      const { invoke: inv } = await import('@tauri-apps/api/core')
      setDownloadModelId(aiModel)
      setShowDownloadModal(true)
      inv('start_model_download', { model: aiModel }).catch(() => {})
      return // Modal will handle the rest via events
    } else {
      modelStatusCache[aiModel] = true
      setModelStatus((prev) => ({ ...prev, [aiModel]: true }))
      setInitPhase('model_ok')
    }
    await delay(400)

    // Phase 4: Warmup (load model into rembg)
    setInitPhase('loading')
    try {
      await invoke<string>('warmup_ai_model', { model: aiModel })
    } catch {
      setInitPhase('load_error')
      return
    }
    setInitPhase('load_ok')
    await delay(600)

    // All done — AI is armed for the session
    aiArmed = true
    setInitPhase('ready')
    setMode('detection')
    setTimeout(() => setInitPhase('idle'), 1500)
  }, [aiModel])

  const handleDownloadModel = async () => {
    const { invoke } = await import('@tauri-apps/api/core')
    setDownloadModelId(aiModel)
    setShowDownloadModal(true)
    invoke('start_model_download', { model: aiModel }).catch(() => {})
  }

  const handleDownloadComplete = useCallback(() => {
    modelStatusCache[downloadModelId] = true
    setModelStatus((prev) => ({ ...prev, [downloadModelId]: true }))
    setShowDownloadModal(false)
    // Continue with warmup if we were in the init flow
    if (initPhase === 'download' || initPhase === 'idle') {
      setInitPhase('download_ok')
      setTimeout(async () => {
        setInitPhase('loading')
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke<string>('warmup_ai_model', { model: downloadModelId })
        } catch {
          setInitPhase('load_error')
          return
        }
        setInitPhase('load_ok')
        aiArmed = true
        aiProbed = true
        aiProbedResult = { available: true, reason: 'unknown', python: null, python_version: null, rembg_version: null }
        setAiStatus(aiProbedResult)
        setInitPhase('ready')
        setMode('detection')
        setTimeout(() => setInitPhase('idle'), 1500)
      }, 400)
    }
  }, [downloadModelId, initPhase])

  const handleDownloadError = useCallback((msg: string) => {
    setShowDownloadModal(false)
    setError(t('image.modelErrorMsg', { msg }))
  }, [])

  const handleUpload = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const file = await open({
        filters: [{ name: t('image.filterImages'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg'] }],
        multiple: false,
      })
      if (!file) return
      const path = file as string
      const name = path.split('\\').pop()?.split('/').pop() || t('image.defaultName')

      const { readFile } = await import('@tauri-apps/plugin-fs')
      const data = await readFile(path)

      // Copy to permanent storage
      const { copyImageToStorage } = await import('@/store')
      const storagePath = await copyImageToStorage(path, data)

      const blob = new Blob([data])
      const url = URL.createObjectURL(blob)

      const img = new Image()
      const dimensions = await new Promise<{ w: number; h: number }>((resolve) => {
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => resolve({ w: 0, h: 0 })
        img.src = url
      })

      const tpl = useStore.getState().template
      const cw = tpl?.width ?? 1280
      const ch = tpl?.height ?? 720
      const maxW = cw * 0.8
      const maxH = ch * 0.8
      let iw: number, ih: number
      if (dimensions.w > 0 && dimensions.h > 0) {
        const scale = Math.min(maxW / dimensions.w, maxH / dimensions.h, 1)
        iw = (dimensions.w * scale) / cw
        ih = (dimensions.h * scale) / ch
      } else {
        iw = 0.8
        ih = 0.8
      }
      addImageLayer(storagePath, url, name, iw, ih)
    } catch (e: any) {
      setError(t('image.loadError', { msg: e?.message || t('error.unknown') }))
    }
  }

  // Points to a folder of images; re-links any image layer whose source file is
  // missing by matching its filename inside the chosen folder (recursively).
  const handleFindSources = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const fs = await import('@tauri-apps/plugin-fs')
      const { getImagesStorageDir, copyImageToStorage } = await import('@/store')

      const buildIndex = async (dir: string, map: Map<string, string>) => {
        const entries = await fs.readDir(dir)
        for (const e of entries) {
          const full = `${dir}/${e.name}`.replace(/\\/g, '/').replace(/\//g, '/')
          if (e.isDirectory) {
            await buildIndex(full, map)
          } else {
            map.set(e.name.toLowerCase(), full)
          }
        }
      }
      const index = new Map<string, string>()

      // Always search the app's own storage directory first
      try {
        const imagesDir = await getImagesStorageDir()
        await buildIndex(imagesDir, index)
      } catch {}

      // Ask user for additional folder
      const folder = await open({ directory: true, multiple: false, title: t('image.findSourcesTitle') })
      if (folder) {
        const root = typeof folder === 'string' ? folder : folder[0]
        if (root) await buildIndex(root as string, index)
      }

      const st = useStore.getState()
      const { readFile } = fs
      let relinked = 0
      for (const l of st.layers) {
        if (l.type !== 'image') continue
        if (l.preview && l.source) continue
        const base = (l.source?.split('\\').pop()?.split('/').pop() || l.name || '').toLowerCase()
        if (!base || !index.has(base)) continue
        const found = index.get(base)!
        try {
          const data = await readFile(found)
          // Copy to storage for future persistence
          const storagePath = await copyImageToStorage(found, data)
          const url = URL.createObjectURL(new Blob([data]))
          st.updateLayer(l.id, { source: storagePath, preview: url }, false)
          relinked++
        } catch {}
      }
      // Also relink the background image if it's missing
      const bg = st.background
      if (bg.type === 'image' && bg.imagePath && (!bg.imagePreview || !st.layers.find(l => l.isBackground && l.preview))) {
        const bgBase = bg.imagePath.split('\\').pop()?.split('/').pop()?.toLowerCase()
        if (bgBase && index.has(bgBase)) {
          const found = index.get(bgBase)!
          try {
            const data = await readFile(found)
            const storagePath = await copyImageToStorage(found, data)
            const url = URL.createObjectURL(new Blob([data]))
            st.setBackgroundImage(storagePath, url)
            const bgLayer = st.layers.find(l => l.isBackground)
            if (bgLayer) {
              st.updateLayer(bgLayer.id, { source: storagePath, preview: url }, false)
            }
            relinked++
          } catch {}
        }
      }
      if (relinked > 0) {
        setError(t('image.findSourcesDone', { n: relinked }))
      } else {
        setError(t('image.findSourcesNone'))
      }
    } catch (e: any) {
      setError(t('image.loadError', { msg: e?.message || t('error.unknown') }))
    }
  }

  const handleReplace = async () => {
    if (!selectedLayer) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const file = await open({
        filters: [{ name: t('image.filterImages'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg'] }],
        multiple: false,
      })
      if (!file) return
      const path = file as string
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const data = await readFile(path)

      const { copyImageToStorage } = await import('@/store')
      const storagePath = await copyImageToStorage(path, data)

      const blob = new Blob([data])
      const url = URL.createObjectURL(blob)
      const name = path.split('\\').pop()?.split('/').pop() || t('image.defaultName')
      // Compute correct bounding box for the new image (respecting its aspect and template limits)
      const img = new Image()
      const dims = await new Promise<{ w: number; h: number }>((resolve) => {
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => resolve({ w: 0, h: 0 })
        img.src = url
      })
      const tpl = useStore.getState().template
      const cw = tpl?.width ?? 1280
      const ch = tpl?.height ?? 720
      const maxW = cw * 0.8, maxH = ch * 0.8
      let iw: number, ih: number
      if (dims.w > 0 && dims.h > 0) {
        const s = Math.min(maxW / dims.w, maxH / dims.h, 1)
        iw = (dims.w * s) / cw
        ih = (dims.h * s) / ch
      } else {
        iw = selectedLayer.width
        ih = selectedLayer.height
      }
      const cx = selectedLayer.x + selectedLayer.width / 2
      const cy = selectedLayer.y + selectedLayer.height / 2
      const nx = Math.max(0, Math.min(1 - iw, cx - iw / 2))
      const ny = Math.max(0, Math.min(1 - ih, cy - ih / 2))
      updateLayer(selectedLayer.id, {
        source: storagePath,
        preview: url,
        name,
        x: nx,
        y: ny,
        width: Math.max(0.02, Math.min(2, iw)),
        height: Math.max(0.02, Math.min(2, ih)),
        crop: null,
        originalPreview: undefined,
        originalWidth: undefined,
        originalHeight: undefined,
      }, true)
    } catch (e: any) {
      setError(t('image.loadError', { msg: e?.message || t('error.unknown') }))
    }
  }

  const doRemoveBg = async () => {
    if (!selectedLayer) return
    const id = selectedLayer.id
    const { tempDir } = await import('@tauri-apps/api/path')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    setProcessing(id, true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      // If AI (python+rembg) is not available, use the built-in chromakey path.
      const effectiveMode = mode === 'detection' && !aiAvailable ? 'chromakey' : mode
      // When the layer has a non-destructive crop, run the removal on the
      // CROPPED window only (baked to a temp PNG) so the result matches what
      // the canvas shows — not the full original image.
      let inputPath = selectedLayer.source
      const crop = selectedLayer.crop
      const full = selectedLayer.originalPreview ?? selectedLayer.preview
      if (crop && crop.w > 0 && crop.h > 0 && full) {
        const { cropToDataUrl, dataUrlToBytes } = await import('@/image')
        const baked = await cropToDataUrl(full, crop)
        let dir = await tempDir()
        if (!dir.endsWith('/') && !dir.endsWith('\\')) dir += '/'
        const cropPath = `${dir}lovert_crop_${Date.now()}.png`
        await writeFile(cropPath, dataUrlToBytes(baked))
        inputPath = cropPath
      }
      const result = await invoke<{ success: boolean; preview?: string; error?: string }>('remove_bg', {
        inputPath,
        mode: effectiveMode,
        threshold: effectiveMode === 'chromakey' ? threshold : null,
        model: effectiveMode === 'detection' ? aiModel : null,
        erodeSize: erodeSize !== 0 ? erodeSize : null,
        color: effectiveMode === 'chromakey' ? chromaColor : null,
      })
      if (result.success && result.preview) {
        const { tempDir } = await import('@tauri-apps/api/path')
        const { writeFile } = await import('@tauri-apps/plugin-fs')
        let dir = await tempDir()
        if (!dir.endsWith('/') && !dir.endsWith('\\')) dir += '/'
        const name = `lovert_${Date.now()}.png`
        const outPath = `${dir}${name}`
        const bin = atob(result.preview)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        await writeFile(outPath, bytes)
        const blob = new Blob([bytes], { type: 'image/png' })
        const previewUrl = URL.createObjectURL(blob)
        const { trimTransparent } = await import('@/image')
        const trimmed = await trimTransparent(previewUrl)
        const l = layers.find(x => x.id === id)
        if (trimmed.w > 0 && trimmed.h > 0 && l) {
          const area = l.width * l.height
          // Same template-aspect correction as the crop tool: layer width/height
          // are template fractions, so divide by the template aspect to keep the
          // pixel aspect of the trimmed image.
          const tpl = useStore.getState().template
          const ta = (tpl?.width ?? 1280) / (tpl?.height ?? 720)
          const aspect = (trimmed.w / trimmed.h) / ta
          const newW = Math.sqrt(area * aspect)
          const newH = newW / aspect
          // The background-removed image is a brand new asset: clear any previous
          // crop so the stale region/original preview can't render over it.
          updateLayer(id, { source: outPath, preview: trimmed.dataUrl, width: newW, height: newH, crop: null, originalPreview: undefined, originalWidth: undefined, originalHeight: undefined }, true)
        } else {
          updateLayer(id, { source: outPath, preview: previewUrl, crop: null, originalPreview: undefined, originalWidth: undefined, originalHeight: undefined }, true)
        }
      } else {
        setError(result.error || t('image.removeBgError'))
      }
    } catch (e: any) {
      setError(t('image.error', { msg: e?.message || t('error.unknown') }))
    } finally {
      setProcessing(id, false)
    }
  }

  const imageLayers = layers.filter((l) => l.type === 'image' && !l.isBackground)

  return (
    <div className="space-y-3">
      <PanelCard title={t('panel.addImage')} icon="📷" defaultOpen>
        <button onClick={handleUpload} className="w-full py-2.5 rounded-xl bg-white text-zinc-900 text-[11px] font-semibold hover:bg-zinc-100 transition-colors">{t('image.add')}</button>
        <button onClick={handleFindSources} className="w-full py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] hover:bg-zinc-700 transition-colors" title={t('image.findSourcesTitle')}>{t('image.findSources')}</button>
      </PanelCard>

      {imageLayers.length > 0 && (
        <PanelCard title={t('panel.library')} icon="🗂️" defaultOpen={false}>
          <div className="grid grid-cols-3 gap-1.5 max-h-[160px] overflow-y-auto">
            {imageLayers.map((l) => {
              const hasCrop = !!l.crop && (l.originalPreview || l.preview)
              const thumbBg = hasCrop ? (l.originalPreview || l.preview) : ''
              const cropCss = hasCrop && l.crop ? cropBackgroundCss(l.crop) : null
              return (
                <button key={l.id} onClick={() => useStore.getState().selectLayer(l.id)} className={`relative rounded-xl overflow-hidden border-2 aspect-square ${selectedLayer?.id===l.id?'border-white':'border-zinc-700/40 hover:border-zinc-600'}`}>
                  {hasCrop ? <div className="w-full h-full bg-zinc-800 bg-no-repeat" style={{ backgroundImage: `url("${thumbBg}")`, backgroundSize: cropCss?.backgroundSize, backgroundPosition: cropCss?.backgroundPosition }} /> : <img src={l.preview} alt="" className="w-full h-full object-cover"/>}
                  <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-white truncate px-1 py-0.5">{l.name}</span>
                </button>
              )
            })}
          </div>
        </PanelCard>
      )}

      {selectedLayer && (
        <PanelCard title={t('panel.selectedImage')} icon="🖼️">
          <div className="grid grid-cols-2 gap-1.5">
            <button onClick={handleReplace} className="py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] hover:bg-zinc-700">{t('image.replace')}</button>
            <button onClick={async () => { const isCropping=croppingLayerId===selectedLayer.id; if(isCropping){setCroppingLayerId(null);return} if(!selectedLayer.crop){ const src=selectedLayer.originalPreview??selectedLayer.preview; if(src){ const img=new Image(); const dims=await new Promise<{w:number;h:number}>(res=>{ img.onload=()=>res({w:img.naturalWidth,h:img.naturalHeight}); img.onerror=()=>res({w:0,h:0}); img.src=src}); if(dims.w>0&&dims.h>0){ updateLayer(selectedLayer.id,{crop:{x:0,y:0,w:dims.w,h:dims.h,imgW:dims.w,imgH:dims.h},originalPreview:selectedLayer.originalPreview??src,originalWidth:dims.w,originalHeight:dims.h},true)}}} setCroppingLayerId(selectedLayer.id)}} className={`py-2 rounded-xl border text-[11px] ${croppingLayerId===selectedLayer.id?'bg-white text-zinc-900 border-white':'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'}`}>
              {croppingLayerId===selectedLayer.id ? t('app.close') : t('image.cropBtn')}
            </button>
          </div>
          {croppingLayerId===selectedLayer.id && (
            <div className="rounded-xl bg-zinc-900 border border-zinc-700 p-2.5 space-y-2">
              <p className="text-[11px] font-medium text-white">{t('image.cropTitle')} <span className="text-[10px] text-zinc-500 font-normal">— ao vivo no canvas</span></p>
              <div className="grid grid-cols-3 gap-1">
                {[{label:'Livre',w:0,h:0},{label:'1:1',w:1,h:1},{label:'16:9',w:16,h:9},{label:'4:3',w:4,h:3},{label:'3:2',w:3,h:2},{label:'9:16',w:9,h:16}].map(r=> (
                  <button key={r.label} onClick={async ()=>{ const l=selectedLayer; if(!l) return; const src=l.originalPreview??l.preview; if(!src) return; const img=new Image(); const dims=await new Promise<{w:number;h:number}>(res=>{img.onload=()=>res({w:img.naturalWidth,h:img.naturalHeight});img.onerror=()=>res({w:l.originalWidth??0,h:l.originalHeight??0});img.src=src}); const iw=dims.w||l.crop?.imgW||1000; const ih=dims.h||l.crop?.imgH||1000; const centered=(()=>{ if(r.w===0) return {x:0,y:0,w:iw,h:ih}; const a=r.w/r.h; let cw,ch; if(iw/ih>a){ch=ih;cw=Math.round(ch*a)} else{cw=iw;ch=Math.round(cw/a)} return {x:Math.round((iw-cw)/2),y:Math.round((ih-ch)/2),w:cw,h:ch}})(); const tpl=useStore.getState().template; const ta2=(tpl?.width??1280)/(tpl?.height??720); const boxAspect2=(centered.w/centered.h)/ta2; const area2=l.width*l.height; const newW2=Math.sqrt(area2*boxAspect2); const newH2=newW2/boxAspect2; const cx2=l.x+l.width/2, cy2=l.y+l.height/2; updateLayer(l.id,{crop:{x:centered.x,y:centered.y,w:centered.w,h:centered.h,imgW:iw,imgH:ih},originalPreview:l.originalPreview??src,originalWidth:iw,originalHeight:ih,x:cx2-newW2/2,y:cy2-newH2/2,width:newW2,height:newH2},true)}} className="py-1 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-[11px]">{r.label}</button>
                ))}
              </div>
              <div className="flex gap-1.5"><button onClick={()=>setCroppingLayerId(null)} className="flex-1 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px]">{t('text.cancel')}</button><button onClick={()=>setCroppingLayerId(null)} className="flex-1 py-1.5 rounded-xl bg-white text-zinc-900 text-[11px] font-semibold">{t('image.cropApply')}</button></div>
            </div>
          )}
        </PanelCard>
      )}

      {selectedLayer && (
        <PanelCard title={t('panel.removeBg')} icon="✨">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl border" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-light)' }}>
            <button onClick={()=>{ if(initPhase==='idle'||initPhase==='ready') setMode('chromakey')}} disabled={initPhase!=='idle'&&initPhase!=='ready'} className={`py-1.5 rounded-lg text-[11px] font-medium ${mode==='chromakey'&& (initPhase==='idle'||initPhase==='ready') ? 'bg-white text-zinc-900' : ''}`} style={mode==='chromakey'&& (initPhase==='idle'||initPhase==='ready') ? {} : { color: 'var(--text-secondary)' }}>{t('image.chromakey')}</button>
            <button onClick={handleAIToggle} disabled={initPhase!=='idle'&&initPhase!=='ready'} className={`py-1.5 rounded-lg text-[11px] font-medium ${mode==='detection'||(initPhase!=='idle'&&initPhase!=='ready') ? 'bg-white text-zinc-900' : ''}`} style={mode==='detection'||(initPhase!=='idle'&&initPhase!=='ready') ? {} : { color: 'var(--text-secondary)' }}>{initPhase!=='idle'&&initPhase!=='ready' ? '⏳' : t('image.ai')}</button>
          </div>

          {/* ── Relatórios de carregamento / modelo / rembg ── */}
          {initPhase !== 'idle' && initPhase !== 'ready' && (
            <div className="rounded-xl border px-3 py-2.5 space-y-1.5" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-light)' }}>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin shrink-0" />
                <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  {initPhase==='python' ? t('image.initCheckingPython')
                    : initPhase==='python_ok' ? t('image.initPythonFound')
                    : initPhase==='python_error' ? t('image.initPythonNotFound')
                    : initPhase==='model' ? t('image.initCheckingModel', { model: aiModel } as any)
                    : initPhase==='model_ok' ? t('image.initModelFound', { model: aiModel } as any)
                    : initPhase==='model_error' ? t('image.initDownloadError')
                    : initPhase==='loading' ? t('image.initLoadingModel')
                    : initPhase==='load_ok' ? t('image.initModelLoaded')
                    : initPhase==='load_error' ? t('image.initModelError')
                    : '⏳ A inicializar IA...'}
                </span>
              </div>
              {initPhase==='python_error' && aiStatus && (
                <p className="text-[10px] leading-tight" style={{ color: 'var(--text-secondary)' }}>{aiStatus.hint || t('image.aiReasonUnknown')}</p>
              )}
              {initPhase==='load_error' && (
                <button onClick={()=>{ setInitPhase('idle'); handleAIToggle() }} className="text-[10px] px-2 py-1 rounded-full bg-[var(--accent)] text-white">{t('image.initRetry')}</button>
              )}
            </div>
          )}

          {initPhase==='ready' && (
            <div className="rounded-xl border px-3 py-2 flex items-center gap-2" style={{ background: 'rgba(16,185,129,0.12)', borderColor: 'rgba(16,185,129,0.25)' }}>
              <span className="text-emerald-400 text-[11px]">✅</span>
              <span className="text-[11px] font-medium text-emerald-400">{t('image.initReady')}</span>
            </div>
          )}

          {/* Sempre mostra estado do rembg/modelo quando idle */}
          {initPhase==='idle' && (
            <div className="rounded-xl border px-3 py-2 space-y-1.5" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
              {aiStatus ? (
                aiAvailable ? (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-400 text-[11px]">✓</span>
                      <span className="text-[11px] font-medium text-emerald-400">rembg instalado</span>
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{aiStatus.python_version ? `Python ${aiStatus.python_version}` : ''} {aiStatus.rembg_version ? `· rembg ${aiStatus.rembg_version}` : ''}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${modelStatus[aiModel] ? 'bg-emerald-400' : modelStatus[aiModel]===false ? 'bg-amber-400' : 'bg-zinc-500'}`} />
                      <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{modelStatus[aiModel] ? t('image.modelReady', { model: aiModel } as any) : modelStatus[aiModel]===false ? t('image.downloadModel', { model: aiModel } as any) + ' · ' + t('image.downloadInfo') : t('image.checkingModel')}</span>
                    </div>
                    {mode==='detection' && <p className="text-[10px] leading-tight" style={{ color: 'var(--text-muted)' }}>{t('image.aiFoundAt', { python: aiStatus.python || 'python', version: aiStatus.python_version || '?', rembg: aiStatus.rembg_version || '?' } as any)}</p>}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <span className="text-red-400 text-[11px]">✕</span>
                      <span className="text-[11px] font-medium text-red-400">{aiStatus.reason==='no_python' ? t('image.aiReasonNoPython') : aiStatus.reason==='python_too_old' ? t('image.aiReasonPythonTooOld', { version: aiStatus.python_version||'?' } as any) : aiStatus.reason==='rembg_missing' ? t('image.aiReasonRembgMissing') : aiStatus.reason==='rembg_broken' ? t('image.aiReasonRembgBroken', { msg: aiStatus.hint||'' } as any) : t('image.aiReasonUnknown')}</span>
                    </div>
                    {aiStatus.hint && <p className="text-[10px] leading-tight whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{aiStatus.hint}</p>}
                    {!aiAvailable && <p className="text-[10px] leading-tight" style={{ color: 'var(--text-muted)' }}>{t('image.aiUnavailable')}</p>}
                  </>
                )
              ) : null}
            </div>
          )}

          {(initPhase==='idle'||initPhase==='ready') && (
            mode==='chromakey' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <label className="w-9 h-9 rounded-xl border bg-transparent p-0.5 flex items-center justify-center cursor-pointer overflow-hidden" style={{ borderColor: 'var(--border-light)', background: chromaColor }}>
                    <input type="color" value={chromaColor} onChange={e=>setChromaColor(e.target.value)} onInput={e=>setChromaColor((e.target as HTMLInputElement).value)} className="w-full h-full opacity-0 cursor-pointer" style={{ cursor: 'pointer' }} title={t('image.chromaColorDesc')}/>
                  </label>
                  <span className="text-[11px] font-mono" style={{ color: 'var(--text-primary)' }}>{chromaColor.toUpperCase()}</span>
                </div>
                <PanelSlider label={t('image.chromaSensitivity')} value={threshold} min={1} max={255} step={1} onChange={setThreshold} />
                <p className="text-[10px] leading-tight" style={{ color: 'var(--text-muted)' }}>{t('image.chromaDesc')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-1">
                  {MODELS.map(m=> {
                    const st = modelStatus[m.id]
                    return (
                      <button key={m.id} onClick={()=>{setAiModel(m.id); probeModel(m.id)}} className={`px-2 py-2 rounded-xl text-left border relative ${aiModel===m.id?'bg-white text-zinc-900 border-white':'border hover:text-white'}`} style={aiModel!==m.id ? { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderColor: 'var(--border-light)'} : {}}>
                        <div className="text-[11px] font-semibold leading-none flex items-center gap-1">{m.label} {st===true ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/> : st===false ? <span className="w-1.5 h-1.5 rounded-full bg-amber-500"/> : null}</div><div className="text-[8px] opacity-70 leading-none mt-0.5">{m.desc}</div>
                      </button>
                    )
                  })}
                </div>
                <PanelSlider label={t('image.aiRefine')} value={erodeSize} min={-10} max={10} step={1} onChange={setErodeSize} />
              </div>
            )
          )}
          {(initPhase==='idle'||initPhase==='ready') && (
            <button onClick={doRemoveBg} disabled={!!processingLayers[selectedLayer.id]} className="w-full py-2.5 rounded-xl bg-white text-zinc-900 text-[11px] font-semibold hover:bg-zinc-100 disabled:opacity-50">
              {processingLayers[selectedLayer.id] ? t('image.processing') : mode==='chromakey' ? t('image.removeBg') : t('image.removeBgAI')}
            </button>
          )}
        </PanelCard>
      )}

      {showDownloadModal && <ModelDownloadModal model={downloadModelId} onComplete={handleDownloadComplete} onError={handleDownloadError} />}
    </div>
  )
}