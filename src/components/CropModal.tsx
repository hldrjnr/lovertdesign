import { useRef, useState, useEffect } from 'react'
import { t } from '@/i18n'
import { useStore } from '@/store'

interface CropModalProps {
  layerId?: string
  imageUrl: string
  onClose: () => void
  /** When set, the modal emits a non-destructive crop + trimmed image data URL
   *  via this callback (used for the background layer, which still wants a
   *  baked image because the editor never re-reads its source). */
  onApply?: (dataUrl: string, cropW: number, cropH: number) => void
  ratioLock?: { w: number; h: number }
  initialCrop?: { x: number; y: number; w: number; h: number; imgW: number; imgH: number } | null
}

interface Ratio {
  label: string
  w: number
  h: number
}

const RATIOS: Ratio[] = [
  { label: 'Livre', w: 0, h: 0 },
  { label: '1:1', w: 1, h: 1 },
  { label: '16:9', w: 16, h: 9 },
  { label: '4:3', w: 4, h: 3 },
  { label: '3:2', w: 3, h: 2 },
  { label: '9:16', w: 9, h: 16 },
  { label: '2:3', w: 2, h: 3 },
]

type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move'

function centeredCrop(iw: number, ih: number, r: Ratio): { x: number; y: number; w: number; h: number } {
  if (r.w === 0) return { x: 0, y: 0, w: iw, h: ih }
  const aspect = r.w / r.h
  let cw: number, ch: number
  if (iw / ih > aspect) {
    ch = ih
    cw = Math.round(ch * aspect)
  } else {
    cw = iw
    ch = Math.round(cw / aspect)
  }
  return { x: Math.round((iw - cw) / 2), y: Math.round((ih - ch) / 2), w: cw, h: ch }
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

export function CropModal({ layerId, imageUrl, onClose, onApply, ratioLock, initialCrop }: CropModalProps) {
  const updateLayer = useStore((s) => s.updateLayer)
  const language = useStore((s) => s.language)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const [dispSize, setDispSize] = useState({ w: 0, h: 0 })
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  // Com ratioLock (ex.: background), a bounding box inicia no aspecto do projeto,
  // mas o usuário pode mover e redimensionar livremente.
  const lockedRatio: Ratio | null = ratioLock ? { label: `${ratioLock.w}:${ratioLock.h}`, w: ratioLock.w, h: ratioLock.h } : null
  const [ratio, setRatio] = useState<Ratio>(lockedRatio || RATIOS[1])
  const [customW, setCustomW] = useState(0)
  const [customH, setCustomH] = useState(0)

  const dragRef = useRef<{
    active: 'move' | HandleId | null
    startMouseX: number
    startMouseY: number
    startCrop: { x: number; y: number; w: number; h: number }
  }>({ active: null, startMouseX: 0, startMouseY: 0, startCrop: { x: 0, y: 0, w: 0, h: 0 } })

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const nw = img.naturalWidth
      const nh = img.naturalHeight
      const maxW = 700
      const maxH = 500
      const scale = Math.min(maxW / nw, maxH / nh, 1)
      setDispSize({ w: Math.round(nw * scale), h: Math.round(nh * scale) })
      setImgNatural({ w: nw, h: nh })
      setCustomW(nw)
      setCustomH(nh)
      // If the layer already has a crop and we are loading the original image,
      // resume the previous crop region so the user can keep tweaking it.
      if (initialCrop && initialCrop.imgW === nw && initialCrop.imgH === nh) {
        setCrop({ x: initialCrop.x, y: initialCrop.y, w: initialCrop.w, h: initialCrop.h })
        // Free ratio so re-opening doesn't snap an existing crop to 1:1.
        setRatio(lockedRatio || RATIOS[0])
      } else {
        const initial = lockedRatio || RATIOS[1]
        setCrop(centeredCrop(nw, nh, initial))
      }
    }
    img.src = imageUrl
  }, [imageUrl])

  // Apenas recalcula quando o usuário troca a proporção manualmente (sem ratioLock).
  useEffect(() => {
    if (imgNatural.w === 0 || lockedRatio) return
    if (ratio.w === 0) return
    setCrop(centeredCrop(imgNatural.w, imgNatural.h, ratio))
  }, [ratio, imgNatural.w, imgNatural.h, lockedRatio])

  function displayToImage(displayX: number, displayY: number) {
    if (dispSize.w === 0) return { x: 0, y: 0 }
    const sx = imgNatural.w / dispSize.w
    const sy = imgNatural.h / dispSize.h
    return { x: displayX * sx, y: displayY * sy }
  }

  function imageToDisplay(ix: number, iy: number) {
    if (dispSize.w === 0) return { x: 0, y: 0 }
    const sx = dispSize.w / imgNatural.w
    const sy = dispSize.h / imgNatural.h
    return { x: ix * sx, y: iy * sy }
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!crop || !containerRef.current || !imgRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dx = e.clientX - rect.left
    const dy = e.clientY - rect.top
    const imgP = displayToImage(dx, dy)
    const hw = dispSize.w > 0 ? 8 / (dispSize.w / imgNatural.w) : 8

    const left = crop.x
    const right = crop.x + crop.w
    const top = crop.y
    const bottom = crop.y + crop.h

    const onLeft = Math.abs(imgP.x - left) < hw
    const onRight = Math.abs(imgP.x - right) < hw
    const onTop = Math.abs(imgP.y - top) < hw
    const onBottom = Math.abs(imgP.y - bottom) < hw
    const inside = imgP.x >= left && imgP.x <= right && imgP.y >= top && imgP.y <= bottom

    let handle: HandleId | null = null
    if (onTop && onLeft) handle = 'nw'
    else if (onTop && onRight) handle = 'ne'
    else if (onBottom && onLeft) handle = 'sw'
    else if (onBottom && onRight) handle = 'se'
    else if (onTop) handle = 'n'
    else if (onBottom) handle = 's'
    else if (onLeft) handle = 'w'
    else if (onRight) handle = 'e'
    else if (inside) handle = 'move'

    if (handle) {
      dragRef.current = { active: handle, startMouseX: imgP.x, startMouseY: imgP.y, startCrop: { ...crop } }
      try { (e.target as HTMLElement).setPointerCapture(e.pointerId) } catch {}
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d.active || !crop || !containerRef.current || !imgRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dx = e.clientX - rect.left
    const dy = e.clientY - rect.top
    const imgP = displayToImage(dx, dy)
    const mx = imgP.x - d.startMouseX
    const my = imgP.y - d.startMouseY
    const sc = d.startCrop

    if (d.active === 'move') {
      let nx = clamp(sc.x + mx, 0, imgNatural.w - sc.w)
      let ny = clamp(sc.y + my, 0, imgNatural.h - sc.h)
      setCrop({ x: nx, y: ny, w: sc.w, h: sc.h })
    } else {
      const minSize = 10
      const aspectRatio = lockedRatio || ratio
      const lockAspect = aspectRatio.w !== 0 && aspectRatio.h !== 0
      const ar = aspectRatio.w / aspectRatio.h

      const east = d.active.includes('e')
      const west = d.active.includes('w')
      const south = d.active.includes('s')
      const north = d.active.includes('n')
      const corner = (east || west) && (south || north)

      // 1) Candidate w/h from the mouse delta.
      let w = sc.w
      let h = sc.h
      if (east && !west) w = sc.w + mx
      if (west && !east) w = sc.w - mx
      if (south && !north) h = sc.h + my
      if (north && !south) h = sc.h - my

      // 2) Keep the aspect ratio: corners follow the dominant axis.
      if (lockAspect) {
        if (corner) {
          if (Math.abs(mx) >= Math.abs(my)) h = w / ar
          else w = h * ar
        } else if (east || west) {
          h = w / ar
        } else {
          w = h * ar
        }
      }

      // 3) Bounds of the moving edge (the opposite edge is anchored).
      const maxW = east ? (imgNatural.w - sc.x) : (sc.x + sc.w)
      const maxH = south ? (imgNatural.h - sc.y) : (sc.y + sc.h)

      // 4) Clamp so the rect stays inside the image AND the aspect survives.
      if (lockAspect) {
        let fw = Math.min(w, maxW, maxH * ar)
        const fwMin = Math.max(minSize, minSize * ar)
        if (fw < fwMin) fw = Math.min(fwMin, maxW)
        let fh = fw / ar
        if (fh < minSize) {
          fh = Math.min(minSize, maxH)
          fw = fh * ar
        }
        w = fw
        h = fw / ar
      } else {
        w = clamp(w, minSize, maxW)
        h = clamp(h, minSize, maxH)
      }

      // 5) Re-derive x/y from the anchored edge.
      let x = sc.x
      let y = sc.y
      if (west) x = sc.x + sc.w - w
      if (north) y = sc.y + sc.h - h

      setCrop({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) })
    }
  }

  function handlePointerUp() {
    dragRef.current.active = null
  }

  async function handleApply() {
    const img = imgRef.current
    if (!img || !crop || crop.w < 2 || crop.h < 2) return

    if (onApply) {
      // Background (or other callback consumers): render a baked cropped image.
      // The background layer is special — it is drawn via CSS object-fit/object-
      // position from a single image, so we still emit a flattened data URL.
      const canvas = document.createElement('canvas')
      canvas.width = crop.w
      canvas.height = crop.h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h)
      const dataUrl = canvas.toDataURL('image/png')
      onApply(dataUrl, crop.w, crop.h)
      onClose()
      return
    }

    if (layerId) {
      const allLayers = useStore.getState().layers
      const l = allLayers.find((x) => x.id === layerId)
      if (l) {
        // Non-destructive crop: keep the ORIGINAL image untouched and just
        // remember the region of interest. The Canvas/mask pipeline reads
        // `originalPreview` + `crop` and clips at render time, so the object
        // remains fully recognisable for masks, AI backgrounds, etc.
        const centerX = l.x + l.width / 2
        const centerY = l.y + l.height / 2
        const cropAspect = crop.w / crop.h
        // Layer width/height are fractions of the template, so a box with
        // width/height = A renders with PIXEL aspect A × templateAspect.
        // To get a box whose pixels match the crop aspect we divide by it.
        const template = useStore.getState().template
        const ta = (template?.width ?? 1280) / (template?.height ?? 720)
        const boxAspect = cropAspect / ta
        const area = l.width * l.height
        const newW = Math.sqrt(area * boxAspect)
        const newH = newW / boxAspect
        updateLayer(layerId, {
          // The original image (or what was the original up to this point) is
          // promoted to `originalPreview` once. Subsequent crops keep using
          // the same original — the crop is purely a viewing window.
          originalPreview: l.originalPreview ?? imageUrl,
          originalWidth: l.originalWidth ?? imgNatural.w,
          originalHeight: l.originalHeight ?? imgNatural.h,
          // preview is kept as a fallback (when no originalPreview is loaded
          // yet) but the canvas prefers originalPreview when a crop is set.
          preview: l.originalPreview ?? imageUrl,
          crop: { x: crop.x, y: crop.y, w: crop.w, h: crop.h, imgW: imgNatural.w, imgH: imgNatural.h },
          x: centerX - newW / 2,
          y: centerY - newH / 2,
          width: newW,
          height: newH,
        }, true)
      }
    }
    onClose()
  }

  const HANDLE_SIZE = 8

  function renderHandle(dx: number, dy: number) {
    return (
      <div
        className="absolute w-2 h-2 bg-white border border-blue-500 rounded-sm"
        style={{ left: dx - HANDLE_SIZE / 2, top: dy - HANDLE_SIZE / 2, pointerEvents: 'none' }}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onPointerDown={(e) => { if (e.target === e.currentTarget && !dragRef.current.active) onClose() }}>
      <div
        className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden max-w-[90vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-white">{t('image.cropTitle')}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-sm">✕</button>
        </div>

        <div className="flex gap-4 p-4">
          <div
            ref={containerRef}
            className="relative overflow-hidden rounded-lg bg-black/40 select-none touch-none"
            style={{ width: dispSize.w || 700, height: dispSize.h || 500 }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt={t('image.cropAlt')}
              className="block select-none w-full h-full"
              draggable={false}
            />
            {crop && (
              <>
                <div
                  className="absolute inset-0"
                  style={{
                    background: `rgba(0,0,0,0.55)`,
                    clipPath: `polygon(
                      0% 0%, 100% 0%, 100% 100%, 0% 100%,
                      0% ${(crop.y / imgNatural.h) * 100}%,
                      ${(crop.x / imgNatural.w) * 100}% ${(crop.y / imgNatural.h) * 100}%,
                      ${(crop.x / imgNatural.w) * 100}% ${((crop.y + crop.h) / imgNatural.h) * 100}%,
                      ${((crop.x + crop.w) / imgNatural.w) * 100}% ${((crop.y + crop.h) / imgNatural.h) * 100}%,
                      ${((crop.x + crop.w) / imgNatural.w) * 100}% ${(crop.y / imgNatural.h) * 100}%,
                      0% ${(crop.y / imgNatural.h) * 100}%
                    )`,
                  }}
                />
                <div
                  className="absolute border-2 border-blue-400 cursor-move"
                  style={{
                    left: `${(crop.x / imgNatural.w) * 100}%`,
                    top: `${(crop.y / imgNatural.h) * 100}%`,
                    width: `${(crop.w / imgNatural.w) * 100}%`,
                    height: `${(crop.h / imgNatural.h) * 100}%`,
                  }}
                >
                  {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => {
                    const pct = (h.includes('e') ? 100 : h.includes('w') ? 0 : 50)
                    const pct2 = (h.includes('s') ? 100 : h.includes('n') ? 0 : 50)
                    return (
                      <div
                        key={h}
                        className="absolute w-2.5 h-2.5 bg-white border-2 border-blue-500 rounded-sm -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: `${pct}%`,
                          top: `${pct2}%`,
                          cursor: h === 'n' || h === 's' ? 'ns-resize' : h === 'e' || h === 'w' ? 'ew-resize' : ['nw', 'se'].includes(h) ? 'nwse-resize' : 'nesw-resize',
                        }}
                      />
                    )
                  })}
                </div>
                <div className="absolute bottom-2 right-2 bg-blue-600/80 text-white text-[10px] px-1.5 py-0.5 rounded pointer-events-none">
                  {crop.w}×{crop.h}
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-3 w-48 shrink-0">
            {ratioLock ? (
              <div>
                <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider mb-1">{t('image.cropRatio')}</p>
                <p className="text-xs text-zinc-300">{ratioLock.w}:{ratioLock.h}</p>
              </div>
            ) : (
              <>
              <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">{t('image.cropRatio')}</p>
              <div className="flex flex-col gap-1">
                {RATIOS.slice(1).map((r) => (
                  <label
                    key={r.label}
                    className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded hover:bg-zinc-800 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={ratio.label === r.label}
                      onChange={() => setRatio(r)}
                      className="rounded"
                    />
                    <span className="text-xs text-zinc-300">{r.label === 'Livre' ? t('image.cropFree') : r.label}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2 cursor-pointer px-2 py-1.5 rounded hover:bg-zinc-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={ratio.w === 0}
                    onChange={() => setRatio(RATIOS[0])}
                    className="rounded"
                  />
                  <span className="text-xs text-zinc-300">{t('image.cropFree')}</span>
                </label>
              </div>

              {ratio.w === 0 && (
                <div className="space-y-2 pt-1 border-t border-zinc-800">
                  <p className="text-[10px] text-zinc-500">{t('image.cropDimensions')}</p>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <p className="text-[9px] text-zinc-500 mb-0.5">{t('image.cropWidth')}</p>
                      <input
                        type="number"
                        min={1}
                        max={imgNatural.w}
                        value={crop?.w ?? customW}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 1
                          setCustomW(v)
                          if (crop) setCrop({ ...crop, w: Math.min(v, imgNatural.w - crop.x) })
                        }}
                        className="w-full bg-zinc-800 rounded px-2 py-1 text-xs text-white border border-zinc-700"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-[9px] text-zinc-500 mb-0.5">{t('image.cropHeight')}</p>
                      <input
                        type="number"
                        min={1}
                        max={imgNatural.h}
                        value={crop?.h ?? customH}
                        onChange={(e) => {
                          const v = parseInt(e.target.value) || 1
                          setCustomH(v)
                          if (crop) setCrop({ ...crop, h: Math.min(v, imgNatural.h - crop.y) })
                        }}
                        className="w-full bg-zinc-800 rounded px-2 py-1 text-xs text-white border border-zinc-700"
                      />
                    </div>
                  </div>
                </div>
              )}
              </>
            )}

            <div className="mt-auto pt-3 border-t border-zinc-800">
              <div className="text-[10px] text-zinc-500 mb-2">
                {t('image.cropOriginal', { w: imgNatural.w, h: imgNatural.h })}
                {crop && <span className="block">{t('image.cropResult', { w: crop.w, h: crop.h })}</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="flex-1 btn btn-ghost text-xs text-zinc-400 hover:text-white">
                  {t('save.cancel')}
                </button>
                <button
                  onClick={handleApply}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs px-4 py-1.5 rounded-lg"
                >
                  {t('image.cropApply')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
