import { create } from 'zustand'
import { TEMPLATE_PRESETS, TEMPLATES } from '@/types'
import type { Template, Layer, BackgroundState, VectorShape, ShadowEffect, OutlineEffect, VectorData, VectorPathData, MaskConfig, BevelEffect } from '@/types'
import { t, type Language } from '@/i18n'
import { sanitizeTextSpans } from '@/richText'

const dateStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').trim() || 'Design'

const DEFAULT_BG: BackgroundState = {
  type: 'color',
  color: '#000000',
  gradient: 'linear-gradient(135deg, #00d2ff, #3a7bd5)',
  imagePath: '',
  imagePreview: '',
  brightness: 1,
  blur: 0,
  contrast: 1,
  saturation: 1,
  hueRotate: 0,
  sepia: 0,
  bgPosition: 'center',
  bgSize: 'cover',
}

import { APP_VERSION } from './version'
export { APP_VERSION }

const MAX_HISTORY = 50
const CUSTOM_PRESETS_KEY = 'thumbnail-app.custom-presets.v1'

// ── Permanent storage directory (Documents/ThumbnailApp/) ─────────
let _storageDir: string | null = null

export async function getStorageDir(): Promise<string> {
  if (_storageDir) return _storageDir
  const { documentDir } = await import('@tauri-apps/api/path')
  const { mkdir } = await import('@tauri-apps/plugin-fs')
  const docs = (await documentDir()).replace(/\\/g, '/').replace(/\/$/, '')
  const dir = docs + '/LovertDesign'
  _storageDir = dir
  await mkdir(dir, { recursive: true }).catch(() => {})
  await mkdir(dir + '/images', { recursive: true }).catch(() => {})
  return dir
}

export async function getImagesStorageDir(): Promise<string> {
  return (await getStorageDir()) + '/images'
}

/** Copy an image file into the permanent storage and return the new path. */
export async function copyImageToStorage(sourcePath: string, fileData?: Uint8Array): Promise<string> {
  const { readFile, writeFile } = await import('@tauri-apps/plugin-fs')
  const ext = sourcePath.split('.').pop()?.toLowerCase() || 'png'
  const known = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'svg']
  const safeExt = known.includes(ext) ? ext : 'png'
  const name = 'img_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9) + '.' + safeExt
  const destPath = (await getImagesStorageDir()) + '/' + name
  const data = fileData ?? await readFile(sourcePath)
  await writeFile(destPath, data)
  return destPath
}

/** Read a file from disk and return a blob URL. */
export async function readFileAsBlobUrl(filePath: string): Promise<string> {
  try {
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const data = await readFile(filePath)
    return URL.createObjectURL(new Blob([data]))
  } catch { return '' }
}

let _previewsDir: string | null = null
async function getPreviewsDir(): Promise<string> {
  if (_previewsDir) return _previewsDir
  const { appDataDir } = await import('@tauri-apps/api/path')
  const { mkdir } = await import('@tauri-apps/plugin-fs')
  const dir = await appDataDir()
  _previewsDir = dir
  await mkdir(dir, { recursive: true }).catch(() => {})
  return dir
}

/** Read a JPG preview from disk as a blob URL (or '' if missing). */
export async function readPreviewFile(presetId: string): Promise<string> {
  try {
    const dir = await getPreviewsDir()
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const { join } = await import('@tauri-apps/api/path')
    const filePath = await join(dir, `${presetId}.jpg`)
    const data = await readFile(filePath)
    const blob = new Blob([data], { type: 'image/jpeg' })
    return URL.createObjectURL(blob)
  } catch {
    return ''
  }
}

/** Write a JPG preview to disk from a PNG data URL (returns the blob URL). */
export async function writePreviewFile(presetId: string, pngDataUrl: string): Promise<string> {
  try {
    const dir = await getPreviewsDir()
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const { join } = await import('@tauri-apps/api/path')
    const filePath = await join(dir, `${presetId}.jpg`)
    // Convert PNG data URL → JPEG bytes via an offscreen canvas
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Failed to load preview image'))
      el.src = pngDataUrl
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const jpegBlob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85))
    const buf = new Uint8Array(await jpegBlob.arrayBuffer())
    await writeFile(filePath, buf)
    // Return a data URL so the preview survives page reloads
    return await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => resolve('')
      reader.readAsDataURL(new Blob([buf], { type: 'image/jpeg' }))
    })
  } catch {
    return ''
  }
}

/** Delete a JPG preview from disk. */
export async function deletePreviewFile(presetId: string): Promise<void> {
  try {
    const dir = await getPreviewsDir()
    const { remove } = await import('@tauri-apps/plugin-fs')
    const { join } = await import('@tauri-apps/api/path')
    const filePath = await join(dir, `${presetId}.jpg`)
    await remove(filePath).catch(() => {})
  } catch {}
}

/**
 * Read a JPG preview file and return it as a data: URL (for embedding in
 * exported template JSON files where a file path would be useless).
 */
export async function readPreviewFileAsDataUrl(presetId: string): Promise<string> {
  try {
    const dir = await getPreviewsDir()
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const { join } = await import('@tauri-apps/api/path')
    const filePath = await join(dir, `${presetId}.jpg`)
    const data = await readFile(filePath)
    const base64 = btoa(String.fromCharCode(...data))
    return `data:image/jpeg;base64,${base64}`
  } catch {
    return ''
  }
}

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
}

interface Snapshot {
  layers: Layer[]
  background: BackgroundState
  selectedLayerId: string | null
  selectedLayerIds: string[]
}

function snap(layers: Layer[], background: BackgroundState, selectedLayerId: string | null, selectedLayerIds: string[]): Snapshot {
  return { layers: JSON.parse(JSON.stringify(layers)), background: { ...background }, selectedLayerId, selectedLayerIds: [...selectedLayerIds] }
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return JSON.stringify(a.layers) === JSON.stringify(b.layers) && JSON.stringify(a.background) === JSON.stringify(b.background)
}

const VALID_BG_TYPES = new Set(['color', 'gradient', 'image'])
const VALID_BG_SIZE = new Set(['cover', 'contain', 'fill', 'auto'])

function sanitizeBackground(v: unknown): BackgroundState {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...DEFAULT_BG }
  const o = v as Record<string, unknown>
  return {
    type: VALID_BG_TYPES.has(o.type as string) ? o.type as BackgroundState['type'] : 'color',
    color: str(o.color, '#000000'),
    gradient: str(o.gradient, ''),
    imagePath: str(o.imagePath, ''),
    imagePreview: str(o.imagePreview, ''),
    brightness: num(o.brightness, 1, 0, 2),
    blur: num(o.blur, 0, 0, 20),
    contrast: num(o.contrast, 1, 0, 2),
    saturation: num(o.saturation, 1, 0, 2),
    hueRotate: num(o.hueRotate, 0, 0, 360),
    sepia: num(o.sepia, 0, 0, 1),
    bgPosition: str(o.bgPosition, 'center'),
    bgSize: VALID_BG_SIZE.has(o.bgSize as string) ? o.bgSize as BackgroundState['bgSize'] : 'cover',
  }
}

const VALID_LAYER_TYPES = new Set(['image', 'text', 'element', 'vector', 'group', 'mask'])
const VALID_TEXT_ALIGN = new Set(['left', 'center', 'right'])
const VALID_TEXT_TRANSFORM = new Set(['none', 'uppercase', 'lowercase'])
const VALID_FONT_STYLE = new Set(['normal', 'italic', 'oblique'])
const VALID_STROKE_DASH = new Set(['solid', 'dashed', 'dotted', 'dash-dot'])
const VALID_VECTOR_SHAPES = new Set<VectorShape>(['line', 'rounded-rect', 'circle', 'triangle', 'hexagon', 'star', 'plus', 'arrow-right', 'arrow', 'curved-arrow', 'diamond', 'pentagon', 'cross', 'lightning', 'heart', 'bloom', 'speech-bubble-left', 'speech-bubble-right', 'thought-bubble', 'speech-bubble-wide', 'speech-bubble-tall', 'speech-bubble-wide-left', 'speech-bubble-wide-right'])

function num(v: unknown, fallback: number, min?: number, max?: number): number {
  const n = Number(v)
  let result = Number.isFinite(n) ? n : fallback
  if (min !== undefined) result = Math.max(min, result)
  if (max !== undefined) result = Math.min(max, result)
  return result
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v
  if (v === 'true') return true
  if (v === 'false') return false
  return fallback
}

function optStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function sanitizeShadow(v: unknown): ShadowEffect | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  return {
    color: str(o.color, '#000000'),
    blur: num(o.blur, 0, 0, 100),
    offsetX: num(o.offsetX, 0, -200, 200),
    offsetY: num(o.offsetY, 0, -200, 200),
    intensity: num(o.intensity, 0.6, 0, 1),
    inset: bool(o.inset, false),
    spread: o.spread !== undefined ? num(o.spread, 0, -50, 50) : undefined,
  }
}
function sanitizeInnerShadow(v: unknown): ShadowEffect | null {
  if (v === null || v === undefined) return null
  return sanitizeShadow(v)
}

function sanitizeOutline(v: unknown): OutlineEffect | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  return {
    color: str(o.color, '#000000'),
    width: num(o.width, 0, 0, 200),
  }
}

function sanitizeBevel(v: unknown): BevelEffect | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (o.enabled === false) return null
  return {
    enabled: bool(o.enabled, true),
    size: num(o.size, 6, 0, 20),
    smoothing: num(o.smoothing, 2, 0, 10),
    strength: num(o.strength, 0.6, 0, 1),
    lightAngle: num(o.lightAngle, 120, 0, 360),
    highlightColor: str(o.highlightColor, 'rgba(255,255,255,0.85)'),
    shadowColor: str(o.shadowColor, 'rgba(0,0,0,0.55)'),
  }
}

function sanitizeVector(v: unknown): VectorData | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const shape = VALID_VECTOR_SHAPES.has(o.shape as VectorShape) ? (o.shape as VectorShape) : 'rounded-rect'
  const isOpenStroke = shape === 'line' || shape === 'arrow' || shape === 'cross'
  const isBloom = shape === 'bloom'
  const rawFilled = bool(o.filled, true)
  const filled = isBloom ? rawFilled : isOpenStroke ? false : rawFilled
  return {
    shape,
    color: str(o.color, '#ffffff'),
    fillGradient: optStr(o.fillGradient),
    strokeColor: str(o.strokeColor, '#000000'),
    strokeWidth: num(o.strokeWidth, 0, 0, 100),
    filled,
    cornerRadius: num(o.cornerRadius, 0, 0, 1000),
    strokeDash: VALID_STROKE_DASH.has(o.strokeDash as string) ? (o.strokeDash as VectorData['strokeDash']) : 'solid',
    skewX: num(o.skewX, 0, -180, 180),
    imagePreview: str(o.imagePreview, ''),
  }
}

function sanitizeVectorPath(v: unknown): VectorPathData | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const VALID_DASH = new Set(['solid','dashed','dotted','dash-dot'])
  const VALID_CAP = new Set(['none','arrow','round'])
  return {
    points: Array.isArray(o.points) ? o.points.map((p: any) => ({
      id: str(p?.id, makeId()),
      x: num(p?.x, 0, -10000, 10000),
      y: num(p?.y, 0, -10000, 10000),
      type: (p?.type === 'corner' || p?.type === 'bezier') ? p.type : 'corner',
      handleIn: p?.handleIn ? { x: num(p.handleIn.x, 0, -10000, 10000), y: num(p.handleIn.y, 0, -10000, 10000) } : undefined,
      handleOut: p?.handleOut ? { x: num(p.handleOut.x, 0, -10000, 10000), y: num(p.handleOut.y, 0, -10000, 10000) } : undefined,
    })) : [],
    closed: bool(o.closed, false),
    fillColor: str(o.fillColor, '#ffffff'),
    strokeColor: str(o.strokeColor, '#000000'),
    strokeWidth: num(o.strokeWidth, 20, 0, 100),
    strokeDash: VALID_DASH.has(o.strokeDash as string) ? o.strokeDash as VectorPathData['strokeDash'] : 'solid',
    startCap: VALID_CAP.has(o.startCap as string) ? o.startCap as VectorPathData['startCap'] : 'none',
    endCap: VALID_CAP.has(o.endCap as string) ? o.endCap as VectorPathData['endCap'] : 'none',
    startCapSize: num(o.startCapSize, 10, 0, 100),
    endCapSize: num(o.endCapSize, 10, 0, 100),
  }
}

function sanitizeMask(v: unknown): MaskConfig | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  if (o.mode !== 'intersection' && o.mode !== 'difference') return null
  if (typeof o.sourceId !== 'string') return null
  return { id: str(o.id, makeId()), mode: o.mode, sourceId: o.sourceId }
}

function sanitizeMasks(v: unknown): MaskConfig[] {
  if (Array.isArray(v)) {
    return v.map(m => sanitizeMask(m)).filter((m): m is MaskConfig => m !== null)
  }
  // Backward compat: single mask object → array
  const single = sanitizeMask(v)
  return single ? [single] : []
}

function makeBackgroundLayer(bg: BackgroundState, source?: string, preview?: string): Layer {
  return {
    id: makeId(), type: 'image', name: 'Fundo', visible: true, locked: true, isBackground: true,
    zIndex: -1, x: 0, y: 0, width: 1, height: 1,
    rotation: 0, opacity: 1,
    shadow: null, innerShadow: null, outline: null, borderRadius: 0, borderRadiusPx: 0, outlineWidthPx: 0,
    brightness: bg.brightness, blur: bg.blur, contrast: bg.contrast,
    saturation: bg.saturation ?? 1, hueRotate: bg.hueRotate ?? 0, sepia: bg.sepia ?? 0,
    negative: false, autoFit: true,
    source: source ?? bg.imagePath, preview: preview ?? '',
    text: '', font: 'Arial', fontSize: 48, color: '#FFFFFF', textAlign: 'center',
    lineHeight: 1.2, letterSpacing: 0, textTransform: 'none', textGradient: null,
    fontStyle: 'normal', fontWeight: 700,
    elementContent: '', elementName: '', vector: null, vectorPath: null, mirrorX: false, mirrorY: false,     perspectiveX: 0, perspectiveY: 0, bevel: null,
  }
}

// ── Auto-fit bounding box ───────────────────────────────────────────────
export function computeTextBounds(text: string, font: string, fontSize: number, cw: number, ch: number, fontStyle='normal', fontWeight=700, lineHeight=1.2, letterSpacing=0, textTransform='none'): {width:number;height:number} {
  let tw=0.08,th=0.05
  try{
    const mc=document.createElement('canvas')
    const ctx=mc.getContext('2d')
    if(ctx){
      ctx.font=`${fontStyle} ${fontWeight} ${fontSize}px "${font}"`
      const lines=text.split('\n')
      let maxW=0
      for(let line of lines){
        let l=line
        if(textTransform==='uppercase') l=l.toUpperCase()
        else if(textTransform==='lowercase') l=l.toLowerCase()
        const m=ctx.measureText(l)
        let w=m.width
        if(letterSpacing>0) w+=(l.length-1)*letterSpacing
        maxW=Math.max(maxW,w)
      }
      // Usa métricas reais do font para bbox justa verticalmente
      let totalH = 0
      for (const line of lines) {
        let l = line || ' '
        if(textTransform==='uppercase') l=l.toUpperCase()
        else if(textTransform==='lowercase') l=l.toLowerCase()
        const m:any = ctx.measureText(l)
        const ascent = m.actualBoundingBoxAscent ?? fontSize * 0.82
        const descent = m.actualBoundingBoxDescent ?? fontSize * 0.18
        const lineH = Math.max(ascent + descent, fontSize * 0.9)
        totalH += lineH
      }
      if (lines.length > 1) totalH += (lines.length - 1) * fontSize * (lineHeight - 1)
      tw=Math.max(0.08,Math.min(maxW+fontSize*0.12,cw*0.98)/cw)
      th=Math.max(0.03,Math.min(totalH + fontSize*0.06,ch*0.98)/ch)
    }
  }catch{}
  return {width:tw,height:th}
}

export function computeWrappedTextHeight(text: string, font: string, fontSize: number, maxWidthPx: number, fontStyle='normal', fontWeight=700, lineHeight=1.2, letterSpacing=0, textTransform='none'): number {
  try{
    const mc=document.createElement('canvas')
    const ctx=mc.getContext('2d')
    if(!ctx) return fontSize*lineHeight
    ctx.font=`${fontStyle} ${fontWeight} ${fontSize}px "${font}"`
    const measure = (s:string)=>{
      if(!s) return 0
      let l=s
      if(textTransform==='uppercase') l=l.toUpperCase()
      else if(textTransform==='lowercase') l=l.toLowerCase()
      const m=ctx.measureText(l)
      let w=m.width
      if(letterSpacing) w+=(l.length-1)*letterSpacing
      return w
    }
    const paragraphs=text.split('\n')
    let totalLines=0
    for(const para of paragraphs){
      if(para===''){ totalLines+=1; continue }
      const words=para.split(' ')
      let cur=''
      let linesForPara=0
      for(const w of words){
        const test = cur ? cur + ' ' + w : w
        if(measure(test) <= maxWidthPx){
          cur=test
        } else {
          if(cur){ linesForPara+=1 }
          if(measure(w) > maxWidthPx){
            // quebra palavra caractere a caractere
            let acc=''
            for(const ch of w){
              const t2 = acc + ch
              if(measure(t2) > maxWidthPx){
                if(acc){ linesForPara+=1 }
                acc=ch
              } else acc=t2
            }
            cur=acc
          } else {
            cur=w
          }
        }
      }
      if(cur) linesForPara+=1
      if(linesForPara===0) linesForPara=1
      totalLines+=linesForPara
    }
    if(totalLines===0) totalLines=1
    return totalLines*fontSize*lineHeight
  }catch{ return fontSize*lineHeight }
}

export function computeWrappedBounds(text: string, font: string, fontSize: number, maxWidthPx: number, cw: number, ch: number, fontStyle='normal', fontWeight=700, lineHeight=1.2, letterSpacing=0, textTransform='none'): {width:number;height:number} {
  const hPx = computeWrappedTextHeight(text, font, fontSize, maxWidthPx, fontStyle, fontWeight, lineHeight, letterSpacing, textTransform)
  const wNorm = Math.max(0.05, Math.min(maxWidthPx, cw*0.98)/cw)
  const hNorm = Math.max(0.05, Math.min(hPx + fontSize*0.2, ch*0.98)/ch)
  return {width:wNorm, height:hNorm}
}

/** Collapse `type:'mask'` sub-layers back into the parent's legacy `masks[]`
 *  array (the pre-v4 model). Sub-layers attached directly to a layer become
 *  masks on that layer; sub-layers attached to a group become masks on every
 *  group member, preserving the "clip all members" behaviour. Idempotent:
 *  layers without sub-layer masks pass through untouched. */
function demigrateMasks(layers: Layer[]): Layer[] {
  const subMasks = layers.filter((l) => l.type === 'mask' && l.sourceId)
  if (subMasks.length === 0) return layers
  const byParent = new Map<string, MaskConfig[]>()
  for (const m of subMasks) {
    const key = m.parentId ?? ''
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key)!.push({ id: makeId(), mode: m.maskMode ?? 'intersection', sourceId: m.sourceId! })
  }
  const out: Layer[] = []
  for (const l of layers) {
    if (l.type === 'mask') continue
    const base = l.masks ?? (l.mask ? [l.mask] : [])
    out.push({ ...l, masks: [...base, ...(byParent.get(l.id) ?? [])], mask: null })
  }
  // Group masks carry to every member (visual parity with the sub-layer model).
  for (const l of out) {
    if (l.type !== 'group') continue
    const groupMasks = l.masks ?? []
    if (groupMasks.length === 0) continue
    for (const member of out) {
      if (member.groupId === l.id) member.masks = [...(member.masks ?? []), ...groupMasks]
    }
  }
  return out
}

/**
 * Sanitize a layer from external JSON. Fills ALL missing fields with defaults,
 * validates types, and strips invalid values. Safe for untrusted input.
 */
function sanitizeLayer(raw: Record<string, unknown>, fallbackIndex: number = 0): Layer {
  const layerType = str(raw.type, 'text')
  const _vec = sanitizeVector(raw.vector)
  const isBloomRaw = _vec?.shape === 'bloom'
  return {
    id: str(raw.id, makeId()),
    type: VALID_LAYER_TYPES.has(layerType) ? layerType as Layer['type'] : 'text',
    name: str(raw.name, 'Layer'),
    visible: bool(raw.visible, true),
    locked: bool(raw.locked, false),
    groupId: optStr(raw.groupId) ?? undefined,
    zIndex: num(raw.zIndex, fallbackIndex, -9999, 9999),
    x: num(raw.x, 0.5, -10, 10),
    y: num(raw.y, 0.5, -10, 10),
    width: num(raw.width, 0.5, 0.01, 10),
    height: num(raw.height, 0.5, 0.01, 10),
    rotation: num(raw.rotation, 0, -180, 180),
    opacity: num(raw.opacity, 1, 0, 1),
    shadow: isBloomRaw ? null : sanitizeShadow(raw.shadow),
    innerShadow: isBloomRaw ? null : sanitizeInnerShadow((raw as any).innerShadow),
    outline: isBloomRaw ? null : sanitizeOutline(raw.outline),
    outlineWidthPx: isBloomRaw ? 0 : num(raw.outlineWidthPx, 0, 0, 200),
    borderRadius: num(raw.borderRadius, 0, 0, 999),
    borderRadiusPx: num(raw.borderRadiusPx, 0, 0, 1000),
    brightness: num(raw.brightness, 1, 0, 2),
    blur: num(raw.blur, 0, 0, 20),
    contrast: num(raw.contrast, 1, 0, 2),
    saturation: num(raw.saturation, 1, 0, 2),
    hueRotate: num(raw.hueRotate, 0, 0, 360),
    sepia: num(raw.sepia, 0, 0, 1),
    negative: bool(raw.negative, false),
    source: str(raw.source, ''),
    preview: str(raw.preview, ''),
    text: str(raw.text, ''),
    font: str(raw.font, 'Arial'),
    fontSize: num(raw.fontSize, 48, 8, 500),
    color: str(raw.color, '#ffffff'),
    textAlign: VALID_TEXT_ALIGN.has(raw.textAlign as string) ? raw.textAlign as Layer['textAlign'] : 'center',
    lineHeight: num(raw.lineHeight, 1.2, 0.1, 5),
    letterSpacing: num(raw.letterSpacing, 0, -100, 200),
    textTransform: VALID_TEXT_TRANSFORM.has(raw.textTransform as string) ? raw.textTransform as Layer['textTransform'] : 'none',
    textGradient: optStr(raw.textGradient),
    fontStyle: VALID_FONT_STYLE.has(raw.fontStyle as string) ? raw.fontStyle as Layer['fontStyle'] : 'normal',
    fontWeight: num(raw.fontWeight, 700, 100, 900),
    elementContent: str(raw.elementContent, ''),
    elementName: str(raw.elementName, ''),
    vector: _vec,
    vectorPath: sanitizeVectorPath(raw.vectorPath),
    mirrorX: bool(raw.mirrorX, false),
    mirrorY: bool(raw.mirrorY, false),
    isBackground: raw.isBackground === true ? true : undefined,
    parentId: optStr(raw.parentId) ?? undefined,
    maskMode: (raw.maskMode === 'intersection' || raw.maskMode === 'difference') ? raw.maskMode : 'intersection',
    sourceId: optStr(raw.sourceId) ?? undefined,
    mask: sanitizeMask(raw.mask),
    masks: sanitizeMasks(raw.masks ?? raw.mask),
    perspectiveX: num(raw.perspectiveX, 0, -60, 60),
    perspectiveY: num(raw.perspectiveY, 0, -60, 60),
    bevel: sanitizeBevel(raw.bevel),
    autoFit: raw.autoFit === undefined ? true : bool(raw.autoFit, true),
    // Non-destructive crop fields (undefined when no crop is active) — validated numerically to stay aligned with abrir projeto
    crop: (() => {
      const c = raw.crop as any
      if (!c || typeof c !== 'object') return null
      const imgW = num(c.imgW, 0, 1, 20000), imgH = num(c.imgH, 0, 1, 20000)
      const w = num(c.w, 0, 1, 10000), h = num(c.h, 0, 1, 10000)
      if (w <= 0 || h <= 0 || imgW <= 0 || imgH <= 0) return null
      const x = Math.max(0, Math.min(num(c.x, 0, -5000, 5000), imgW - w))
      const y = Math.max(0, Math.min(num(c.y, 0, -5000, 5000), imgH - h))
      // clamp w/h if they exceed image bounds
      const cw = Math.min(w, imgW - x), ch = Math.min(h, imgH - y)
      if (cw <= 0 || ch <= 0) return null
      return { x, y, w: cw, h: ch, imgW, imgH }
    })(),
    originalPreview: (() => { const s = optStr(raw.originalPreview); if (!s) return undefined; return s.startsWith('blob:') ? undefined : s })(),
    originalWidth: typeof raw.originalWidth === 'number' && Number.isFinite(raw.originalWidth) ? Math.max(1, Math.min(20000, raw.originalWidth)) : undefined,
    originalHeight: typeof raw.originalHeight === 'number' && Number.isFinite(raw.originalHeight) ? Math.max(1, Math.min(20000, raw.originalHeight)) : undefined,
  }
}

/**
 * Normalize an existing valid Layer (numeric clamping only).
 * Use sanitizeLayer for external/untrusted input.
 */
function normalizeLayer(layer: Layer): Layer {
  const isBezier = !!(layer as any).vectorPath
  const maxSize = isBezier ? 10 : 2
  const minSize = isBezier ? 0.01 : 0.02
  const width = Math.max(minSize, Math.min(maxSize, Number.isFinite(layer.width) ? layer.width : 0.02))
  const height = Math.max(minSize, Math.min(maxSize, Number.isFinite(layer.height) ? layer.height : 0.02))
  const isBloom = layer.vector?.shape === 'bloom'
  let uniformVector = layer.vector
  return {
    ...layer,
    vector: uniformVector,
    x: Math.max(-10, Math.min(10, Number.isFinite(layer.x) ? layer.x : 0)),
    y: Math.max(-10, Math.min(10, Number.isFinite(layer.y) ? layer.y : 0)),
    width,
    height,
    zIndex: Math.round(Number.isFinite(layer.zIndex) ? layer.zIndex : 0),
    rotation: Math.max(-180, Math.min(180, Number.isFinite(layer.rotation) ? layer.rotation : 0)),
    opacity: Math.max(0, Math.min(1, Number.isFinite(layer.opacity) ? layer.opacity : 1)),
    borderRadiusPx: Math.max(0, Math.min(1000, Number.isFinite(layer.borderRadiusPx) ? layer.borderRadiusPx : 0)),
    outlineWidthPx: isBloom ? 0 : Math.max(0, Math.min(200, Number.isFinite(layer.outlineWidthPx) ? layer.outlineWidthPx : 0)),
    shadow: isBloom ? null : layer.shadow,
    innerShadow: isBloom ? null : layer.innerShadow ?? null,
    outline: isBloom ? null : layer.outline,
    autoFit: layer.autoFit ?? true,
    brightness: Math.max(0, Math.min(2, Number.isFinite(layer.brightness) ? layer.brightness : 1)),
    blur: Math.max(0, Math.min(20, Number.isFinite(layer.blur) ? layer.blur : 0)),
    contrast: Math.max(0, Math.min(2, Number.isFinite(layer.contrast) ? layer.contrast : 1)),
    fontSize: Math.max(8, Math.min(500, Number.isFinite(layer.fontSize) ? layer.fontSize : 48)),
    lineHeight: layer.lineHeight ?? 1.2,
    letterSpacing: layer.letterSpacing ?? 0,
    textTransform: layer.textTransform ?? 'none',
    textGradient: layer.textGradient ?? null,
    textSpans: sanitizeTextSpans(layer.textSpans, typeof layer.text === 'string' ? layer.text : ''),
    fontStyle: layer.fontStyle || 'normal',
    fontWeight: Math.max(100, Math.min(900, Math.round((layer.fontWeight || 700) / 100) * 100)),
    negative: layer.negative ?? false,
    mirrorX: layer.mirrorX ?? false,
    mirrorY: layer.mirrorY ?? false,
    parentId: layer.parentId,
    maskMode: layer.maskMode ?? 'intersection',
    sourceId: layer.sourceId,
    mask: layer.mask ?? null,
    masks: layer.masks ?? (layer.mask ? [layer.mask] : []),
    perspectiveX: Math.max(-60, Math.min(60, Number.isFinite(layer.perspectiveX) ? layer.perspectiveX : 0)),
    perspectiveY: Math.max(-60, Math.min(60, Number.isFinite(layer.perspectiveY) ? layer.perspectiveY : 0)),
    bevel: layer.bevel ?? null,
  }
}

function withHistory(s: EditorStore): Pick<EditorStore, 'undoStack' | 'redoStack'> {
  if (s.batchDepth > 0) return { undoStack: s.undoStack, redoStack: s.redoStack }
  const current = snap(s.layers, s.background, s.selectedLayerId, s.selectedLayerIds)
  const last = s.undoStack[s.undoStack.length - 1]
  if (last && sameSnapshot(last, current)) return { undoStack: s.undoStack, redoStack: [] }
  return {
    undoStack: [...s.undoStack.slice(-(MAX_HISTORY - 1)), current],
    redoStack: [],
  }
}

export interface CustomTemplatePreset {
  id: string
  name: string
  category: string
  icon: string
  template: Template
  theme: string
  background: BackgroundState
  layers: Layer[]
  createdAt: number
  preview?: string
  globalEffects?: { brightness: number; contrast: number; saturation: number; blur: number; sepia: number; hueRotate: number }
}

function readCustomPresets(): CustomTemplatePreset[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    const presets = data.filter((p) => p && p.id && p.name && p.template && Array.isArray(p.layers)).map((p) => ({ ...p, category: p.category || 'Geral' }))
    // Keep data URL previews (they survive page reloads). For presets with empty
    // preview, try to read the JPG from disk and convert to a data URL.
    let needsJpgLoad = false
    for (const p of presets) {
      if (!p.preview) { needsJpgLoad = true; break }
    }
    if (needsJpgLoad) {
      void (async () => {
        for (const p of presets) {
          if (p.preview) continue
          try {
            const dir = await getPreviewsDir()
            const { readFile } = await import('@tauri-apps/plugin-fs')
            const { join } = await import('@tauri-apps/api/path')
            const filePath = await join(dir, `${p.id}.jpg`)
            const data = await readFile(filePath)
            const blob = new Blob([data], { type: 'image/jpeg' })
            const reader = new FileReader()
            const dataUrl = await new Promise<string>((resolve) => {
              reader.onload = () => resolve(reader.result as string)
              reader.onerror = () => resolve('')
              reader.readAsDataURL(blob)
            })
            if (dataUrl) {
              const prev = useStore.getState().customPresets
              const updated = prev.map((cp: CustomTemplatePreset) => cp.id === p.id ? { ...cp, preview: dataUrl } : cp)
              useStore.setState({ customPresets: updated })
              writeCustomPresets(updated)
            }
          } catch {}
        }
      })()
    }
    return presets
  } catch {
    return []
  }
}

function writeCustomPresets(presets: CustomTemplatePreset[]) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(presets))
  } catch (e) {
    console.error('Failed to save custom presets:', e)
  }
}

// Waits until every <img> inside the export target has finished loading, so a
// preview snapshot is never taken with blank/missing images.
function waitForImagesLoaded(root: HTMLElement | null, timeoutMs = 8000): Promise<void> {
  if (!root) return Promise.resolve()
  const imgs = Array.from(root.querySelectorAll('img')) as HTMLImageElement[]
  // Also look for elements with CSS background-image (used by crop-mode layers)
  const bgEls = Array.from(root.querySelectorAll('[style*="background-image"]')) as HTMLElement[]
  const all = [...imgs, ...bgEls]
  const pending = all.filter((el) => {
    if (el instanceof HTMLImageElement) return !el.complete || el.naturalWidth === 0
    // For background-image elements, check if the image data is loaded
    const bg = getComputedStyle(el).backgroundImage
    return bg && bg !== 'none' && bg.includes('blob:') || bg.includes('data:')
  })
  if (pending.length === 0) return Promise.resolve()
  const start = Date.now()
  return new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearInterval(timer)
      resolve()
    }
    const check = () => {
      const remaining = imgs.filter((img) => !img.complete || img.naturalWidth === 0)
      if (remaining.length === 0 || Date.now() - start > timeoutMs) finish()
    }
    const timer = window.setInterval(check, 50)
    for (const img of pending) {
      if (img instanceof HTMLImageElement) {
        img.addEventListener('load', check, { once: true })
        img.addEventListener('error', check, { once: true })
      }
    }
    check()
  })
}
export const CUSTOM_GRADIENTS_KEY = 'thumbnail-app.custom-gradients.v1'

export interface CustomGradient {
  id: string
  name: string
  value: string
  angle: number
  stops: string[]
  type?: 'linear' | 'radial'
}

export function readCustomGradients(): CustomGradient[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_GRADIENTS_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter((g) => g && g.id && g.value && Array.isArray(g.stops)).slice(0, 40)
  } catch { return [] }
}

export function writeCustomGradients(gradients: CustomGradient[]) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CUSTOM_GRADIENTS_KEY, JSON.stringify(gradients.slice(0, 40)))
  } catch (e) { console.error('Failed to save custom gradients:', e) }
}

export function addCustomGradient(gradient: CustomGradient) {
  const all = readCustomGradients()
  writeCustomGradients([gradient, ...all])
}

export function removeCustomGradient(id: string) {
  writeCustomGradients(readCustomGradients().filter((g) => g.id !== id))
}

export const CUSTOM_VECTORS_KEY = 'thumbnail-app.custom-vectors.v1'

export interface CustomVector {
  id: string
  name: string
  icon: string
  vectorPath: VectorPathData
  createdAt: number
  isGroup?: boolean
  groupLayers?: Layer[]
  groupWidth?: number
  groupHeight?: number
}

export function readCustomVectors(): CustomVector[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_VECTORS_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return data.filter((v) => v && v.id && ((v.vectorPath && Array.isArray(v.vectorPath.points)) || (v.isGroup && Array.isArray(v.groupLayers)))).slice(0, 100)
  } catch { return [] }
}

export function writeCustomVectors(vectors: CustomVector[]) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CUSTOM_VECTORS_KEY, JSON.stringify(vectors.slice(0, 100)))
  } catch (e) { console.error('Failed to save custom vectors:', e) }
}

interface EditorStore {
  template: Template | null
  setTemplate: (t: Template) => void
  convertTemplate: (target: Template, copyNameSuffix?: string) => void

  selectedResolution: Template | null
  setSelectedResolution: (t: Template | null) => void

  canvasScale: number
  setCanvasScale: (s: number) => void
  panOffset: { x: number; y: number }
  setPanOffset: (p: { x: number; y: number }) => void
  resetView: () => void

  snapEnabled: boolean
  setSnapEnabled: (s: boolean) => void
  toggleSnap: () => void

  createGroup: (name: string) => void
  moveLayerToGroup: (layerId: string, groupId: string | null) => void
  ungroupGroup: (id: string) => void

  layers: Layer[]
  selectedLayerId: string | null
  selectedLayerIds: string[]
  addLayer: (l: Layer) => void
  updateLayer: (id: string, u: Partial<Layer>, saveHistory?: boolean) => void
  updateLayers: (ids: string[], u: Partial<Layer>, saveHistory?: boolean) => void
  updateLayersBatch: (patches: Record<string, Partial<Layer>>) => void
  removeLayer: (id: string) => void
  selectLayer: (id: string | null) => void
  toggleLayerSelection: (id: string) => void
  selectLayers: (ids: string[]) => void
  clearSelection: () => void
  duplicateLayer: (id: string) => void
  duplicateLayerExact: (ids: string[]) => void
  toggleVisibility: (id: string) => void
  toggleVisibilityMultiple: (ids: string[]) => void
  toggleLock: (id: string) => void
  toggleLockMultiple: (ids: string[]) => void
  moveLayerToIndex: (id: string, targetIdx: number) => void

  addTextLayer: (text?: string) => void
  addImageLayer: (source: string, preview: string, name: string, w?: number, h?: number) => void
  addElementLayer: (content: string, name: string) => void
  addVectorLayer: (shape: VectorShape, color: string, strokeColor: string, strokeWidth: number, filled: boolean) => void
  addVectorPathLayer: () => void
  updateVectorPath: (id: string, updater: (vp: VectorPathData) => VectorPathData, saveHistory?: boolean) => void
  mergeVectors: (ids: string[]) => void
  alignLayer: (id: string, align: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom', padding: number) => void
  alignLayers: (ids: string[], align: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom', padding: number) => void

  background: BackgroundState
  setBackgroundColor: (c: string) => void
  setBackgroundGradient: (g: string) => void
  setBackgroundImage: (path: string, preview: string) => void
  setBackgroundEffects: (effects: Partial<BackgroundState>) => void
  removeBackgroundImageLayer: () => void

  processingLayers: Record<string, boolean>
  setProcessing: (id: string, v: boolean) => void

  showSaveDialog: boolean
  setShowSaveDialog: (v: boolean) => void

  showCloseConfirm: boolean
  setShowCloseConfirm: (v: boolean) => void

  groupNameCallback: ((name: string) => void) | null
  setGroupNameCallback: (cb: ((name: string) => void) | null) => void

  inlinePrompt: { title: string; placeholder: string; defaultValue: string; onConfirm: (v: string) => void; onCancel: () => void } | null
  setInlinePrompt: (p: { title: string; placeholder: string; defaultValue: string; onConfirm: (v: string) => void; onCancel: () => void } | null) => void
  requestInlinePrompt: (title: string, defaultValue: string, onConfirm: (v: string) => void) => void

  errorMsg: string | null
  setError: (msg: string | null) => void

  systemFonts: string[]
  setSystemFonts: (fonts: string[]) => void

  undoStack: Snapshot[]
  redoStack: Snapshot[]
  pushHistory: () => void
  startBatch: () => void
  endBatch: () => void
  batchDepth: number
  undo: () => void
  redo: () => void

  projectFilePath: string | null
  setProjectFilePath: (p: string | null) => void
  loadingProject: boolean
  setLoadingProject: (v: boolean) => void
  customPresets: CustomTemplatePreset[]
  saveCurrentAsPreset: (name: string, category?: string) => void | Promise<void>
  removeCustomPreset: (id: string) => void
  renameCustomPreset: (id: string, newName: string) => void
  loadPresetPreviews: () => Promise<void>
  loadPreset: (presetId: string) => void | Promise<void>
  customVectors: CustomVector[]
  saveCustomVector: (vectorPath: VectorPathData, name?: string) => void
  saveCustomVectorGroup: (groupId: string, name?: string) => void
  removeCustomVector: (id: string) => void
  addCustomVectorLayer: (vectorId: string) => void
  newProject: () => void
  saveProject: () => Promise<void>
  savedHash: string
  markSaved: () => void
  isDirty: () => boolean
  loadProject: () => Promise<void>
  loadProjectFromFile: (filePath: string) => Promise<void>
  exportTemplateToFile: (name?: string | null, category?: string | null) => Promise<void>
  batchImportTemplates: () => Promise<void>
  batchImportFolder: () => Promise<void>
  language: Language
  setLanguage: (lang: Language) => void

  uiScale: number
  setUiScale: (s: number) => void
  uiTheme: string
  setUiTheme: (t: string) => void

  baseTheme: string
  setBaseTheme: (t: string) => void

  globalEffects: { brightness: number; contrast: number; saturation: number; blur: number; sepia: number; hueRotate: number }
  setGlobalEffects: (e: Partial<EditorStore['globalEffects']>) => void
  showGlobalEffects: boolean
  setShowGlobalEffects: (v: boolean) => void

  licenseKey: string
  licenseValid: boolean
  licenseEmail: string
  licenseUses: number
  licenseTier: string
  exportCount: number
  showLicenseDialog: boolean
  setShowLicenseDialog: (v: boolean) => void
  showReportModal: boolean
  setShowReportModal: (v: boolean) => void
  setLicenseValid: (valid: boolean, uses?: number, email?: string, tier?: string) => void
  setExportCount: (count: number) => void
  checkCachedLicense: () => Promise<void>
  validateLicenseOnline: (key: string) => Promise<boolean>
  canExport: () => boolean
  croppingLayerId: string | null
  setCroppingLayerId: (id: string | null) => void
  bezierEditMode: boolean
  setBezierEditMode: (v: boolean) => void
  selectedBezierPointId: string | null
  setSelectedBezierPointId: (id: string | null) => void
  isolatedGroupId: string | null
  setIsolatedGroupId: (id: string | null) => void
  enterGroupIsolate: (groupId: string) => void
  exitGroupIsolate: () => void

  handleSize: number
  setHandleSize: (s: number) => void

  isPanelResizing: boolean
  setIsPanelResizing: (v: boolean) => void
}

export const useStore = create<EditorStore>((set, get) => ({
  template: null,
  setTemplate: (t) => {
    set({ template: t, layers: [], selectedLayerId: null, selectedLayerIds: [], undoStack: [], redoStack: [], canvasScale: 1, panOffset: { x: 0, y: 0 }, globalEffects: { brightness: 1, contrast: 1, saturation: 1, blur: 0, sepia: 0, hueRotate: 0 } })
    get().markSaved()
  },

  convertTemplate: (target, copyNameSuffix) => {
    set((s) => {
      const current = s.template
      if (!current) return {}
      const W1 = current.width, H1 = current.height
      const W2 = target.width, H2 = target.height

      // Compute bounding box of CONTENT layers only (ignore the background, which
      // is meant to cover the whole canvas and must not affect element scaling).
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const l of s.layers) {
        if (l.isBackground) continue
        const lx = l.x * W1, ly = l.y * H1
        const lw = l.width * W1, lh = l.height * H1
        if (lx < minX) minX = lx
        if (ly < minY) minY = ly
        if (lx + lw > maxX) maxX = lx + lw
        if (ly + lh > maxY) maxY = ly + lh
      }
      // Fallback: if no layers or degenerate bounding box, use full canvas
      if (!Number.isFinite(minX) || maxX - minX < 1 || maxY - minY < 1) {
        minX = 0; minY = 0; maxX = W1; maxY = H1
      }

      const bbW = maxX - minX, bbH = maxY - minY
      const bbCx = (minX + maxX) / 2, bbCy = (minY + maxY) / 2
      const sScale = Math.max(0.05, Math.min(20, Math.min(W2 / bbW, H2 / bbH)))

      // Background layer is kept at (0,0,1,1) — it must always cover the full
      // canvas and must NOT be scaled/repositioned with content layers.
      const newLayers = s.layers
        .filter((l) => l.isBackground)
        .map((l) => ({ ...l, x: 0, y: 0, width: 1, height: 1 }))
        .concat(
          s.layers.filter((l) => !l.isBackground).map((l) => {
            const lPx = l.x * W1, lPy = l.y * H1
            const lPw = l.width * W1, lPh = l.height * H1

            const newPx = (lPx - bbCx) * sScale + W2 / 2
            const newPy = (lPy - bbCy) * sScale + H2 / 2
            const newPw = lPw * sScale
            const newPh = lPh * sScale

            const next: Layer = {
              ...l,
              x: newPx / W2,
              y: newPy / H2,
              width: Math.max(0.02, newPw / W2),
              height: Math.max(0.02, newPh / H2),
            }
            if (l.type === 'text' || l.type === 'element') {
              next.fontSize = Math.max(8, Math.round(l.fontSize * sScale))
            }
            return next
          })
        )

      const newTemplate: Template = {
        ...target,
        name: copyNameSuffix ? `${target.name} ${copyNameSuffix}` : target.name,
      }
      return {
        template: newTemplate,
        layers: newLayers,
        background: s.background.imagePath
          ? { ...s.background, imagePath: s.background.imagePath, imagePreview: s.background.imagePreview, bgSize: 'cover' }
          : s.background,
        selectedLayerId: null,
        selectedLayerIds: [],
        undoStack: [],
        redoStack: [],
        canvasScale: 1,
        panOffset: { x: 0, y: 0 },
        projectFilePath: null,
        globalEffects: s.globalEffects,
      }
    })

    // Reimport the background image so the new template displays it correctly
    // (the old blob URL may have been revoked, or the file may have moved
    // since the project was opened). This is async and runs after the
    // synchronous state change so the UI doesn't block.
    const state = get()
    if (state.background.type === 'image' && state.background.imagePath) {
      void (async () => {
        try {
          const { readFile } = await import('@tauri-apps/plugin-fs')
          const data = await readFile(state.background.imagePath)
          const blob = new Blob([data])
          const url = URL.createObjectURL(blob)
          // Revoke the previous preview URL to avoid memory leak
          if (state.background.imagePreview && state.background.imagePreview.startsWith('blob:')) {
            try { URL.revokeObjectURL(state.background.imagePreview) } catch {}
          }
          const nextBg = { ...state.background, imagePreview: url, bgSize: 'cover' as const }
          set((s) => {
            const existingBgLayer = s.layers.find((l) => l.isBackground)
            let nextLayers: Layer[]
            if (existingBgLayer) {
              nextLayers = s.layers.map((l) => l.id === existingBgLayer.id
                ? { ...l, x: 0, y: 0, width: 1, height: 1, source: state.background.imagePath, preview: url, brightness: nextBg.brightness, blur: nextBg.blur, contrast: nextBg.contrast, saturation: nextBg.saturation ?? 1, hueRotate: nextBg.hueRotate ?? 0, sepia: nextBg.sepia ?? 0 }
                : l)
            } else {
              nextLayers = [makeBackgroundLayer(nextBg, state.background.imagePath, url), ...s.layers]
            }
            return { background: nextBg, layers: nextLayers }
          })
        } catch {
          // File no longer exists on disk — leave the previous preview in place
          // so the user at least sees something instead of a black canvas.
        }
      })()
    }
  },

  selectedResolution: null,
  setSelectedResolution: (t) => set({ selectedResolution: t }),

  canvasScale: 1,
  setCanvasScale: (s) => set({ canvasScale: Math.max(0.05, Math.min(10, s)) }),
  panOffset: { x: 0, y: 0 },
  setPanOffset: (p) => set({ panOffset: p }),
  resetView: () => set({ canvasScale: 1, panOffset: { x: 0, y: 0 } }),

  snapEnabled: true,
  setSnapEnabled: (s) => set({ snapEnabled: s }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),

  language: (localStorage.getItem('clippy-lang') as Language) || 'pt',
  setLanguage: (lang) => { localStorage.setItem('clippy-lang', lang); set({ language: lang }) },

  uiScale: parseFloat(localStorage.getItem('thumbnail-app.ui-scale') || '1'),
  setUiScale: (s) => { localStorage.setItem('thumbnail-app.ui-scale', String(s)); set({ uiScale: Math.max(0.6, Math.min(1.5, s)) }) },

  uiTheme: localStorage.getItem('thumbnail-app.ui-theme') || 'default',
  setUiTheme: (t) => { localStorage.setItem('thumbnail-app.ui-theme', t); set({ uiTheme: t }) },

  baseTheme: localStorage.getItem('thumbnail-app.base-theme') || 'padrao',
  setBaseTheme: (t) => { localStorage.setItem('thumbnail-app.base-theme', t); set({ baseTheme: t }) },

  globalEffects: { brightness: 1, contrast: 1, saturation: 1, blur: 0, sepia: 0, hueRotate: 0 },
  setGlobalEffects: (e) => set((s) => ({ globalEffects: { ...s.globalEffects, ...e } })),
  showGlobalEffects: false,
  setShowGlobalEffects: (v) => set({ showGlobalEffects: v }),

  licenseKey: '',
  licenseValid: false,
  licenseEmail: '',
  licenseUses: 0,
  licenseTier: '',
  exportCount: 0,
  showLicenseDialog: false,
  setShowLicenseDialog: (v) => set({ showLicenseDialog: v }),
  showReportModal: false,
  setShowReportModal: (v) => set({ showReportModal: v }),
  croppingLayerId: null,
  setCroppingLayerId: (id) => set({ croppingLayerId: id }),
  bezierEditMode: false,
  setBezierEditMode: (v) => set({ bezierEditMode: v }),
  selectedBezierPointId: null,
  setSelectedBezierPointId: (id) => set({ selectedBezierPointId: id }),
  isolatedGroupId: null,
  setIsolatedGroupId: (id) => set({ isolatedGroupId: id }),
  enterGroupIsolate: (groupId) => set({ isolatedGroupId: groupId, selectedLayerId: null, selectedLayerIds: [] }),
  exitGroupIsolate: () => set({ isolatedGroupId: null, selectedLayerId: null, selectedLayerIds: [] }),

  handleSize: parseFloat(localStorage.getItem('thumbnail-app.handle-size') || '1'),
  setHandleSize: (s) => { const v=Math.max(0.6, Math.min(1.8, s)); localStorage.setItem('thumbnail-app.handle-size', String(v)); set({ handleSize: v }) },
  isPanelResizing: false,
  setIsPanelResizing: (v: boolean) => set({ isPanelResizing: v }),
  setLicenseValid: (valid, uses, email, tier) => set({
    licenseValid: valid,
    licenseEmail: email ?? '',
    licenseUses: uses ?? 0,
    licenseTier: tier ?? '',
  }),
  setExportCount: (count) => set({ exportCount: count }),
  checkCachedLicense: async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const [licenseResult, exportCount] = await Promise.all([
        invoke<{success: boolean; message: string; uses?: number; email?: string; tier?: string}>('check_cached_license'),
        invoke<number>('get_export_count'),
      ])
      if (licenseResult.success) {
        set({
          licenseValid: true,
          licenseEmail: licenseResult.email ?? '',
          licenseUses: licenseResult.uses ?? 0,
          licenseTier: licenseResult.tier ?? '',
        })
      }
      set({ exportCount })
    } catch {}
  },
  validateLicenseOnline: async (key: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<{success: boolean; message: string; uses?: number; email?: string; tier?: string}>('verify_license_key', { licenseKey: key.trim() })
      if (result.success) {
        set({
          licenseKey: key.trim(),
          licenseValid: true,
          licenseEmail: result.email ?? '',
          licenseUses: result.uses ?? 0,
          licenseTier: result.tier ?? '',
        })
        return true
      }
      return false
    } catch (e) {
      console.error('License validation error:', e)
      return false
    }
  },
  canExport: () => {
    const s = get()
    return s.licenseValid || s.exportCount < 5
  },

  layers: [],
  selectedLayerId: null,
  selectedLayerIds: [],

  systemFonts: [],
  setSystemFonts: (fonts) => set({ systemFonts: fonts }),

  undoStack: [],
  redoStack: [],

  pushHistory: () =>
    set((s) => withHistory(s)),

  batchDepth: 0,
  startBatch: () => set((s) => ({ batchDepth: s.batchDepth + 1 })),
  endBatch: () => set((s) => ({ batchDepth: Math.max(0, s.batchDepth - 1) })),

  undo: () => {
    const { undoStack, layers, background, selectedLayerId, selectedLayerIds } = get()
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    set({
      layers: prev.layers,
      background: prev.background,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, snap(layers, background, selectedLayerId, selectedLayerIds)],
      selectedLayerId: prev.selectedLayerId,
      selectedLayerIds: prev.selectedLayerIds,
    })
  },

  redo: () => {
    const { redoStack, layers, background, selectedLayerId, selectedLayerIds } = get()
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    set({
      layers: next.layers,
      background: next.background,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, snap(layers, background, selectedLayerId, selectedLayerIds)],
      selectedLayerId: next.selectedLayerId,
      selectedLayerIds: next.selectedLayerIds,
    })
  },

  addLayer: (l) =>
    set((s) => ({
      layers: [...s.layers, normalizeLayer(l)],
      selectedLayerId: l.id,
      selectedLayerIds: [l.id],
      ...withHistory(s),
    })),

  updateLayer: (id, u, saveHistory = false) =>
    set((s) => {
      const textKeys = new Set(['text','font','fontSize','fontStyle','fontWeight','lineHeight','letterSpacing','textTransform'])
      const hasTextChange = Object.keys(u).some(k=>textKeys.has(k))
      const hasManualSize = u.width !== undefined || u.height !== undefined
      const tpl = s.template
      const cw = tpl?.width ?? 1280
      const ch = tpl?.height ?? 720
      const targetLayer = s.layers.find((x) => x.id === id)
      const isGroupTarget = targetLayer?.type === 'group'
      const layers = s.layers.map((l) => {
        const isTarget = l.id === id
        const isChildOfGroup = isGroupTarget && l.groupId === id
        if ((!isTarget && !isChildOfGroup) || (l.locked && u.locked === undefined)) return l
        let next: Layer = { ...l, ...u } as Layer
        // Se o usuário redimensionou manualmente, desativa autoFit
        if (hasManualSize && l.type==='text' && l.autoFit !== false) {
          // only disable if width/height explicitly changed not via autofit recalc
          // detection: if textKeys not changing together with size, assume manual
          if (!hasTextChange) next.autoFit = false
        }
        // Auto-fit bounding box constante: recalcula sempre que texto/estilo muda e autoFit ativo
        // Não recalcular quando o usuário está redimensionando manualmente (bbox scaling)
        if (next.type==='text' && next.autoFit !== false && hasTextChange && !hasManualSize) {
          try {
            const cx = l.x + l.width/2
            const cy = l.y + l.height/2
            const {width,height} = computeTextBounds(
              next.text ?? l.text,
              next.font ?? l.font,
              next.fontSize ?? l.fontSize,
              cw, ch,
              next.fontStyle ?? l.fontStyle,
              next.fontWeight ?? l.fontWeight,
              next.lineHeight ?? l.lineHeight,
              next.letterSpacing ?? l.letterSpacing,
              next.textTransform ?? l.textTransform
            )
            next.width = width
            next.height = height
            next.x = cx - width/2
            next.y = cy - height/2
          } catch {}
        } else if (next.type==='text' && next.autoFit === false && hasTextChange && !hasManualSize) {
          // modo manual com quebra de linha: recalcula altura pela largura atual
          try {
            const newFS = next.fontSize ?? l.fontSize
            const maxWpx = Math.max(20, next.width * cw - newFS*0.4)
            const hPx = computeWrappedTextHeight(next.text ?? l.text, next.font ?? l.font, newFS, maxWpx, next.fontStyle ?? l.fontStyle, next.fontWeight ?? l.fontWeight, next.lineHeight ?? l.lineHeight, next.letterSpacing ?? l.letterSpacing, next.textTransform ?? l.textTransform) + newFS*0.2
            const newH = Math.max(0.05, Math.min(hPx / ch, 0.98))
            const cx = l.x + l.width/2
            const cy = l.y + l.height/2
            next.height = newH
            next.y = cy - newH/2
          } catch {}
        }
        return normalizeLayer(next)
      })
      return { layers, ...(saveHistory ? withHistory(s) : {}) }
    }),

  updateLayers: (ids, u, saveHistory = false) =>
    set((s) => {
      const textKeys = new Set(['text','font','fontSize','fontStyle','fontWeight','lineHeight','letterSpacing','textTransform'])
      const hasTextChange = Object.keys(u).some(k=>textKeys.has(k))
      const hasManualSize = (u as any).width !== undefined || (u as any).height !== undefined
      const tpl = s.template
      const cw = tpl?.width ?? 1280
      const ch = tpl?.height ?? 720
      const groupIdsInIds = new Set(ids.filter((gid) => s.layers.find((x) => x.id === gid)?.type === 'group'))
      const layers = s.layers.map((l) => {
        const isDirectTarget = ids.includes(l.id)
        const isChildOfTargetGroup = !!l.groupId && groupIdsInIds.has(l.groupId)
        if ((!isDirectTarget && !isChildOfTargetGroup) || l.locked) return l
        let next: Layer = { ...l, ...u } as Layer
        if (next.type==='text' && next.autoFit !== false && hasTextChange && !hasManualSize) {
          try {
            const cx = l.x + l.width/2
            const cy = l.y + l.height/2
            const {width,height} = computeTextBounds(
              next.text ?? l.text,
              next.font ?? l.font,
              next.fontSize ?? l.fontSize,
              cw, ch,
              next.fontStyle ?? l.fontStyle,
              next.fontWeight ?? l.fontWeight,
              next.lineHeight ?? l.lineHeight,
              next.letterSpacing ?? l.letterSpacing,
              next.textTransform ?? l.textTransform
            )
            next.width = width
            next.height = height
            next.x = cx - width/2
            next.y = cy - height/2
          } catch {}
        } else if (next.type==='text' && next.autoFit === false && hasTextChange && !hasManualSize) {
          try {
            const newFS = next.fontSize ?? l.fontSize
            const maxWpx = Math.max(20, next.width * cw - newFS*0.4)
            const hPx = computeWrappedTextHeight(next.text ?? l.text, next.font ?? l.font, newFS, maxWpx, next.fontStyle ?? l.fontStyle, next.fontWeight ?? l.fontWeight, next.lineHeight ?? l.lineHeight, next.letterSpacing ?? l.letterSpacing, next.textTransform ?? l.textTransform) + newFS*0.2
            const newH = Math.max(0.05, Math.min(hPx / ch, 0.98))
            const cx = l.x + l.width/2
            const cy = l.y + l.height/2
            next.height = newH
            next.y = cy - newH/2
          } catch {}
        }
        if (u.width!==undefined || u.height!==undefined) {
          if (l.type==='text' && !hasTextChange) next.autoFit = false
        }
        return normalizeLayer(next)
      })
        return { layers, ...(saveHistory ? withHistory(s) : {}) }
    }),

  updateLayersBatch: (patches) =>
    set((s) => {
      const tpl = s.template
      const cw = tpl?.width ?? 1280
      const ch = tpl?.height ?? 720
      // Para efeitos em grupo, propaga patch do grupo para seus filhos
      const groupPatchIds = new Set(Object.keys(patches).filter((gid) => s.layers.find((x) => x.id === gid)?.type === 'group'))
      const layers = s.layers.map((l) => {
        let u: any = patches[l.id]
        if (!u && l.groupId && groupPatchIds.has(l.groupId)) {
          u = patches[l.groupId]
        }
        if (!u || l.locked) return l
        const textKeys = new Set(['text','font','fontSize','fontStyle','fontWeight','lineHeight','letterSpacing','textTransform'])
        const hasTextChange = Object.keys(u).some(k=>textKeys.has(k))
        const hasManualSize = u.width !== undefined || u.height !== undefined
        let next: Layer = { ...l, ...u } as Layer
        if (hasManualSize && l.type==='text' && l.autoFit !== false) {
          if (!hasTextChange) next.autoFit = false
        }
        if (next.type==='text' && next.autoFit !== false && hasTextChange && !hasManualSize) {
          try {
            const cx = l.x + l.width/2
            const cy = l.y + l.height/2
            const {width,height} = computeTextBounds(
              next.text ?? l.text,
              next.font ?? l.font,
              next.fontSize ?? l.fontSize,
              cw, ch,
              next.fontStyle ?? l.fontStyle,
              next.fontWeight ?? l.fontWeight,
              next.lineHeight ?? l.lineHeight,
              next.letterSpacing ?? l.letterSpacing,
              next.textTransform ?? l.textTransform
            )
            next.width = width
            next.height = height
            next.x = cx - width/2
            next.y = cy - height/2
          } catch {}
        } else if (next.type==='text' && next.autoFit === false && hasTextChange && !hasManualSize) {
          try {
            const newFS = next.fontSize ?? l.fontSize
            const maxWpx = Math.max(20, next.width * cw - newFS*0.4)
            const hPx = computeWrappedTextHeight(next.text ?? l.text, next.font ?? l.font, newFS, maxWpx, next.fontStyle ?? l.fontStyle, next.fontWeight ?? l.fontWeight, next.lineHeight ?? l.lineHeight, next.letterSpacing ?? l.letterSpacing, next.textTransform ?? l.textTransform) + newFS*0.2
            const newH = Math.max(0.05, Math.min(hPx / ch, 0.98))
            const cx = l.x + l.width/2
            const cy = l.y + l.height/2
            next.height = newH
            next.y = cy - newH/2
          } catch {}
        }
        if (u.width!==undefined || u.height!==undefined) {
          if (l.type==='text' && !hasTextChange) next.autoFit = false
        }
        return normalizeLayer(next)
      })
      return { layers }
    }),

  removeLayer: (id) =>
    set((s) => {
      const layer = s.layers.find((l) => l.id === id)
      if (!layer || layer.locked) return {}
      const removeIds = new Set([id])
      if (layer.type === 'group') {
        for (const l of s.layers) {
          if (l.groupId === id) removeIds.add(l.id)
        }
      }
      let remaining = s.layers.filter((l) => !removeIds.has(l.id))
      // Remove grupos vazios que ficaram sem filhos
      const childGroupIds = new Set(remaining.filter((l) => l.groupId).map((l) => l.groupId!))
      const emptyGroups = remaining.filter((l) => l.type === 'group' && !childGroupIds.has(l.id)).map((l) => l.id)
      if (emptyGroups.length > 0) {
        const emptySet = new Set(emptyGroups)
        remaining = remaining.filter((l) => !emptySet.has(l.id))
        for (const gid of emptyGroups) removeIds.add(gid)
      }
      const nextIds = s.selectedLayerIds.filter((sid) => !removeIds.has(sid))
      const background = layer.type !== 'group' && layer.isBackground
        ? { ...s.background, type: 'color' as const, color: '#000000', imagePath: '', imagePreview: '' }
        : s.background
      return {
        layers: remaining,
        selectedLayerId: s.selectedLayerId && removeIds.has(s.selectedLayerId) ? (nextIds[nextIds.length - 1] ?? null) : s.selectedLayerId,
        selectedLayerIds: nextIds,
        background,
        ...withHistory(s),
      }
    }),

  selectLayer: (id) => set({ selectedLayerId: id, selectedLayerIds: id ? [id] : [] }),

  toggleLayerSelection: (id) =>
    set((s) => {
      if (s.selectedLayerIds.includes(id)) {
        const next = s.selectedLayerIds.filter((sid) => sid !== id)
        return { selectedLayerIds: next, selectedLayerId: next[next.length - 1] ?? null }
      }
      return { selectedLayerIds: [...s.selectedLayerIds, id], selectedLayerId: id }
    }),

  selectLayers: (ids) => set({ selectedLayerIds: ids, selectedLayerId: ids[ids.length - 1] ?? null }),

  clearSelection: () => set({ selectedLayerId: null, selectedLayerIds: [] }),

  createGroup: (name) =>
    set((s) => {
      const zIndex = Math.max(0, ...s.layers.map((l) => l.zIndex)) + 1
      const group: Layer = {
        id: makeId(), type: 'group', name, visible: true, locked: false,
        zIndex, x: 0, y: 0, width: 0.1, height: 0.1,
        rotation: 0, opacity: 1,
        shadow: null, innerShadow: null,         outline: null,  borderRadius: 0, borderRadiusPx: 0, outlineWidthPx: 0, brightness: 1, blur: 0, contrast: 1, saturation: 1, hueRotate: 0, sepia: 0, negative: false, autoFit: true,
        source: '', preview: '',
        text: '', font: 'Arial', fontSize: 48, color: '#FFFFFF', textAlign: 'center',
        lineHeight: 1.2, letterSpacing: 0, textTransform: 'none', textGradient: null,
        fontStyle: 'normal', fontWeight: 700,
        elementContent: '', elementName: '', vector: null, vectorPath: null, mirrorX: false, mirrorY: false,     perspectiveX: 0, perspectiveY: 0, bevel: null,
      }
      return {
        layers: [...s.layers, group],
        ...withHistory(s),
      }
    }),

  moveLayerToGroup: (layerId, groupId) => set((s) => ({ layers: s.layers.map((l) => l.id === layerId ? { ...l, groupId: groupId ?? undefined } : l), ...withHistory(s) })),

  ungroupGroup: (id) =>
    set((s) => {
      const group = s.layers.find((l) => l.id === id && l.type === 'group')
      if (!group) return {}
      return {
        layers: s.layers.filter((l) => l.id !== id).map((l) => l.groupId === id ? { ...l, groupId: undefined } : l),
        ...withHistory(s),
      }
    }),

  duplicateLayer: (id) =>
    set((s) => {
      const layer = s.layers.find((l) => l.id === id)
      if (!layer || layer.locked || layer.isBackground) return {}
      const zIndex = Math.max(0, ...s.layers.map((l) => l.zIndex)) + 1
      if (layer.type === 'group') {
        const newGroupId = makeId()
        const children = s.layers.filter((l) => l.groupId === id)
        const newGroup = normalizeLayer({ ...layer, id: newGroupId, name: layer.name + t('layer.copySuffix'), locked: false, zIndex, x: layer.x + 0.02, y: layer.y + 0.02 })
        const newChildren: Layer[] = []
        for (const l of children) {
          const newId = makeId()
          newChildren.push(normalizeLayer({ ...l, id: newId, name: l.name + ' (cópia)', locked: false, zIndex: zIndex + 1, groupId: newGroupId, x: l.x + 0.02, y: l.y + 0.02 }))
        }
        const all = [newGroup, ...newChildren].map((l, i) => ({ ...l, zIndex: zIndex + i }))
        return {
          layers: [...s.layers, ...all],
          selectedLayerId: newGroupId,
          selectedLayerIds: [newGroupId],
          ...withHistory(s),
        }
      }
      const newId = makeId()
      return {
        layers: [...s.layers, normalizeLayer({ ...layer, id: newId, name: layer.name + t('layer.copySuffix'), locked: false, zIndex, x: layer.x + 0.02, y: layer.y + 0.02 })],
        selectedLayerId: newId,
        selectedLayerIds: [newId],
        ...withHistory(s),
      }
    }),

  duplicateLayerExact: (ids) =>
    set((s) => {
      const toDup = s.layers.filter((l) => ids.includes(l.id) && !l.locked && !l.isBackground && l.type !== 'mask')
      if (toDup.length === 0) return {}
      let zIndex = Math.max(0, ...s.layers.map((l) => l.zIndex)) + 1
      const created: Layer[] = []
      for (const layer of toDup) {
        if (layer.type === 'group') {
          const newGroupId = makeId()
          const children = s.layers.filter((l) => l.groupId === layer.id)
          const newGroup = normalizeLayer({ ...layer, id: newGroupId, name: layer.name + t('layer.copySuffix'), locked: false, zIndex: zIndex++ })
          created.push(newGroup)
          for (const child of children) {
            created.push(normalizeLayer({ ...child, id: makeId(), name: child.name + ' (cópia)', locked: false, zIndex: zIndex++, groupId: newGroupId }))
          }
        } else {
          created.push(normalizeLayer({ ...layer, id: makeId(), name: layer.name + t('layer.copySuffix'), locked: false, zIndex: zIndex++ }))
        }
      }
      return {
        layers: [...s.layers, ...created],
        selectedLayerId: created[created.length - 1]?.id ?? null,
        selectedLayerIds: created.map((l) => l.id),
        ...withHistory(s),
      }
    }),

  toggleVisibility: (id) =>
    set((s) => {
      const layer = s.layers.find((l) => l.id === id)
      const nextVisible = layer ? !layer.visible : true
      const toggleIds = new Set([id])
      if (layer?.type === 'group') {
        for (const l of s.layers) {
          if (l.groupId === id) toggleIds.add(l.id)
        }
      }
      // Groups must affect every member the same way — lock is independent of
      // visibility, so locked children still toggle with the group.
      return {
        layers: s.layers.map((l) => (toggleIds.has(l.id) ? { ...l, visible: nextVisible } : l)),
        ...withHistory(s),
      }
    }),

  toggleVisibilityMultiple: (ids) =>
    set((s) => {
      const targetIds = new Set<string>()
      for (const id of ids) {
        const layer = s.layers.find((l) => l.id === id)
        if (!layer || layer.isBackground) continue
        targetIds.add(id)
        if (layer.type === 'group') {
          for (const l of s.layers) {
            if (l.groupId === id) targetIds.add(l.id)
          }
        }
      }
      if (targetIds.size === 0) return {}
      const anyVisible = s.layers.some((l) => targetIds.has(l.id) && l.visible)
      const nextVisible = !anyVisible
      return {
        layers: s.layers.map((l) => (targetIds.has(l.id) ? { ...l, visible: nextVisible } : l)),
        ...withHistory(s),
      }
    }),

  toggleLock: (id) =>
    set((s) => {
      const layer = s.layers.find((l) => l.id === id)
      if (!layer || layer.isBackground) return {}
      const nextLocked = !layer.locked
      const toggleIds = new Set([id])
      if (layer.type === 'group') {
        for (const l of s.layers) {
          if (l.groupId === id) toggleIds.add(l.id)
        }
      }
      return {
        layers: s.layers.map((l) => toggleIds.has(l.id) ? { ...l, locked: nextLocked } : l),
        ...withHistory(s),
      }
    }),

  toggleLockMultiple: (ids) =>
    set((s) => {
      const targetIds = new Set<string>()
      for (const id of ids) {
        const layer = s.layers.find((l) => l.id === id)
        if (!layer || layer.isBackground) continue
        targetIds.add(id)
        if (layer.type === 'group') {
          for (const l of s.layers) {
            if (l.groupId === id) targetIds.add(l.id)
          }
        }
      }
      if (targetIds.size === 0) return {}
      const anyUnlocked = s.layers.some((l) => targetIds.has(l.id) && !l.locked)
      const nextLocked = anyUnlocked
      return {
        layers: s.layers.map((l) => targetIds.has(l.id) ? { ...l, locked: nextLocked } : l),
        ...withHistory(s),
      }
    }),

  moveLayerToIndex: (id, targetIdx) =>
    set((s) => {
      const all = [...s.layers]
      const idx = all.findIndex((l) => l.id === id)
      if (idx === -1 || targetIdx < 0) return {}
      if (all[idx].locked) return {}
      const movingIds = new Set([id])
      const layer = all[idx]
      if (layer.type === 'group') {
        for (const l of all) {
          if (l.groupId === id) movingIds.add(l.id)
        }
      } else if (layer.groupId) {
        const siblings = all.filter((l) => l.groupId === layer.groupId)
        const sibMin = Math.min(...siblings.map((l) => l.zIndex))
        const sibMax = Math.max(...siblings.map((l) => l.zIndex))
        const targetZ = all.filter((l) => !movingIds.has(l.id)).sort((a, b) => a.zIndex - b.zIndex)[targetIdx]?.zIndex ?? -1
        if (targetIdx >= all.filter((l) => !movingIds.has(l.id)).length) {
          for (const s of siblings) movingIds.add(s.id)
        } else if (targetZ < sibMin || targetZ > sibMax) {
          for (const s of siblings) movingIds.add(s.id)
        }
      }
      const moving = all.filter((l) => movingIds.has(l.id))
      const remaining = all.filter((l) => !movingIds.has(l.id))
      // Keep background always at the bottom (zIndex 0)
      const bgLayer = remaining.find((l) => l.isBackground)
      const nonBgRemaining = bgLayer ? remaining.filter((l) => !l.isBackground) : remaining
      // Adjust targetIdx since background is excluded from nonBgRemaining
      const adjustedIdx = bgLayer ? Math.max(0, targetIdx - 1) : targetIdx
      const clamped = Math.max(0, Math.min(nonBgRemaining.length, adjustedIdx))
      const reordered = [...nonBgRemaining.slice(0, clamped), ...moving, ...nonBgRemaining.slice(clamped)]
      const finalLayers = bgLayer ? [bgLayer, ...reordered] : reordered
      return {
        layers: finalLayers.map((l, i) => ({ ...l, zIndex: i })),
        ...withHistory(s),
      }
    }),

  addTextLayer: (text) => {
    set((s) => {
      const zIndex = Math.max(0, ...s.layers.map((l) => l.zIndex)) + 1
      const txt = text || 'TEXTO'
      const tpl = s.template
      const cw = tpl?.width ?? 1280
      const ch = tpl?.height ?? 720
      const fs = 72
      const lh = 1.2
      let tw = 0.08, th = 0.05
      try {
        const mCanvas = document.createElement('canvas')
        const ctx = mCanvas.getContext('2d')
        if (ctx) {
          ctx.font = `700 ${fs}px Impact`
          const lines = txt.split('\n')
          let maxW = 0
          for (const line of lines) {
            const m = ctx.measureText(line)
            maxW = Math.max(maxW, m.width)
          }
          const totalH = lines.length * fs * lh
          tw = Math.max(0.08, Math.min(maxW + fs * 0.3, cw * 0.98) / cw)
          th = Math.max(0.05, Math.min(totalH, ch * 0.98) / ch)
        }
      } catch {}
      const displayName = txt.trim().slice(0, 22) || 'Texto'
      const existingTextCount = s.layers.filter((l) => l.type === 'text').length
      const uniqueName = s.layers.some((l) => l.name === displayName) ? `${displayName} ${existingTextCount + 1}` : displayName
      const layer: Layer = {
        id: makeId(), type: 'text', name: uniqueName, visible: true, locked: false,
        zIndex, x: 0.5 - tw / 2, y: 0.5 - th / 2, width: tw, height: th,
        rotation: 0, opacity: 1,
        shadow: { color: '#000000', blur: 8, offsetX: 0, offsetY: 0, intensity: 0.6, inset: false },
        innerShadow: null,
        outline: { color: '#000000', width: 3 },  borderRadius: 0, borderRadiusPx: 0, outlineWidthPx: 0,
        brightness: 1, blur: 0, contrast: 1, saturation: 1, hueRotate: 0, sepia: 0, negative: false, autoFit: true, source: '', preview: '',
        text: txt, font: 'Impact', fontSize: fs, color: '#FFFFFF', textAlign: 'center',
        lineHeight: lh, letterSpacing: 0, textTransform: 'none', textGradient: null,
        fontStyle: 'normal', fontWeight: 700,
        elementContent: '', elementName: '', vector: null, vectorPath: null, mirrorX: false, mirrorY: false,     perspectiveX: 0, perspectiveY: 0, bevel: null,
      }
      return {
        layers: [...s.layers, normalizeLayer(layer)],
        selectedLayerId: layer.id,
        selectedLayerIds: [layer.id],
        ...withHistory(s),
      }
    })
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        // Fecha tudo: todos os containers do painel de propriedades
        const allKeys = Object.keys(localStorage)
        for (const k of allKeys) {
          if (k.startsWith('panel.open.') || k.startsWith('effectrow.open.') || k.startsWith('collapsible.open.')) {
            localStorage.setItem(k, 'false')
          }
        }
        // Só deixa aberto Tipografia / Typography (Estilos) e Predefinições por padrão
        const typoKeys = ['panel.open.Tipografia', 'panel.open.Typography', 'panel.open.Tipografía', 'panel.open.Estilos', 'panel.open.Styles', 'panel.open.Predefinições', 'panel.open.Presets', 'panel.open.Predefiniciones']
        for (const k of typoKeys) localStorage.setItem(k, 'true')
        // Garante Conteúdo/Cor fechados explicitamente (compatibilidade pt/en/es)
        for (const k of ['panel.open.Conteúdo','panel.open.Content','panel.open.Contenido','panel.open.Cor','panel.open.Color']) localStorage.setItem(k,'false')
        window.dispatchEvent(new CustomEvent('lovert:reset-text-panels'))
      }
    } catch {}
  },

  addImageLayer: (source: string, preview: string, name: string, w?: number, h?: number) =>
    set((s) => {
      const zIndex = Math.max(0, ...s.layers.map((l) => l.zIndex)) + 1
      const width = w ?? 0.8
      const height = h ?? 0.8
      const layer: Layer = {
        id: makeId(), type: 'image', name, visible: true, locked: false,
        zIndex, x: 0.5 - width / 2, y: 0.5 - height / 2, width, height,
        rotation: 0, opacity: 1,
        shadow: null, innerShadow: null,         outline: null,  borderRadius: 0, borderRadiusPx: 0, outlineWidthPx: 0, brightness: 1, blur: 0, contrast: 1, saturation: 1, hueRotate: 0, sepia: 0, negative: false, autoFit: true,
        source, preview,
        text: '', font: 'Arial', fontSize: 48, color: '#FFFFFF', textAlign: 'center',
        lineHeight: 1.2, letterSpacing: 0, textTransform: 'none', textGradient: null,
        fontStyle: 'normal', fontWeight: 700,
        elementContent: '', elementName: '', vector: null, vectorPath: null, mirrorX: false, mirrorY: false,     perspectiveX: 0, perspectiveY: 0, bevel: null,
      }
      return {
        layers: [...s.layers, normalizeLayer(layer)],
        selectedLayerId: layer.id,
        selectedLayerIds: [layer.id],
        ...withHistory(s),
      }
    }),

  addElementLayer: (content, name) =>
    set((s) => {
      const zIndex = Math.max(0, ...s.layers.map((l) => l.zIndex)) + 1
      const tpl = s.template
      const cw = tpl?.width ?? 1280
      const ch = tpl?.height ?? 720
      let w = 200 / cw
      let h = 200 / ch
      try {
        const mCanvas = document.createElement('canvas')
        const ctx = mCanvas.getContext('2d')
        if (ctx) {
          ctx.font = `400 200px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
          const m: any = ctx.measureText(content)
          const aw = m.width + 16
          const ascent = m.actualBoundingBoxAscent ?? 160
          const descent = m.actualBoundingBoxDescent ?? 40
          const ah = ascent + descent + 16
          w = Math.max(0.06, Math.min(aw / cw, 0.5))
          h = Math.max(0.06, Math.min(ah / ch, 0.5))
        }
      } catch {}
      const layer: Layer = {
        id: makeId(), type: 'element', name, visible: true, locked: false,
        zIndex, x: 0.5 - w / 2, y: 0.5 - h / 2,
        width: w, height: h,
        rotation: 0, opacity: 1,
        shadow: null, innerShadow: null,         outline: null,  borderRadius: 0, borderRadiusPx: 0, outlineWidthPx: 0, brightness: 1, blur: 0, contrast: 1, saturation: 1, hueRotate: 0, sepia: 0, negative: false, autoFit: true,
        source: '', preview: '',
        text: '', font: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif', fontSize: 200, color: '#FFFFFF', textAlign: 'center',
        lineHeight: 1.2, letterSpacing: 0, textTransform: 'none', textGradient: null,
        fontStyle: 'normal', fontWeight: 700,
        elementContent: content, elementName: name, vector: null, vectorPath: null, mirrorX: false, mirrorY: false, perspectiveX: 0, perspectiveY: 0,
      }
      return {
        layers: [...s.layers, normalizeLayer(layer)],
        selectedLayerId: layer.id,
        selectedLayerIds: [layer.id],
        ...withHistory(s),
      }
    }),

  addVectorLayer: (shape, color, strokeColor, strokeWidth, filled) =>
    set((s) => {
      const zIndex = Math.max(0, ...s.layers.map((l) => l.zIndex)) + 1
      const tpl = s.template
      const cw = tpl?.width ?? 1280
      const ch = tpl?.height ?? 720
      const sizePx = 350
      let w = sizePx / cw
      let h = sizePx / ch
      // Linha/setas/cross têm bbox vertical justo ao traço, não quadrado cheio
      if (shape === 'line' || shape === 'arrow' || shape === 'cross') {
        h = Math.max(0.02, (Math.max(8, strokeWidth) * 2.5) / ch)
      } else if (shape === 'speech-bubble-wide' || shape === 'speech-bubble-wide-left' || shape === 'speech-bubble-wide-right') {
        w = (sizePx * 1.45) / cw
        h = (sizePx * 0.72) / ch
      } else if (shape === 'speech-bubble-tall') {
        w = (sizePx * 0.70) / cw
        h = (sizePx * 1.35) / ch
      }
      const isBloom = shape === 'bloom'
      const isOpenStroke = shape === 'line' || shape === 'arrow' || shape === 'cross'
      const isBalloon = shape.startsWith('speech') || shape.startsWith('thought')
      const filledFinal = isBloom ? filled : isOpenStroke ? false : filled
      const uniformFilled = filledFinal
      const swBalloon = isBalloon ? Math.max(2, strokeWidth) : uniformFilled ? Math.max(2, strokeWidth) : strokeWidth
      const shapeNames: Record<string,string> = { 'line':'Linha', 'arrow':'Seta', 'curved-arrow':'Seta Curva', 'rounded-rect':'Retângulo', 'circle':'Círculo', 'diamond':'Losango', 'triangle':'Triângulo', 'pentagon':'Pentágono', 'hexagon':'Hexágono', 'star':'Estrela', 'cross':'X', 'plus':'Cruz', 'lightning':'Raio', 'heart':'Coração', 'arrow-right':'Seta Cheia', 'bloom':'Bloom', 'speech-bubble-left':'Balão Esq.', 'speech-bubble-right':'Balão Dir.', 'thought-bubble':'Balão Ideia', 'speech-bubble-wide':'Balão Largo', 'speech-bubble-wide-left':'Balão Largo Esq.', 'speech-bubble-wide-right':'Balão Largo Dir.', 'speech-bubble-tall':'Balão Alto' }
      const baseName = shapeNames[shape] || shape
      const sameCount = s.layers.filter((l) => l.type === 'vector' && (l.name === baseName || l.name.startsWith(baseName + ' '))).length
      const displayName = sameCount > 0 ? `${baseName} ${sameCount + 1}` : baseName
      const layer: Layer = {
        id: makeId(), type: 'vector', name: displayName, visible: true, locked: false,
        zIndex, x: 0.5 - w / 2, y: 0.5 - h / 2,
        width: w, height: h,
        rotation: 0, opacity: 1,
        shadow: null, innerShadow: null,         outline: null,  borderRadius: 0, borderRadiusPx: 0, outlineWidthPx: 0, brightness: 1, blur: 0, contrast: 1, saturation: 1, hueRotate: 0, sepia: 0, negative: false, autoFit: true,
        source: '', preview: '',
        text: '', font: 'Arial', fontSize: 48, color: '#FFFFFF', textAlign: 'center',
        lineHeight: 1.2, letterSpacing: 0, textTransform: 'none', textGradient: null,
        fontStyle: 'normal', fontWeight: 700,
        elementContent: '', elementName: '', vector: isBloom
          ? { shape, color, fillGradient: null, strokeColor: color, strokeWidth: 0, filled: true, cornerRadius: 0, strokeDash: 'solid', skewX: 0 }
          : { shape, color, fillGradient: null, strokeColor, strokeWidth: swBalloon, filled: filledFinal, cornerRadius: 0, strokeDash: 'solid', skewX: 0 }, vectorPath: null, mirrorX: false, mirrorY: false,     perspectiveX: 0, perspectiveY: 0, bevel: null,
      }
      return {
        layers: [...s.layers, normalizeLayer(layer)],
        selectedLayerId: layer.id,
        selectedLayerIds: [layer.id],
        ...withHistory(s),
      }
    }),

  addVectorPathLayer: () =>
    set((s) => {
      const zIndex = Math.max(0, ...s.layers.map((l) => l.zIndex)) + 1
      const tpl = s.template
      const cw = tpl?.width ?? 1280
      const ch = tpl?.height ?? 720
      const sizePx = 400
      const w = sizePx / cw
      const h = sizePx / ch
      const bezierCount = s.layers.filter((l) => l.type === 'vector' && l.name.startsWith('Traçado')).length
      const bezierName = bezierCount > 0 ? `Traçado ${bezierCount + 1}` : 'Traçado'
      const layer: Layer = {
        id: makeId(),
        type: 'vector',
        name: bezierName,
        visible: true,
        locked: false,
        zIndex,
        x: 0.5 - w / 2,
        y: 0.5 - h / 2,
        width: w,
        height: h,
        rotation: 0,
        opacity: 1,
        shadow: null,
        outline: null,
        borderRadius: 0,
        borderRadiusPx: 0,
        outlineWidthPx: 0,
        brightness: 1,
        blur: 0,
        contrast: 1,
        saturation: 1,
        hueRotate: 0,
        sepia: 0,
        negative: false,
        source: '',
        preview: '',
        text: '',
        font: 'Arial',
        fontSize: 48,
        color: '#FFFFFF',
        textAlign: 'center',
        lineHeight: 1.2,
        letterSpacing: 0,
        textTransform: 'none',
        textGradient: null,
        fontStyle: 'normal',
        fontWeight: 700,
        elementContent: '',
        elementName: '',
        vector: null,
        vectorPath: {
          points: [
            { id: makeId(), x: 10, y: 50, type: 'bezier' as const, handleOut: { x: 20, y: -30 } },
            { id: makeId(), x: 90, y: 50, type: 'bezier' as const, handleIn: { x: -20, y: 30 } },
          ],
          closed: false,
          fillColor: '#3b82f6',
          strokeColor: '#ffffff',
          strokeWidth: 20,
          startCapSize: 10,
          endCapSize: 10,
        },
        mirrorX: false,
        mirrorY: false,
        perspectiveX: 0,
        perspectiveY: 0, autoFit: true, innerShadow: null,
      }
      return {
        layers: [...s.layers, normalizeLayer(layer)],
        selectedLayerId: layer.id,
        selectedLayerIds: [layer.id],
        ...withHistory(s),
      }
    }),

  updateVectorPath: (id, updater, saveHistory = true) =>
    set((s) => {
      const nextLayers = s.layers.map((l) => {
        if (l.id !== id || !l.vectorPath) return l
        const next = updater(l.vectorPath)
        return normalizeLayer({ ...l, vectorPath: sanitizeVectorPath(next) || next } as Layer)
      })
      return {
        layers: nextLayers,
        ...(saveHistory ? withHistory(s) : {}),
      }
    }),

  mergeVectors: (ids) =>
    set((s) => {
      const selected = s.layers.filter((l) => ids.includes(l.id) && l.type === 'vector')
      if (selected.length < 2) return {}
      // Calcula bbox combinada para o novo grupo
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const l of selected) {
        minX = Math.min(minX, l.x)
        minY = Math.min(minY, l.y)
        maxX = Math.max(maxX, l.x + l.width)
        maxY = Math.max(maxY, l.y + l.height)
      }
      const newW = Math.max(0.02, maxX - minX)
      const newH = Math.max(0.02, maxY - minY)
      const groupId = makeId()
      const group: Layer = {
        id: groupId,
        type: 'group',
        name: 'Vetor combinado',
        visible: true,
        locked: false,
        zIndex: Math.max(0, ...s.layers.map((l) => l.zIndex)) + 1,
        x: minX,
        y: minY,
        width: newW,
        height: newH,
        rotation: 0,
        opacity: 1,
        shadow: null,
        innerShadow: null,
        outline: null,
        borderRadius: 0,
        borderRadiusPx: 0,
        outlineWidthPx: 0,
        brightness: 1,
        blur: 0,
        contrast: 1,
        saturation: 1,
        hueRotate: 0,
        sepia: 0,
        negative: false,
        autoFit: true,
        source: '',
        preview: '',
        text: '',
        font: 'Arial',
        fontSize: 48,
        color: '#FFFFFF',
        textAlign: 'center',
        lineHeight: 1.2,
        letterSpacing: 0,
        textTransform: 'none',
        textGradient: null,
        fontStyle: 'normal',
        fontWeight: 700,
        elementContent: '',
        elementName: '',
        vector: null,
        vectorPath: null,
        mirrorX: false,
        mirrorY: false,
        perspectiveX: 0,
        perspectiveY: 0,
        bevel: null,
      }
      const newLayers = s.layers.map((l) => {
        if (ids.includes(l.id) && l.type === 'vector') {
          return { ...l, groupId }
        }
        return l
      })
      const childIds = selected.map((l) => l.id)
      return {
        layers: [...newLayers, normalizeLayer(group)],
        selectedLayerId: groupId,
        selectedLayerIds: [groupId, ...childIds],
        ...withHistory(s),
      }
    }),

  alignLayer: (id, align, padding) =>
    set((s) => {
      const layer = s.layers.find((l) => l.id === id)
      if (!layer || layer.locked) return {}
      const p = Math.max(0, Math.min(50, padding)) / 100
      let x = layer.x
      let y = layer.y
      switch (align) {
        case 'left': x = p; break
        case 'center-h': x = 0.5 - layer.width / 2; break
        case 'right': x = 1 - layer.width - p; break
        case 'top': y = p; break
        case 'center-v': y = 0.5 - layer.height / 2; break
        case 'bottom': y = 1 - layer.height - p; break
      }
      return {
        layers: s.layers.map((l) => (l.id === id ? normalizeLayer({ ...l, x: Math.max(0, Math.min(1 - l.width, x)), y: Math.max(0, Math.min(1 - l.height, y)) }) : l)),
        ...withHistory(s),
      }
    }),

  alignLayers: (ids, align, padding) =>
    set((s) => {
      const target = s.layers.filter((l) => ids.includes(l.id) && !l.locked)
      if (target.length === 0) return {}
      const p = Math.max(0, Math.min(50, padding)) / 100
      const minX = Math.min(...target.map((l) => l.x))
      const minY = Math.min(...target.map((l) => l.y))
      const maxX = Math.max(...target.map((l) => l.x + l.width))
      const maxY = Math.max(...target.map((l) => l.y + l.height))
      const groupW = maxX - minX
      const groupH = maxY - minY
      let newMinX = minX, newMinY = minY
      switch (align) {
        case 'left': newMinX = p; break
        case 'center-h': newMinX = 0.5 - groupW / 2; break
        case 'right': newMinX = 1 - groupW - p; break
        case 'top': newMinY = p; break
        case 'center-v': newMinY = 0.5 - groupH / 2; break
        case 'bottom': newMinY = 1 - groupH - p; break
      }
      const dx = newMinX - minX
      const dy = newMinY - minY
      return {
        layers: s.layers.map((l) => {
          if (!ids.includes(l.id) || l.locked) return l
          return normalizeLayer({ ...l, x: Math.max(-l.width + 0.02, Math.min(1 - 0.02, l.x + dx)), y: Math.max(-l.height + 0.02, Math.min(1 - 0.02, l.y + dy)) })
        }),
        ...withHistory(s),
      }
    }),

  background: { ...DEFAULT_BG },
  setBackgroundColor: (c) =>
    set((s) => ({
      layers: s.layers.filter((l) => !l.isBackground),
      background: { ...s.background, type: 'color', color: c, gradient: '', imagePath: '', imagePreview: '' },
      ...withHistory(s),
    })),
  setBackgroundGradient: (g) =>
    set((s) => ({
      layers: s.layers.filter((l) => !l.isBackground),
      background: { ...s.background, type: 'gradient', gradient: g, color: '', imagePath: '', imagePreview: '' },
      ...withHistory(s),
    })),
  setBackgroundImage: (path, preview) =>
    set((s) => {
      if (!path && !preview) {
        const noBg = s.layers.filter((l) => !l.isBackground)
        return {
          layers: noBg,
          background: { ...s.background, type: 'color' as const, color: '#000000', imagePath: '', imagePreview: '' },
          ...withHistory(s),
        }
      }
      const existingBg = s.layers.find((l) => l.isBackground)
      const bgLayer: Layer = existingBg
        ? { ...existingBg, source: path, preview, borderRadius: existingBg.borderRadius ?? 0 }
        : makeBackgroundLayer({ ...s.background, type: 'image', imagePath: path, imagePreview: preview }, path, preview)
      return {
        layers: existingBg ? s.layers.map((l) => l.id === existingBg.id ? bgLayer : l) : [...s.layers, bgLayer],
        background: { ...s.background, type: 'image', imagePath: path, imagePreview: preview, color: '', gradient: '' },
        ...withHistory(s),
      }
    }),
  setBackgroundEffects: (effects) =>
    set((s) => {
      const bgLayer = s.layers.find((l) => l.isBackground)
      const layerEffects: Partial<Layer> = {}
      if (effects.brightness !== undefined) layerEffects.brightness = effects.brightness
      if (effects.blur !== undefined) layerEffects.blur = effects.blur
      if (effects.contrast !== undefined) layerEffects.contrast = effects.contrast
      if (effects.saturation !== undefined) layerEffects.saturation = effects.saturation
      if (effects.hueRotate !== undefined) layerEffects.hueRotate = effects.hueRotate
      if (effects.sepia !== undefined) layerEffects.sepia = effects.sepia
      return {
        background: { ...s.background, ...effects },
        layers: bgLayer
          ? s.layers.map((l) => l.id === bgLayer.id ? { ...l, ...layerEffects } : l)
          : s.layers,
        ...withHistory(s),
      }
    }),
  removeBackgroundImageLayer: () =>
    set((s) => ({
      layers: s.layers.filter((l) => !l.isBackground),
      background: { ...s.background, type: 'color' as const, color: '#000000', imagePath: '', imagePreview: '' },
      ...withHistory(s),
    })),

  processingLayers: {},
  setProcessing: (id, v) =>
    set((s) => ({ processingLayers: { ...s.processingLayers, [id]: v } })),

  showSaveDialog: false,
  setShowSaveDialog: (v) => set({ showSaveDialog: v }),

  showCloseConfirm: false,
  setShowCloseConfirm: (v) => set({ showCloseConfirm: v }),

  groupNameCallback: null,
  setGroupNameCallback: (cb) => set({ groupNameCallback: cb }),

  inlinePrompt: null,
  setInlinePrompt: (p) => set({ inlinePrompt: p }),
  requestInlinePrompt: (title, defaultValue, onConfirm) => set({ inlinePrompt: { title, placeholder: title, defaultValue, onConfirm: (v: string) => onConfirm(v), onCancel: () => set({ inlinePrompt: null }) } }),

  errorMsg: null,
  setError: (msg) => set({ errorMsg: msg }),

  projectFilePath: null,
  setProjectFilePath: (p) => set({ projectFilePath: p }),

  loadingProject: false,
  setLoadingProject: (v) => set({ loadingProject: v }),

  savedHash: '',
  markSaved: () => set({ savedHash: JSON.stringify({ layers: get().layers, background: get().background }) }),
  isDirty: () => {
    const s = get()
    return JSON.stringify({ layers: s.layers, background: s.background }) !== s.savedHash
  },

  customPresets: readCustomPresets(),
  saveCurrentAsPreset: async (name, category) => {
    try {
      const state = get()
      if (!state.template) return
      if (!state.licenseValid) {
        set({ errorMsg: t('error.activateToSaveTemplates', { n: 5 - state.exportCount }) })
        return
      }
      const cleanName = name.trim() || 'Meu template'
      const cleanCategory = category?.trim() || 'Geral'
      // Embed images as data URLs like saveProject does, to preserve scale/crop correctly.
      // This ensures templates open with identical image dimensions, independent of file moves.
      const makeDataUrlFromSource = async (sourcePath: string): Promise<string> => {
        if (!sourcePath) return ''
        const blobUrl = await readFileAsBlobUrl(sourcePath)
        if (!blobUrl) return ''
        try {
          const resp = await fetch(blobUrl)
          const blob = await resp.blob()
          const reader = new FileReader()
          return await new Promise<string>((resolve) => {
            reader.onload = () => { URL.revokeObjectURL(blobUrl); resolve(reader.result as string) }
            reader.onerror = () => { URL.revokeObjectURL(blobUrl); resolve('') }
            reader.readAsDataURL(blob)
          })
        } catch { try { URL.revokeObjectURL(blobUrl) } catch {} ; return '' }
      }
      const rawLayers = [...state.layers]
        .filter((l) => !l.isBackground)
        .sort((a, b) => a.zIndex - b.zIndex)
      const layers: Layer[] = await Promise.all(rawLayers.map(async (l) => {
        if (l.type !== 'image') return { ...l, preview: '' } as Layer
        // Embed preview and originalPreview as data URLs, preserving crop and original dimensions
        let previewData = ''
        if (l.preview?.startsWith('data:')) previewData = l.preview
        else if (l.source) previewData = await makeDataUrlFromSource(l.source)
        else if (l.preview?.startsWith('blob:')) previewData = l.preview // fallback keep blob if no source
        let originalData: string | undefined = undefined
        if (l.crop) {
          if (l.originalPreview?.startsWith('data:')) originalData = l.originalPreview
          else if (l.originalPreview?.startsWith('blob:') || !l.originalPreview) originalData = previewData || (l.source ? await makeDataUrlFromSource(l.source) : undefined)
          else originalData = l.originalPreview
        } else {
          originalData = l.originalPreview?.startsWith('blob:') ? undefined : l.originalPreview
        }
        const next: any = { ...l, preview: previewData, source: l.source || '' }
        if (originalData !== undefined) next.originalPreview = originalData
        else if (next.originalPreview?.startsWith('blob:')) next.originalPreview = undefined
        // Preserve originalWidth/Height for correct scale on load
        if (l.originalWidth) next.originalWidth = l.originalWidth
        if (l.originalHeight) next.originalHeight = l.originalHeight
        return next as Layer
      }))
      let preview = ''
      try {
        const { toPng } = await import('html-to-image')
        const el = document.getElementById('canvas-export-target')
        if (el) {
          await waitForImagesLoaded(el)
          preview = await toPng(el as HTMLElement, {
            width: state.template.width,
            height: state.template.height,
            canvasWidth: state.template.width,
            canvasHeight: state.template.height,
            pixelRatio: 1,
          })
        }
      } catch {}
      // Save the template thumbnail as a JPG on disk (small, separate from localStorage)
      const presetId = 'custom_' + makeId()
      let previewUrl = ''
      if (preview) {
        try {
          previewUrl = await writePreviewFile(presetId, preview)
        } catch {}
        if (!previewUrl) previewUrl = preview
      }
      let bgImagePreview = ''
      if (state.background.type === 'image' && state.background.imagePath) {
        if (state.background.imagePreview?.startsWith('data:')) bgImagePreview = state.background.imagePreview
        else bgImagePreview = await makeDataUrlFromSource(state.background.imagePath)
        if (!bgImagePreview && state.background.imagePreview?.startsWith('data:')) bgImagePreview = state.background.imagePreview
      } else if (state.background.imagePreview?.startsWith('data:')) {
        bgImagePreview = state.background.imagePreview
      }
      const preset: CustomTemplatePreset = {
        id: presetId,
        name: cleanName,
        category: cleanCategory,
        icon: '⭐',
        preview: previewUrl,
        template: { ...state.template },
        theme: 'Personalizado',
        background: { ...state.background, imagePreview: bgImagePreview },
        layers,
        createdAt: Date.now(),
        globalEffects: { ...state.globalEffects },
      }
      const currentPresets = get().customPresets
      const customPresets = [preset, ...currentPresets].slice(0, 60)
      writeCustomPresets(customPresets)
      set({ customPresets, errorMsg: t('success.templateSaved') })
    } catch (e) {
      set({ errorMsg: t('error.saveTemplate', { msg: String(e) }) })
    }
  },
  removeCustomPreset: (id) => {
    const customPresets = get().customPresets.filter((p) => p.id !== id)
    writeCustomPresets(customPresets)
    deletePreviewFile(id)
    set({ customPresets })
  },
  renameCustomPreset: (id, newName) => {
    const clean = newName.trim()
    if (!clean) return
    const customPresets = get().customPresets.map((p) => p.id === id ? { ...p, name: clean } : p)
    writeCustomPresets(customPresets)
    set({ customPresets })
  },
  customVectors: readCustomVectors(),
  saveCustomVector: (vectorPath, name) => {
    const cleanName = (name?.trim() || `Vector ${Date.now().toString(36).slice(0,4)}`)
    const vec: CustomVector = {
      id: 'vec_' + makeId(),
      name: cleanName,
      icon: '✏️',
      vectorPath: JSON.parse(JSON.stringify(vectorPath)),
      createdAt: Date.now(),
    }
    const vectors = [vec, ...get().customVectors].slice(0, 100)
    writeCustomVectors(vectors)
    set({ customVectors: vectors, errorMsg: '✅ Vector guardado!' })
  },
  saveCustomVectorGroup: (groupId, name) => {
    const s = get()
    const group = s.layers.find((l) => l.id === groupId && l.type === 'group')
    if (!group) {
      set({ errorMsg: '❌ Grupo não encontrado' })
      return
    }
    const children = s.layers.filter((l) => l.groupId === groupId && l.type === 'vector')
    if (children.length === 0) {
      set({ errorMsg: '❌ Nenhum vetor no grupo' })
      return
    }
    const cleanName = (name?.trim() || group.name || `Vector Grupo ${Date.now().toString(36).slice(0,4)}`)
    // Salva as camadas do grupo com posições relativas ao grupo (para ficar 100% fiel)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const l of children) {
      minX = Math.min(minX, l.x)
      minY = Math.min(minY, l.y)
      maxX = Math.max(maxX, l.x + l.width)
      maxY = Math.max(maxY, l.y + l.height)
    }
    const groupW = Math.max(0.02, maxX - minX)
    const groupH = Math.max(0.02, maxY - minY)
    const groupLayers: Layer[] = children.map((l) => {
      const relX = (l.x - minX) / groupW
      const relY = (l.y - minY) / groupH
      const relW = l.width / groupW
      const relH = l.height / groupH
      return JSON.parse(JSON.stringify({ ...l, x: relX, y: relY, width: relW, height: relH, groupId: undefined, id: l.id, zIndex: l.zIndex }))
    })
    const vec: CustomVector = {
      id: 'vec_' + makeId(),
      name: cleanName,
      icon: '🧩',
      vectorPath: JSON.parse(JSON.stringify(children[0].vectorPath || children[0].vector || { points: [], closed: false, fillColor: '#ffffff', strokeColor: '#000000', strokeWidth: 2 })),
      createdAt: Date.now(),
      isGroup: true,
      groupLayers,
      groupWidth: groupW,
      groupHeight: groupH,
    }
    const vectors = [vec, ...get().customVectors].slice(0, 100)
    writeCustomVectors(vectors)
    set({ customVectors: vectors, errorMsg: '✅ Vetor complexo guardado!' })
  },
  removeCustomVector: (id) => {
    const vectors = get().customVectors.filter((v) => v.id !== id)
    writeCustomVectors(vectors)
    set({ customVectors: vectors })
  },
  addCustomVectorLayer: (vectorId) => {
    const vec = get().customVectors.find((v) => v.id === vectorId)
    if (!vec) return
    const s = get()
    const tpl = s.template
    const cw = tpl?.width ?? 1280
    const ch = tpl?.height ?? 720
    if ((vec as any).isGroup && (vec as any).groupLayers) {
      const gvec: any = vec
      const groupW = gvec.groupWidth || 0.4
      const groupH = gvec.groupHeight || 0.4
      const sizePx = 400
      // Calcula escala para caber no canvas mantendo proporção do grupo
      const scale = Math.min((sizePx / cw) / groupW, (sizePx / ch) / groupH, 1)
      const newGroupW = groupW * scale
      const newGroupH = groupH * scale
      const groupX = 0.5 - newGroupW / 2
      const groupY = 0.5 - newGroupH / 2
      const zIndex = Math.max(0, ...s.layers.map((l) => l.zIndex)) + 1
      const groupId = makeId()
      const groupLayer: Layer = {
        id: groupId, type: 'group', name: vec.name, visible: true, locked: false,
        zIndex, x: groupX, y: groupY, width: newGroupW, height: newGroupH,
        rotation: 0, opacity: 1,
        shadow: null, innerShadow: null, outline: null, borderRadius: 0, borderRadiusPx: 0, outlineWidthPx: 0, brightness: 1, blur: 0, contrast: 1, saturation: 1, hueRotate: 0, sepia: 0, negative: false, autoFit: true,
        source: '', preview: '',
        text: '', font: 'Arial', fontSize: 48, color: '#FFFFFF', textAlign: 'center',
        lineHeight: 1.2, letterSpacing: 0, textTransform: 'none', textGradient: null,
        fontStyle: 'normal', fontWeight: 700,
        elementContent: '', elementName: '', vector: null, vectorPath: null,
        mirrorX: false, mirrorY: false, perspectiveX: 0, perspectiveY: 0, bevel: null,
      }
      const newLayers: Layer[] = [normalizeLayer(groupLayer)]
      const sortedGroupLayers = [...gvec.groupLayers].sort((a: any, b: any) => a.zIndex - b.zIndex)
      const childIds: string[] = []
      for (const gl of sortedGroupLayers) {
        const newId = makeId()
        childIds.push(newId)
        const absX = groupX + (gl.x as number) * newGroupW
        const absY = groupY + (gl.y as number) * newGroupH
        const absW = (gl.width as number) * newGroupW
        const absH = (gl.height as number) * newGroupH
        const newLayer: Layer = {
          ...(JSON.parse(JSON.stringify(gl)) as Layer),
          id: newId,
          groupId,
          x: absX,
          y: absY,
          width: absW,
          height: absH,
          zIndex: zIndex + 1 + sortedGroupLayers.indexOf(gl),
          visible: true,
          locked: false,
        }
        newLayers.push(normalizeLayer(newLayer))
      }
      set((st) => ({
        layers: [...st.layers, ...newLayers],
        selectedLayerId: groupId,
        selectedLayerIds: [groupId, ...childIds],
        ...withHistory(st),
      }))
      return
    }
    const sizePx = 400
    const w = sizePx / cw
    const h = sizePx / ch
    const zIndex = Math.max(0, ...s.layers.map((l) => l.zIndex)) + 1
    const layer: Layer = {
      id: makeId(), type: 'vector', name: vec.name, visible: true, locked: false,
      zIndex, x: 0.5 - w / 2, y: 0.5 - h / 2, width: w, height: h,
      rotation: 0, opacity: 1,
      shadow: null, innerShadow: null, outline: null, borderRadius: 0, borderRadiusPx: 0, outlineWidthPx: 0, brightness: 1, blur: 0, contrast: 1, saturation: 1, hueRotate: 0, sepia: 0, negative: false, autoFit: true,
      source: '', preview: '',
      text: '', font: 'Arial', fontSize: 48, color: '#FFFFFF', textAlign: 'center',
      lineHeight: 1.2, letterSpacing: 0, textTransform: 'none', textGradient: null,
      fontStyle: 'normal', fontWeight: 700,
      elementContent: '', elementName: '', vector: null,
      vectorPath: JSON.parse(JSON.stringify(vec.vectorPath)),
      mirrorX: false, mirrorY: false,     perspectiveX: 0, perspectiveY: 0, bevel: null,
    }
    set((st) => ({
      layers: [...st.layers, normalizeLayer(layer)],
      selectedLayerId: layer.id,
      selectedLayerIds: [layer.id],
      ...withHistory(st),
    }))
  },
  loadPresetPreviews: async () => {
    const presets = get().customPresets
    const updated = await Promise.all(
      presets.map(async (p) => {
        if (p.preview) return p // already loaded or has inline data
        const url = await readPreviewFile(p.id)
        return url ? { ...p, preview: url } : p
      })
    )
    set({ customPresets: updated })
  },

  loadPreset: async (presetId) => {
    const preset = TEMPLATE_PRESETS.find((p) => p.id === presetId)
    const customPreset = get().customPresets.find((p) => p.id === presetId)
    if (!preset && !customPreset) return
    const template = customPreset?.template || TEMPLATES.find((t) => t.id === preset!.templateId)
    if (!template) return
    const rawLayers = customPreset?.layers || preset!.getLayers()
    // Ensure background layers are always at the bottom (first in array = lowest zIndex)
    const bgLayers = rawLayers.filter((l: any) => l.isBackground === true)
    const contentLayers = rawLayers.filter((l: any) => l.isBackground !== true)
    const sortedRaw = [...bgLayers, ...contentLayers]
    const idMap = new Map<string, string>()
    const layers: Layer[] = sortedRaw.map((l, i) => {
      const newId = makeId()
      idMap.set((l as any).id || `old_${i}`, newId)
      const layer = sanitizeLayer(l as Record<string, unknown>, i)
      // Object URLs are session-only: a blob: originalPreview persisted in a preset
      // is dead on load, so fall back to `preview` (data URL or re-hydrated below).
      const originalPreview = layer.originalPreview?.startsWith('blob:') ? undefined : layer.originalPreview
      return normalizeLayer({ ...layer, id: newId, zIndex: i, originalPreview })
    })
    for (const l of layers) {
      if (l.mask?.sourceId) {
        l.mask = { ...l.mask, sourceId: idMap.get(l.mask.sourceId) || l.mask.sourceId }
      }
      if (l.masks) {
        l.masks = l.masks.map(m => ({ ...m, sourceId: idMap.get(m.sourceId) || m.sourceId }))
      }
      if (l.groupId) {
        l.groupId = idMap.get(l.groupId) || l.groupId
      }
      if (l.parentId) {
        l.parentId = idMap.get(l.parentId) || l.parentId
      }
      if (l.sourceId) {
        l.sourceId = idMap.get(l.sourceId) || l.sourceId
      }
    }
    const migratedLayers = demigrateMasks(layers)
    const background = sanitizeBackground(customPreset?.background || preset!.background)
    set({
      template: { ...template },
      background: { ...background },
      layers: migratedLayers,
      selectedLayerId: migratedLayers.length > 0 ? migratedLayers[migratedLayers.length - 1].id : null,
      selectedLayerIds: migratedLayers.length > 0 ? [migratedLayers[migratedLayers.length - 1].id] : [],
      canvasScale: 1,
      selectedResolution: null,
      projectFilePath: null,
      undoStack: [],
      redoStack: [],
      globalEffects: customPreset?.globalEffects || { brightness: 1, contrast: 1, saturation: 1, blur: 0, sepia: 0, hueRotate: 0 },
    })
    try {
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const hydrated = await Promise.all(migratedLayers.map(async (layer) => {
        if (layer.type !== 'image') return layer
        let nextPreview = layer.preview
        let nextOriginal = layer.originalPreview
        if (!nextPreview && layer.source) {
          try {
            const data = await readFile(layer.source)
            nextPreview = URL.createObjectURL(new Blob([data]))
          } catch {}
        }
        // re-hydrate originalPreview when crop exists — keeps "abrir projeto" aligned with salvar
        if (layer.crop && !nextOriginal) {
          if (nextPreview) nextOriginal = nextPreview
          else if (layer.source) {
            try {
              const data = await readFile(layer.source)
              nextOriginal = URL.createObjectURL(new Blob([data]))
            } catch {}
          }
        }
        if (nextPreview !== layer.preview || nextOriginal !== layer.originalPreview) return { ...layer, preview: nextPreview || '', originalPreview: nextOriginal }
        return layer
      }))
      const currentBg = get().background
      let nextBg = currentBg
      if (currentBg.type === 'image' && currentBg.imagePath && !currentBg.imagePreview) {
        try {
          const data = await readFile(currentBg.imagePath)
          nextBg = { ...currentBg, imagePreview: URL.createObjectURL(new Blob([data])) }
        } catch {}
      }
        set({ layers: hydrated, background: nextBg })
        if (nextBg.type === 'image' && nextBg.imagePreview) {
          const existingBg = get().layers.find((l) => l.isBackground)
          if (!existingBg) {
            set({ layers: [makeBackgroundLayer(nextBg, nextBg.imagePath, nextBg.imagePreview), ...get().layers] })
          }
        }
    } catch {}
  },

  exportTemplateToFile: async (name?: string | null, category?: string | null) => {
    try {
      const state = get()
      if (!state.template) return
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')
      let preview = ''
      try {
        const { toPng } = await import('html-to-image')
        const el = document.getElementById('canvas-export-target')
        if (el) {
          await waitForImagesLoaded(el)
          const pngDataUrl = await toPng(el as HTMLElement, {
            width: state.template.width,
            height: state.template.height,
            canvasWidth: state.template.width,
            canvasHeight: state.template.height,
            pixelRatio: 1,
          })
          // Convert PNG → JPEG for a smaller embedded preview
          if (pngDataUrl) {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const el = new Image()
              el.onload = () => resolve(el)
              el.onerror = () => reject(new Error('preview load'))
              el.src = pngDataUrl
            })
            const canvas = document.createElement('canvas')
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            canvas.getContext('2d')!.drawImage(img, 0, 0)
            preview = await new Promise<string>((resolve) => canvas.toBlob((b) => {
              if (b) {
                const reader = new FileReader()
                reader.onload = () => resolve(reader.result as string)
                reader.readAsDataURL(b)
              } else resolve(pngDataUrl)
            }, 'image/jpeg', 0.85) ?? pngDataUrl)
          }
        }
      } catch {}
      const idMap = new Map<string, string>()
      const cleanLayers = state.layers
        .filter((l) => !l.isBackground)
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((l) => {
          const newId = 'layer_' + Math.random().toString(36).slice(2, 10)
          idMap.set(l.id, newId)
          return { ...l, id: newId }
        })
        .map((l) => ({
          ...l,
          source: l.source || '',
          preview: l.preview?.startsWith('data:') ? l.preview : '',
          mask: l.mask ? { ...l.mask, sourceId: idMap.get(l.mask.sourceId) || l.mask.sourceId } : null,
          masks: l.masks ? l.masks.map(m => ({ ...m, sourceId: idMap.get(m.sourceId) || m.sourceId })) : undefined,
          groupId: l.groupId ? (idMap.get(l.groupId) || l.groupId) : undefined,
          parentId: l.parentId ? (idMap.get(l.parentId) || l.parentId) : undefined,
          sourceId: l.sourceId ? (idMap.get(l.sourceId) || l.sourceId) : undefined,
        }))
      const groupLayers = state.layers.filter((l) => l.type === 'group' && !l.isBackground)
      const cleanGroups = groupLayers.map((g) => {
        const newId = idMap.get(g.id) || g.id
        return { ...g, id: newId }
      })
      // Embed layer images as data: URLs so the template works standalone — aligned with salvar projeto (preview + originalPreview for crops)
      const embedImageDataUrl = async (sourcePath: string): Promise<string> => {
        if (!sourcePath) return ''
        try {
          const { readFile } = await import('@tauri-apps/plugin-fs')
          const data = await readFile(sourcePath)
          const blob = new Blob([data])
          const url = URL.createObjectURL(blob)
          const dataUrl = await new Promise<string>((resolve) => {
            const img = new Image()
            img.onload = () => {
              const canvas = document.createElement('canvas')
              canvas.width = img.naturalWidth
              canvas.height = img.naturalHeight
              canvas.getContext('2d')?.drawImage(img, 0, 0)
              try { resolve(canvas.toDataURL()) } catch { resolve('') }
            }
            img.onerror = () => resolve('')
            img.src = url
          })
          URL.revokeObjectURL(url)
          return dataUrl
        } catch { return '' }
      }
      const allCleanLayers = await Promise.all(
        [...cleanGroups, ...cleanLayers].map(async (l) => {
          if (l.type !== 'image') {
            // strip blob originalPreview for non-image layers
            if ((l as any).originalPreview?.startsWith?.('blob:')) return { ...l, originalPreview: undefined }
            return l
          }
          const previewData = l.preview?.startsWith('data:') ? l.preview : (l.source ? await embedImageDataUrl(l.source) : '')
          let originalData: string | undefined = undefined
          if (l.crop) {
            if (l.originalPreview?.startsWith('data:')) originalData = l.originalPreview
            else if (l.originalPreview?.startsWith('blob:') || !l.originalPreview) originalData = previewData || (l.source ? await embedImageDataUrl(l.source) : undefined)
            else originalData = l.originalPreview
          } else {
            // no crop -> no need for originalPreview; strip blob
            originalData = l.originalPreview?.startsWith('blob:') ? undefined : l.originalPreview
          }
          const next: any = { ...l }
          if (previewData) next.preview = previewData
          else if (!l.preview?.startsWith('data:')) next.preview = ''
          if (originalData !== undefined) next.originalPreview = originalData
          else if (next.originalPreview?.startsWith('blob:')) next.originalPreview = undefined
          return next as Layer
        })
      )
      // Embed background imagePreview as data: so the template works standalone.
      const embedBgImagePreview = async (): Promise<string> => {
        const bg = state.background
        if (bg.imagePreview && bg.imagePreview.startsWith('data:')) return bg.imagePreview
        if (bg.type === 'image' && bg.imagePath) {
          try {
            const { readFile } = await import('@tauri-apps/plugin-fs')
            const data = await readFile(bg.imagePath)
            const blob = new Blob([data])
            const url = URL.createObjectURL(blob)
            const dataUrl = await new Promise<string>((resolve) => {
              const img = new Image()
              img.onload = () => {
                const canvas = document.createElement('canvas')
                canvas.width = img.naturalWidth
                canvas.height = img.naturalHeight
                canvas.getContext('2d')?.drawImage(img, 0, 0)
                try { resolve(canvas.toDataURL()) } catch { resolve('') }
              }
              img.onerror = () => resolve('')
              img.src = url
            })
            URL.revokeObjectURL(url)
            return dataUrl
          } catch { return '' }
        }
        return ''
      }
      const bgImagePreview = await embedBgImagePreview()
      const data = JSON.stringify({
        type: 'template',
        version: 2,
        name: name?.trim() || state.template.name,
        category: category?.trim() || 'Geral',
        icon: '⭐',
        preview,
        template: state.template,
        background: { ...state.background, imagePreview: bgImagePreview },
        layers: allCleanLayers,
        globalEffects: state.globalEffects,
      }, null, 2)
      const path = await save({
        filters: [{ name: 'Template Thumbnail', extensions: ['json'] }],
        defaultPath: `${state.template.name}.json`,
      })
      if (path) {
        await writeTextFile(path, data)
        set({ errorMsg: t('success.exported') })
      }
    } catch (e) {
      set({ errorMsg: t('error.exportTemplate', { msg: String(e) }) })
    }
  },

  batchImportTemplates: async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      const result = await open({
        filters: [{ name: 'Projetos/Templates', extensions: ['json', 'lovd'] }],
        multiple: true,
      })
      if (!result) return
      const filePaths = typeof result === 'string' ? [result] : result
      if (filePaths.length === 0) return
      const imported: CustomTemplatePreset[] = []
      let errors = 0
      for (const filePath of filePaths) {
        try {
          const raw = await readTextFile(filePath)
          const data = JSON.parse(raw)
          if (!data || !data.template || !data.layers || !Array.isArray(data.layers)) {
            errors++
            continue
          }
          if (typeof data.template.width !== 'number' || typeof data.template.height !== 'number') {
            errors++
            continue
          }
          const layers = data.layers.map((l: Record<string, unknown>, i: number) => sanitizeLayer(l, i))
          const name = data.name || data.template.name || 'Template'
          const category = data.category || 'Importado'
          imported.push({
            id: 'custom_' + makeId(),
            name,
            category,
            icon: data.icon || '📂',
            template: data.template,
            theme: data.theme || 'Importado',
            background: sanitizeBackground(data.background),
            layers,
            createdAt: Date.now(),
            preview: typeof data.preview === 'string' && data.preview.startsWith('data:') ? data.preview : '',
            globalEffects: data.globalEffects,
          })
        } catch {
          errors++
        }
      }
      if (imported.length === 0) {
        set({ errorMsg: `Nenhum template valido encontrado${errors > 0 ? ` (${errors} erro(s))` : ''}.` })
        return
      }
      const { readFile } = await import('@tauri-apps/plugin-fs')
      for (let pi = 0; pi < imported.length; pi++) {
        const preset = imported[pi]
        if (preset.preview) continue
        try {
          const state = get()
          const savedTemplate = state.template
          const savedLayers = state.layers
          const savedBg = state.background
          const hydrated = await Promise.all(preset.layers.map(async (l) => {
            if (l.type !== 'image') return l
            let nextPreview = l.preview
            let nextOriginal = l.originalPreview
            if (!nextPreview && l.source) {
              try {
                const buf = await readFile(l.source)
                nextPreview = URL.createObjectURL(new Blob([buf]))
              } catch {}
            }
            if (l.crop && !nextOriginal) nextOriginal = nextPreview
            if (nextPreview !== l.preview || nextOriginal !== l.originalPreview) return { ...l, preview: nextPreview || '', originalPreview: nextOriginal }
            return l
          }))
          // Load background image
          let bg = preset.background
          let bgLayers: Layer[] = []
          if (bg.type === 'image' && bg.imagePath) {
            if (bg.imagePreview) {
              // Already has preview (data URL from export) — create layer automatically
              bgLayers = [makeBackgroundLayer(bg, bg.imagePath, bg.imagePreview)]
            } else {
              try {
                const buf = await readFile(bg.imagePath)
                const preview = URL.createObjectURL(new Blob([buf]))
                bg = { ...bg, imagePreview: preview }
                bgLayers = [makeBackgroundLayer(bg, bg.imagePath, preview)]
              } catch {}
            }
          }
          const allLayers = [...bgLayers, ...hydrated]
          const idMap = new Map<string, string>()
          const remappedLayers = allLayers.map((l, i) => {
            const oldId = l.id
            const newId = makeId()
            idMap.set(oldId, newId)
            return { ...l, id: newId, zIndex: i }
          })
          for (const l of remappedLayers) {
            if (l.mask?.sourceId) {
              l.mask = { ...l.mask, sourceId: idMap.get(l.mask.sourceId) || l.mask.sourceId }
            }
            if (l.masks) {
              l.masks = l.masks.map(m => ({ ...m, sourceId: idMap.get(m.sourceId) || m.sourceId }))
            }
            if (l.groupId) {
              l.groupId = idMap.get(l.groupId) || l.groupId
            }
            if (l.parentId) {
              l.parentId = idMap.get(l.parentId) || l.parentId
            }
            if (l.sourceId) {
              l.sourceId = idMap.get(l.sourceId) || l.sourceId
            }
          }
          // Write hydrated layers back to the imported preset BEFORE saving
          imported[pi] = { ...preset, layers: remappedLayers, background: bg }
          set({ template: preset.template, layers: remappedLayers, background: bg, globalEffects: preset.globalEffects || { brightness: 1, contrast: 1, saturation: 1, blur: 0, sepia: 0, hueRotate: 0 } })
          // Wait for React to flush the DOM with the imported state
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          const { toPng } = await import('html-to-image')
          const el = document.getElementById('canvas-export-target')
          if (el) {
            await waitForImagesLoaded(el)
            try {
              const pngDataUrl = await toPng(el as HTMLElement, {
                width: preset.template.width,
                height: preset.template.height,
                canvasWidth: preset.template.width,
                canvasHeight: preset.template.height,
                pixelRatio: 1,
              })
              if (pngDataUrl) {
                const jpgUrl = await writePreviewFile(imported[pi].id, pngDataUrl)
                imported[pi].preview = jpgUrl || pngDataUrl
              }
            } catch {
              try {
                const pngDataUrl = await toPng(el as HTMLElement, {
                  width: preset.template.width,
                  height: preset.template.height,
                  canvasWidth: preset.template.width,
                  canvasHeight: preset.template.height,
                  pixelRatio: 1,
                })
                if (pngDataUrl) {
                  const jpgUrl = await writePreviewFile(imported[pi].id, pngDataUrl)
                  imported[pi].preview = jpgUrl || pngDataUrl
                }
              } catch {}
            }
          }
          set({ template: savedTemplate, layers: savedLayers, background: savedBg })
        } catch {}
      }
      const currentPresets = get().customPresets
      const customPresets = [...imported, ...currentPresets].slice(0, 60)
      writeCustomPresets(customPresets)
      set({ customPresets, errorMsg: t('success.imported', { n: imported.length, errors: errors > 0 ? ` (${errors} ${t('error.unit')})` : '' }) })
    } catch (e) {
      set({ errorMsg: t('error.importTemplates', { msg: String(e) }) })
    }
  },

  batchImportFolder: async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const fs = await import('@tauri-apps/plugin-fs')
      const result = await open({ directory: true, multiple: false })
      if (!result) return
      const folderPath = typeof result === 'string' ? result : result[0]
      if (!folderPath) return
      const jsonFiles: string[] = []
      const walkDir = async (dir: string) => {
        const entries = await fs.readDir(dir)
        for (const entry of entries) {
          const fullPath = dir + '\\' + entry.name
          if (entry.isDirectory) await walkDir(fullPath)
          else if (entry.isFile && (entry.name.toLowerCase().endsWith('.json') || entry.name.toLowerCase().endsWith('.lovd'))) jsonFiles.push(fullPath)
        }
      }
      await walkDir(folderPath)
      if (jsonFiles.length === 0) {
        set({ errorMsg: t('error.noJsonFiles') })
        return
      }
      const imported: CustomTemplatePreset[] = []
      let errors = 0
      for (const filePath of jsonFiles) {
        try {
          const raw = await fs.readTextFile(filePath)
          const data = JSON.parse(raw)
          if (!data || !data.template || !data.layers || !Array.isArray(data.layers)) { errors++; continue }
          if (typeof data.template.width !== 'number' || typeof data.template.height !== 'number') { errors++; continue }
          const layers = data.layers.map((l: Record<string, unknown>, i: number) => sanitizeLayer(l, i))
          const name = data.name || data.template.name || 'Template'
          imported.push({
            id: 'custom_' + makeId(), name, category: data.category || 'Importado',
            icon: data.icon || '📂', template: data.template, theme: data.theme || 'Importado',
            background: sanitizeBackground(data.background),
            layers, createdAt: Date.now(),
            preview: typeof data.preview === 'string' && data.preview.startsWith('data:') ? data.preview : '',
          })
        } catch { errors++ }
      }
      if (imported.length === 0) {
        set({ errorMsg: `Nenhum template valido encontrado${errors > 0 ? ` (${errors} erro(s))` : ''}.` })
        return
      }
      for (let pi = 0; pi < imported.length; pi++) {
        const preset = imported[pi]
        if (preset.preview) continue
        try {
          const state = get()
          const savedTemplate = state.template
          const savedLayers = state.layers
          const savedBg = state.background
          const hydrated = await Promise.all(preset.layers.map(async (l) => {
            if (l.type !== 'image') return l
            let nextPreview = l.preview
            let nextOriginal = l.originalPreview
            if (!nextPreview && l.source) {
              try {
                const buf = await fs.readFile(l.source)
                nextPreview = URL.createObjectURL(new Blob([buf]))
              } catch {}
            }
            if (l.crop && !nextOriginal) nextOriginal = nextPreview
            if (nextPreview !== l.preview || nextOriginal !== l.originalPreview) return { ...l, preview: nextPreview || '', originalPreview: nextOriginal }
            return l
          }))
          // Load background image
          let bg = preset.background
          let bgLayers: Layer[] = []
          if (bg.type === 'image' && bg.imagePath) {
            if (bg.imagePreview) {
              bgLayers = [makeBackgroundLayer(bg, bg.imagePath, bg.imagePreview)]
            } else {
              try {
                const buf = await fs.readFile(bg.imagePath)
                const preview = URL.createObjectURL(new Blob([buf]))
                bg = { ...bg, imagePreview: preview }
                bgLayers = [makeBackgroundLayer(bg, bg.imagePath, preview)]
              } catch {}
            }
          }
          const allLayers = [...bgLayers, ...hydrated]
          const idMap = new Map<string, string>()
          const remappedLayers = allLayers.map((l, i) => {
            const oldId = l.id
            const newId = makeId()
            idMap.set(oldId, newId)
            return { ...l, id: newId, zIndex: i }
          })
          for (const l of remappedLayers) {
            if (l.mask?.sourceId) {
              l.mask = { ...l.mask, sourceId: idMap.get(l.mask.sourceId) || l.mask.sourceId }
            }
            if (l.masks) {
              l.masks = l.masks.map(m => ({ ...m, sourceId: idMap.get(m.sourceId) || m.sourceId }))
            }
            if (l.groupId) {
              l.groupId = idMap.get(l.groupId) || l.groupId
            }
            if (l.parentId) {
              l.parentId = idMap.get(l.parentId) || l.parentId
            }
            if (l.sourceId) {
              l.sourceId = idMap.get(l.sourceId) || l.sourceId
            }
          }
          // Write hydrated layers back to the imported preset BEFORE saving
          imported[pi] = { ...preset, layers: remappedLayers, background: bg }
          set({ template: preset.template, layers: remappedLayers, background: bg, globalEffects: preset.globalEffects || { brightness: 1, contrast: 1, saturation: 1, blur: 0, sepia: 0, hueRotate: 0 } })
          // Wait for React to flush the DOM with the imported state
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          const { toPng } = await import('html-to-image')
          const el = document.getElementById('canvas-export-target')
          if (el) {
            await waitForImagesLoaded(el)
            try {
              const pngDataUrl = await toPng(el as HTMLElement, {
                width: preset.template.width,
                height: preset.template.height,
                canvasWidth: preset.template.width,
                canvasHeight: preset.template.height,
                pixelRatio: 1,
              })
              if (pngDataUrl) {
                const jpgUrl = await writePreviewFile(imported[pi].id, pngDataUrl)
                imported[pi].preview = jpgUrl || pngDataUrl
              }
            } catch {
              try {
                const pngDataUrl = await toPng(el as HTMLElement, {
                  width: preset.template.width,
                  height: preset.template.height,
                  canvasWidth: preset.template.width,
                  canvasHeight: preset.template.height,
                  pixelRatio: 1,
                })
                if (pngDataUrl) {
                  const jpgUrl = await writePreviewFile(imported[pi].id, pngDataUrl)
                  imported[pi].preview = jpgUrl || pngDataUrl
                }
              } catch {}
            }
          }
          set({ template: savedTemplate, layers: savedLayers, background: savedBg })
        } catch {}
      }
      const currentPresets = get().customPresets
      const customPresets = [...imported, ...currentPresets].slice(0, 60)
      writeCustomPresets(customPresets)
      set({ customPresets, errorMsg: t('success.importedFolder', { n: imported.length, errors: errors > 0 ? ` (${errors} ${t('error.unit')})` : '' }) })
    } catch (e) {
      set({ errorMsg: t('error.importFolder', { msg: String(e) }) })
    }
  },

  newProject: () => {
    set({
      template: null,
      selectedResolution: null,
      layers: [],
      selectedLayerId: null,
      selectedLayerIds: [],
      background: { ...DEFAULT_BG },
      canvasScale: 1,
      projectFilePath: null,
      undoStack: [],
      redoStack: [],
      globalEffects: { brightness: 1, contrast: 1, saturation: 1, blur: 0, sepia: 0, hueRotate: 0 },
    })
    get().markSaved()
  },

  saveProject: async () => {
    try {
      const state = get()
      if (!state.licenseValid) {
        set({ errorMsg: t('error.activateToSaveProjects', { n: 5 - state.exportCount }) })
        return
      }
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')
      // Embed each image layer as data URL so the project survives file moves — aligned with salvar template (preview + originalPreview + crop)
      const makeDataUrlFromSource = async (sourcePath: string): Promise<string> => {
        if (!sourcePath) return ''
        const blobUrl = await readFileAsBlobUrl(sourcePath)
        if (!blobUrl) return ''
        try {
          const resp = await fetch(blobUrl)
          const blob = await resp.blob()
          const reader = new FileReader()
          return await new Promise<string>((resolve) => {
            reader.onload = () => { URL.revokeObjectURL(blobUrl); resolve(reader.result as string) }
            reader.onerror = () => { URL.revokeObjectURL(blobUrl); resolve('') }
            reader.readAsDataURL(blob)
          })
        } catch { URL.revokeObjectURL(blobUrl); return '' }
      }
      const makePreviewDataUrl = async (layer: Layer): Promise<string> => {
        if (layer.type !== 'image') return ''
        if (layer.preview?.startsWith('data:')) return layer.preview
        const fromSource = layer.source ? await makeDataUrlFromSource(layer.source) : ''
        if (fromSource) return fromSource
        // fallback: keep existing data preview if source missing (avoids losing crop)
        if (layer.preview?.startsWith('data:')) return layer.preview
        return ''
      }
      const embeddedLayers = await Promise.all(
        state.layers.filter((l) => !l.isBackground).sort((a, b) => a.zIndex - b.zIndex).map(async (l) => {
          if (l.type !== 'image') return { ...l, preview: '' }
          const previewData = await makePreviewDataUrl(l)
          let originalData: string | undefined = undefined
          if (l.crop) {
            if (l.originalPreview?.startsWith('data:')) originalData = l.originalPreview
            else if (l.originalPreview?.startsWith('blob:') || !l.originalPreview) originalData = previewData || (l.source ? await makeDataUrlFromSource(l.source) : undefined)
            else originalData = l.originalPreview
          } else {
            originalData = l.originalPreview?.startsWith('blob:') ? undefined : l.originalPreview
          }
          const next: any = { ...l, preview: previewData }
          if (originalData !== undefined) next.originalPreview = originalData
          else if (next.originalPreview?.startsWith('blob:')) next.originalPreview = undefined
          return next as Layer
        })
      )
      let embeddedBgPreview = ''
      if (state.background.type === 'image' && state.background.imagePath) {
        const blobUrl = await readFileAsBlobUrl(state.background.imagePath)
        if (blobUrl) {
          try {
            const resp = await fetch(blobUrl)
            const blob = await resp.blob()
            const reader = new FileReader()
            embeddedBgPreview = await new Promise<string>((resolve) => {
              reader.onload = () => { URL.revokeObjectURL(blobUrl); resolve(reader.result as string) }
              reader.onerror = () => { URL.revokeObjectURL(blobUrl); resolve('') }
              reader.readAsDataURL(blob)
            })
          } catch { URL.revokeObjectURL(blobUrl) }
        }
      }
      const data = JSON.stringify({
        version: 3,
        template: state.template,
        background: { ...state.background, imagePreview: embeddedBgPreview || state.background.imagePreview },
        layers: demigrateMasks(embeddedLayers),
        globalEffects: state.globalEffects,
      }, null, 2)
      if (state.projectFilePath) {
        await writeTextFile(state.projectFilePath, data)
        set({ errorMsg: t('success.projectSaved') })
        get().markSaved()
      } else {
        const path = await save({
          filters: [{ name: 'Projeto Lovert Design', extensions: ['lovd', 'json'] }],
          defaultPath: state.template ? `${sanitize(state.template.name)}_${dateStr()}.lovd` : `Design_${dateStr()}.lovd`,
        })
        if (path) {
          await writeTextFile(path, data)
          set({ projectFilePath: path, errorMsg: '✅ Projeto guardado!' })
          get().markSaved()
        }
      }
    } catch (e) {
      set({ errorMsg: t('error.saveProject', { msg: String(e) }) })
    }
  },

  loadProject: async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const { readTextFile, readFile } = await import('@tauri-apps/plugin-fs')
      const path = await open({
        filters: [{ name: 'Projeto Lovert Design', extensions: ['lovd', 'json'] }],
        multiple: false,
      })
      if (!path) return
      const raw = await readTextFile(path as string)
      const data = JSON.parse(raw)
      if (!data.version || !data.template || !data.layers) {
        set({ errorMsg: t('error.invalidProject') })
        return
      }
      const projectDir = (path as string).substring(0, (path as string).lastIndexOf('\\') + 1)
      const layers: Layer[] = demigrateMasks(data.layers.map((l: Record<string, unknown>, i: number) => {
        const layer = sanitizeLayer(l, i)
        let source = layer.source || ''
        if (source.startsWith('./')) source = projectDir + source.substring(2)
        // Object URLs are session-only: a blob: originalPreview saved to disk is dead
        // on reload, so fall back to `preview` (data URL or freshly re-hydrated).
        const originalPreview = layer.originalPreview?.startsWith('blob:') ? undefined : layer.originalPreview
        // Keep data URL previews if present (embedding in saveProject)
        return normalizeLayer({ ...layer, source, originalPreview, preview: layer.preview || '' })
      }))
      const bg = sanitizeBackground(data.background)
      set({
        template: data.template,
        background: bg,
        layers,
        selectedLayerId: null,
        selectedLayerIds: [],
        canvasScale: 1,
        projectFilePath: path as string,
        undoStack: [],
        redoStack: [],
        globalEffects: data.globalEffects || { brightness: 1, contrast: 1, saturation: 1, blur: 0, sepia: 0, hueRotate: 0 },
      })
      try {
        const hydrated = await Promise.all(layers.map(async (layer) => {
          if (layer.type !== 'image') return layer
          let nextPreview = layer.preview
          let nextOriginal = layer.originalPreview
          if (!nextPreview && layer.source) {
            try {
              const fileData = await readFile(layer.source)
              nextPreview = URL.createObjectURL(new Blob([fileData]))
            } catch {}
          }
          if (layer.crop && !nextOriginal) {
            if (nextPreview) nextOriginal = nextPreview
            else if (layer.source) {
              try {
                const fileData = await readFile(layer.source)
                nextOriginal = URL.createObjectURL(new Blob([fileData]))
              } catch {}
            }
          }
          if (nextPreview !== layer.preview || nextOriginal !== layer.originalPreview) return { ...layer, preview: nextPreview || '', originalPreview: nextOriginal }
          return layer
        }))
        let nextBg = get().background
        if (nextBg.type === 'image' && nextBg.imagePath && !nextBg.imagePreview) {
          try {
            const fileData = await readFile(nextBg.imagePath)
            nextBg = { ...nextBg, imagePreview: URL.createObjectURL(new Blob([fileData])) }
          } catch {}
        }
        set({ layers: hydrated, background: nextBg })
        if (nextBg.type === 'image' && nextBg.imagePreview) {
          const existingBg = get().layers.find((l) => l.isBackground)
          if (!existingBg) {
            set({ layers: [makeBackgroundLayer(nextBg, nextBg.imagePath, nextBg.imagePreview), ...get().layers] })
          }
        }
      } catch {}
      get().markSaved()
      set({ errorMsg: t('success.projectLoaded') })
    } catch (e) {
      set({ errorMsg: t('error.openProject', { msg: String(e) }) })
    }
  },

  loadProjectFromFile: async (filePath: string) => {
    set({ loadingProject: true })
    try {
      const { readTextFile, readFile } = await import('@tauri-apps/plugin-fs')
      const raw = await readTextFile(filePath)
      const data = JSON.parse(raw)
      if (!data.version || !data.template || !data.layers) {
        set({ errorMsg: t('error.invalidProject') })
        return
      }
      const projectDir = filePath.substring(0, filePath.lastIndexOf('\\') + 1)
      const layers: Layer[] = demigrateMasks(data.layers.map((l: Record<string, unknown>, i: number) => {
        const layer = sanitizeLayer(l, i)
        let source = layer.source || ''
        if (source.startsWith('./')) source = projectDir + source.substring(2)
        // Object URLs are session-only: a blob: originalPreview saved to disk is dead
        // on reload, so fall back to `preview` (data URL or freshly re-hydrated).
        const originalPreview = layer.originalPreview?.startsWith('blob:') ? undefined : layer.originalPreview
        return normalizeLayer({ ...layer, source, originalPreview, preview: layer.preview || '' })
      }))
      const bg = sanitizeBackground(data.background)
      set({
        template: data.template,
        background: bg,
        layers,
        selectedLayerId: null,
        selectedLayerIds: [],
        canvasScale: 1,
        projectFilePath: filePath,
        undoStack: [],
        redoStack: [],
        globalEffects: data.globalEffects || { brightness: 1, contrast: 1, saturation: 1, blur: 0, sepia: 0, hueRotate: 0 },
      })
      try {
        const hydrated = await Promise.all(layers.map(async (layer) => {
          if (layer.type !== 'image') return layer
          let nextPreview = layer.preview
          let nextOriginal = layer.originalPreview
          if (!nextPreview && layer.source) {
            try {
              const fileData = await readFile(layer.source)
              nextPreview = URL.createObjectURL(new Blob([fileData]))
            } catch {}
          }
          if (layer.crop && !nextOriginal) {
            if (nextPreview) nextOriginal = nextPreview
            else if (layer.source) {
              try {
                const fileData = await readFile(layer.source)
                nextOriginal = URL.createObjectURL(new Blob([fileData]))
              } catch {}
            }
          }
          if (nextPreview !== layer.preview || nextOriginal !== layer.originalPreview) return { ...layer, preview: nextPreview || '', originalPreview: nextOriginal }
          return layer
        }))
        let nextBg = get().background
        if (nextBg.type === 'image' && nextBg.imagePath && !nextBg.imagePreview) {
          try {
            const fileData = await readFile(nextBg.imagePath)
            nextBg = { ...nextBg, imagePreview: URL.createObjectURL(new Blob([fileData])) }
          } catch {}
        }
        set({ layers: hydrated, background: nextBg })
        if (nextBg.type === 'image' && nextBg.imagePreview) {
          const existingBg = get().layers.find((l) => l.isBackground)
          if (!existingBg) {
            set({ layers: [makeBackgroundLayer(nextBg, nextBg.imagePath, nextBg.imagePreview), ...get().layers] })
          }
        }
      } catch {}
      get().markSaved()
    } catch (e) {
      set({ errorMsg: t('error.openProject', { msg: String(e) }) })
    } finally {
      set({ loadingProject: false })
    }
  },
}))
