import React, { useRef, useCallback, useState, useEffect, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store'
import type { Layer } from '@/types'
import { t } from '@/i18n'
import { getCompositeMaskDataUrl, getMaskCss, canBeMaskSource, projectLayerCorners, isExtremeTilt, type MaskDrawDef } from '@/mask'
import { cropBackgroundCss } from '@/cropCss'
import { computeWrappedTextHeight } from '@/store'
import { closeOpenColorPopups } from '@/colorPopup'
import { ColorPalette } from './ColorPalette'
import {
  splitRuns, serializeRichElement, setRichEditorContent, applyRichColorToSelection,
  getEditorSelectionOffsets, placeCaretAtEnd,
} from '@/richText'

function colorWithIntensity(color: string, intensity: number): string {
  const i = Math.max(0, Math.min(1, intensity ?? 0.6))
  if (i >= 0.99) return color
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    let r=0,g=0,b=0
    if (hex.length===3) { r=parseInt(hex[0]+hex[0],16); g=parseInt(hex[1]+hex[1],16); b=parseInt(hex[2]+hex[2],16) }
    else if (hex.length>=6) { r=parseInt(hex.slice(0,2),16); g=parseInt(hex.slice(2,4),16); b=parseInt(hex.slice(4,6),16) }
    else return color
    return `rgba(${r},${g},${b},${i})`
  }
  if (color.startsWith('rgba')) {
    return color.replace(/rgba\(([^)]+)\)/, (_, inner)=>{
      const parts=inner.split(',').map((s:string)=>s.trim())
      const a= parseFloat(parts[3]||'1')*i
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${a})`
    })
  }
  if (color.startsWith('rgb')) {
    return color.replace(/rgb\(([^)]+)\)/, (_, inner)=>{
      const parts=inner.split(',').map((s:string)=>s.trim())
      return `rgba(${parts[0]},${parts[1]},${parts[2]},${i})`
    })
  }
  return color
}
function loadImagePromise(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(img)
    img.src = src
  })
}

/** Compute the SINGLE composite mask for a layer.
 *  Masks are the legacy `masks[]/mask` property on the layer. They are
 *  rasterised onto ONE canvas in a deterministic order — no more CSS
 *  mask-composite or async ordering bugs. */
function useCompositeMaskDataUrl(layer: Layer, layers: Layer[], cw: number, ch: number, isInteracting?: boolean, canvasScale?: number): string | null {
  const defs: MaskDrawDef[] = []
  const legacy = layer.masks ?? (layer.mask ? [layer.mask] : [])
  for (const m of legacy) {
    if (m?.sourceId) defs.push({ sourceId: m.sourceId, mode: m.mode })
  }

  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (isInteracting) return
    if (defs.length === 0 || cw < 1 || ch < 1) {
      setDataUrl(null)
      return
    }
    const resolvable = defs
      .map((d) => ({ d, src: layers.find((s) => s.id === d.sourceId) }))
      .filter((x): x is { d: MaskDrawDef; src: Layer } => !!x.src && canBeMaskSource(x.src))
    if (resolvable.length === 0) {
      setDataUrl(null)
      return
    }
    const imageUrls = resolvable
      .filter((x) => x.src.type === 'image' && (x.src.originalPreview || x.src.preview))
      .map((x) => x.src.originalPreview ?? x.src.preview)

    let cancelled = false
    ;(async () => {
      const imgs = await Promise.all(imageUrls.map((url) => loadImagePromise(url)))
      if (cancelled) return
      const map = new Map<string, HTMLImageElement>()
      imageUrls.forEach((url, i) => map.set(url, imgs[i]))
      const url = getCompositeMaskDataUrl(layer, defs, layers, cw, ch, map)
      if (!cancelled) setDataUrl(url)
    })()
    return () => { cancelled = true }
  }, [layer.id, layer.x, layer.y, layer.width, layer.height, layer.rotation, cw, ch, layers, defs.length, defs.map((d) => d.sourceId + d.mode).join(','), isInteracting, canvasScale])

  return dataUrl
}

const RESIZE_SENS = 1
const MIN_LAYER_SIZE = 0.02

function rotatePoint(x: number, y: number, cosA: number, sinA: number) {
  return { x: x * cosA - y * sinA, y: x * sinA + y * cosA }
}

function colorToTransparent(color: string): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16); const g = parseInt(hex[1] + hex[1], 16); const b = parseInt(hex[2] + hex[2], 16)
      return `rgba(${r},${g},${b},0)`
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0,2),16); const g = parseInt(hex.slice(2,4),16); const b = parseInt(hex.slice(4,6),16)
      return `rgba(${r},${g},${b},0)`
    }
  }
  if (color.startsWith('rgb')) {
    return color.replace(/rgba?\(([^)]+)\)/, (_, inner) => {
      const parts = inner.split(',').map((s:string)=>s.trim())
      return `rgba(${parts[0]},${parts[1]},${parts[2]},0)`
    })
  }
  return 'rgba(0,0,0,0)'
}

function darkenColor(color: string, amount: number): string {
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    let r: number, g: number, b: number
    if (hex.length === 3) {
      r = parseInt(hex[0]+hex[0],16); g = parseInt(hex[1]+hex[1],16); b = parseInt(hex[2]+hex[2],16)
    } else {
      r = parseInt(hex.slice(0,2),16); g = parseInt(hex.slice(2,4),16); b = parseInt(hex.slice(4,6),16)
    }
    r = Math.max(0, Math.min(255, Math.round(r * (1 - amount))))
    g = Math.max(0, Math.min(255, Math.round(g * (1 - amount))))
    b = Math.max(0, Math.min(255, Math.round(b * (1 - amount))))
    return `rgb(${r},${g},${b})`
  }
  if (color.startsWith('rgb')) {
    const m = color.match(/rgba?\(([^)]+)\)/)
    if (m) {
      const parts = m[1].split(',').map((s:string)=>s.trim())
      const r = Math.max(0, Math.min(255, Math.round(parseInt(parts[0]) * (1-amount))))
      const g = Math.max(0, Math.min(255, Math.round(parseInt(parts[1]) * (1-amount))))
      const b = Math.max(0, Math.min(255, Math.round(parseInt(parts[2]) * (1-amount))))
      const a = parts[3] ? `,${parts[3]}` : ''
      return `rgba(${r},${g},${b}${a})`
    }
  }
  return color
}

function hexToRgb(color: string): {r:number,g:number,b:number} | null {
  if (color.startsWith('#')) {
    const hex = color.slice(1)
    if (hex.length===3) return {r:parseInt(hex[0]+hex[0],16), g:parseInt(hex[1]+hex[1],16), b:parseInt(hex[2]+hex[2],16)}
    if (hex.length>=6) return {r:parseInt(hex.slice(0,2),16), g:parseInt(hex.slice(2,4),16), b:parseInt(hex.slice(4,6),16)}
  }
  return null
}

function getBevelFilter(layer: Layer): string | undefined {
  const bv = layer.bevel
  if (!bv?.enabled || bv.size <= 0) return undefined
  // Use SVG filter via CSS url() — respects geometry and is smoother than double drop-shadow (no visible overlap)
  return `url(#bevel-${layer.id})`
}

function BevelFilterDef({ layer }: { layer: Layer }) {
  const bv = layer.bevel
  if (!bv?.enabled || bv.size <= 0) return null
  const angle = (bv.lightAngle * Math.PI) / 180
  // Offsets na direção da luz — valores menores para chanfro interno sutil (Affinity)
  const dx = Math.cos(angle) * bv.size * 0.35
  const dy = Math.sin(angle) * bv.size * 0.35
  const sx = -Math.cos(angle) * bv.size * 0.35
  const sy = -Math.sin(angle) * bv.size * 0.35
  const erodeR = Math.max(0.5, bv.size * 0.28)
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <filter id={`bevel-${layer.id}`} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
          {/* Blur do alpha para suavização */}
          <feGaussianBlur in="SourceAlpha" stdDeviation={bv.smoothing} result="blur"/>
          {/* Erode para criar anel interno — só a borda interna recebe o bevel */}
          <feMorphology operator="erode" radius={erodeR} in="SourceAlpha" result="eroded"/>
          {/* Highlight interno: offset na direção da luz, recortado dentro da forma e só no anel */}
          <feOffset dx={dx} dy={dy} in="blur" result="offHi"/>
          <feComposite in="offHi" in2="SourceAlpha" operator="in" result="hiInside"/>
          <feComposite in="hiInside" in2="eroded" operator="out" result="hiEdge"/>
          <feFlood floodColor={bv.highlightColor} floodOpacity={bv.strength} result="hiColor"/>
          <feComposite in="hiColor" in2="hiEdge" operator="in" result="hi"/>
          {/* Shadow interno: offset oposto */}
          <feOffset dx={sx} dy={sy} in="blur" result="offSh"/>
          <feComposite in="offSh" in2="SourceAlpha" operator="in" result="shInside"/>
          <feComposite in="shInside" in2="eroded" operator="out" result="shEdge"/>
          <feFlood floodColor={bv.shadowColor} floodOpacity={bv.strength * 0.9} result="shColor"/>
          <feComposite in="shColor" in2="shEdge" operator="in" result="sh"/>
          {/* Compõe: gráfico original por baixo, highlight e shadow por cima dentro da forma */}
          <feMerge>
            <feMergeNode in="SourceGraphic"/>
            <feMergeNode in="hi"/>
            <feMergeNode in="sh"/>
          </feMerge>
        </filter>
      </defs>
    </svg>
  )
}

function getInnerShadowFilter(layer: Layer): string | undefined {
  const eff: any = (layer as any).innerShadow || (layer.shadow?.inset ? layer.shadow : null)
  if (!eff) return undefined
  if (eff.blur === 0 && eff.offsetX === 0 && eff.offsetY === 0) return undefined
  return `url(#inner-shadow-${layer.id})`
}

function InnerShadowFilterDef({ layer }: { layer: Layer }) {
  const eff: any = (layer as any).innerShadow || (layer.shadow?.inset ? layer.shadow : null)
  if (!eff) return null
  if (layer.vector?.shape === 'bloom') return null
  const blur = Math.max(0, eff.blur ?? 8)
  const dx = eff.offsetX ?? 0
  const dy = eff.offsetY ?? 0
  const intensity = Math.max(0, Math.min(1, eff.intensity ?? 0.5))
  const col = eff.color ?? '#000000'
  let floodColor = col
  let floodOpacity: number | string = intensity
  if (col.startsWith('rgba')) {
    const m = col.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/)
    if (m) { floodColor = `rgb(${m[1]},${m[2]},${m[3]})`; floodOpacity = (parseFloat(m[4]) * intensity).toFixed(3) }
  } else if (col.startsWith('#')) {
    floodColor = col
  }
  const std = Math.max(1.0, blur * 0.68)
  const erodeR = Math.max(0.6, Math.min(blur * 0.28, 10))
  const strongOpacity = Math.min(1, Number(floodOpacity) * 1.35)
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <filter id={`inner-shadow-${layer.id}`} x="-70%" y="-70%" width="240%" height="240%" colorInterpolationFilters="sRGB">
          {/* inner shadow fortalecido: anel mais espesso e blur mais intenso */}
          <feMorphology operator="erode" radius={erodeR} in="SourceAlpha" result="eroded"/>
          <feComposite operator="out" in="SourceAlpha" in2="eroded" result="ring"/>
          <feOffset dx={dx} dy={dy} in="ring" result="off"/>
          <feGaussianBlur in="off" stdDeviation={std} result="blur"/>
          <feComposite operator="in" in="blur" in2="SourceAlpha" result="innerBlur"/>
          <feFlood floodColor={floodColor} floodOpacity={strongOpacity} result="flood"/>
          <feComposite operator="in" in="flood" in2="innerBlur" result="shadowInside"/>
          <feComposite operator="over" in="shadowInside" in2="SourceGraphic" result="withShadow"/>
        </filter>
      </defs>
    </svg>
  )
}

function getCombinedEffectFilter(layer: Layer): string | undefined {
  const hasOutline = !!(layer.outline && (layer.outlineWidthPx ?? 0) > 0)
  const hasBevel = !!(layer.bevel?.enabled && layer.bevel.size > 0)
  const hasInner = !!((layer as any).innerShadow || (layer.shadow?.inset))
  const count = (hasOutline ? 1 : 0) + (hasBevel ? 1 : 0) + (hasInner ? 1 : 0)
  if (count < 2) return undefined
  if (layer.vector?.shape === 'bloom') return undefined
  return `url(#effect-${layer.id})`
}

function CombinedEffectFilterDef({ layer }: { layer: Layer }) {
  const hasOutline = !!(layer.outline && (layer.outlineWidthPx ?? 0) > 0)
  const hasBevel = !!(layer.bevel?.enabled && layer.bevel.size > 0)
  const hasInner = !!((layer as any).innerShadow || (layer.shadow?.inset ? layer.shadow : null))
  const count = (hasOutline ? 1 : 0) + (hasBevel ? 1 : 0) + (hasInner ? 1 : 0)
  if (count < 2) return null
  if (layer.vector?.shape === 'bloom') return null
  const outlineW = hasOutline ? (layer.outlineWidthPx ?? 0) : 0
  const outlineColor = hasOutline ? layer.outline!.color : '#000'
  const bv: any = layer.bevel
  const innerEff: any = (layer as any).innerShadow || (layer.shadow?.inset ? layer.shadow : null)
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        <filter id={`effect-${layer.id}`} x="-70%" y="-70%" width="240%" height="240%" colorInterpolationFilters="sRGB">
          {/* 1. Base alpha: SourceAlpha + outline dilatado */}
          {hasOutline ? (
            <>
              <feMorphology operator="dilate" radius={outlineW} in="SourceAlpha" result="baseAlpha"/>
              <feFlood floodColor={outlineColor} result="outlineColor"/>
              <feComposite operator="in" in="outlineColor" in2="baseAlpha" result="outlineFill"/>
              <feComposite operator="over" in="SourceGraphic" in2="outlineFill" result="withOutline"/>
            </>
          ) : (
            <feMorphology operator="dilate" radius="0" in="SourceAlpha" result="baseAlpha"/>
          )}
          {/* 2. Bevel aplicado sobre baseAlpha (já inclui outline) */}
          {hasBevel && (() => {
            const angle = (bv.lightAngle * Math.PI) / 180
            const dx = Math.cos(angle) * bv.size * 0.35
            const dy = Math.sin(angle) * bv.size * 0.35
            const sx = -Math.cos(angle) * bv.size * 0.35
            const sy = -Math.sin(angle) * bv.size * 0.35
            const erodeR = Math.max(0.5, bv.size * 0.28)
            const inResult = hasOutline ? 'withOutline' : 'SourceGraphic'
            return (
              <>
                <feGaussianBlur in="baseAlpha" stdDeviation={bv.smoothing ?? 2} result="bvBlur"/>
                <feMorphology operator="erode" radius={erodeR} in="baseAlpha" result="bvEroded"/>
                <feOffset dx={dx} dy={dy} in="bvBlur" result="bvOffHi"/>
                <feComposite in="bvOffHi" in2="baseAlpha" operator="in" result="bvHiInside"/>
                <feComposite in="bvHiInside" in2="bvEroded" operator="out" result="bvHiEdge"/>
                <feFlood floodColor={bv.highlightColor} floodOpacity={bv.strength} result="bvHiColor"/>
                <feComposite in="bvHiColor" in2="bvHiEdge" operator="in" result="bvHi"/>
                <feOffset dx={sx} dy={sy} in="bvBlur" result="bvOffSh"/>
                <feComposite in="bvOffSh" in2="baseAlpha" operator="in" result="bvShInside"/>
                <feComposite in="bvShInside" in2="bvEroded" operator="out" result="bvShEdge"/>
                <feFlood floodColor={bv.shadowColor} floodOpacity={bv.strength * 0.9} result="bvShColor"/>
                <feComposite in="bvShColor" in2="bvShEdge" operator="in" result="bvSh"/>
                <feMerge result="withBevel">
                  <feMergeNode in={inResult}/>
                  <feMergeNode in="bvHi"/>
                  <feMergeNode in="bvSh"/>
                </feMerge>
              </>
            )
          })()}
          {/* 3. Inner shadow sobre resultado com bevel (ou sobre base com outline) */}
          {hasInner && (() => {
            const eff = innerEff
            const blur = Math.max(0, eff.blur ?? 8)
            const dx = eff.offsetX ?? 0
            const dy = eff.offsetY ?? 0
            const baseIntensity = Math.max(0, Math.min(1, eff.intensity ?? 0.5))
            const col = eff.color ?? '#000000'
            let floodColor: any = col
            let floodOpacity: any = baseIntensity
            if (typeof col === 'string' && col.startsWith('rgba')) {
              const m = col.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/)
              if (m) { floodColor = `rgb(${m[1]},${m[2]},${m[3]})`; floodOpacity = (parseFloat(m[4]) * baseIntensity).toFixed(3) }
            }
            const std = Math.max(1.0, blur * 0.68)
            const erodeR = Math.max(0.6, Math.min(blur * 0.28, 10))
            const strongOpacity = Math.min(1, Number(floodOpacity) * 1.35)
            const inResult = hasBevel ? 'withBevel' : (hasOutline ? 'withOutline' : 'SourceGraphic')
            return (
              <>
                <feMorphology operator="erode" radius={erodeR} in="baseAlpha" result="isEroded"/>
                <feComposite operator="out" in="baseAlpha" in2="isEroded" result="isRing"/>
                <feOffset dx={dx} dy={dy} in="isRing" result="isOff"/>
                <feGaussianBlur in="isOff" stdDeviation={std} result="isBlur"/>
                <feComposite operator="in" in="isBlur" in2="baseAlpha" result="isInnerBlur"/>
                <feFlood floodColor={floodColor} floodOpacity={strongOpacity} result="isFlood"/>
                <feComposite operator="in" in="isFlood" in2="isInnerBlur" result="isShadowInside"/>
                <feComposite operator="over" in="isShadowInside" in2={inResult} result="withInner"/>
              </>
            )
          })()}
          {/* 4. Se não houve bevel/inner, garante que o resultado com outline seja propagado */}
          {!hasBevel && !hasInner && hasOutline && (
            <feMerge result="withOutlineOnly">
              <feMergeNode in="withOutline"/>
            </feMerge>
          )}
        </filter>
      </defs>
    </svg>
  )
}

/** Reajusta a bbox do texto ao conteúdo (autoFit: mede e centraliza; wrapped: só altura). Sem histórico. */
function refitTextLayer(layerId: string, cw: number, ch: number) {
  try {
    const st = useStore.getState()
    const cur = st.layers.find((l) => l.id === layerId) as any
    if (!cur || cur.type !== 'text') return
    const isWrapped = cur.autoFit === false
    if (!isWrapped) {
      const fs = cur.fontSize
      const mCanvas = document.createElement('canvas')
      const ctx = mCanvas.getContext('2d')
      if (!ctx) return
      ctx.font = `${cur.fontStyle} ${cur.fontWeight} ${fs}px "${cur.font}"`
      const lines = (cur.text as string).split('\n')
      let maxW = 0
      for (const line of lines) {
        let l = line
        if (cur.textTransform === 'uppercase') l = l.toUpperCase()
        else if (cur.textTransform === 'lowercase') l = l.toLowerCase()
        const m = ctx.measureText(l)
        let w = m.width
        if (cur.letterSpacing) w += (l.length - 1) * cur.letterSpacing
        maxW = Math.max(maxW, w)
      }
      const totalH = lines.length * fs * cur.lineHeight
      const tw = Math.max(0.08, Math.min(maxW + fs * 0.3, cw * 0.98) / cw)
      const th = Math.max(0.05, Math.min(totalH, ch * 0.98) / ch)
      if (Math.abs(tw - cur.width) > 0.0005 || Math.abs(th - cur.height) > 0.0005) {
        st.updateLayer(layerId, { width: tw, height: th, x: cur.x + (cur.width - tw) / 2, y: cur.y + (cur.height - th) / 2 } as any, false)
      }
    } else {
      const maxWpx = Math.max(20, cur.width * cw - cur.fontSize * 0.4)
      const hPx = computeWrappedTextHeight(cur.text, cur.font, cur.fontSize, maxWpx, cur.fontStyle, cur.fontWeight, cur.lineHeight, cur.letterSpacing, cur.textTransform) + cur.fontSize * 0.2
      const newH = Math.max(0.05, Math.min(hPx / ch, 0.98))
      if (Math.abs(newH - cur.height) > 0.001) st.updateLayer(layerId, { height: newH } as any, false)
    }
  } catch {}
}

/**
 * Editor inline de texto rico (modo ENTER no canvas).
 * contentEditable não-controlado: o DOM é a fonte da verdade durante a digitação;
 * cada input serializa texto + trechos coloridos para a camada (sem histórico;
 * o commit acontece no blur/Escape/clique-fora, como antes).
 */
function InlineTextEditor({ layerId, cw, ch, onExit }: { layerId: string; cw: number; ch: number; onExit: () => void }) {
  const layer = useStore((s) => s.layers.find((l) => l.id === layerId) ?? null)
  const editorRef = useRef<HTMLDivElement>(null)
  const [selColor, setSelColor] = useState<string | null>(null)

  // Inicializa o DOM uma única vez (construído a partir de texto + spans guardados)
  useEffect(() => {
    const ed = editorRef.current
    if (!ed || (ed as any).dataset.richInit) return
    const cur = useStore.getState().layers.find((l) => l.id === layerId) as any
    if (!cur) return
    setRichEditorContent(ed, cur.text ?? '', cur.textSpans ?? null)
    ;(ed as any).dataset.richInit = '1'
    ed.focus()
    placeCaretAtEnd(ed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Observa a seleção para habilitar a toolbar de cor do trecho
  useEffect(() => {
    const onSelChange = () => {
      const ed = editorRef.current
      if (!ed || document.activeElement !== ed) {
        setSelColor(null)
        return
      }
      try {
        const range = getEditorSelectionOffsets(ed)
        if (!range) {
          setSelColor(null)
          return
        }
        const { spans } = serializeRichElement(ed)
        const covering = (spans ?? []).find((sp) => sp.s <= range.start && sp.e >= range.end)
        setSelColor(covering ? covering.color : null)
      } catch {
        setSelColor(null)
      }
    }
    document.addEventListener('selectionchange', onSelChange)
    return () => document.removeEventListener('selectionchange', onSelChange)
  }, [])

  if (!layer || layer.type !== 'text') return null

  const commitInput = () => {
    const ed = editorRef.current
    if (!ed) return
    const { text, spans } = serializeRichElement(ed)
    useStore.getState().updateLayer(layerId, { text, textSpans: spans } as any, false)
    refitTextLayer(layerId, cw, ch)
  }

  const applyColor = (c: string) => {
    const ed = editorRef.current
    if (!ed) return
    const res = applyRichColorToSelection(ed, c)
    if (!res) return
    useStore.getState().updateLayer(layerId, { text: res.text, textSpans: res.spans } as any, false)
  }

  const showAbove = layer.y * ch >= 140

  return (
    <>
      <div
        data-no-deselect="true"
        style={{ position: 'absolute', left: 0, zIndex: 100006, ...(showAbove ? { bottom: '100%', marginBottom: 16 } : { top: '100%', marginTop: 16 }) }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-zinc-800/95 border border-zinc-600 rounded-xl p-1 shadow-2xl">
          <ColorPalette
            value={selColor ?? layer.color}
            onChange={applyColor}
            buttonClassName="w-12 h-12 rounded-xl border-2 border-zinc-500 hover:border-white transition-colors cursor-pointer shrink-0 block"
          />
        </div>
      </div>
      <div
        ref={editorRef}
        contentEditable
        spellCheck={false}
        data-no-deselect="true"
        onInput={commitInput}
        onBlur={() => {
          refitTextLayer(layerId, cw, ch)
          try { useStore.getState().pushHistory() } catch {}
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            refitTextLayer(layerId, cw, ch)
            try { useStore.getState().pushHistory() } catch {}
            onExit()
            e.preventDefault()
            e.stopPropagation()
            return
          }
          e.stopPropagation()
        }}
        style={{
          width: '100%', height: '100%', background: 'rgba(0,0,0,0.18)', border: '1.5px dashed var(--accent)', borderRadius: 6,
          color: layer.textGradient ? 'transparent' : layer.color,
          backgroundImage: (layer.textGradient as any) || undefined,
          WebkitBackgroundClip: layer.textGradient ? 'text' as any : undefined,
          backgroundClip: layer.textGradient ? 'text' as any : undefined,
          WebkitTextFillColor: layer.textGradient ? 'transparent' as any : undefined,
          fontFamily: layer.font, fontSize: `${Math.round(layer.fontSize)}px`, fontStyle: layer.fontStyle as any, fontWeight: layer.fontWeight as any,
          lineHeight: layer.lineHeight, letterSpacing: layer.letterSpacing ? `${Math.round(layer.letterSpacing)}px` : undefined,
          textAlign: layer.textAlign as any, textTransform: layer.textTransform as any,
          whiteSpace: (layer as any).autoFit === false ? 'pre-wrap' as const : 'pre' as const,
          wordBreak: 'break-word' as const, overflowWrap: 'anywhere' as const,
          outline: 'none', padding: 6, overflow: 'auto', caretColor: '#fff',
          // o editor vive sob ancestrais com select-none: força seleção e cursor de texto
          userSelect: 'text' as const, WebkitUserSelect: 'text' as any, cursor: 'text' as const,
          boxShadow: '0 0 0 2px rgba(59,130,246,0.25)', display: 'block',
        }}
      />
    </>
  )
}

interface LayerDivProps {
  layer: Layer
  isSelected: boolean
  isHidden: boolean
  parentGroupLocked: boolean
  cw: number
  ch: number
  layers: Layer[]
  background: { type: string; color: string; gradient: string; bgPosition: string; bgSize: string }
  px: (v: number) => number
  toFilter: (layer: Layer) => string | undefined
  toBlurFilter: (layer: Layer) => string | undefined
  toShadow: (layer: Layer) => string
  toShadowFilter: (layer: Layer) => string | undefined
  outlineFilter: (layer: Layer) => string | undefined
  parseCSSGradient: (css: string) => { type: 'linear' | 'radial'; x1?: number; y1?: number; x2?: number; y2?: number; stops: { offset: string; color: string }[] } | null
  onPointerDown: (e: React.PointerEvent, layerId: string) => void
  onDoubleClick?: (e: React.MouseEvent, layerId: string) => void
  bezierEditMode?: boolean
  scale?: number
  isDimmed?: boolean
  isInteracting?: boolean
}

function LayerDiv({ layer, isSelected, isHidden, parentGroupLocked, cw, ch, layers, background, px, toFilter, toBlurFilter, toShadow, toShadowFilter, outlineFilter, parseCSSGradient, onPointerDown, onDoubleClick, bezierEditMode, scale, isDimmed, isInteracting }: LayerDivProps) {
  const maskDataUrl = useCompositeMaskDataUrl(layer, layers, cw, ch, isInteracting, scale)
  const maskCss = getMaskCss(maskDataUrl)

  const has3d = layer.perspectiveX !== 0 || layer.perspectiveY !== 0
  const transform3d = has3d
    ? `perspective(500px) rotateY(${layer.perspectiveX}deg) rotateX(${-layer.perspectiveY}deg)`
    : ''

  // Filter (bloom/shadow/outline/blur) lives on the OUTER wrapper so the glow
  // and blur can overflow the bounding box. The mask lives on an INNER wrapper
  // so it only clips the layer content, never the shadow halo or blur spread.
  const isBloom = layer.vector?.shape === 'bloom'
  const combinedFilter = isInteracting ? undefined : getCombinedEffectFilter(layer)
  const bevelFilter = combinedFilter ? undefined : isInteracting ? undefined : getBevelFilter(layer)
  const innerShadowFilter = combinedFilter ? undefined : isInteracting ? undefined : getInnerShadowFilter(layer)
  const outlineFilterVal = combinedFilter ? undefined : outlineFilter(layer)
  const layerFilter = isInteracting
    ? undefined
    : combinedFilter
      ? [toBlurFilter(layer), combinedFilter, toShadowFilter(layer)].filter(Boolean).join(' ') || undefined
      : isBloom
        ? [toBlurFilter(layer), bevelFilter].filter(Boolean).join(' ') || undefined
        : [toBlurFilter(layer), bevelFilter, innerShadowFilter, toShadowFilter(layer), outlineFilterVal].filter(Boolean).join(' ') || undefined

  const hasBevel = !!(layer.bevel?.enabled && layer.bevel.size > 0)

  return (
    <div
      className={`canvas-layer ${isSelected ? 'selected' : ''} ${layer.locked || parentGroupLocked ? 'locked' : ''}`}
      data-layer-id={layer.id}
      style={{
        left: `${layer.x * 100}%`,
        top: `${layer.y * 100}%`,
        width: `${layer.width * 100}%`,
        height: `${layer.height * 100}%`,
        transform: `${transform3d} rotate(${layer.rotation}deg)${layer.mirrorX ? ' scaleX(-1)' : ''}${layer.mirrorY ? ' scaleY(-1)' : ''}${isInteracting ? ' translateZ(0)' : ''}`.trim(),
        transformStyle: has3d ? 'preserve-3d' as const : undefined,
        willChange: has3d || isInteracting ? 'transform' as const : undefined,
        imageRendering: has3d ? 'auto' as const : undefined,
        backfaceVisibility: has3d ? 'hidden' as const : undefined,
        opacity: isDimmed ? layer.opacity * 0.22 : layer.opacity,
        zIndex: layer.zIndex,
        display: isHidden ? 'none' : undefined,
        pointerEvents: (isDimmed ? 'none' as const : bezierEditMode ? 'none' as const : (layer.locked || parentGroupLocked) ? 'none' as const : undefined),
        overflow: 'visible',
        filter: isDimmed ? 'grayscale(0.7) ' + (layerFilter || '') : layerFilter,
      }}
      onPointerDown={(e) => onPointerDown(e, layer.id)}
      onDoubleClick={(e) => onDoubleClick?.(e, layer.id)}
    >
      <div
        className="canvas-layer-mask"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
        overflow: 'visible',
          ...maskCss,
        }}
      >
      <BevelFilterDef layer={layer} />
      <InnerShadowFilterDef layer={layer} />
      <CombinedEffectFilterDef layer={layer} />
      {layer.type === 'image' && layer.preview && (() => {
        const brPx = layer.borderRadiusPx ?? 0
        const maxRadius = Math.min(layer.width, layer.height) * cw / 2
        const cappedRadius = brPx > 0 ? Math.min(px(brPx), Math.round(maxRadius)) : 0
        const radiusCSS = cappedRadius > 0 ? `${cappedRadius}px` : (layer.borderRadius ? `${px(layer.borderRadius)}px` : undefined)
        const filterCSS = toFilter(layer)
        // Non-destructive crop: the image stays intact and we only show a
        // window of it. We render the FULL original via background-image with
        // background-position/background-size tuned to the crop region, so
        // (a) the layer box keeps its current width/height, and
        // (b) any consumer that needs the un-cropped image (masks, AI
        //     background removal, future tools) can still read originalPreview
        //     and get the full picture.
        const hasCrop = !!layer.crop && (layer.originalPreview || layer.preview)
        if (hasCrop) {
          const crop = layer.crop!
          const fullSrc = layer.originalPreview || layer.preview
          const { backgroundSize, backgroundPosition } = cropBackgroundCss(crop)
          const effectiveInnerFilter = combinedFilter || (innerShadowFilter && !isBloom ? innerShadowFilter : undefined)
          const combinedCropFilter = [filterCSS, effectiveInnerFilter].filter(Boolean).join(' ') || undefined
          return (
            <div
              className="absolute inset-0"
              data-cropped-preview="true"
              data-full-src={fullSrc}
              style={{
                backgroundImage: `url("${fullSrc}")`,
                backgroundRepeat: 'no-repeat',
                backgroundSize,
                backgroundPosition,
                borderRadius: radiusCSS,
                filter: combinedCropFilter,
                // For non-background layers the crop already represents the
                // visible content; the rest of the box is intentionally empty.
                pointerEvents: 'none',
              }}
            />
          )
        }
        const effectiveInnerFilterImg = combinedFilter || (innerShadowFilter && !isBloom ? innerShadowFilter : undefined)
        const combinedImgFilter = [filterCSS, effectiveInnerFilterImg].filter(Boolean).join(' ') || undefined
        const imgEl = (
          <img
            src={layer.preview} alt="" draggable={false}
            style={{
              width: '100%', height: '100%',
              borderRadius: radiusCSS,
              objectFit: layer.isBackground ? (background.bgSize === '100% 100%' ? 'fill' : background.bgSize === 'auto' ? 'none' : background.bgSize as any) : 'contain',
              objectPosition: layer.isBackground ? (background.bgPosition as any) : undefined,
              filter: combinedImgFilter,
            }}
          />
        )
        return imgEl
      })()}
      {layer.type === 'text' && (() => {
        // quando autoFit desativado a bbox define a largura e o texto deve quebrar
        const isWrapped = (layer as any).autoFit === false
        const tb: React.CSSProperties = {
          fontSize: `${px(layer.fontSize)}px`,
          fontFamily: layer.font,
          fontStyle: layer.fontStyle || 'normal',
          fontWeight: layer.fontWeight || 700,
          lineHeight: Math.max(1.0, layer.lineHeight),
          letterSpacing: layer.letterSpacing ? `${px(layer.letterSpacing)}px` : undefined,
          textTransform: layer.textTransform !== 'none' ? layer.textTransform : undefined,
          whiteSpace: isWrapped ? 'pre-wrap' : 'pre',
          textAlign: layer.textAlign,
          wordBreak: isWrapped ? 'break-word' as const : undefined,
          overflowWrap: isWrapped ? 'anywhere' as const : undefined,
          width: isWrapped ? '100%' : undefined,
          display: isWrapped ? 'block' as const : undefined,
          transform: (layer.fontStyle === 'italic' || layer.fontStyle === 'oblique') ? 'skewX(-10deg)' : undefined,
        }

        const layerFilter = toFilter(layer)
        const layerShadow = toShadow(layer)
        const justifyContent = layer.textAlign === 'center' ? 'center' : layer.textAlign === 'right' ? 'flex-end' : 'flex-start'

        // inner shadow SVG filter (contour-aware) – for text, apply via CSS filter on the wrapper instead of duplicate textShadow copy
        const textInnerFilter = innerShadowFilter && !isBloom ? innerShadowFilter : undefined
        const hasTextInner = !!textInnerFilter

        // The first copy is in normal flow to give the text box its real size;
        // Stacking order (bottom -> top): outline, shadow, then the base color
        // (or gradient) on top. The first hidden copy is in normal flow only to
        // give the text box its real size. All visible copies are absolutely
        // positioned on top of it and layered with z-index. Gradient/outline
        // clip only to the glyphs (never to the layer/manipulation box).
        const isWrappedCopy = (layer as any).autoFit === false
        // Texto rico: trechos com cor própria (editados no modo ENTER).
        // Trechos sem cor herdam a cor do pai (base, sombra, outline ou gradiente).
        const textRuns = splitRuns(layer.text, (layer as any).textSpans)
        const renderRuns = (solid: boolean) => textRuns.map((r, i) =>
          r.color
            ? <span key={i} style={solid ? { color: r.color, WebkitTextFillColor: r.color, background: 'none' } : { color: r.color }}>{r.text}</span>
            : <React.Fragment key={i}>{r.text}</React.Fragment>
        )
        const TextCopy = ({ color, extra, zIndex, solidSpans }: { color?: string; extra?: React.CSSProperties; zIndex?: number; solidSpans?: boolean }) => (
          <span
            style={{
              ...tb,
              color: color ?? 'transparent',
              position: 'absolute',
              top: 0,
              left: 0,
              width: isWrappedCopy ? '100%' : undefined,
              display: isWrappedCopy ? 'block' as const : 'inline-block' as const,
              pointerEvents: 'none',
              zIndex,
              ...extra,
            }}
          >
            {renderRuns(!!solidSpans)}
          </span>
        )

        const wrapStyle: React.CSSProperties = {
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'visible',
          filter: layerFilter,
        }
        const fillFilter = hasTextInner ? textInnerFilter : undefined

        const textBoxStyle: React.CSSProperties = {
          position: 'relative',
          display: isWrapped ? 'block' as const : 'inline-block' as const,
          width: isWrapped ? '100%' : undefined,
          maxWidth: '100%',
          textAlign: layer.textAlign,
        }

        // Hidden in-flow copy that sizes the box (no visual contribution).
        const Sizer = (
          <span style={{ ...tb, color: 'transparent', position: 'relative', display: isWrapped ? 'block' as const : 'inline-block' as const, width: isWrapped ? '100%' : undefined, visibility: 'hidden' }}>
            {layer.text}
          </span>
        )

        const effInner = (layer as any).innerShadow || (layer.shadow?.inset ? layer.shadow : null)
        const innerShadowStr = effInner && !hasTextInner ? `${px(effInner.offsetX)}px ${px(effInner.offsetY)}px ${px(effInner.blur)}px ${colorWithIntensity(effInner.color, effInner.intensity ?? 0.5)}` : null
        // ordem corrigida: sombra no fundo, outline no meio, fill no topo — evita sombra cobrindo contorno
        const inner = (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent, pointerEvents: 'none' }}>
            <div style={textBoxStyle}>
              {Sizer}
              {layer.shadow && !layer.shadow.inset && <TextCopy zIndex={1} extra={{ textShadow: layerShadow }} />}
              {layer.outline && (layer.outlineWidthPx ?? 0) > 0 && (
                <TextCopy
                  zIndex={2}
                  extra={{
                    WebkitTextStroke: `${px(layer.outlineWidthPx)}px ${layer.outline.color}`,
                    paintOrder: 'stroke fill',
                  }}
                />
              )}
              {effInner && !hasTextInner && <TextCopy zIndex={2.5 as any} extra={{ textShadow: innerShadowStr!, opacity: 0.85 }} />}
              <TextCopy zIndex={3} color={layer.color} extra={fillFilter ? { filter: fillFilter } : undefined} />
            </div>
          </div>
        )

        if (layer.textGradient) {
          return (
            <div key={layer.textGradient} style={wrapStyle}>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent, pointerEvents: 'none' }}>
                <div style={textBoxStyle}>
                  {Sizer}
                  {layer.shadow && !layer.shadow.inset && <TextCopy zIndex={1} extra={{ textShadow: layerShadow }} />}
                  {layer.outline && (layer.outlineWidthPx ?? 0) > 0 && (
                    <TextCopy
                      zIndex={2}
                      extra={{
                        WebkitTextStroke: `${px(layer.outlineWidthPx)}px ${layer.outline.color}`,
                        paintOrder: 'stroke fill',
                      }}
                    />
                  )}
                  {effInner && !hasTextInner && <TextCopy zIndex={2.5 as any} extra={{ textShadow: innerShadowStr!, opacity: 0.85 }} />}
                  <TextCopy
                    zIndex={3}
                    solidSpans
                    extra={{
                      background: layer.textGradient,
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      filter: fillFilter,
                    }}
                  />
                </div>
              </div>
            </div>
          )
        }

        return (
          <div style={wrapStyle}>
            {inner}
          </div>
        )
      })()}
      {layer.type === 'vector' && layer.vector && (() => {
        const innerF = innerShadowFilter && !isBloom ? innerShadowFilter : undefined
        const combinedVecFilter = [toFilter(layer), innerF].filter(Boolean).join(' ') || undefined
        const isCrossShape = layer.vector.shape === 'cross'
        return (
        <svg
          viewBox="0 0 100 100" preserveAspectRatio={isCrossShape ? "xMidYMid meet" : "none"} overflow="visible"
          style={{
            width: '100%', height: '100%', display: 'block',
            filter: combinedVecFilter,
            transform: layer.vector.skewX ? `skewX(${layer.vector.skewX}deg)` : undefined,
            transformOrigin: 'center center',
          }}
        >
          {layer.vector.fillGradient && (() => {
            const g = parseCSSGradient(layer.vector.fillGradient!)
            if (!g) return null
            return (
              <defs>
                {g.type === 'radial' ? (
                  <radialGradient id={`vg-${layer.id}`} cx="50%" cy="50%" r="50%">
                    {g.stops.map((s, i) => (
                      <stop key={i} offset={s.offset} stopColor={s.color} />
                    ))}
                  </radialGradient>
                ) : (
                  <linearGradient id={`vg-${layer.id}`} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
                    {g.stops.map((s, i) => (
                      <stop key={i} offset={s.offset} stopColor={s.color} />
                    ))}
                  </linearGradient>
                )}
              </defs>
            )
          })()}
          {(() => {
            const v = layer.vector!
            const fc = v.color
            const sc = v.strokeColor || v.color
            const adjustedSw = v.strokeWidth
            const isLine = v.shape === 'line' || v.shape === 'arrow'
            const fillVal = isLine ? 'none' : (v.filled ? (v.fillGradient ? `url(#vg-${layer.id})` : fc) : 'none')
            const strokeVal = (isLine || v.strokeWidth > 0) ? sc : 'none'
            const dashMap: Record<string, string | undefined> = {
              solid: undefined,
              dashed: `${adjustedSw * 4},${adjustedSw * 2}`,
              dotted: `${adjustedSw * 1},${adjustedSw * 2}`,
              'dash-dot': `${adjustedSw * 4},${adjustedSw * 2},${adjustedSw * 1},${adjustedSw * 2}`,
            }
            const commonStroke: Record<string, any> = { stroke: strokeVal, strokeWidth: adjustedSw, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const, strokeDasharray: dashMap[v.strokeDash], vectorEffect: 'non-scaling-stroke' }
            const shapeProps = { fill: fillVal, ...commonStroke }
            const renderShape = () => {
              switch (v.shape) {
                case 'line':
                  return <line x1="0" y1="50" x2="100" y2="50" stroke={sc} strokeWidth={adjustedSw} strokeLinecap="round" strokeDasharray={dashMap[v.strokeDash]} vectorEffect="non-scaling-stroke" />
                case 'arrow':
                  return <path d="M 10,50 L 82,50 M 82,50 L 70,36 M 82,50 L 70,64" fill="none" stroke={sc} strokeWidth={adjustedSw} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dashMap[v.strokeDash]} vectorEffect="non-scaling-stroke" />
                case 'curved-arrow':
                  return <path d="M 3.5,55.3 C 5.9,52.0 21.6,32.7 44.0,32.1 C 72.1,31.4 84.9,50.8 84.9,50.8 l 9.0,-16.9 l 2.6,38.9 l -37.0,-6.4 l 17.4,-7.1 C 68.9,49.2 59.0,41.3 44.4,41.1 C 31.4,41.1 17.8,45.2 3.5,55.3 Z" {...shapeProps} />
                case 'rounded-rect': {
                  const maxR = Math.min(v.cornerRadius, 50)
                  const aspect = (layer.width * cw) / Math.max(layer.height * ch, 0.01)
                  const rx = Math.min(maxR, 50 / aspect)
                  const ry = Math.min(maxR * aspect, 50)
                  return <rect x="0" y="0" width="100" height="100" rx={rx} ry={ry} {...shapeProps} />
                }
                case 'circle':
                  return <ellipse cx="50" cy="50" rx="50" ry="50" {...shapeProps} />
                case 'diamond':
                  return <polygon points="50,2 98,50 50,98 2,50" {...shapeProps} />
                case 'triangle':
                  return <polygon points="50,2 98,98 2,98" {...shapeProps} />
                case 'pentagon': {
                  const pts5: string[] = []
                  for (let i = 0; i < 5; i++) {
                    const a = i * Math.PI * 2 / 5 - Math.PI / 2
                    pts5.push(`${50 + 48 * Math.cos(a)},${50 + 48 * Math.sin(a)}`)
                  }
                  return <polygon points={pts5.join(' ')} {...shapeProps} />
                }
                case 'hexagon': {
                  const pts: string[] = []
                  for (let i = 0; i < 6; i++) {
                    const a = i * Math.PI / 3 - Math.PI / 2
                    pts.push(`${50 + 48 * Math.cos(a)},${50 + 48 * Math.sin(a)}`)
                  }
                  return <polygon points={pts.join(' ')} {...shapeProps} />
                }
                case 'star': {
                  const pts: string[] = []
                  for (let i = 0; i < 10; i++) {
                    const a = i * Math.PI / 5 - Math.PI / 2
                    const r = i % 2 === 0 ? 48 : 20
                    pts.push(`${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`)
                  }
                  return <polygon points={pts.join(' ')} {...shapeProps} />
                }
                case 'cross':
                  return <g><line x1="20" y1="20" x2="80" y2="80" stroke={sc} strokeWidth={adjustedSw} strokeLinecap="round" strokeDasharray={dashMap[v.strokeDash]} vectorEffect="non-scaling-stroke" /><line x1="80" y1="20" x2="20" y2="80" stroke={sc} strokeWidth={adjustedSw} strokeLinecap="round" strokeDasharray={dashMap[v.strokeDash]} vectorEffect="non-scaling-stroke" /></g>
                case 'lightning':
                  return <path d="M 62,2 L 18,55 H 40 L 28,98 L 82,42 H 60 Z" {...shapeProps} />
                case 'heart':
                  return <path d="M 50,35 C 50,20 20,20 20,40 C 20,60 50,85 50,85 C 50,85 80,60 80,40 C 80,20 50,20 50,35 Z" {...shapeProps} />
                case 'plus':
                  return <path d="M30,0 L70,0 L70,30 L100,30 L100,70 L70,70 L70,100 L30,100 L30,70 L0,70 L0,30 L30,30 Z" {...shapeProps} />
                case 'arrow-right':
                  return <path d="M0,30 L58,30 L58,5 L96,50 L58,95 L58,70 L0,70 Z" {...shapeProps} />
                case 'bloom': {
                  const gradId = `bloom-${layer.id}`
                  const transparent = colorToTransparent(v.color)
                  return (
                    <g>
                      <defs>
                        <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor={v.color} stopOpacity={1} />
                          <stop offset="100%" stopColor={transparent} stopOpacity={0} />
                        </radialGradient>
                      </defs>
                      <ellipse cx="50" cy="50" rx="50" ry="50" fill={`url(#${gradId})`} stroke="none" />
                    </g>
                  )
                }
                case 'speech-bubble-left': {
                  const r = 12
                  return <path d={`M ${r} 0 H ${100-r} A ${r} ${r} 0 0 1 100 ${r} V ${82-r} A ${r} ${r} 0 0 1 ${100-r} 82 H 28 L 12 100 L 20 82 H ${r} A ${r} ${r} 0 0 1 0 ${82-r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`} {...shapeProps} />
                }
                case 'speech-bubble-right': {
                  const r = 12
                  return <path d={`M ${r} 0 H ${100-r} A ${r} ${r} 0 0 1 100 ${r} V ${82-r} A ${r} ${r} 0 0 1 ${100-r} 82 H 80 L 88 100 L 72 82 H ${r} A ${r} ${r} 0 0 1 0 ${82-r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`} {...shapeProps} />
                }
                case 'thought-bubble': {
                  // balão pensamento — elipse + 2 círculos pequenos para cauda
                  return (
                    <g fill={(shapeProps as any).fill} stroke={(shapeProps as any).stroke} strokeWidth={(shapeProps as any).strokeWidth} strokeDasharray={(shapeProps as any).strokeDasharray} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke">
                      <ellipse cx="50" cy="38" rx="42" ry="28" />
                      <ellipse cx="28" cy="72" rx="10" ry="8" />
                      <ellipse cx="14" cy="88" rx="6" ry="5" />
                    </g>
                  )
                }
                case 'speech-bubble-wide': {
                  // bem mais largo/horizontal — bem rectangular (r pequeno, rect baixo)
                  const r = 4
                  return <path d={`M ${r} 0 H ${100-r} A ${r} ${r} 0 0 1 100 ${r} V ${68-r} A ${r} ${r} 0 0 1 ${100-r} 68 H ${58} L 50 90 L ${42} 68 H ${r} A ${r} ${r} 0 0 1 0 ${68-r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`} {...shapeProps} />
                }
                case 'speech-bubble-wide-left': {
                  const r = 4
                  return <path d={`M ${r} 0 H ${100-r} A ${r} ${r} 0 0 1 100 ${r} V ${68-r} A ${r} ${r} 0 0 1 ${100-r} 68 H 28 L 10 90 L 20 68 H ${r} A ${r} ${r} 0 0 1 0 ${68-r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`} {...shapeProps} />
                }
                case 'speech-bubble-wide-right': {
                  const r = 4
                  return <path d={`M ${r} 0 H ${100-r} A ${r} ${r} 0 0 1 100 ${r} V ${68-r} A ${r} ${r} 0 0 1 ${100-r} 68 H 80 L 90 90 L 72 68 H ${r} A ${r} ${r} 0 0 1 0 ${68-r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`} {...shapeProps} />
                }
                case 'speech-bubble-tall': {
                  // mais vertical — cauda lateral direita
                  const r = 12
                  return <path d={`M ${r} 0 H ${70} A ${r} ${r} 0 0 1 82 ${r} V ${40} L 100 50 L 82 60 V ${100-r} A ${r} ${r} 0 0 1 70 100 H ${r} A ${r} ${r} 0 0 1 0 ${100-r} V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`} {...shapeProps} />
                }
                default:
                  return null
              }
            }
            return renderShape()
          })()}
        </svg>
      )})()}
      {layer.type === 'vector' && (layer as any).vectorPath && (() => {
        const innerFP = innerShadowFilter && !isBloom ? innerShadowFilter : undefined
        const combinedPathFilter = [toFilter(layer), innerFP].filter(Boolean).join(' ') || undefined
        const vp: any = (layer as any).vectorPath
        const pts: any[] = vp.points || []
        if (pts.length === 0) return null
        let d = `M ${pts[0].x} ${pts[0].y}`
        for (let i = 1; i < pts.length; i++) {
          const prev = pts[i - 1]
          const cur = pts[i]
          const isBez = cur.type === 'bezier' || prev.type === 'bezier'
          if (isBez) {
            const cp1x = prev.x + (prev.handleOut?.x ?? 0)
            const cp1y = prev.y + (prev.handleOut?.y ?? 0)
            const cp2x = cur.x + (cur.handleIn?.x ?? 0)
            const cp2y = cur.y + (cur.handleIn?.y ?? 0)
            d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${cur.x} ${cur.y}`
          } else {
            d += ` L ${cur.x} ${cur.y}`
          }
        }
        if (vp.closed) d += ' Z'
        // mesmo sistema de traço dos outros vetores (Inkscape-like, escala por espessura)
        const sw = vp.strokeWidth ?? 2
        const dashMap: Record<string, string | undefined> = {
          solid: undefined,
          dashed: `${sw * 4},${sw * 2}`,
          dotted: `${sw * 1},${sw * 2}`,
          'dash-dot': `${sw * 4},${sw * 2},${sw * 1},${sw * 2}`,
        }
        const dash = dashMap[(vp as any).strokeDash || 'solid']
        const skew = (layer.vector as any)?.skewX
        // usa "none" para que 0..100 mapeie exatamente à bbox (igual aos handles CSS), evitando deformação quando bbox não é quadrada
        return (
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" overflow="visible" style={{ width: '100%', height: '100%', display: 'block', filter: combinedPathFilter, transform: skew ? `skewX(${skew}deg)` : undefined, transformOrigin: 'center center' }}>
            <path d={d} fill={vp.closed ? vp.fillColor : 'none'} stroke={vp.strokeColor} strokeWidth={sw} strokeLinejoin="round" strokeLinecap={vp.strokeDash === 'solid' && (vp as any).endCap === 'round' ? 'round' : 'round'} strokeDasharray={dash} vectorEffect="non-scaling-stroke" />
            {(vp as any).endCap === 'arrow' && pts.length >= 2 && (() => {
              const last: any = pts[pts.length - 1]
              let ang: number
              if (last.type === 'bezier' && last.handleIn) {
                ang = Math.atan2(-last.handleIn.y, -last.handleIn.x)
              } else {
                const prev: any = pts[pts.length - 2]
                ang = Math.atan2(last.y - prev.y, last.x - prev.x)
              }
              const capSize = (vp as any).endCapSize > 0 ? (vp as any).endCapSize : 10
              const bboxScreenPx = Math.max(1, Math.min(layer.width*cw, layer.height*ch) * (scale || 1))
              const lenPx = Math.max(8, capSize * 1.8)
              const len = lenPx / bboxScreenPx * 100
              const halfW = len * 0.42
              const tipX = last.x + len * Math.cos(ang)
              const tipY = last.y + len * Math.sin(ang)
              const perpX = -Math.sin(ang), perpY = Math.cos(ang)
              const w1x = last.x + perpX * halfW, w1y = last.y + perpY * halfW
              const w2x = last.x - perpX * halfW, w2y = last.y - perpY * halfW
              return <polygon points={`${tipX},${tipY} ${w1x},${w1y} ${w2x},${w2y}`} fill={vp.strokeColor} stroke={vp.strokeColor} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            })()}
            {(vp as any).endCap === 'round' && pts.length >= 1 && (() => {
              const last: any = pts[pts.length - 1]
              const capSize = (vp as any).endCapSize > 0 ? (vp as any).endCapSize : 10
              const bboxScreenPx = Math.max(1, Math.min(layer.width * cw, layer.height * ch) * (scale || 1))
              const rPx = Math.max(4, capSize * 0.9)
              const r = rPx / bboxScreenPx * 100
              let ang: number
              if (last.type === 'bezier' && last.handleIn) ang = Math.atan2(-last.handleIn.y, -last.handleIn.x)
              else if (pts.length >= 2) { const p = pts[pts.length-2]; ang = Math.atan2(last.y - p.y, last.x - p.x) } else ang = 0
              const cx = last.x + Math.cos(ang) * r * 0.6
              const cy = last.y + Math.sin(ang) * r * 0.6
              return <circle cx={cx} cy={cy} r={r} fill={vp.strokeColor} stroke="none" vectorEffect="non-scaling-stroke" />
            })()}
            {(vp as any).startCap === 'arrow' && pts.length >= 2 && (() => {
              const first: any = pts[0]
              let angF: number
              if (first.type === 'bezier' && first.handleOut) angF = Math.atan2(first.handleOut.y, first.handleOut.x)
              else { const s: any = pts[1]; angF = Math.atan2(s.y - first.y, s.x - first.x) }
              const ang = angF + Math.PI
              const capSize = (vp as any).startCapSize > 0 ? (vp as any).startCapSize : 10
              const bboxScreenPx = Math.max(1, Math.min(layer.width * cw, layer.height * ch) * (scale || 1))
              const lenPx = Math.max(4, capSize)
              const len = lenPx / bboxScreenPx * 100
              const halfW = len * 0.42
              const tipX = first.x + len * Math.cos(ang)
              const tipY = first.y + len * Math.sin(ang)
              const perpX = -Math.sin(ang), perpY = Math.cos(ang)
              const w1x = first.x + perpX * halfW, w1y = first.y + perpY * halfW
              const w2x = first.x - perpX * halfW, w2y = first.y - perpY * halfW
              return <polygon points={`${tipX},${tipY} ${w1x},${w1y} ${w2x},${w2y}`} fill={vp.strokeColor} stroke={vp.strokeColor} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            })()}
            {(vp as any).startCap === 'round' && pts.length >= 1 && (() => {
              const first: any = pts[0]
              const capSize = (vp as any).startCapSize > 0 ? (vp as any).startCapSize : 10
              const bboxScreenPx = Math.max(1, Math.min(layer.width * cw, layer.height * ch) * (scale || 1))
              const rPx = Math.max(4, capSize * 0.9)
              const r = rPx / bboxScreenPx * 100
              let angF: number
              if (first.type === 'bezier' && first.handleOut) angF = Math.atan2(first.handleOut.y, first.handleOut.x)
              else if (pts.length >= 2) { const s:any = pts[1]; angF = Math.atan2(s.y - first.y, s.x - first.x) } else angF = Math.PI
              const ang = angF + Math.PI
              const cx = first.x + Math.cos(ang) * r * 0.6
              const cy = first.y + Math.sin(ang) * r * 0.6
              return <circle cx={cx} cy={cy} r={r} fill={vp.strokeColor} stroke="none" vectorEffect="non-scaling-stroke" />
            })()}
          </svg>
        )
      })()}
      </div>
      {layer.type === 'element' && (() => {
        const fs = px(layer.fontSize)
        const emojiStyle: React.CSSProperties = {
          fontSize: `${fs}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          lineHeight: 1, overflow: 'visible',
          fontFamily: '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Twemoji Mozilla", "EmojiOne Color", sans-serif',
        }
        const outline = layer.outline
        const outlineDrops: string[] = []
        if (outline && (layer.outlineWidthPx ?? 0) > 0) {
          const n = px(layer.outlineWidthPx)
          if (n >= 1) outlineDrops.push(
            `drop-shadow(${n}px 0 0px ${outline.color})`,
            `drop-shadow(${-n}px 0 0px ${outline.color})`,
            `drop-shadow(0 ${n}px 0px ${outline.color})`,
            `drop-shadow(0 ${-n}px 0px ${outline.color})`,
          )
        }
        const frontFilter = toFilter(layer)
        const elemInnerFilter = innerShadowFilter && !isBloom ? innerShadowFilter : undefined
        const combinedElemFilter = [frontFilter, elemInnerFilter].filter(Boolean).join(' ') || undefined
        return (
          <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'visible' }}>
            {outlineDrops.length > 0 && (
              <div style={{
                ...emojiStyle,
                position: 'absolute', inset: 0,
                filter: outlineDrops.join(' '),
                pointerEvents: 'none',
              }}>
                <span>{layer.elementContent}</span>
              </div>
            )}
            <div style={{
              ...emojiStyle,
              width: '100%', height: '100%',
              filter: combinedElemFilter,
            }}>
              <span style={{ display: 'block', textAlign: 'center', lineHeight: 1 }}>{layer.elementContent}</span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

export const Canvas = React.memo(CanvasBase)


function CanvasBase() {
  const template = useStore((s) => s.template)
  const layers = useStore((s) => s.layers)
  const selectedLayerId = useStore((s) => s.selectedLayerId)
  const selectedLayerIds = useStore((s) => s.selectedLayerIds)
  const background = useStore((s) => s.background)
  const selectLayer = useStore((s) => s.selectLayer)
  const toggleLayerSelection = useStore((s) => s.toggleLayerSelection)
  const selectLayers = useStore((s) => s.selectLayers)
  const clearSelection = useStore((s) => s.clearSelection)
  const updateLayer = useStore((s) => s.updateLayer)
  const updateLayers = useStore((s) => s.updateLayers)
  const updateLayersBatch = useStore((s) => s.updateLayersBatch)
  const pushHistory = useStore((s) => s.pushHistory)
  const canvasScale = useStore((s) => s.canvasScale)
  const setCanvasScale = useStore((s) => s.setCanvasScale)
  const panOffset = useStore((s) => s.panOffset)
  const setPanOffset = useStore((s) => s.setPanOffset)
  const resetView = useStore((s) => s.resetView)
  const snapEnabled = useStore((s) => s.snapEnabled)
  const language = useStore((s) => s.language)
  const globalEffects = useStore((s) => s.globalEffects)
  const isolatedGroupId = useStore((s) => s.isolatedGroupId)
  const removeLayer = useStore((s) => s.removeLayer)
  const duplicateLayer = useStore((s) => s.duplicateLayer)
  const moveLayerToIndex = useStore((s) => s.moveLayerToIndex)
  const toggleLockMultiple = useStore((s) => s.toggleLockMultiple)
  const toggleVisibility = useStore((s) => s.toggleVisibility)
  const addImageLayer = useStore((s) => s.addImageLayer)
  const updateVectorPath = useStore((s) => s.updateVectorPath)
  const croppingLayerId = useStore((s) => s.croppingLayerId)
  const setCroppingLayerId = useStore((s) => s.setCroppingLayerId)

  const containerRef = useRef<HTMLDivElement>(null)
  const workAreaRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 })
  useLayoutEffect(() => {
    const el = workAreaRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setContainerSize({ w: width - 32, h: height - 32 })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => () => cancelAnimationFrame(rafRef.current), [])
  useEffect(() => {
    const el = workAreaRef.current
    if (!el) return
    const prevent = (e: MouseEvent) => { if (e.button === 1) e.preventDefault() }
    el.addEventListener('mousedown', prevent)
    return () => el.removeEventListener('mousedown', prevent)
  }, [])
  const [isInteracting, setIsInteracting] = useState(false)
  const isPanelResizing = useStore((s) => s.isPanelResizing)
  const isUiBusy = isInteracting || isPanelResizing
  const panRafRef = useRef<number>(0)
  const pendingPanRef = useRef<{x:number;y:number}|null>(null)
  const wheelRafRef = useRef<number>(0)
  const pendingScaleRef = useRef<number|null>(null)
  const zoomEndTimeoutRef = useRef<number>(0)
  useEffect(()=> ()=> { cancelAnimationFrame(panRafRef.current); cancelAnimationFrame(wheelRafRef.current); if(zoomEndTimeoutRef.current) window.clearTimeout(zoomEndTimeoutRef.current)},[])
  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    const factor = e.deltaY > 0 ? 0.92 : 1.08
    const next = Math.max(0.05, Math.min(10, (pendingScaleRef.current ?? canvasScale) * factor))
    const prev = pendingScaleRef.current ?? canvasScale
    const ratio = next / prev
    // Zoom em relação à visão no editor (viewport), não ao centro do canvas do projeto.
    // Para roda: zoom em direção ao cursor; para fallback sem cursor usa centro da viewport.
    const workRect = workAreaRef.current?.getBoundingClientRect()
    const canvasRect = containerRef.current?.getBoundingClientRect()
    if (workRect && canvasRect) {
      const hasMouse = e.clientX !== 0 || e.clientY !== 0
      const anchorX = hasMouse ? (e.clientX - workRect.left) : workRect.width / 2
      const anchorY = hasMouse ? (e.clientY - workRect.top) : workRect.height / 2
      const canvasCenterX = canvasRect.left - workRect.left + canvasRect.width / 2
      const canvasCenterY = canvasRect.top - workRect.top + canvasRect.height / 2
      const dx = -(anchorX - canvasCenterX) * (ratio - 1)
      const dy = -(anchorY - canvasCenterY) * (ratio - 1)
      const curPan = useStore.getState().panOffset
      setPanOffset({ x: curPan.x + dx, y: curPan.y + dy })
    }
    // mesma otimização de pan/edição: desativa filtros/máscaras durante zoom
    setIsInteracting(true)
    if (zoomEndTimeoutRef.current) window.clearTimeout(zoomEndTimeoutRef.current)
    zoomEndTimeoutRef.current = window.setTimeout(()=> setIsInteracting(false), 280) as unknown as number
    pendingScaleRef.current = next
    if (!wheelRafRef.current) {
      wheelRafRef.current = requestAnimationFrame(()=>{
        if(pendingScaleRef.current!=null) setCanvasScale(pendingScaleRef.current)
        pendingScaleRef.current=null
        wheelRafRef.current=0
      })
    }
  }, [canvasScale, setCanvasScale, setPanOffset])
  // Otimização também durante zoom via botões/atalhos (via mudança de canvasScale)
  const prevScaleRef = useRef(canvasScale)
  useEffect(() => {
    if (prevScaleRef.current === canvasScale) return
    prevScaleRef.current = canvasScale
    setIsInteracting(true)
    if (zoomEndTimeoutRef.current) window.clearTimeout(zoomEndTimeoutRef.current)
    zoomEndTimeoutRef.current = window.setTimeout(()=> setIsInteracting(false), 320) as unknown as number
  }, [canvasScale])
  const [snapGuides, setSnapGuides] = useState<{ vertical: number[]; horizontal: number[] }>({ vertical: [], horizontal: [] })
  const rubberBandRef = useRef<{ sx: number; sy: number; cx: number; cy: number; w: number; h: number } | null>(null)
  const [rubberBand, setRubberBand] = useState<{ sx: number; sy: number; cx: number; cy: number; w: number; h: number } | null>(null)
  const [rotationBbox, setRotationBbox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const panRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const dropCountRef = useRef(0)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const wasSelectedAtFirstClickRef = useRef<Map<string, boolean>>(new Map())
  // Gesto que sai do modo edição é consumido: não inicia move/rubber-band.
  // (O closer regista em captura e corre antes dos handlers de arrasto.)
  const editExitSuppressRef = useRef(false)
  // ESC ou clique fora da bbox sai do modo edição inline — referência: Figma/Canva/Excalidraw
  // Entrada: duplo clique SOMENTE se já selecionado; Saída: ESC ou clique fora
  useEffect(() => {
    if (!editingTextId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingTextId(null)
        try { useStore.getState().pushHistory() } catch {}
        e.preventDefault()
        e.stopPropagation()
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest(`[data-layer-id="${editingTextId}"]`) || target.closest('[data-inline-text-edit]')) return
      // popups (ex.: seletor de cor da toolbar rica) não encerram a edição
      if (target.closest('[data-color-popup="true"]')) return
      // popup de cor aberto: o toque só o dispensa, sem sair da edição
      if (closeOpenColorPopups()) return
      // clique em qualquer lugar fora da bbox/textarea encerra edição (canvas, painéis, etc.) — commit histórico
      // e consome o gesto para o rato não mover nada nesse toque
      editExitSuppressRef.current = true
      window.setTimeout(() => { editExitSuppressRef.current = false }, 0)
      setEditingTextId(null)
      try { useStore.getState().pushHistory() } catch {}
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [editingTextId])
  // Return (Enter) para entrar em edição direta — Figma/Canva: Enter edita texto selecionado
  useEffect(() => {
    if (editingTextId) return
    const onKeyEnter = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      const st = useStore.getState()
      if (st.selectedLayerIds.length !== 1) return
      const lid = st.selectedLayerIds[0]
      const lyr = st.layers.find(l => l.id === lid)
      if (!lyr || lyr.type !== 'text') return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable || target.closest('[data-inline-text-edit]') || target.closest('input,textarea,select'))) return
      e.preventDefault()
      e.stopPropagation()
      setEditingTextId(lid)
    }
    window.addEventListener('keydown', onKeyEnter, true)
    return () => window.removeEventListener('keydown', onKeyEnter, true)
  }, [editingTextId])

  const handleTextDoubleClick = useCallback((e: React.MouseEvent, layerId: string) => {
    // Desativado: edição agora é via Return (Enter) conforme solicitado
    // Mantido apenas para compatibilidade futura, não entra em edição por duplo clique
    const l = layers.find(x => x.id === layerId)
    if (l?.type === 'text' && selectedLayerIds.includes(layerId)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [layers, selectedLayerIds])
  const bezierEditMode = useStore((s) => s.bezierEditMode)
  const setBezierEditMode = useStore((s) => s.setBezierEditMode)
  const selectedBezierPointId = useStore((s) => s.selectedBezierPointId)
  const setSelectedBezierPointId = useStore((s) => s.setSelectedBezierPointId)
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onDown = (e: MouseEvent) => {
      const menu = document.getElementById('ctx-menu-root')
      if (menu && menu.contains(e.target as Node)) return
      close()
    }
    // pointerdown captura cliques fora, mesmo com stopPropagation, e pointerup para drag
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
  }, [contextMenu])
  // Adds an image layer from a real file path, copying it to permanent storage.
  const addImageFromPath = async (filePath: string) => {
    try {
      const { readFile } = await import('@tauri-apps/plugin-fs')
      const data = await readFile(filePath)

      // Copy to permanent storage
      const { copyImageToStorage } = await import('@/store')
      const storagePath = await copyImageToStorage(filePath, data)

      const blob = new Blob([data])
      const url = URL.createObjectURL(blob)
      const img = new Image()
      const dimensions = await new Promise<{ w: number; h: number }>((resolve) => {
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
        img.onerror = () => resolve({ w: 0, h: 0 })
        img.src = url
      })
      const st = useStore.getState()
      const cw = st.template?.width ?? 1280
      const ch = st.template?.height ?? 720
      const maxW = cw * 0.8
      const maxH = ch * 0.8
      let iw: number, ih: number
      if (dimensions.w > 0 && dimensions.h > 0) {
        const scale = Math.min(maxW / dimensions.w, maxH / dimensions.h, 1)
        iw = (dimensions.w * scale) / cw
        ih = (dimensions.h * scale) / ch
      } else {
        iw = 0.8; ih = 0.8
      }
      const name = filePath.split('\\').pop()?.split('/').pop() || 'image'
      st.addImageLayer(storagePath, url, name, iw, ih)
    } catch {}
  }

  // Document-level drag-drop: works even when dragging over nested elements or panels.
  // Module-level cooldown: Tauri native handler sets this timestamp on every drop;
  // the HTML5 handler checks it to avoid double-processing the same OS drop.
  let _tauriDropTs = 0
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      dropCountRef.current++
      setDragOver(true)
    }
    const onDragLeave = () => {
      dropCountRef.current--
      if (dropCountRef.current <= 0) { dropCountRef.current = 0; setDragOver(false) }
    }
    const onDrop = async (e: DragEvent) => {
      e.preventDefault()
      dropCountRef.current = 0
      setDragOver(false)
      // If the Tauri native handler just processed this OS drop (<1s ago), bail out.
      if (Date.now() - _tauriDropTs < 1000) return
      // File drops are handled by Tauri's onDragDropEvent (which has real paths).
      // URL drops (text/uri-list from browser drag) still come through HTML5.
      // Skip entirely if the drag carried files — on Tauri v2 Windows, the HTML5
      // event often fires alongside onDragDropEvent but files is an empty FileList,
      // so we check the types array instead of files.length.
      if (e.dataTransfer?.types.includes('Files')) return
      const urls: string[] = []
      if (e.dataTransfer?.types.includes('text/uri-list')) {
        const uriList = e.dataTransfer.getData('text/uri-list')
        // OS file drops often expose file:// URIs here — Tauri handles the real paths.
        if (/^file:\/\//im.test(uriList)) return
        for (const line of uriList.split('\n')) {
          const url = line.trim()
          if (url && !url.startsWith('#')) urls.push(url)
        }
      }
      if (urls.length === 0 && e.dataTransfer?.types.includes('text/plain')) {
        const text = e.dataTransfer.getData('text/plain').trim()
        if (/^https?:\/\//i.test(text)) urls.push(text)
      }
      for (const imageUrl of urls) {
        try {
          const resp = await fetch(imageUrl)
          if (!resp.ok) continue
          const contentType = resp.headers.get('content-type') || ''
          if (!contentType.startsWith('image/') && !imageUrl.endsWith('.svg')) continue
          const blob = await resp.blob()
          const url = URL.createObjectURL(blob)
          const img = new Image()
          const dimensions = await new Promise<{ w: number; h: number }>((resolve) => {
            img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
            img.onerror = () => resolve({ w: 0, h: 0 })
            img.src = url
          })
          const st = useStore.getState()
          const cw = st.template?.width ?? 1280
          const ch = st.template?.height ?? 720
          const maxW = cw * 0.8
          const maxH = ch * 0.8
          let iw: number, ih: number
          if (dimensions.w > 0 && dimensions.h > 0) {
            const scale = Math.min(maxW / dimensions.w, maxH / dimensions.h, 1)
            iw = (dimensions.w * scale) / cw
            ih = (dimensions.h * scale) / ch
          } else {
            iw = 0.8; ih = 0.8
          }
          const name = imageUrl.split('/').pop()?.split('?')[0] || 'image'
          st.addImageLayer(imageUrl, url, name, iw, ih)
        } catch {}
      }
    }
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)

    // Tauri native OS file drag-drop (HTML5 drop does not receive real file
    // paths in Tauri webviews). This is the path that actually fires when the
    // user drags image files from the OS into the app.
    // Guard: Tauri v2 on Windows can fire multiple 'drop' events for the same
    // OS drop operation. Dedup by normalized path so even separator-different duplicates are caught.
    const recentDrops = new Set<string>()
    let unlistenTauri: (() => void) | undefined
    let cancelled = false
    ;(async () => {
      try {
        const { getCurrentWebview } = await import('@tauri-apps/api/webview')
        if (cancelled) return
        unlistenTauri = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === 'drop') {
            _tauriDropTs = Date.now()
            setDragOver(false)
            const paths = event.payload.paths || []
            for (const p of paths) {
              // Normalise path separators so \\ vs / don't bypass dedup
              const normalised = p.replace(/\\/g, '/')
              const lower = normalised.toLowerCase()
              if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') ||
                  lower.endsWith('.webp') || lower.endsWith('.bmp') || lower.endsWith('.gif') || lower.endsWith('.svg')) {
                if (recentDrops.has(normalised)) continue
                recentDrops.add(normalised)
                setTimeout(() => recentDrops.delete(normalised), 3000)
                void addImageFromPath(p)
              }
            }
          } else if (event.payload.type === 'over') {
            setDragOver(true)
          } else if (event.payload.type === 'leave') {
            setDragOver(false)
          }
        })
      } catch {}
    })()

    return () => {
      cancelled = true
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
      if (unlistenTauri) unlistenTauri()
    }
  }, [])
  useEffect(() => {
    const el = workAreaRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const targetLayer = (e.target as HTMLElement)?.closest('.canvas-layer') as HTMLElement | null
      const clickedId = targetLayer?.getAttribute('data-layer-id') ?? null
      // Ctrl+right-click deselects the clicked item
      if (e.ctrlKey || e.metaKey) {
        if (clickedId) {
          const s = useStore.getState()
          if (s.selectedLayerIds.includes(clickedId)) {
            s.toggleLayerSelection(clickedId)
          }
        }
        setContextMenu(null)
        return
      }
      // Select the clicked layer (if any) so context menu reflects it
      let s = useStore.getState()
      if (clickedId && !s.selectedLayerIds.includes(clickedId)) {
        s.selectLayer(clickedId)
      }
      s = useStore.getState()
      if (s.selectedLayerIds.length > 0) {
        setContextMenu({ x: e.clientX, y: e.clientY })
      } else {
        setContextMenu(null)
      }
    }
    el.addEventListener('contextmenu', handler, true)
    return () => el.removeEventListener('contextmenu', handler, true)
  }, [])

  const dragRef = useRef<{
    ids: string[]; mode: 'move' | 'resize' | 'rotate'
    handle: string; startX: number; startY: number
    origStates: Map<string, { x: number; y: number; width: number; height: number; rotation: number; fontSize: number }>
    origRotation: number; origFontSize: number; aspect: number
    hasMoved: boolean; historySaved: boolean; startAngle?: number
    groupOrigBbox?: { x: number; y: number; width: number; height: number }
    rotateAnchor?: { x: number; y: number }
    scaleFromCenter?: boolean
    origTextData?: Map<string, { text:string; font:string; fontStyle:string; fontWeight:number; lineHeight:number; letterSpacing:number; textTransform:string; autoFit:boolean; fontSize:number }>
  } | null>(null)

  const pointerMoveRef = useRef<(e: PointerEvent) => void>(() => {})
  const pointerUpRef = useRef<(e: PointerEvent) => void>(() => {})
  const rafRef = useRef<number>(0)
  const pendingEventRef = useRef<PointerEvent | null>(null)

  if (!template) return null

  const cw = template.width
  const ch = template.height
  const baseScale = Math.min(containerSize.w / cw, containerSize.h / ch, 1)
  const scale = baseScale * canvasScale
  // escala visual para handles/bbox — aumenta com resolução (ex: 1920x1080 vs 1280x720)
  const resScale = Math.max(1, Math.min(2.2, Math.sqrt(cw * ch) / Math.sqrt(1280 * 720)))
  const handlePx = (v: number) => Math.round(v * resScale)
  const handleSizeFactor = useStore((s) => s.handleSize) ?? 1
  // tamanho dinâmico corrigido: inverso ao zoom para não ficar gigante (screen-constant)
  const bboxMetrics = useMemo(() => {
    const zoomPowInv = Math.pow(canvasScale, -0.22)
    const hs = Math.round(Math.max(8, Math.min(40, 18 * resScale * handleSizeFactor * zoomPowInv)))
    const half = Math.round(hs / 2)
    const border = Math.round(Math.max(1, Math.min(8, 2 * resScale * handleSizeFactor * Math.pow(canvasScale, -0.15))))
    const bHalf = Math.round(border / 2)
    const rSize = Math.round(Math.max(12, Math.min(36, 24 * resScale * handleSizeFactor * zoomPowInv)))
    const rHalf = Math.round(rSize / 2)
    const stem = Math.round(Math.max(12, Math.min(56, 28 * resScale * handleSizeFactor * Math.pow(canvasScale, -0.18))))
    const rTop = -(stem + rSize)
    const rStemH = stem
    return { hs, half, border, bHalf, rSize, rHalf, rTop, rStemH }
  }, [resScale, canvasScale, handleSizeFactor])

  const sortedLayers = useMemo(() => [...layers].sort((a, b) => a.zIndex - b.zIndex), [layers])
  const groupVisibility = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const l of layers) if (l.type === 'group') m.set(l.id, l.visible)
    return m
  }, [layers])
  const groupLocked = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const l of layers) if (l.type === 'group') m.set(l.id, l.locked)
    return m
  }, [layers])

  const px = useCallback((v: number) => Math.round(v), [])

  const toFilter = (layer: Layer): string | undefined => {
    const f: string[] = []
    if (layer.brightness !== 1) f.push(`brightness(${layer.brightness})`)
    // blur lives on the OUTER wrapper so it can overflow the bounding box
    if (layer.contrast !== 1) f.push(`contrast(${layer.contrast})`)
    if (layer.saturation !== 1) f.push(`saturate(${layer.saturation})`)
    if (layer.hueRotate !== 0) f.push(`hue-rotate(${layer.hueRotate}deg)`)
    if (layer.sepia !== 0) f.push(`sepia(${layer.sepia})`)
    if (layer.negative) f.push('invert(1)')
    return f.length > 0 ? f.join(' ') : undefined
  }

  const toBlurFilter = (layer: Layer): string | undefined => {
    return layer.blur > 0 ? `blur(${px(layer.blur)}px)` : undefined
  }

  function colorWithIntensity(color: string, intensity: number): string {
    const i = Math.max(0, Math.min(1, intensity ?? 0.6))
    if (i >= 0.99) return color
    if (color.startsWith('#')) {
      const hex = color.slice(1)
      let r=0,g=0,b=0
      if (hex.length===3) { r=parseInt(hex[0]+hex[0],16); g=parseInt(hex[1]+hex[1],16); b=parseInt(hex[2]+hex[2],16) }
      else if (hex.length>=6) { r=parseInt(hex.slice(0,2),16); g=parseInt(hex.slice(2,4),16); b=parseInt(hex.slice(4,6),16) }
      else return color
      return `rgba(${r},${g},${b},${i})`
    }
    if (color.startsWith('rgba')) {
      return color.replace(/rgba\(([^)]+)\)/, (_, inner)=>{
        const parts=inner.split(',').map((s:string)=>s.trim())
        const a= parseFloat(parts[3]||'1')*i
        return `rgba(${parts[0]},${parts[1]},${parts[2]},${a})`
      })
    }
    if (color.startsWith('rgb')) {
      return color.replace(/rgb\(([^)]+)\)/, (_, inner)=>{
        const parts=inner.split(',').map((s:string)=>s.trim())
        return `rgba(${parts[0]},${parts[1]},${parts[2]},${i})`
      })
    }
    return color
  }

  const toShadow = (layer: Layer): string => {
    const s: string[] = []
    const push = (sh: typeof layer.shadow) => {
      if (!sh) return
      if (sh.inset) return // inset handled via innerShadow overlay / separate
      const c = colorWithIntensity(sh.color, sh.intensity ?? 0.6)
      s.push(`${px(sh.offsetX)}px ${px(sh.offsetY)}px ${px(sh.blur)}px ${c}`)
    }
    push(layer.shadow)
    // legacy: if shadow was inset, treat as inner handled elsewhere
    return s.join(', ') || 'none'
  }

  const toShadowFilter = (layer: Layer): string | undefined => {
    const drops: string[] = []
    const push = (sh: typeof layer.shadow) => {
      if (!sh) return
      if (sh.inset) return
      const c = colorWithIntensity(sh.color, sh.intensity ?? 0.6)
      drops.push(`drop-shadow(${px(sh.offsetX)}px ${px(sh.offsetY)}px ${px(sh.blur)}px ${c})`)
    }
    push(layer.shadow)
    return drops.length > 0 ? drops.join(' ') : undefined
  }

  const toInnerShadowStyle = (layer: Layer): React.CSSProperties | null => {
    const sh = layer.innerShadow || (layer.shadow?.inset ? layer.shadow : null)
    if (!sh) return null
    const c = colorWithIntensity(sh.color, sh.intensity ?? 0.5)
    const inset = `inset ${px(sh.offsetX)}px ${px(sh.offsetY)}px ${px(sh.blur)}px ${c}`
    return { boxShadow: inset, borderRadius: layer.borderRadiusPx ? `${px(layer.borderRadiusPx)}px` : undefined }
  }

  function dropShadowOutline(n: number, color: string): string[] {
    return [
      `drop-shadow(${n}px 0 0px ${color})`,
      `drop-shadow(${-n}px 0 0px ${color})`,
      `drop-shadow(0 ${n}px 0px ${color})`,
      `drop-shadow(0 ${-n}px 0px ${color})`,
    ]
  }

  const outlineFilter = (layer: Layer): string | undefined => {
    const drops: string[] = []
    if (layer.outline && (layer.outlineWidthPx ?? 0) > 0) {
      drops.push(...dropShadowOutline(px(layer.outlineWidthPx), layer.outline.color))
    }
    return drops.length > 0 ? drops.join(' ') : undefined
  }

  function parseCSSGradient(css: string): { type: 'linear' | 'radial'; x1?: number; y1?: number; x2?: number; y2?: number; stops: { offset: string; color: string }[] } | null {
    const linearM = css.match(/linear-gradient\(\s*([^,]+)\s*,(.+)\)/)
    if (linearM) {
      let angle = 135
      const rawDir = linearM[1].trim()
      if (rawDir.endsWith('deg')) angle = parseFloat(rawDir)
      const rad = angle * Math.PI / 180
      const sin = Math.sin(rad), cos = Math.cos(rad)
      const stops = parseStops(linearM[2])
      return { type: 'linear', x1: 0.5 - sin / 2, y1: 0.5 + cos / 2, x2: 0.5 + sin / 2, y2: 0.5 - cos / 2, stops }
    }
    const radialM = css.match(/radial-gradient\(\s*(circle)?\s*,?\s*(.+)\)/)
    if (radialM) {
      const stops = parseStops(radialM[2])
      return { type: 'radial', stops }
    }
    return null
  }

  function parseStops(raw: string): { color: string; offset: string }[] {
    const stops: { color: string; offset: string }[] = []
    let depth = 0, cur = ''
    for (const ch of raw) {
      if (ch === '(') depth++
      else if (ch === ')') depth--
      if (ch === ',' && depth === 0) { stops.push(parseStop(cur.trim())); cur = '' }
      else cur += ch
    }
    if (cur.trim()) stops.push(parseStop(cur.trim()))
    const hasPos = stops.some(s => s.offset !== 'auto')
    if (!hasPos && stops.length > 1) {
      stops.forEach((s, i, a) => { s.offset = `${Math.round((i / (a.length - 1)) * 100)}%` })
    }
    return stops
  }

  function parseStop(s: string): { color: string; offset: string } {
    const h = s.match(/^(#[0-9A-Fa-f]{3,8}|rgba?\([^)]+\))(?:\s+([\d.]+%))?$/)
    if (h) return { color: h[1], offset: h[2] || 'auto' }
    const parts = s.split(/\s+/)
    return { color: parts[0], offset: parts[1] || 'auto' }
  }

  const bgStyle: React.CSSProperties = {}
  if (background.type === 'color' && background.color !== 'transparent') bgStyle.backgroundColor = background.color
  else if (background.type === 'gradient') bgStyle.background = background.gradient

  const onDragMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d || !containerRef.current) return
    if (!d.historySaved) {
      pushHistory()
      d.historySaved = true
    }
    d.hasMoved = true
    const rect = containerRef.current.getBoundingClientRect()
    let dx = ((e.clientX - d.startX) / rect.width) * RESIZE_SENS
    let dy = ((e.clientY - d.startY) / rect.height) * RESIZE_SENS

    if (d.mode === 'move') {
      let snapDx = 0, snapDy = 0
      let guides: { vertical: number[]; horizontal: number[] } = { vertical: [], horizontal: [] }
      const shouldSnap = snapEnabled && !(isUiBusy && canvasScale > 1.5)
      if (shouldSnap) {
        const SNAP_THRESHOLD = 0.012
        let selMinX = Infinity, selMinY = Infinity, selMaxX = -Infinity, selMaxY = -Infinity
        for (const [, o] of d.origStates) {
          if (o.x < selMinX) selMinX = o.x
          if (o.y < selMinY) selMinY = o.y
          if (o.x + o.width > selMaxX) selMaxX = o.x + o.width
          if (o.y + o.height > selMaxY) selMaxY = o.y + o.height
        }
        const movingLeft = selMinX + dx
        const movingRight = selMaxX + dx
        const movingTop = selMinY + dy
        const movingBottom = selMaxY + dy
        const movingCx = (movingLeft + movingRight) / 2
        const movingCy = (movingTop + movingBottom) / 2
        const snapXSet = new Set<number>([0, 0.5, 1])
        const snapYSet = new Set<number>([0, 0.5, 1])
        for (const l of layers) {
          if (d.ids.includes(l.id) || !l.visible) continue
          snapXSet.add(l.x)
          snapXSet.add(l.x + l.width)
          snapXSet.add(l.x + l.width / 2)
          snapYSet.add(l.y)
          snapYSet.add(l.y + l.height)
          snapYSet.add(l.y + l.height / 2)
        }
        const snapTargetsX: number[] = Array.from(snapXSet)
        const snapTargetsY: number[] = Array.from(snapYSet)
        const findBest = (vals: number[], movingVals: number[]) => {
          let bestDelta = 0, bestDist = SNAP_THRESHOLD, bestAnchor = -1
          for (const m of movingVals) {
            for (const t of vals) {
              const d2 = t - m
              if (Math.abs(d2) < bestDist) {
                bestDist = Math.abs(d2)
                bestDelta = d2
                bestAnchor = t
              }
            }
          }
          return { delta: bestDelta, anchor: bestAnchor }
        }
        const rx = findBest(snapTargetsX, [movingLeft, movingRight, movingCx])
        const ry = findBest(snapTargetsY, [movingTop, movingBottom, movingCy])
        if (rx.anchor >= 0) {
          snapDx = rx.delta
          guides.vertical.push(rx.anchor)
        }
        if (ry.anchor >= 0) {
          snapDy = ry.delta
          guides.horizontal.push(ry.anchor)
        }
      }
      const finalDx = dx + snapDx
      const finalDy = dy + snapDy
      const patches: Record<string, Partial<Layer>> = {}
      for (const id of d.ids) {
        const orig = d.origStates.get(id)
        if (!orig) continue
        patches[id] = { x: orig.x + finalDx, y: orig.y + finalDy }
      }
      updateLayersBatch(patches)
      setSnapGuides(guides)
    } else if (d.mode === 'resize') {
      setSnapGuides({ vertical: [], horizontal: [] })
      const liveScaleFromCenter = e.altKey
      const h = d.handle
      const corner = h.length === 2
      // canto: uniforme por padrão, Ctrl libera; borda: Ctrl trava
      const wantsUniform = corner ? !(e.ctrlKey || e.metaKey) : (e.ctrlKey || e.metaKey)
      const primaryOrig = d.origStates.get(d.ids[0])
      if (!primaryOrig) return
      const rad = primaryOrig.rotation * Math.PI / 180
      const cosA = Math.cos(rad)
      const sinA = Math.sin(rad)
      let x = primaryOrig.x, y = primaryOrig.y, w = primaryOrig.width, hh = primaryOrig.height
      const effectiveAspect = wantsUniform
        ? (d.aspect > 0 ? d.aspect : primaryOrig.width / Math.max(0.001, primaryOrig.height))
        : d.aspect

      if (corner) {
        const moveSignX = h.includes('e') ? 1 : -1
        const moveSignY = h.includes('s') ? 1 : -1
        const anchorSignX = liveScaleFromCenter ? 0 : -moveSignX
        const anchorSignY = liveScaleFromCenter ? 0 : -moveSignY
        const origCx = primaryOrig.x + primaryOrig.width / 2
        const origCy = primaryOrig.y + primaryOrig.height / 2
        const anchorLocal = {
          x: anchorSignX * primaryOrig.width / 2,
          y: anchorSignY * primaryOrig.height / 2,
        }
        const movingLocal = {
          x: moveSignX * primaryOrig.width / 2,
          y: moveSignY * primaryOrig.height / 2,
        }
        const anchorOffset = rotatePoint(anchorLocal.x, anchorLocal.y, cosA, sinA)
        const movingOffset = rotatePoint(movingLocal.x, movingLocal.y, cosA, sinA)
        const anchorWorld = { x: origCx + anchorOffset.x, y: origCy + anchorOffset.y }
        const movingWorld = { x: origCx + movingOffset.x + dx, y: origCy + movingOffset.y + dy }
        const targetFromAnchor = {
          x: movingWorld.x - anchorWorld.x,
          y: movingWorld.y - anchorWorld.y,
        }
        const targetLocal = {
          x: targetFromAnchor.x * cosA + targetFromAnchor.y * sinA,
          y: -targetFromAnchor.x * sinA + targetFromAnchor.y * cosA,
        }

        let rawW = liveScaleFromCenter ? Math.abs(targetLocal.x) * 2 : Math.abs(targetLocal.x)
        let rawH = liveScaleFromCenter ? Math.abs(targetLocal.y) * 2 : Math.abs(targetLocal.y)
        if (effectiveAspect > 0) {
          if (rawW / Math.max(0.001, rawH) > effectiveAspect) rawH = rawW / effectiveAspect
          else rawW = rawH * effectiveAspect
        }
        w = Math.max(MIN_LAYER_SIZE, rawW)
        hh = Math.max(MIN_LAYER_SIZE, rawH)
        if (effectiveAspect > 0) {
          // preserva proporção mesmo quando atinge o mínimo — evita "só vertical"
          if (w === MIN_LAYER_SIZE) hh = Math.max(MIN_LAYER_SIZE, w / effectiveAspect)
          if (hh === MIN_LAYER_SIZE) w = Math.max(MIN_LAYER_SIZE, hh * effectiveAspect)
        }

        const nextAnchorLocal = {
          x: anchorSignX * w / 2,
          y: anchorSignY * hh / 2,
        }
        const nextAnchorOffset = rotatePoint(nextAnchorLocal.x, nextAnchorLocal.y, cosA, sinA)
        const nextCx = anchorWorld.x - nextAnchorOffset.x
        const nextCy = anchorWorld.y - nextAnchorOffset.y
        x = nextCx - w / 2
        y = nextCy - hh / 2
      } else {
        const lx = dx * cosA + dy * sinA
        const ly = -dx * sinA + dy * cosA
        const hx = h.includes('e') ? primaryOrig.x + primaryOrig.width : h.includes('w') ? primaryOrig.x : primaryOrig.x + primaryOrig.width / 2
        const hy = h.includes('s') ? primaryOrig.y + primaryOrig.height : h.includes('n') ? primaryOrig.y : primaryOrig.y + primaryOrig.height / 2
        const mx = hx + lx
        const my = hy + ly

        if (liveScaleFromCenter) {
          const origCx = primaryOrig.x + primaryOrig.width / 2
          const origCy = primaryOrig.y + primaryOrig.height / 2
          if (effectiveAspect > 0 && wantsUniform && (h.includes('e') || h.includes('w')) && !(h.includes('s') || h.includes('n'))) {
            const deltaW = Math.abs(mx - origCx) * 2
            w = Math.max(MIN_LAYER_SIZE, deltaW)
            hh = w / effectiveAspect
            x = origCx - w / 2
            y = origCy - hh / 2
          } else if (effectiveAspect > 0 && wantsUniform && (h.includes('s') || h.includes('n')) && !(h.includes('e') || h.includes('w'))) {
            const deltaH = Math.abs(my - origCy) * 2
            hh = Math.max(MIN_LAYER_SIZE, deltaH)
            w = hh * effectiveAspect
            x = origCx - w / 2
            y = origCy - hh / 2
          } else {
            if (h.includes('e') || h.includes('w')) {
              const deltaW = Math.abs(mx - origCx) * 2
              w = Math.max(MIN_LAYER_SIZE, deltaW)
              x = origCx - w / 2
            }
            if (h.includes('s') || h.includes('n')) {
              const deltaH = Math.abs(my - origCy) * 2
              hh = Math.max(MIN_LAYER_SIZE, deltaH)
              y = origCy - hh / 2
            }
          }
        } else if (effectiveAspect > 0) {
          if (h.includes('e') || h.includes('w')) {
            w = Math.max(MIN_LAYER_SIZE, h.includes('w') ? primaryOrig.x + primaryOrig.width - mx : mx - primaryOrig.x)
            hh = w / effectiveAspect
            if (h.includes('w')) x = primaryOrig.x + primaryOrig.width - w
            // quando trava proporção via lateral, centraliza no eixo oposto
            if (wantsUniform) {
              const origCy = primaryOrig.y + primaryOrig.height / 2
              y = origCy - hh / 2
            }
          } else {
            hh = Math.max(MIN_LAYER_SIZE, h.includes('n') ? primaryOrig.y + primaryOrig.height - my : my - primaryOrig.y)
            w = hh * effectiveAspect
            if (h.includes('n')) y = primaryOrig.y + primaryOrig.height - hh
            if (wantsUniform) {
              const origCx = primaryOrig.x + primaryOrig.width / 2
              x = origCx - w / 2
            }
          }
        } else {
          if (h.includes('e')) w = Math.max(MIN_LAYER_SIZE, mx - primaryOrig.x)
          if (h.includes('w')) { w = Math.max(MIN_LAYER_SIZE, primaryOrig.x + primaryOrig.width - mx); x = mx }
          if (h.includes('s')) hh = Math.max(MIN_LAYER_SIZE, my - primaryOrig.y)
          if (h.includes('n')) { hh = Math.max(MIN_LAYER_SIZE, primaryOrig.y + primaryOrig.height - my); y = my }
        }
      }
      w = Math.max(MIN_LAYER_SIZE, w); hh = Math.max(MIN_LAYER_SIZE, hh)

      const nw = w / primaryOrig.width
      const nh = hh / primaryOrig.height
      if (d.ids.length === 1) {
        const orig = d.origStates.get(d.ids[0])
        if (orig) {
          const txtData = d.origTextData?.get(d.ids[0])
          const isText = !!txtData
          if(isText && txtData){
            // bounding box de textos deve transformar exatamente como outros objetos (sem recalcular quebra)
            const patch: any = { width: w, height: hh, x, y, autoFit: false }
            if (corner && d.origFontSize > 0) {
              const uni = Math.sqrt(Math.max(0.01, nw*nh))
              patch.fontSize = Math.max(8, Math.round(d.origFontSize * uni))
            }
            updateLayer(d.ids[0], patch)
          } else {
            const patch: Partial<Layer> = {
              width: Math.max(MIN_LAYER_SIZE, orig.width * nw),
              height: Math.max(MIN_LAYER_SIZE, orig.height * nh),
              x, y,
            }
            if (d.origFontSize > 0 && corner) {
              patch.fontSize = Math.max(8, Math.round(d.origFontSize * Math.sqrt(nw * nh)))
            }
            updateLayer(d.ids[0], patch)
          }
        }
      } else {
        const gb = d.groupOrigBbox
        if (!gb) return
        const h = d.handle
        const corner = h.length === 2
        const gbCx = gb.x + gb.width / 2
        const gbCy = gb.y + gb.height / 2

        let sx: number, sy: number
        let anchorX: number, anchorY: number

        if (corner) {
          if (liveScaleFromCenter) {
            anchorX = gbCx; anchorY = gbCy
          } else {
            if (h === 'se') { anchorX = gb.x; anchorY = gb.y }
            else if (h === 'sw') { anchorX = gb.x + gb.width; anchorY = gb.y }
            else if (h === 'ne') { anchorX = gb.x; anchorY = gb.y + gb.height }
            else { anchorX = gb.x + gb.width; anchorY = gb.y + gb.height }
          }
          // escala linear estável: usa largura/altura em vez de diagonal para evitar salto exponencial
          let rawW = gb.width + (h.includes('e') ? dx : h.includes('w') ? -dx : 0) * (liveScaleFromCenter ? 2 : 1)
          let rawH = gb.height + (h.includes('s') ? dy : h.includes('n') ? -dy : 0) * (liveScaleFromCenter ? 2 : 1)
          rawW = Math.max(MIN_LAYER_SIZE, rawW)
          rawH = Math.max(MIN_LAYER_SIZE, rawH)
          if (wantsUniform) {
            const aspect = gb.width / Math.max(0.001, gb.height)
            if (Math.abs(rawW) >= Math.abs(rawH) * aspect) rawH = rawW / aspect
            else rawW = rawH * aspect
          }
          sx = Math.max(0.01, rawW / gb.width)
          sy = Math.max(0.01, rawH / gb.height)
        } else {
          if (liveScaleFromCenter) {
            anchorX = gbCx; anchorY = gbCy
          } else {
            anchorX = h.includes('e') ? gb.x : h.includes('w') ? gb.x + gb.width : gbCx
            anchorY = h.includes('s') ? gb.y : h.includes('n') ? gb.y + gb.height : gbCy
          }
          sx = gb.width > 0 ? Math.max(0.01, (gb.width + (h.includes('e') ? dx : h.includes('w') ? -dx : 0)) / gb.width) : 1
          sy = gb.height > 0 ? Math.max(0.01, (gb.height + (h.includes('s') ? dy : h.includes('n') ? -dy : 0)) / gb.height) : 1
          if (wantsUniform) {
            if (h.includes('e') || h.includes('w')) sy = sx
            else if (h.includes('s') || h.includes('n')) sx = sy
          }
        }

        // snap durante redimensionamento desativado — mantém movimento livre e evita salto da borda
        void snapEnabled

        const batchPatches: Record<string, Partial<Layer>> = {}
        for (const [id, orig] of d.origStates) {
          // bounding box de textos transforma exatamente como outros objetos (sem recalcular quebra)
          const origCx = orig.x + orig.width / 2
          const origCy = orig.y + orig.height / 2
          const newCx = anchorX + (origCx - anchorX) * sx
          const newCy = anchorY + (origCy - anchorY) * sy
          const newW = Math.max(MIN_LAYER_SIZE, orig.width * sx)
          const newH = Math.max(MIN_LAYER_SIZE, orig.height * sy)
          const txtDataBatch = d.origTextData?.get(id)
          const isTextBatch = !!txtDataBatch
          const patch: any = {
            x: newCx - newW / 2,
            y: newCy - newH / 2,
            width: newW,
            height: newH,
            ...(isTextBatch ? { autoFit: false } : {}),
          }
          if (corner && orig.fontSize > 0) {
            const uni = Math.sqrt(Math.max(0.01, sx*sy))
            patch.fontSize = Math.max(8, Math.round(orig.fontSize * uni))
          }
          batchPatches[id] = patch
        }
        updateLayersBatch(batchPatches)
      }
    } else if (d.mode === 'rotate') {
      setSnapGuides({ vertical: [], horizontal: [] })
      if (d.origStates.size === 0) return
      const rect = containerRef.current.getBoundingClientRect()
      // Âncora única para todo o grupo — rotação rígida como um só objeto
      let centroidX: number, centroidY: number
      if (d.rotateAnchor) { centroidX = d.rotateAnchor.x; centroidY = d.rotateAnchor.y }
      else {
        let mnx=Infinity,mny=Infinity,mxx=-Infinity,mxy=-Infinity
        for(const[,o]of d.origStates){const cx=o.x+o.width/2,cy=o.y+o.height/2,hw=o.width/2,hh=o.height/2,rad=o.rotation*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad); for(const[ lx,ly] of [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]] as const){const rx=cx+lx*cos - ly*sin, ry=cy+lx*sin+ly*cos; if(rx<mnx)mnx=rx; if(ry<mny)mny=ry; if(rx>mxx)mxx=rx; if(ry>mxy)mxy=ry}}
        centroidX=(mnx+mxx)/2; centroidY=(mny+mxy)/2
      }
      const screenCx = rect.left + centroidX * rect.width
      const screenCy = rect.top + centroidY * rect.height
      const angle = -Math.atan2(e.clientX - screenCx, e.clientY - screenCy) * (180 / Math.PI)
      let rot = (angle % 360 + 360) % 360
      if (rot > 180) rot -= 360
      if (d.startAngle === undefined) {
        d.startAngle = rot
      }
      let delta = rot - d.startAngle

      if (snapEnabled) {
        const SNAP_ANGLES = [0, 45, 90, 135, 180, -45, -90, -135, -180]
        const SNAP_THRESHOLD_DEG = 5
        let bestAngle = delta
        let bestDist = SNAP_THRESHOLD_DEG
        for (const a of SNAP_ANGLES) {
          const diff = Math.abs(delta - a)
          if (diff < bestDist) { bestDist = diff; bestAngle = a }
        }
        if (bestDist < SNAP_THRESHOLD_DEG) {
          delta = bestAngle
          setSnapGuides({ vertical: [], horizontal: [] })
        }
      }
      const rad = delta * Math.PI / 180
      const cosA = Math.cos(rad)
      const sinA = Math.sin(rad)
      const rotatePatches: Record<string, Partial<Layer>> = {}
      for (const id of d.ids) {
        const orig = d.origStates.get(id)
        if (!orig) continue
        const origCx = orig.x + orig.width / 2
        const origCy = orig.y + orig.height / 2
        const ox = origCx - centroidX
        const oy = origCy - centroidY
        const nx = ox * cosA - oy * sinA
        const ny = ox * sinA + oy * cosA
        const newCx = centroidX + nx
        const newCy = centroidY + ny
        let r = orig.rotation + delta
        while (r > 180) r -= 360
        while (r < -180) r += 360
        rotatePatches[id] = { x: newCx - orig.width / 2, y: newCy - orig.height / 2, rotation: r }
      }
      updateLayersBatch(rotatePatches)
    }
  }, [pushHistory, updateLayer, updateLayersBatch, snapEnabled, layers, cw, ch, isUiBusy, canvasScale])

  const onDragEnd = useCallback(() => {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    setRotationBbox(null)
    setSnapGuides({ vertical: [], horizontal: [] })
    document.removeEventListener('pointermove', pointerMoveRef.current)
    document.removeEventListener('pointerup', pointerUpRef.current)
    setTimeout(()=>setIsInteracting(false), 80)
  }, [pushHistory])

  pointerMoveRef.current = (e: PointerEvent) => {
    cancelAnimationFrame(rafRef.current)
    pendingEventRef.current = e
    rafRef.current = requestAnimationFrame(() => {
      if (pendingEventRef.current) {
        onDragMove(pendingEventRef.current)
        pendingEventRef.current = null
      }
    })
  }
  pointerUpRef.current = onDragEnd

  const handleMoveStart = useCallback((e: React.PointerEvent, layerId: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const layer = layers.find((l) => l.id === layerId)
    if (!layer || layer.locked) return
    const parentGroupLocked = layer.groupId && layers.find((l) => l.id === layer.groupId)?.locked
    if (parentGroupLocked) return
    // Ctrl+drag = copy: deixa cópia na origem e arrasta o duplicado
    const isCopyDrag = !!(e.ctrlKey || e.metaKey)
    if (isCopyDrag) {
      const idsToDup = selectedLayerIds.includes(layerId) ? selectedLayerIds.filter((id) => {
        const l = layers.find((x) => x.id === id)
        return l && !l.locked && !l.isBackground && l.type !== 'mask'
      }) : [layerId]
      if (idsToDup.length > 0) {
        const st = useStore.getState()
        // duplicação exata (sem offset) — já cria seleção nos novos ids
        st.duplicateLayerExact(idsToDup)
        const after = useStore.getState()
        const newIds = after.selectedLayerIds
        if (newIds.length > 0) {
          const origStates = new Map<string, { x: number; y: number; width: number; height: number; rotation: number; fontSize: number }>()
          for (const id of newIds) {
            const l = after.layers.find((x) => x.id === id)
            if (l && !l.locked) origStates.set(id, { x: l.x, y: l.y, width: l.width, height: l.height, rotation: l.rotation, fontSize: l.fontSize })
          }
          if (origStates.size === 0) return
          dragRef.current = { ids: Array.from(origStates.keys()), mode: 'move', handle: '', startX: e.clientX, startY: e.clientY, origStates, origRotation: 0, origFontSize: 0, aspect: 0, hasMoved: false, historySaved: false }
          setIsInteracting(true)
          document.addEventListener('pointermove', pointerMoveRef.current)
          document.addEventListener('pointerup', pointerUpRef.current)
          return
        }
      }
    }
    // If target is a group, expand to its children
    const isGroup = layer.type === 'group'
    let ids: string[]
    if (isGroup) {
      const childIds = layers.filter((l) => l.groupId === layerId && !l.locked).map((l) => l.id)
      const alreadySelected = selectedLayerIds.includes(layerId) || childIds.some((id) => selectedLayerIds.includes(id))
      if (alreadySelected) {
        // já selecionado: mantém seleção atual para mover múltiplos
        const filtered = selectedLayerIds.filter((id) => {
          const l = layers.find((x) => x.id === id)
          return l && !l.locked && !l.isBackground && l.type !== 'mask'
        })
        ids = filtered.length > 0 ? filtered : childIds
      } else {
        ids = childIds
        if (ids.length > 0) {
          selectLayers([...ids, layerId])
        } else {
          selectLayers([layerId])
          ids = [layerId]
        }
      }
    } else if (layer.groupId) {
      // Filho de grupo: clique simples seleciona só o filho para edição individual de filtros
      // Ctrl/Shift adiciona à seleção; duplo clique entra no isolamento do grupo
      if (e.ctrlKey || e.metaKey || e.shiftKey) {
        if (selectedLayerIds.includes(layerId)) {
          const next = selectedLayerIds.filter((id) => id !== layerId)
          selectLayers(next)
          ids = next
        } else {
          const next = [...selectedLayerIds, layerId]
          selectLayers(next)
          ids = [layerId]
        }
      } else {
        ids = selectedLayerIds.includes(layerId) && selectedLayerIds.length === 1 ? selectedLayerIds : [layerId]
        if (!selectedLayerIds.includes(layerId) || selectedLayerIds.length !== 1) {
          selectLayer(layerId)
        }
      }
    } else {
      ids = selectedLayerIds.includes(layerId) ? selectedLayerIds : [layerId]
      if (!selectedLayerIds.includes(layerId)) {
        selectLayer(layerId)
      }
    }
    if (ids.length === 0) return
    const origStates = new Map<string, { x: number; y: number; width: number; height: number; rotation: number; fontSize: number }>()
    for (const id of ids) {
      const l = layers.find((x) => x.id === id)
      if (l && !l.locked) {
        origStates.set(id, { x: l.x, y: l.y, width: l.width, height: l.height, rotation: l.rotation, fontSize: l.fontSize })
      }
    }
    if (origStates.size === 0) return
    dragRef.current = {
      ids: Array.from(origStates.keys()), mode: 'move', handle: '',
      startX: e.clientX, startY: e.clientY,
      origStates,
      origRotation: 0, origFontSize: 0, aspect: 0, hasMoved: false, historySaved: false,
    }
    setIsInteracting(true)
    document.addEventListener('pointermove', pointerMoveRef.current)
    document.addEventListener('pointerup', pointerUpRef.current)
  }, [layers, selectLayer, selectedLayerIds])

  const handleResizeStart = useCallback((e: React.PointerEvent, layerId: string, handle: string) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const layer = layers.find((l) => l.id === layerId)
    if (!layer || layer.locked) return
    const parentGroupLocked = layer.groupId && layers.find((l) => l.id === layer.groupId)?.locked
    if (parentGroupLocked) return
    const ids = selectedLayerIds.includes(layerId) ? selectedLayerIds : [layerId]
    if (!selectedLayerIds.includes(layerId)) {
      selectLayer(layerId)
    }
    const origStates = new Map<string, { x: number; y: number; width: number; height: number; rotation: number; fontSize: number }>()
    const origTextData = new Map<string, { text:string; font:string; fontStyle:string; fontWeight:number; lineHeight:number; letterSpacing:number; textTransform:string; autoFit:boolean; fontSize:number }>()
    for (const id of ids) {
      const l = layers.find((x) => x.id === id)
      if (l && !l.locked) {
        origStates.set(id, { x: l.x, y: l.y, width: l.width, height: l.height, rotation: l.rotation, fontSize: l.fontSize })
        if(l.type==='text'){
          origTextData.set(id, { text:l.text, font:l.font, fontStyle:l.fontStyle, fontWeight:l.fontWeight, lineHeight:l.lineHeight, letterSpacing:l.letterSpacing, textTransform:l.textTransform, autoFit:(l as any).autoFit!==false, fontSize:l.fontSize })
        }
      }
    }
    if (origStates.size === 0) return
    const firstLayer = layers.find((l) => l.id === ids[0])
    const isBezierLayer = !!(firstLayer as any)?.vectorPath
    // bbox bezier deve ser sempre 1:1 em pixels -> w/h em unidades normalizadas = ch/cw
    const bezierAspect = ch > 0 && cw > 0 ? ch / cw : 1
    // texto single-line mantém proporção ao arrastar canto (evita virar vertical); wrapped fica livre
    const isTextSingleLine = firstLayer?.type === 'text' && (firstLayer as any).autoFit !== false
    const isCrossVector = (firstLayer as any)?.vector?.shape === 'cross'
    // regra "no stretching" aplica-se ao bezier e ao X (cross deve permanecer 1:1)
    const aspect = origStates.size > 1 ? 0 : isCrossVector ? 1 : isBezierLayer ? bezierAspect : (firstLayer?.type === 'image' || firstLayer?.type === 'element' || isTextSingleLine ? firstLayer.width / firstLayer.height : 0)
    let groupOrigBbox: { x: number; y: number; width: number; height: number } | undefined
    if (origStates.size > 1) {
      let bbMinX = Infinity, bbMinY = Infinity, bbMaxX = -Infinity, bbMaxY = -Infinity
      for (const [, o] of origStates) {
        const cx = o.x + o.width / 2, cy = o.y + o.height / 2
        const hw = o.width / 2, hh = o.height / 2
        const rad = o.rotation * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad)
        for (const [lx, ly] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
          const rx = cx + lx * cos - ly * sin, ry = cy + lx * sin + ly * cos
          if (rx < bbMinX) bbMinX = rx; if (ry < bbMinY) bbMinY = ry
          if (rx > bbMaxX) bbMaxX = rx; if (ry > bbMaxY) bbMaxY = ry
        }
      }
      groupOrigBbox = { x: bbMinX, y: bbMinY, width: bbMaxX - bbMinX, height: bbMaxY - bbMinY }
    }
    dragRef.current = {
      ids: Array.from(origStates.keys()), mode: 'resize', handle,
      startX: e.clientX, startY: e.clientY,
      origStates,
      origRotation: firstLayer?.rotation ?? 0, origFontSize: firstLayer && firstLayer.type !== 'image' ? firstLayer.fontSize : 0,
      aspect, hasMoved: false, historySaved: false, groupOrigBbox,
      scaleFromCenter: e.altKey,
      origTextData,
    }
    setIsInteracting(true)
    document.addEventListener('pointermove', pointerMoveRef.current)
    document.addEventListener('pointerup', pointerUpRef.current)
  }, [layers, selectedLayerIds, selectLayer])

  const handleRotateStart = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    const origStates = new Map<string, { x: number; y: number; width: number; height: number; rotation: number; fontSize: number }>()
    const ids = (selectedLayerIds.length > 0 ? selectedLayerIds : (selectedLayerId ? [selectedLayerId] : [])).filter((id): id is string => !!id)
    for (const id of ids) {
      const l = layers.find((x) => x.id === id)
      if (l && !l.locked) {
        const parentGroupLocked = l.groupId && layers.find((x) => x.id === l.groupId)?.locked
        if (!parentGroupLocked) {
          origStates.set(id, { x: l.x, y: l.y, width: l.width, height: l.height, rotation: l.rotation, fontSize: l.fontSize })
        }
      }
    }
    if (origStates.size === 0) return
    let bbMinX = Infinity, bbMinY = Infinity, bbMaxX = -Infinity, bbMaxY = -Infinity
    for (const [, o] of origStates) {
      const cx = o.x + o.width / 2, cy = o.y + o.height / 2
      const hw = o.width / 2, hh = o.height / 2
      const rad = o.rotation * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad)
      for (const [lx, ly] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
        const rx = cx + lx * cos - ly * sin, ry = cy + lx * sin + ly * cos
        if (rx < bbMinX) bbMinX = rx; if (ry < bbMinY) bbMinY = ry
        if (rx > bbMaxX) bbMaxX = rx; if (ry > bbMaxY) bbMaxY = ry
      }
    }
    const anchor = { x: (bbMinX + bbMaxX) / 2, y: (bbMinY + bbMaxY) / 2 }
    setRotationBbox({ x: bbMinX, y: bbMinY, w: bbMaxX - bbMinX, h: bbMaxY - bbMinY })
    dragRef.current = {
      ids: Array.from(origStates.keys()), mode: 'rotate', handle: '',
      startX: e.clientX, startY: e.clientY,
      origStates,
      origRotation: 0, origFontSize: 0, aspect: 0, hasMoved: false, historySaved: false,
      rotateAnchor: anchor,
    }
    setIsInteracting(true)
    document.addEventListener('pointermove', pointerMoveRef.current)
    document.addEventListener('pointerup', pointerUpRef.current)
  }, [layers, selectedLayerId, selectedLayerIds])

  const selBboxEl = useMemo(() => {
    if (editingTextId) return null
    if (croppingLayerId && selectedLayerIds.includes(croppingLayerId)) return null
    const selected = layers.filter((l) => selectedLayerIds.includes(l.id) && l.visible && !l.locked && l.type !== 'group' && l.type !== 'mask')
    if (selected.length === 0) return null
    const primaryId = selectedLayerId || selected[0].id
    const primary = layers.find((l) => l.id === primaryId)
    if (!primary) return null

    const isMulti = selected.length > 1
    const isImage = primary.type === 'image'
    const isBezierBbox = !!(primary as any).vectorPath
    // em modo edição de curvas a bbox desaparece para desenhar livremente
    if (isBezierBbox && bezierEditMode) return null
    let minX: number, minY: number, maxX: number, maxY: number
    let bboxRotation = 0
    if (isMulti) {
      if (rotationBbox) {
        minX = rotationBbox.x; minY = rotationBbox.y
        maxX = rotationBbox.x + rotationBbox.w; maxY = rotationBbox.y + rotationBbox.h
      } else {
        minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity
        for (const sel of selected) {
          if ((((sel as any).perspectiveX || 0) !== 0 || ((sel as any).perspectiveY || 0) !== 0) && !isExtremeTilt(sel, cw, ch)) {
            // com inclinação 3D, a bbox engloba os cantos projetados
            for (const p of projectLayerCorners(sel, cw, ch)) {
              const fx = p.x / cw, fy = p.y / ch
              if (fx < minX) minX = fx; if (fy < minY) minY = fy
              if (fx > maxX) maxX = fx; if (fy > maxY) maxY = fy
            }
            continue
          }
          const cx = sel.x + sel.width / 2, cy = sel.y + sel.height / 2
          const hw = sel.width / 2, hh = sel.height / 2
          const rad = sel.rotation * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad)
          for (const [lx, ly] of [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]) {
            const rx = cx + lx * cos - ly * sin, ry = cy + lx * sin + ly * cos
            if (rx < minX) minX = rx; if (ry < minY) minY = ry
            if (rx > maxX) maxX = rx; if (ry > maxY) maxY = ry
          }
        }
      }
    } else {
      minX = primary.x; minY = primary.y
      maxX = primary.x + primary.width; maxY = primary.y + primary.height
      bboxRotation = primary.rotation
    }
    // Com inclinação 3D a bbox segue o objeto: quadrilátero projetado em vez de retângulo.
    // Tilt extremo (além da câmara) cai no retângulo chapado para não explodir.
    if (!isMulti && (((primary as any).perspectiveX || 0) !== 0 || ((primary as any).perspectiveY || 0) !== 0) && !isExtremeTilt(primary, cw, ch)) {
      const corners = projectLayerCorners(primary, cw, ch)
      const pts = corners.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
      const ccx = (corners[0].x + corners[2].x) / 2
      const ccy = (corners[0].y + corners[2].y) / 2
      const mtx = (corners[0].x + corners[1].x) / 2
      const mty = (corners[0].y + corners[1].y) / 2
      let rdx = mtx - ccx, rdy = mty - ccy
      const rdl = Math.hypot(rdx, rdy) || 1
      rdx /= rdl; rdy /= rdl
      const stemLen = Math.abs(bboxMetrics.rTop)
      const rotX = mtx + rdx * stemLen, rotY = mty + rdy * stemLen
      const cornerNames = ['nw', 'ne', 'se', 'sw'] as const
      const cornerCursors = ['nwse-resize', 'nesw-resize', 'nwse-resize', 'nesw-resize']
      const handleStroke = Math.max(1, Math.round(bboxMetrics.border * 0.9))
      return (
        <div
          key="sel-bbox"
          data-selection-box="true"
          style={{ position: 'absolute', inset: 0, zIndex: 100000, pointerEvents: 'none' }}
        >
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}
            viewBox={`0 0 ${cw} ${ch}`}
          >
            <polygon
              points={pts}
              fill="rgba(59,130,246,0.04)"
              stroke="#3b82f6"
              strokeWidth={bboxMetrics.border}
              strokeLinejoin="round"
              style={{ pointerEvents: 'auto', cursor: 'move' }}
              onPointerDown={(e) => handleMoveStart(e, primary.id)}
            />
            <line x1={mtx} y1={mty} x2={rotX} y2={rotY} stroke="#3b82f6" strokeWidth={Math.max(1, bboxMetrics.border * 0.8)} />
            <circle
              cx={rotX} cy={rotY} r={bboxMetrics.rSize / 2}
              fill="#fff" stroke="#3b82f6" strokeWidth={Math.max(2, Math.round(bboxMetrics.border * 1.1))}
              style={{ pointerEvents: 'auto', cursor: 'grab' }}
              onPointerDown={handleRotateStart}
            />
            {corners.map((c, i) => (
              <circle
                key={i}
                cx={c.x} cy={c.y} r={bboxMetrics.hs / 2}
                fill="#fff" stroke="#3b82f6" strokeWidth={handleStroke}
                style={{ pointerEvents: 'auto', cursor: cornerCursors[i] }}
                onPointerDown={(e) => handleResizeStart(e, primary.id, cornerNames[i])}
              />
            ))}
          </svg>
        </div>
      )
    }
    const bbW = maxX - minX
    const bbH = maxY - minY
    const bboxMaxRadius = Math.min(bbW, bbH) * cw / 2
    const bboxRadius = !isMulti && (primary.borderRadiusPx ?? 0) > 0 ? `${Math.min(px(primary.borderRadiusPx), Math.round(bboxMaxRadius))}px` : (!isMulti && primary.borderRadius ? `${px(primary.borderRadius)}px` : '2px')

    return (
      <div
        key="sel-bbox"
        data-selection-box="true"
        style={{
          position: 'absolute',
          left: `${minX * 100}%`,
          top: `${minY * 100}%`,
          width: `${bbW * 100}%`,
          height: `${bbH * 100}%`,
          transform: bboxRotation ? `rotate(${bboxRotation}deg)` : undefined,
          transformOrigin: 'center center',
          zIndex: 100000,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute', inset: 0,
            border: `${bboxMetrics.border}px solid #3b82f6`,
            borderRadius: bboxRadius,
            pointerEvents: 'none',
          }}
        />
        <div
          onPointerDown={(e) => {
            const target = e.target as HTMLElement
            if (target.closest('.resize-handle') || target.closest('.rotate-handle')) return
            if (e.shiftKey) {
              e.stopPropagation()
              e.preventDefault()
              toggleLayerSelection(primary.id)
              return
            }
            handleMoveStart(e, primary.id)
          }}
          style={{
            position: 'absolute', inset: 0,
            cursor: 'move',
            pointerEvents: 'auto',
            zIndex: 1,
          }}
        />
        <div className="resize-handle nw" style={{ width: bboxMetrics.hs, height: bboxMetrics.hs, borderWidth: Math.max(1, Math.round(bboxMetrics.border*0.9)), top: -bboxMetrics.half, left: -bboxMetrics.half }} onPointerDown={(e) => handleResizeStart(e, primary.id, 'nw')} />
        <div className="resize-handle ne" style={{ width: bboxMetrics.hs, height: bboxMetrics.hs, borderWidth: Math.max(1, Math.round(bboxMetrics.border*0.9)), top: -bboxMetrics.half, right: -bboxMetrics.half }} onPointerDown={(e) => handleResizeStart(e, primary.id, 'ne')} />
        <div className="resize-handle sw" style={{ width: bboxMetrics.hs, height: bboxMetrics.hs, borderWidth: Math.max(1, Math.round(bboxMetrics.border*0.9)), bottom: -bboxMetrics.half, left: -bboxMetrics.half }} onPointerDown={(e) => handleResizeStart(e, primary.id, 'sw')} />
        <div className="resize-handle se" style={{ width: bboxMetrics.hs, height: bboxMetrics.hs, borderWidth: Math.max(1, Math.round(bboxMetrics.border*0.9)), bottom: -bboxMetrics.half, right: -bboxMetrics.half }} onPointerDown={(e) => handleResizeStart(e, primary.id, 'se')} />
        {!isBezierBbox && !isImage && primary.type !== 'element' && primary.type !== 'text' && <div className="resize-handle n" style={{ width: bboxMetrics.hs, height: bboxMetrics.hs, borderWidth: Math.max(1, Math.round(bboxMetrics.border*0.9)), top: -bboxMetrics.half, left: '50%', transform: 'translateX(-50%)', marginLeft: 0 }} onPointerDown={(e) => handleResizeStart(e, primary.id, 'n')} />}
        {!isBezierBbox && !isImage && primary.type !== 'element' && primary.type !== 'text' && <div className="resize-handle s" style={{ width: bboxMetrics.hs, height: bboxMetrics.hs, borderWidth: Math.max(1, Math.round(bboxMetrics.border*0.9)), bottom: -bboxMetrics.half, left: '50%', transform: 'translateX(-50%)', marginLeft: 0 }} onPointerDown={(e) => handleResizeStart(e, primary.id, 's')} />}
        {!isBezierBbox && !isImage && primary.type !== 'element' && <div className="resize-handle w" style={{ width: bboxMetrics.hs, height: bboxMetrics.hs, borderWidth: Math.max(1, Math.round(bboxMetrics.border*0.9)), top: '50%', left: -bboxMetrics.half, transform: 'translateY(-50%)', marginTop: 0 }} onPointerDown={(e) => handleResizeStart(e, primary.id, 'w')} />}
        {!isBezierBbox && !isImage && primary.type !== 'element' && <div className="resize-handle e" style={{ width: bboxMetrics.hs, height: bboxMetrics.hs, borderWidth: Math.max(1, Math.round(bboxMetrics.border*0.9)), top: '50%', right: -bboxMetrics.half, transform: 'translateY(-50%)', marginTop: 0 }} onPointerDown={(e) => handleResizeStart(e, primary.id, 'e')} />}
        <div className="rotate-handle" style={{ width: bboxMetrics.rSize, height: bboxMetrics.rSize, borderWidth: Math.max(2, Math.round(bboxMetrics.border*1.1)), top: bboxMetrics.rTop, left: '50%', transform: 'translateX(-50%)', marginLeft: 0, ['--r-stem-h' as any]: bboxMetrics.rStemH + 'px' }} onPointerDown={handleRotateStart} title={t('canvas.rotate')} />
      </div>
    )
  }, [layers, selectedLayerId, selectedLayerIds, handleMoveStart, handleResizeStart, handleRotateStart, px, rotationBbox, croppingLayerId, resScale, bezierEditMode, bboxMetrics, cw, ch])

  // ── Live crop overlay — estilo Canva: a bounding box É a janela de crop, a imagem fica fixa ──
  const cropDragRef = useRef<{ handle: string; startX: number; startY: number; startCrop: { x: number; y: number; w: number; h: number; imgW: number; imgH: number }; startBox: { x: number; y: number; w: number; h: number }; rect: DOMRect } | null>(null)
  const pushCropHistory = useRef(false)
  const handleCropPointerDown = useCallback((e: React.PointerEvent, handle: string) => {
    e.stopPropagation(); e.preventDefault()
    const cl = layers.find((l) => l.id === croppingLayerId)
    if (!cl || !cl.crop || !containerRef.current) return
    const overlay = (e.currentTarget as HTMLElement).closest('[data-crop-overlay="true"]') as HTMLElement | null
    const rect = overlay?.getBoundingClientRect() || (e.currentTarget as HTMLElement).getBoundingClientRect()
    const actualRect = overlay ? overlay.getBoundingClientRect() : rect
    cropDragRef.current = { handle, startX: e.clientX, startY: e.clientY, startCrop: { ...cl.crop }, startBox: { x: cl.x, y: cl.y, w: cl.width, h: cl.height }, rect: actualRect }
    pushCropHistory.current = false
    const onMove = (ev: PointerEvent) => {
      const d = cropDragRef.current
      if (!d) return
      const cur = layers.find((l) => l.id === croppingLayerId)
      if (!cur || !cur.crop) return
      if (!pushCropHistory.current) { pushCropHistory.current = true; pushHistory() }
      const dx = ev.clientX - d.startX
      const dy = ev.clientY - d.startY
      const MIN_CROP = 20
      const S_x = d.rect.width / d.startCrop.w
      const S_y = d.rect.height / d.startCrop.h
      // posição da imagem completa no espaço de tela — fica FIXA durante o crop
      const ImageLeft = d.rect.left - d.startCrop.x * S_x
      const ImageTop = d.rect.top - d.startCrop.y * S_y
      // imagem fixa => S para conversão normalizada (sem depender de escala de tela)
      const S_norm_w = d.startBox.w / d.startCrop.w
      const S_norm_h = d.startBox.h / d.startCrop.h
      const ImageLeft_norm = d.startBox.x - d.startCrop.x * S_norm_w
      const ImageTop_norm = d.startBox.y - d.startCrop.y * S_norm_h

      // ── 1) nova bounding box em pixels de tela, a partir do handle ──
      let newLeft = d.rect.left
      let newTop = d.rect.top
      let newW = d.rect.width
      let newH = d.rect.height
      const h = d.handle
      if (h === 'move') {
        newLeft += dx
        newTop += dy
      } else {
        const east = h.includes('e'), west = h.includes('w'), south = h.includes('s'), north = h.includes('n')
        if (east) newW += dx
        if (west) { newW -= dx; newLeft += dx }
        if (south) newH += dy
        if (north) { newH -= dy; newTop += dy }
      }
      // clamp mínimo em pixels de tela
      const minWpx = MIN_CROP * S_x
      const minHpx = MIN_CROP * S_y
      if (newW < minWpx) {
        if (h.includes('w')) newLeft = d.rect.left + d.rect.width - minWpx
        newW = minWpx
      }
      if (newH < minHpx) {
        if (h.includes('n')) newTop = d.rect.top + d.rect.height - minHpx
        newH = minHpx
      }

      // ── 2) deriva o crop que mantém a imagem FIXA ──
      let cx = (newLeft - ImageLeft) / S_x
      let cy = (newTop - ImageTop) / S_y
      let cw2 = newW / S_x
      let ch2 = newH / S_y

      // clamp ao tamanho da imagem original
      cw2 = Math.max(MIN_CROP, Math.min(cw2, d.startCrop.imgW))
      ch2 = Math.max(MIN_CROP, Math.min(ch2, d.startCrop.imgH))
      cx = Math.max(0, Math.min(cx, d.startCrop.imgW - cw2))
      cy = Math.max(0, Math.min(cy, d.startCrop.imgH - ch2))
      // se o clamp de posição reduziu espaço, garante que w/h caibam
      cw2 = Math.max(MIN_CROP, Math.min(cw2, d.startCrop.imgW - cx))
      ch2 = Math.max(MIN_CROP, Math.min(ch2, d.startCrop.imgH - cy))

      // ── 3) recomputa a box normalizada a partir do crop final (garante consistência) ──
      const finalLeft = ImageLeft + cx * S_x
      const finalTop = ImageTop + cy * S_y
      // conversão para coordenadas normalizadas 0..1: usa S_norm e ImageLeft_norm
      void finalLeft; void finalTop
      const finalBoxNormX = ImageLeft_norm + cx * S_norm_w
      const finalBoxNormY = ImageTop_norm + cy * S_norm_h
      const finalBoxNormW = cw2 * S_norm_w
      const finalBoxNormH = ch2 * S_norm_h

      updateLayer(cur.id, {
        x: finalBoxNormX,
        y: finalBoxNormY,
        width: Math.max(0.02, finalBoxNormW),
        height: Math.max(0.02, finalBoxNormH),
        crop: { x: Math.round(cx), y: Math.round(cy), w: Math.round(cw2), h: Math.round(ch2), imgW: d.startCrop.imgW, imgH: d.startCrop.imgH },
      }, false)
    }
    const onUp = () => {
      cropDragRef.current = null
      pushCropHistory.current = false
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [layers, croppingLayerId, pushHistory, updateLayer])

  const cropOverlayEl = useMemo(() => {
    if (!croppingLayerId) return null
    const cl = layers.find((l) => l.id === croppingLayerId)
    if (!cl || cl.type !== 'image' || cl.isBackground) return null
    return (
      <div
        key={`crop-${cl.id}`}
        data-crop-overlay="true"
        style={{
          position: 'absolute',
          left: `${cl.x * 100}%`,
          top: `${cl.y * 100}%`,
          width: `${cl.width * 100}%`,
          height: `${cl.height * 100}%`,
          zIndex: 100001,
          pointerEvents: 'auto',
        }}
      >
        <div
          className="absolute inset-0 border-[3px] border-white/90 bg-transparent pointer-events-auto cursor-move shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
          onPointerDown={(e) => handleCropPointerDown(e, 'move')}
          title="Arraste para mover o recorte"
        />
        <div className="absolute w-7 h-7 bg-white border-2 border-zinc-800 rounded-sm -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize shadow-sm" style={{ left: 0, top: 0 }} onPointerDown={(e) => handleCropPointerDown(e, 'nw')} />
        <div className="absolute w-7 h-7 bg-white border-2 border-zinc-800 rounded-sm -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize shadow-sm" style={{ left: '100%', top: 0 }} onPointerDown={(e) => handleCropPointerDown(e, 'ne')} />
        <div className="absolute w-7 h-7 bg-white border-2 border-zinc-800 rounded-sm -translate-x-1/2 -translate-y-1/2 cursor-nesw-resize shadow-sm" style={{ left: 0, top: '100%' }} onPointerDown={(e) => handleCropPointerDown(e, 'sw')} />
        <div className="absolute w-7 h-7 bg-white border-2 border-zinc-800 rounded-sm -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize shadow-sm" style={{ left: '100%', top: '100%' }} onPointerDown={(e) => handleCropPointerDown(e, 'se')} />
        <div className="absolute w-7 h-4 bg-white border-2 border-zinc-800 rounded-sm -translate-x-1/2 -translate-y-1/2 cursor-ns-resize shadow-sm" style={{ left: '50%', top: 0 }} onPointerDown={(e) => handleCropPointerDown(e, 'n')} />
        <div className="absolute w-7 h-4 bg-white border-2 border-zinc-800 rounded-sm -translate-x-1/2 -translate-y-1/2 cursor-ns-resize shadow-sm" style={{ left: '50%', top: '100%' }} onPointerDown={(e) => handleCropPointerDown(e, 's')} />
        <div className="absolute w-4 h-7 bg-white border-2 border-zinc-800 rounded-sm -translate-x-1/2 -translate-y-1/2 cursor-ew-resize shadow-sm" style={{ left: 0, top: '50%' }} onPointerDown={(e) => handleCropPointerDown(e, 'w')} />
        <div className="absolute w-4 h-7 bg-white border-2 border-zinc-800 rounded-sm -translate-x-1/2 -translate-y-1/2 cursor-ew-resize shadow-sm" style={{ left: '100%', top: '50%' }} onPointerDown={(e) => handleCropPointerDown(e, 'e')} />
      </div>
    )
  }, [croppingLayerId, layers, handleCropPointerDown])

  // ── Vector bezier — edição completa com 2 modos (mover vs editar curvas) ──
  const vectorDragRef = useRef<{ pointId: string; kind: 'point' | 'handleIn' | 'handleOut'; startX: number; startY: number; origPoints: any[]; startLayer: Layer; layerScreenW: number; layerScreenH: number } | null>(null)

  const isCurrentBezier = !!(layers.find((l) => l.id === selectedLayerId && (l as any).vectorPath))
  const enterBezierEdit = useCallback(() => {
    if (!isCurrentBezier) return
    setBezierEditMode(true)
  }, [isCurrentBezier])
  const exitBezierEdit = useCallback(() => {
    const vl: any = layers.find((l) => l.id === selectedLayerId && (l as any).vectorPath)
    if (vl && bezierEditMode && vl.vectorPath?.points?.length) {
      const vp = vl.vectorPath
      const pts: any[] = vp.points
      let minAbsX = Infinity, maxAbsX = -Infinity, minAbsY = Infinity, maxAbsY = -Infinity
      for (const p of pts) {
        const absX = vl.x + (p.x / 100) * vl.width
        const absY = vl.y + (p.y / 100) * vl.height
        minAbsX = Math.min(minAbsX, absX); maxAbsX = Math.max(maxAbsX, absX)
        minAbsY = Math.min(minAbsY, absY); maxAbsY = Math.max(maxAbsY, absY)
      }
      const pad = 0.02
      let wAbs = maxAbsX - minAbsX
      let hAbs = maxAbsY - minAbsY
      const minSideNorm = 0.08
      wAbs = Math.max(wAbs, minSideNorm); hAbs = Math.max(hAbs, minSideNorm)
      // manter quadrado em pixels, não em normalizado (1080p é 1920x1080, quadrado em pixels != quadrado em 0..1)
      const wPx = wAbs * cw
      const hPx = hAbs * ch
      let sidePx = Math.max(wPx, hPx) * (1 + pad)
      const minSidePx = minSideNorm * Math.min(cw, ch)
      sidePx = Math.max(minSidePx, sidePx)
      sidePx = Math.min(Math.min(cw, ch) * 100, sidePx)
      const sideW = sidePx / cw
      const sideH = sidePx / ch
      const centerX = (minAbsX + maxAbsX) / 2
      const centerY = (minAbsY + maxAbsY) / 2
      let newX = centerX - sideW / 2
      let newY = centerY - sideH / 2
      newX = Math.max(-100, Math.min(100 - sideW, newX))
      newY = Math.max(-100, Math.min(100 - sideH, newY))
      const needsExpand = sideW > vl.width + 0.01 || sideH > vl.height + 0.01 || minAbsX < vl.x - 0.01 || maxAbsX > vl.x + vl.width + 0.01 || minAbsY < vl.y - 0.01 || maxAbsY > vl.y + vl.height + 0.01
      if (needsExpand) {
        const newPoints = pts.map((p: any) => {
          const absX = vl.x + (p.x / 100) * vl.width
          const absY = vl.y + (p.y / 100) * vl.height
          const newPx = ((absX - newX) / sideW) * 100
          const newPy = ((absY - newY) / sideH) * 100
          let newHandleIn, newHandleOut
          if (p.handleIn) {
            const absHx = absX + (p.handleIn.x / 100) * vl.width
            const absHy = absY + (p.handleIn.y / 100) * vl.height
            const newHx = ((absHx - newX) / sideW) * 100
            const newHy = ((absHy - newY) / sideH) * 100
            newHandleIn = { x: newHx - newPx, y: newHy - newPy }
          }
          if (p.handleOut) {
            const absHx = absX + (p.handleOut.x / 100) * vl.width
            const absHy = absY + (p.handleOut.y / 100) * vl.height
            const newHx = ((absHx - newX) / sideW) * 100
            const newHy = ((absHy - newY) / sideH) * 100
            newHandleOut = { x: newHx - newPx, y: newHy - newPy }
          }
          return { ...p, x: newPx, y: newPy, handleIn: newHandleIn, handleOut: newHandleOut }
        })
        const st = useStore.getState()
        st.startBatch()
        pushHistory()
        updateLayer(vl.id, { x: newX, y: newY, width: sideW, height: sideH })
        updateVectorPath(vl.id, () => ({ ...vp, points: newPoints }))
        st.endBatch()
      }
    }
    setBezierEditMode(false)
    setSelectedBezierPointId(null)
  }, [layers, selectedLayerId, bezierEditMode, pushHistory, updateLayer, updateVectorPath, cw, ch])
  const toggleBezierEdit = useCallback(() => {
    if (bezierEditMode) exitBezierEdit()
    else enterBezierEdit()
  }, [bezierEditMode, enterBezierEdit, exitBezierEdit])

  // Sai do modo edição ao trocar seleção ou desselecionar bezier
  useEffect(() => {
    if (!isCurrentBezier) setBezierEditMode(false)
    else {
      // ao selecionar novo bezier, começa em modo mover (bbox visível)
      setBezierEditMode(false)
      setSelectedBezierPointId(null)
    }
  }, [selectedLayerId, isCurrentBezier])

  // T para entrar/sair do modo edição de curvas (quando bezier selecionado)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.tagName === 'SELECT' || !!target?.isContentEditable
      if (isTyping) return
      if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const isBez = !!layers.find((l) => l.id === selectedLayerId && (l as any).vectorPath)
        if (!isBez) return
        e.preventDefault()
        if (bezierEditMode) exitBezierEdit()
        else enterBezierEdit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [layers, selectedLayerId, bezierEditMode, enterBezierEdit, exitBezierEdit])

  // Duplo clique sobre bezier selecionado entra no modo edição
  useEffect(() => {
    const el = workAreaRef.current
    if (!el) return
    const onDbl = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('.canvas-layer') as HTMLElement | null
      const id = target?.getAttribute('data-layer-id')
      if (!id) return
      const layer = layers.find((l) => l.id === id && (l as any).vectorPath)
      if (!layer) return
      // só entra se o bezier já estiver selecionado (ou seleciona e entra)
      if (selectedLayerId !== id) {
        // seleciona primeiro
        selectLayer(id)
        // entra no próximo tick para garantir que isCurrentBezier atualize
        setTimeout(() => setBezierEditMode(true), 0)
        return
      }
      if (bezierEditMode) return
      e.preventDefault()
      e.stopPropagation()
      setBezierEditMode(true)
    }
    el.addEventListener('dblclick', onDbl)
    return () => el.removeEventListener('dblclick', onDbl)
  }, [layers, selectedLayerId, bezierEditMode, selectLayer])

  // Delete selected point with Delete/Backspace
  useEffect(() => {
    if (!selectedBezierPointId || !selectedLayerId) return
    const vl: any = layers.find((l) => l.id === selectedLayerId && l.vectorPath)
    if (!vl || !selectedBezierPointId) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA')) {
        const cur: any = useStore.getState().layers.find((l) => l.id === selectedLayerId && l.vectorPath)
        if (!cur || cur.vectorPath.points.length <= 2) return
        e.preventDefault()
        e.stopPropagation()
        ;(e as any).stopImmediatePropagation?.()
        pushHistory()
        updateVectorPath(cur.id, (vp:any) => ({ ...vp, points: vp.points.filter((p:any)=> p.id!==selectedBezierPointId) }), false)
        // history already pushed above, do not double
        setSelectedBezierPointId(null)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [selectedBezierPointId, selectedLayerId, layers, pushHistory, updateVectorPath])

  const handleVectorPointDown = useCallback((e: React.PointerEvent, pointId: string, kind: 'point' | 'handleIn' | 'handleOut') => {
    e.stopPropagation(); e.preventDefault()
    const vl = layers.find((l) => l.id === selectedLayerId && l.vectorPath) as any
    if (!vl || !vl.vectorPath) return
    setSelectedBezierPointId(pointId)
    // tamanho em tela sem rotação (para converter delta corretamente)
    const layerScreenW = vl.width * cw * scale
    const layerScreenH = vl.height * ch * scale
    vectorDragRef.current = { pointId, kind, startX: e.clientX, startY: e.clientY, origPoints: JSON.parse(JSON.stringify(vl.vectorPath.points)), startLayer: vl, layerScreenW: Math.max(1, layerScreenW), layerScreenH: Math.max(1, layerScreenH) }
    const startHist = useStore.getState()
    // salva estado para undo apenas uma vez no início do drag
    pushHistory()
    const onMove = (ev: PointerEvent) => {
      const d: any = vectorDragRef.current
      if (!d) return
      const cur: any = layers.find((l) => l.id === selectedLayerId)
      if (!cur || !cur.vectorPath) return
      // converte delta de tela para espaço local 0..100, considerando rotação da layer
      const dxScreen = ev.clientX - d.startX
      const dyScreen = ev.clientY - d.startY
      const rad = (d.startLayer.rotation * Math.PI) / 180
      const cosA = Math.cos(-rad), sinA = Math.sin(-rad)
      const dxLocalPx = dxScreen * cosA - dyScreen * sinA
      const dyLocalPx = dxScreen * sinA + dyScreen * cosA
      const dx = (dxLocalPx / d.layerScreenW) * 100
      const dy = (dyLocalPx / d.layerScreenH) * 100

      const symmetric = !ev.altKey // Alt desfaz simetria — Inkscape: simétrico mantém curva suave sem deformação feia
      const nextPoints = d.origPoints.map((p: any) => {
        if (p.id !== pointId) return { ...p }
        if (kind === 'point') return { ...p, x: p.x + dx, y: p.y + dy }
        if (kind === 'handleIn') {
          const nh = { x: (p.handleIn?.x ?? 0) + dx, y: (p.handleIn?.y ?? 0) + dy }
          if (symmetric && p.type === 'bezier') {
            // espelha exatamente com mesmo comprimento (suave, sem deformação)
            return { ...p, handleIn: nh, handleOut: { x: -nh.x, y: -nh.y } }
          }
          return { ...p, handleIn: nh }
        }
        if (kind === 'handleOut') {
          const nh = { x: (p.handleOut?.x ?? 0) + dx, y: (p.handleOut?.y ?? 0) + dy }
          if (symmetric && p.type === 'bezier') {
            return { ...p, handleOut: nh, handleIn: { x: -nh.x, y: -nh.y } }
          }
          return { ...p, handleOut: nh }
        }
        return p
      })
      // sem limite — espaço infinito absoluto, não relativo à bbox antiga
      updateVectorPath(cur.id, (vp:any) => ({ ...vp, points: nextPoints }), false)
    }
    const onUp = () => {
      vectorDragRef.current = null
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [layers, selectedLayerId, updateVectorPath, pushHistory, cw, ch, scale])

  const handleVectorOverlayClick = useCallback((e: React.MouseEvent) => {
    const vl: any = layers.find((l) => l.id === selectedLayerId && l.vectorPath)
    if (!vl || !vl.vectorPath) return
    const target = e.target as HTMLElement
    if (target.closest('[data-bezier-point]') || target.closest('[data-bezier-handle]') || target.closest('[data-bezier-move]') || target.closest('[data-bezier-rotate]')) return
    const overlay = (e.currentTarget as HTMLElement)
    const rect = overlay.getBoundingClientRect()
    const layerScreenW = Math.max(1, vl.width * cw * scale)
    const layerScreenH = Math.max(1, vl.height * ch * scale)
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dxScreen = e.clientX - cx
    const dyScreen = e.clientY - cy
    const rad = (vl.rotation * Math.PI) / 180
    const cosA = Math.cos(-rad), sinA = Math.sin(-rad)
    const dxLocalPx = dxScreen * cosA - dyScreen * sinA
    const dyLocalPx = dxScreen * sinA + dyScreen * cosA
    const x = 50 + (dxLocalPx / layerScreenW) * 100
    const y = 50 + (dyLocalPx / layerScreenH) * 100
    const cxClamped = x
    const cyClamped = y
    // insere no segmento mais próximo — distância precisa à curva cúbica (não linear)
    const pts: any[] = vl.vectorPath.points
    let insertIdx = pts.length // default append
    let insertT = 0.5
    let insertSegIsBez = false
    if (pts.length >= 2) {
      let bestDist = Infinity, bestIdx = pts.length, bestT = 0.5, bestIsBez = false
      const segCount = vl.vectorPath.closed ? pts.length : pts.length - 1
      const samples = 24
      for (let i = 0; i < segCount; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length]
        const isBez = b.type === 'bezier' || a.type === 'bezier'
        if (!isBez) {
          const vx = b.x - a.x, vy = b.y - a.y
          const len2 = vx*vx + vy*vy || 1
          const tLin = Math.max(0, Math.min(1, ((cxClamped - a.x)*vx + (cyClamped - a.y)*vy)/len2))
          const pxL = a.x + tLin*vx, pyL = a.y + tLin*vy
          const distL = Math.hypot(cxClamped - pxL, cyClamped - pyL)
          if (distL < bestDist) { bestDist = distL; bestIdx = i + 1; bestT = tLin; bestIsBez = false }
        } else {
          const p0x=a.x, p0y=a.y
          const p1x=a.x+(a.handleOut?.x ?? 0), p1y=a.y+(a.handleOut?.y ?? 0)
          const p2x=b.x+(b.handleIn?.x ?? 0), p2y=b.y+(b.handleIn?.y ?? 0)
          const p3x=b.x, p3y=b.y
          for (let s=0; s<=samples; s++) {
            const t=s/samples
            const u=1-t, u2=u*u, u3=u2*u, t2=t*t, t3=t2*t
            const x = u3*p0x + 3*u2*t*p1x + 3*u*t2*p2x + t3*p3x
            const y = u3*p0y + 3*u2*t*p1y + 3*u*t2*p2y + t3*p3y
            const dist = Math.hypot(cxClamped - x, cyClamped - y)
            if (dist < bestDist) { bestDist = dist; bestIdx = i + 1; bestT = t; bestIsBez = true }
          }
        }
      }
      if (bestDist < 14) { insertIdx = bestIdx; insertT = bestT; insertSegIsBez = bestIsBez }
    }
    pushHistory()
    const nid = Date.now().toString(36) + Math.random().toString(36).slice(2,5)
    let newType: 'corner' | 'bezier' = 'bezier'
    let handleIn: {x:number,y:number} | undefined = undefined
    let handleOut: {x:number,y:number} | undefined = undefined
    if (insertIdx > 0 && insertIdx <= pts.length && insertSegIsBez) {
      // tangente da cúbica em insertT para alinhar alças — precisão no meio da curva
      const a = pts[insertIdx - 1] as any, b = (pts[insertIdx % pts.length] as any) || a
      const p0x=a.x, p0y=a.y
      const p1x=a.x+(a.handleOut?.x ?? 0), p1y=a.y+(a.handleOut?.y ?? 0)
      const p2x=b.x+(b.handleIn?.x ?? 0), p2y=b.y+(b.handleIn?.y ?? 0)
      const p3x=b.x, p3y=b.y
      const t=insertT, u=1-t
      // derivada B'(t) = 3(1-t)^2(P1-P0)+6(1-t)t(P2-P1)+3t^2(P3-P2)
      const dx = 3*u*u*(p1x-p0x) + 6*u*t*(p2x-p1x) + 3*t*t*(p3x-p2x)
      const dy = 3*u*u*(p1y-p0y) + 6*u*t*(p2y-p1y) + 3*t*t*(p3y-p2y)
      const segLen = Math.hypot(dx, dy) || Math.hypot((b?.x??0)-(a?.x??0),(b?.y??0)-(a?.y??0)) || 20
      const ux = dx/(segLen||1), uy = dy/(segLen||1)
      const hl = Math.max(6, Math.min(18, segLen * 0.22))
      handleIn = { x: -ux * hl, y: -uy * hl }
      handleOut = { x: ux * hl, y: uy * hl }
    } else if (insertIdx > 0 && insertIdx <= pts.length) {
      const a = pts[insertIdx - 1] as any, b = (pts[insertIdx % pts.length] as any) || a
      const vx = (b?.x ?? cxClamped) - (a?.x ?? cxClamped), vy = (b?.y ?? cyClamped) - (a?.y ?? cyClamped)
      const segLen = Math.hypot(vx, vy) || 20
      const ux = vx / (segLen || 1), uy = vy / (segLen || 1)
      const hl = Math.max(6, Math.min(18, segLen * 0.28))
      handleIn = { x: -ux * hl, y: -uy * hl }
      handleOut = { x: ux * hl, y: uy * hl }
    } else {
      handleIn = { x: -10, y: 0 }; handleOut = { x: 10, y: 0 }
    }
    updateVectorPath(vl.id, (vp:any) => {
      const next = [...vp.points]
      next.splice(insertIdx, 0, { id: nid, x: cxClamped, y: cyClamped, type: newType, handleIn, handleOut })
      return { ...vp, points: next }
    }, false)
    setSelectedBezierPointId(nid)
  }, [layers, selectedLayerId, pushHistory, updateVectorPath, cw, ch, scale])

  const handleBezierPointContext = useCallback((e: React.MouseEvent, pointId: string) => {
    e.preventDefault(); e.stopPropagation()
    const vl: any = layers.find((l) => l.id === selectedLayerId && l.vectorPath)
    if (!vl) return
    const p = vl.vectorPath.points.find((pt:any)=> pt.id===pointId)
    if (!p) return
    const isRightClick = (e as any).type === 'contextmenu' || (e as any).button === 2
    // botão direito → elimina ponto (solicitado)
    if (isRightClick || e.shiftKey) {
      if (vl.vectorPath.points.length <= 2) return
      pushHistory()
      updateVectorPath(vl.id, (vp:any)=> ({ ...vp, points: vp.points.filter((pt:any)=> pt.id!==pointId) }), false)
      setSelectedBezierPointId(null)
      return
    }
    // duplo-clique → alterna canto/bezier
    const isBez = p.type === 'bezier'
    pushHistory()
    updateVectorPath(vl.id, (vp:any)=> ({ ...vp, points: vp.points.map((pt:any)=> pt.id===pointId ? { ...pt, type: isBez ? 'corner' : 'bezier', handleIn: isBez ? undefined : {x:-10,y:0}, handleOut: isBez ? undefined : {x:10,y:0} } : pt) }), false)
    setSelectedBezierPointId(pointId)
  }, [layers, selectedLayerId, pushHistory, updateVectorPath])

  const vectorPathOverlayEl = useMemo(() => {
    if (!selectedLayerId) return null
    if (!bezierEditMode) return null
    const vl: any = layers.find((l) => l.id === selectedLayerId && l.vectorPath)
    if (!vl || !vl.vectorPath || vl.isBackground) return null
    if (croppingLayerId) return null
    const vp: any = vl.vectorPath
    return (
      <div
        key={`vp-${vl.id}`}
        data-vector-overlay="true"
        onClick={handleVectorOverlayClick}
        style={{
          position: 'absolute',
          left: `${vl.x * 100}%`,
          top: `${vl.y * 100}%`,
          width: `${vl.width * 100}%`,
          height: `${vl.height * 100}%`,
          transform: `rotate(${vl.rotation}deg)`.trim(),
          zIndex: 100002,
          pointerEvents: 'auto',
          cursor: 'crosshair',
        }}
      >
        {/* linhas de controle (SVG) */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }}>
          {vp.points.map((p: any, idx: number) => {
            const next = vp.points[idx + 1]
            const isBezSeg = next && (p.type === 'bezier' || next.type === 'bezier')
            // não desenha segmento de preview entre pontos, só as alças
            return null
          })}
          {vp.points.map((p: any) => (
            <g key={`h-${p.id}`}>
              {p.type === 'bezier' && p.handleOut && (
                <line x1={p.x} y1={p.y} x2={p.x + p.handleOut.x} y2={p.y + p.handleOut.y} stroke="#60a5fa" strokeWidth={1.4 * resScale} strokeDasharray={`${2 * resScale} ${1.2 * resScale}`} vectorEffect="non-scaling-stroke" opacity={0.95} />
              )}
              {p.type === 'bezier' && p.handleIn && (
                <line x1={p.x} y1={p.y} x2={p.x + p.handleIn.x} y2={p.y + p.handleIn.y} stroke="#60a5fa" strokeWidth={1.4 * resScale} strokeDasharray={`${2 * resScale} ${1.2 * resScale}`} vectorEffect="non-scaling-stroke" opacity={0.95} />
              )}
            </g>
          ))}
          {/* linha do caminho para facilitar clique */}
          <path
            d={(() => {
              if (vp.points.length < 2) return ''
              let d = `M ${vp.points[0].x} ${vp.points[0].y}`
              for (let i = 1; i < vp.points.length; i++) {
                const prev = vp.points[i-1], cur = vp.points[i]
                const isBez = cur.type === 'bezier' || prev.type === 'bezier'
                if (isBez) d += ` C ${prev.x + (prev.handleOut?.x ?? 0)} ${prev.y + (prev.handleOut?.y ?? 0)}, ${cur.x + (cur.handleIn?.x ?? 0)} ${cur.y + (cur.handleIn?.y ?? 0)}, ${cur.x} ${cur.y}`
                else d += ` L ${cur.x} ${cur.y}`
              }
              if (vp.closed) d += ' Z'
              return d
            })()}
            fill="none" stroke="transparent" strokeWidth={12 * resScale} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'stroke', cursor: 'crosshair' }}
          />
        </svg>
        {vp.points.map((p: any) => (
          <div key={p.id}>
            <div
              data-bezier-point
              className={`absolute rounded-full -translate-x-1/2 -translate-y-1/2 cursor-move shadow-md border-2 ${selectedBezierPointId===p.id ? 'bg-yellow-400 border-white z-10' : 'bg-blue-500 border-white'} ${p.type==='bezier' ? 'ring-2 ring-blue-400/30' : ''}`}
              style={{ left: `${p.x}%`, top: `${p.y}%`, pointerEvents: 'auto', width: handlePx(selectedBezierPointId===p.id ? 22 : 18), height: handlePx(selectedBezierPointId===p.id ? 22 : 18), borderWidth: handlePx(2.5) }}
              onPointerDown={(e) => handleVectorPointDown(e, p.id, 'point')}
              onDoubleClick={(e) => { e.stopPropagation(); handleBezierPointContext(e as any, p.id)}}
              onContextMenu={(e) => handleBezierPointContext(e, p.id)}
              title={`${p.type==='bezier' ? 'Bezier' : 'Canto'} — duplo-clique alterna, botão direito deleta. Clique no ✕ para eliminar`}
            />

            {p.type === 'bezier' && p.handleOut && (
              <div
                data-bezier-handle
                className="absolute bg-white border-2 border-blue-500 rounded-full -translate-x-1/2 -translate-y-1/2 cursor-move shadow-sm hover:scale-110 transition-transform"
                style={{ left: `${p.x + p.handleOut.x}%`, top: `${p.y + p.handleOut.y}%`, pointerEvents: 'auto', width: handlePx(16), height: handlePx(16), borderWidth: handlePx(2.5) }}
                onPointerDown={(e) => handleVectorPointDown(e, p.id, 'handleOut')}
                title="Alça de saída — Alt arrasta sem espelhar"
              />
            )}
            {p.type === 'bezier' && p.handleIn && (
              <div
                data-bezier-handle
                className="absolute bg-white border-2 border-orange-400 rounded-full -translate-x-1/2 -translate-y-1/2 cursor-move shadow-sm hover:scale-110 transition-transform"
                style={{ left: `${p.x + p.handleIn.x}%`, top: `${p.y + p.handleIn.y}%`, pointerEvents: 'auto', width: handlePx(16), height: handlePx(16), borderWidth: handlePx(2.5) }}
                onPointerDown={(e) => handleVectorPointDown(e, p.id, 'handleIn')}
                title="Alça de entrada — Alt arrasta sem espelhar"
              />
            )}
          </div>
        ))}
        {/* ponto externo para mover — Inkscape-like, fora da bbox (rotação usa o handle nativo) */}
        <div
          data-bezier-move
          className="absolute bg-emerald-500 border-2 border-white rounded-full -translate-x-1/2 shadow-lg flex items-center justify-center cursor-move hover:scale-110 transition-transform"
          style={{ left: '50%', bottom: -handlePx(44), pointerEvents: 'auto', zIndex: 5, width: handlePx(32), height: handlePx(32), borderWidth: handlePx(2) }}
          onPointerDown={(e) => handleMoveStart(e as any, vl.id)}
          title="Mover objeto (ponto externo — arraste)"
        >
          <span style={{ fontSize: handlePx(11) }} className="leading-none select-none">✥</span>
        </div>
        <div className="absolute left-1/2 bg-emerald-500/50 -translate-x-1/2 pointer-events-none" style={{ bottom: -handlePx(20), width: handlePx(1), height: handlePx(20) }} />
      </div>
    )
  }, [selectedLayerId, layers, handleVectorPointDown, handleVectorOverlayClick, handleBezierPointContext, handleMoveStart, croppingLayerId, selectedBezierPointId, cw, ch, scale, resScale, bezierEditMode])

  const handleLayerPointerDown = useCallback((e: React.PointerEvent, layerId: string) => {
    // Gesto que acabou de sair do modo edição é consumido (não move nada)
    if (editExitSuppressRef.current) return
    if (croppingLayerId) return
    if (bezierEditMode) return
    if (editingTextId) return
    if (e.button !== 0) return
    const layer = layers.find((l) => l.id === layerId)
    if (!layer) return
    // Guarda se já estava selecionado antes do primeiro clique do duplo clique (para edição estrita)
    if (layer.type === 'text' && (e as any).detail === 1) {
      wasSelectedAtFirstClickRef.current.set(layerId, selectedLayerIds.includes(layerId))
    }
    const isolated = useStore.getState().isolatedGroupId
    // Duplo clique para entrar no grupo isolado
    if ((e as any).detail === 2) {
      const groupId = layer.type === 'group' ? layer.id : layer.groupId
      if (groupId) {
        const grp = layers.find((g) => g.id === groupId && g.type === 'group')
        if (grp) {
          e.stopPropagation()
          e.preventDefault()
          useStore.getState().enterGroupIsolate(groupId)
          return
        }
      }
    }
    // Quando isolado, só permite interagir com itens do grupo isolado
    if (isolated) {
      if (layer.type === 'group' && layer.id === isolated) return
      if (layer.groupId !== isolated && layer.id !== isolated) return
      // dentro isolado: seleção direta do item, sem mapear para grupo
      if (e.shiftKey) {
        e.stopPropagation(); e.preventDefault()
        toggleLayerSelection(layerId)
      } else {
        if (selectedLayerIds.includes(layerId)) {
          handleMoveStart(e, layerId)
        } else {
          // seleciona só este item do grupo
          selectLayer(layerId)
          handleMoveStart(e, layerId)
        }
      }
      return
    }
    const isGroup = layer.type === 'group'
    const childOfGroup = !!layer.groupId
    const targetId: string = (!e.shiftKey && childOfGroup) ? layer.groupId! : layerId
    if (e.shiftKey) {
      e.stopPropagation()
      e.preventDefault()
      if (isGroup) {
        const childIds = layers.filter((l) => l.groupId === targetId).map((l) => l.id)
        const merged = Array.from(new Set([...selectedLayerIds, ...childIds]))
        selectLayers(merged)
      } else {
        toggleLayerSelection(targetId)
      }
    } else {
      let effectiveId: string
      if (selectedLayerIds.includes(layerId)) {
        effectiveId = layerId
      } else if (isGroup) {
        effectiveId = layerId
      } else if (childOfGroup) {
        effectiveId = targetId
      } else {
        effectiveId = layerId
      }
      handleMoveStart(e, effectiveId)
    }
  }, [layers, handleMoveStart, toggleLayerSelection, selectedLayerIds, selectLayers, croppingLayerId, bezierEditMode, selectLayer, editingTextId])

  const handleLayerDoubleClick = useCallback((e: React.MouseEvent, layerId: string) => {
    // Edição direta agora é via tecla Return (Enter) — duplo clique desativado conforme solicitado
    // Mantém prevenção de propagação para não conflitar com isolate de grupo
    e.preventDefault()
    e.stopPropagation()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const isolated = useStore.getState().isolatedGroupId
      if (isolated) { useStore.getState().exitGroupIsolate(); return }
      if (croppingLayerId) { setCroppingLayerId(null); return }
      if (bezierEditMode) { exitBezierEdit(); return }
      const isBez = !!layers.find((l) => l.id === selectedLayerId && (l as any).vectorPath)
      if (isBez) {
        if (selectedBezierPointId) setSelectedBezierPointId(null)
        else clearSelection()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [croppingLayerId, setCroppingLayerId, layers, selectedLayerId, selectedBezierPointId, clearSelection, bezierEditMode, exitBezierEdit])

  const handleWorkAreaMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Sair do modo de edição (input/textarea) ao clicar no canvas
    const active = document.activeElement as HTMLElement | null
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
      active.blur()
    }
    // Gesto que acabou de sair do modo edição é consumido (só foca seleção de texto)
    if (editExitSuppressRef.current) return
    // Popup de cor aberto: o toque só o dispensa, sem mover/desselecionar
    if ((e.target as HTMLElement)?.closest?.('[data-color-popup="true"]')) return
    if (closeOpenColorPopups()) return
    if (editingTextId) {
      setEditingTextId(null)
    }
    if (e.button !== 0) return
    const isolated = useStore.getState().isolatedGroupId
    if (isolated && (e as any).detail === 2) {
      // duplo clique fora do grupo isolado sai do modo
      const t = e.target as HTMLElement
      const clickedLayer = t.closest('.canvas-layer') as HTMLElement | null
      const clickedId = clickedLayer?.getAttribute('data-layer-id') ?? null
      const insideIsolated = clickedId ? (clickedId === isolated || layers.find((l) => l.id === clickedId)?.groupId === isolated) : false
      if (!insideIsolated) {
        useStore.getState().exitGroupIsolate()
        return
      }
    }
    if (croppingLayerId) {
      const target = e.target as HTMLElement
      if (target.closest('[data-crop-overlay="true"]')) return
      // desselecionar no modo crop deve cancelar o crop (pedido do usuário)
      setCroppingLayerId(null)
      return
    }
    const target = e.target as HTMLElement
    // modo edição de curvas bezier: bbox desaparece e permite desenhar em qualquer lugar da tela
    if (bezierEditMode) {
      if (target.closest('[data-bezier-point]') || target.closest('[data-bezier-handle]') || target.closest('[data-vector-overlay="true"]')) return
      if (target.closest('#ctx-menu-root')) return
      const vl: any = layers.find((l) => l.id === selectedLayerId && (l as any).vectorPath)
      if (vl && containerRef.current) {
        // clique no fundo da tela enquanto em edição: adiciona ponto na posição clicada (permite desenhar livremente)
        const canvasRect = containerRef.current.getBoundingClientRect()
        const layerScreenW = Math.max(1, vl.width * cw * scale)
        const layerScreenH = Math.max(1, vl.height * ch * scale)
        const cxNorm = vl.x + vl.width / 2
        const cyNorm = vl.y + vl.height / 2
        const layerCenterX = canvasRect.left + cxNorm * canvasRect.width
        const layerCenterY = canvasRect.top + cyNorm * canvasRect.height
        const dxScreen = e.clientX - layerCenterX
        const dyScreen = e.clientY - layerCenterY
        const rad = (vl.rotation * Math.PI) / 180
        const cosA = Math.cos(-rad), sinA = Math.sin(-rad)
        const dxLocalPx = dxScreen * cosA - dyScreen * sinA
        const dyLocalPx = dxScreen * sinA + dyScreen * cosA
        const x = 50 + (dxLocalPx / layerScreenW) * 100
        const y = 50 + (dyLocalPx / layerScreenH) * 100
        const cxClamped = x
        const cyClamped = y
        const pts: any[] = vl.vectorPath.points
        let insertIdx = pts.length
        let insertT = 0.5, insertIsBez = false
        if (pts.length >= 2) {
          let bestDist = Infinity, bestIdx = pts.length, bestT=0.5, bestBez=false
          const segCount = vl.vectorPath.closed ? pts.length : pts.length - 1
          const samples=24
          for (let i = 0; i < segCount; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length]
            const isBez = b.type==='bezier' || a.type==='bezier'
            if (!isBez) {
              const vx = b.x - a.x, vy = b.y - a.y
              const len2 = vx*vx + vy*vy || 1
              const tLin = Math.max(0, Math.min(1, ((cxClamped - a.x)*vx + (cyClamped - a.y)*vy)/len2))
              const pxL = a.x + tLin*vx, pyL = a.y + tLin*vy
              const distL = Math.hypot(cxClamped - pxL, cyClamped - pyL)
              if (distL < bestDist) { bestDist = distL; bestIdx = i + 1; bestT=tLin; bestBez=false }
            } else {
              const p0x=a.x, p0y=a.y, p1x=a.x+(a.handleOut?.x??0), p1y=a.y+(a.handleOut?.y??0), p2x=b.x+(b.handleIn?.x??0), p2y=b.y+(b.handleIn?.y??0), p3x=b.x, p3y=b.y
              for (let s=0;s<=samples;s++){const t=s/samples, u=1-t, x=u*u*u*p0x+3*u*u*t*p1x+3*u*t*t*p2x+t*t*t*p3x, y=u*u*u*p0y+3*u*u*t*p1y+3*u*t*t*p2y+t*t*t*p3y; const d=Math.hypot(cxClamped-x, cyClamped-y); if(d<bestDist){bestDist=d; bestIdx=i+1; bestT=t; bestBez=true}}
            }
          }
          if (bestDist < 14) { insertIdx = bestIdx; insertT=bestT; insertIsBez=bestBez }
        }
        pushHistory()
        const nid = Date.now().toString(36) + Math.random().toString(36).slice(2,5)
        let handleIn: any = undefined, handleOut: any = undefined
        if (insertIdx > 0 && insertIdx <= pts.length && insertIsBez) {
          const a = pts[insertIdx - 1] as any, b = (pts[insertIdx % pts.length] as any) || a
          const p0x=a.x,p0y=a.y,p1x=a.x+(a.handleOut?.x??0),p1y=a.y+(a.handleOut?.y??0),p2x=b.x+(b.handleIn?.x??0),p2y=b.y+(b.handleIn?.y??0),p3x=b.x,p3y=b.y
          const t=insertT,u=1-t
          const dx=3*u*u*(p1x-p0x)+6*u*t*(p2x-p1x)+3*t*t*(p3x-p2x)
          const dy=3*u*u*(p1y-p0y)+6*u*t*(p2y-p1y)+3*t*t*(p3y-p2y)
          const segLen=Math.hypot(dx,dy)||Math.hypot((b?.x??0)-(a?.x??0),(b?.y??0)-(a?.y??0))||20
          const ux=dx/(segLen||1), uy=dy/(segLen||1)
          const hl=Math.max(6,Math.min(18,segLen*0.22))
          handleIn={x:-ux*hl,y:-uy*hl}; handleOut={x:ux*hl,y:uy*hl}
        } else if (insertIdx > 0 && insertIdx <= pts.length) {
          const a = pts[insertIdx - 1] as any, b = (pts[insertIdx % pts.length] as any) || a
          const vx = (b?.x ?? cxClamped) - (a?.x ?? cxClamped), vy = (b?.y ?? cyClamped) - (a?.y ?? cyClamped)
          const segLen = Math.hypot(vx, vy) || 20
          const ux = vx / (segLen || 1), uy = vy / (segLen || 1)
          const hl = Math.max(6, Math.min(18, segLen * 0.28))
          handleIn = { x: -ux * hl, y: -uy * hl }
          handleOut = { x: ux * hl, y: uy * hl }
        } else {
          handleIn = { x: -10, y: 0 }; handleOut = { x: 10, y: 0 }
        }
        updateVectorPath(vl.id, (vp:any) => {
          const next = [...vp.points]
          next.splice(insertIdx, 0, { id: nid, x: cxClamped, y: cyClamped, type: 'bezier' as const, handleIn, handleOut })
          return { ...vp, points: next }
        }, false)
        setSelectedBezierPointId(nid)
        e.preventDefault()
        e.stopPropagation()
        return
      }
      return
    }
    // em modo bezier, clique dentro do overlay não deve desmarcar
    if (target.closest('[data-vector-overlay="true"]')) return
    if (target.closest('.canvas-layer') || target.closest('[data-selection-box="true"]')) return
    // seleção direta pela curva bezier clicando na linha (não só na bbox) — hit test com isPointInStroke e tolerância
    if (!bezierEditMode) {
      const hitBezierId = (() => {
        for (const l of layers) {
          if (l.type !== 'vector' || !(l as any).vectorPath || !l.visible || l.locked) continue
          const layerEl = document.querySelector(`[data-layer-id="${l.id}"]`) as HTMLElement | null
          if (!layerEl) continue
          const svgEl = layerEl.querySelector('svg') as unknown as SVGSVGElement | null
          if (!svgEl || !(svgEl as any).createSVGPoint || !svgEl.getScreenCTM) continue
          try {
            const vp: any = (l as any).vectorPath
            const pts: any[] = vp.points || []
            if (pts.length < 1) continue
            let d = `M ${pts[0].x} ${pts[0].y}`
            for (let i = 1; i < pts.length; i++) {
              const prev = pts[i-1], cur = pts[i]
              const isBez = cur.type === 'bezier' || prev.type === 'bezier'
              if (isBez) d += ` C ${prev.x + (prev.handleOut?.x ?? 0)} ${prev.y + (prev.handleOut?.y ?? 0)}, ${cur.x + (cur.handleIn?.x ?? 0)} ${cur.y + (cur.handleIn?.y ?? 0)}, ${cur.x} ${cur.y}`
              else d += ` L ${cur.x} ${cur.y}`
            }
            if (vp.closed) d += ' Z'
            const tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
            tempPath.setAttribute('d', d)
            tempPath.setAttribute('fill', vp.closed ? 'black' : 'none')
            tempPath.setAttribute('stroke', 'black')
            tempPath.setAttribute('stroke-width', '14')
            tempPath.setAttribute('stroke-linecap', 'round')
            tempPath.setAttribute('stroke-linejoin', 'round')
            // usa o mesmo SVG para herdar viewBox/transform
            svgEl.appendChild(tempPath)
            const pt = (svgEl as any).createSVGPoint()
            pt.x = e.clientX
            pt.y = e.clientY
            const ctm = svgEl.getScreenCTM()
            let hit = false
            if (ctm) {
              const svgP = pt.matrixTransform(ctm.inverse())
              hit = (tempPath as any).isPointInStroke(svgP) || (tempPath as any).isPointInFill?.(svgP)
            }
            svgEl.removeChild(tempPath)
            if (hit) return l.id
          } catch {}
        }
        return null
      })()
      if (hitBezierId) {
        if (!selectedLayerIds.includes(hitBezierId)) selectLayer(hitBezierId)
        else {
          // já selecionado: inicia move direto na curva
          handleMoveStart(e as unknown as React.PointerEvent, hitBezierId)
        }
        return
      }
    }
    if (target.closest('#ctx-menu-root')) return
    if (!containerRef.current) return
    if (bezierEditMode) {
      return
    }
    if (!e.shiftKey) {
      clearSelection()
    }
    const rect = containerRef.current.getBoundingClientRect()
    const sx = (e.clientX - rect.left) / rect.width
    const sy = (e.clientY - rect.top) / rect.height
    rubberBandRef.current = { sx, sy, cx: sx, cy: sy, w: rect.width, h: rect.height }
    setRubberBand({ sx, sy, cx: sx, cy: sy, w: rect.width, h: rect.height })

    const onMove = (ev: MouseEvent) => {
      if (!rubberBandRef.current || !containerRef.current) return
      const r = containerRef.current.getBoundingClientRect()
      rubberBandRef.current.cx = (ev.clientX - r.left) / r.width
      rubberBandRef.current.cy = (ev.clientY - r.top) / r.height
      rubberBandRef.current.w = r.width
      rubberBandRef.current.h = r.height
      setRubberBand({ ...rubberBandRef.current })
    }
    const onUp = () => {
      if (rubberBandRef.current) {
        const rb = rubberBandRef.current
        const x1 = Math.min(rb.sx, rb.cx)
        const y1 = Math.min(rb.sy, rb.cy)
        const x2 = Math.max(rb.sx, rb.cx)
        const y2 = Math.max(rb.sy, rb.cy)
        const dx = (x2 - x1) * rb.w
        const dy = (y2 - y1) * rb.h
        if (dx > 4 || dy > 4) {
          const isolated = useStore.getState().isolatedGroupId
          const inside = layers.filter((l) => {
            if (!l.visible || l.locked || l.isBackground || l.type === 'group' || l.type === 'mask') return false
            if (isolated && l.groupId !== isolated) return false
            // locked objects nunca selecionáveis por caixa (já filtrado) e também ignorar grupo travado
            if (l.groupId) {
              const parent = layers.find((p) => p.id === l.groupId)
              if (parent && (!parent.visible || parent.locked)) return false
            }
            // AABB com rotação para reconhecer melhor objetos rotacionados
            const cx = l.x + l.width / 2, cy = l.y + l.height / 2
            const hw = l.width / 2, hh = l.height / 2
            const rad = l.rotation * Math.PI / 180
            const cos = Math.cos(rad), sin = Math.sin(rad)
            const corners = [
              { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh },
            ].map((p) => ({ x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos }))
            const minX = Math.min(...corners.map((c) => c.x))
            const maxX = Math.max(...corners.map((c) => c.x))
            const minY = Math.min(...corners.map((c) => c.y))
            const maxY = Math.max(...corners.map((c) => c.y))
            // overlap test: qualquer sobreposição entre caixas
            return minX < x2 && maxX > x1 && minY < y2 && maxY > y1
          })
          if (e.shiftKey) {
            const merged = Array.from(new Set([...selectedLayerIds, ...inside.map((l) => l.id)]))
            selectLayers(merged)
          } else {
            selectLayers(inside.map((l) => l.id))
          }
        }
      }
      rubberBandRef.current = null
      setRubberBand(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [clearSelection, layers, selectLayers, selectedLayerIds, selectedLayerId, selectedBezierPointId, croppingLayerId, setCroppingLayerId, bezierEditMode, cw, ch, scale, pushHistory, updateVectorPath])

  return (
    <div
      ref={workAreaRef}
      className="flex-1 relative p-4 bg-[#0f0f1a] overflow-hidden"
      data-canvas-area="true"
      onWheel={onWheel}
      onDoubleClick={(e) => {
        // Edição de texto agora via tecla Return (Enter) — duplo clique desativado
        e.preventDefault()
        e.stopPropagation()
      }}
      onMouseDown={(e) => {
        if (e.button === 1) {
          e.preventDefault()
          e.stopPropagation()
          panRef.current = { startX: e.clientX, startY: e.clientY, origX: panOffset.x, origY: panOffset.y }
          setIsInteracting(true)
          const           onMove = (ev: MouseEvent) => {
            if (!panRef.current) return
            const dx = ev.clientX - panRef.current.startX
            const dy = ev.clientY - panRef.current.startY
            pendingPanRef.current = { x: panRef.current.origX + dx, y: panRef.current.origY + dy }
            if (!panRafRef.current) {
              panRafRef.current = requestAnimationFrame(()=>{
                if(pendingPanRef.current && containerRef.current){
                  containerRef.current.style.transform = `translate(calc(-50% + ${pendingPanRef.current!.x}px), calc(-50% + ${pendingPanRef.current!.y}px))`
                }
                panRafRef.current=0
              })
            }
          }
          const onUp = () => {
            cancelAnimationFrame(panRafRef.current); panRafRef.current=0
            if(pendingPanRef.current) setPanOffset(pendingPanRef.current)
            pendingPanRef.current=null
            panRef.current = null
            setTimeout(()=>setIsInteracting(false), 120)
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
          }
          document.addEventListener('mousemove', onMove)
          document.addEventListener('mouseup', onUp)
          return
        }
        if (e.button !== 0) return
        handleWorkAreaMouseDown(e)
      }}
    >
      {isolatedGroupId && (() => {
        const grp = layers.find((l) => l.id === isolatedGroupId)
        return (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-600/90 backdrop-blur text-white text-[11px] shadow-lg border border-blue-500/30" data-no-deselect="true">
            <span>📁 {grp?.name || 'Grupo'} — {t('layers.isolatedHint')}</span>
            <button onClick={() => useStore.getState().exitGroupIsolate()} className="ml-2 px-2 py-0.5 rounded-full bg-white text-blue-700 text-[10px] hover:bg-zinc-100">{t('layers.exitIsolated')}</button>
          </div>
        )
      })()}
      <div
        ref={containerRef}
        className="canvas-container"
        style={{ width: cw * scale, height: ch * scale, overflow: 'visible', position: 'absolute', left: '50%', top: '50%', transform: `translate(calc(-50% + ${panOffset.x}px), calc(-50% + ${panOffset.y}px))`, borderRadius: 0, willChange: isUiBusy ? 'transform' as const : undefined, contain: isUiBusy ? 'layout paint' as const : undefined }}
      >
        <div style={{ width: cw, height: ch, position: 'absolute', top: 0, left: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <div
            ref={exportRef}
            id="canvas-export-target"
            style={{
              width: '100%', height: '100%', position: 'relative', ...bgStyle,
              filter: isUiBusy ? undefined : `brightness(${globalEffects.brightness}) contrast(${globalEffects.contrast}) saturate(${globalEffects.saturation}) sepia(${globalEffects.sepia}) hue-rotate(${globalEffects.hueRotate}deg) blur(${globalEffects.blur}px)`,
              willChange: isUiBusy ? 'transform' as const : undefined,
              contain: isUiBusy ? 'paint' as const : undefined,
            }}
          >
          {snapGuides.vertical.map((x, i) => (
            <div key={`vg-${i}`} style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${x * 100}%`, width: 1,
              background: '#3b82f6', pointerEvents: 'none', zIndex: 9999,
              boxShadow: '0 0 4px rgba(59, 130, 246, 0.8)',
            }} />
          ))}
          {snapGuides.horizontal.map((y, i) => (
            <div key={`hg-${i}`} style={{
              position: 'absolute', left: 0, right: 0,
              top: `${y * 100}%`, height: 1,
              background: '#3b82f6', pointerEvents: 'none', zIndex: 9999,
              boxShadow: '0 0 4px rgba(59, 130, 246, 0.8)',
            }} />
          ))}



          {sortedLayers.map((layer) => {
            if (layer.type === 'group' || layer.type === 'mask') return null
            if (layer.id === editingTextId) return null
            const parentGroupHidden = !!(layer.groupId && !groupVisibility.get(layer.groupId))
            const parentGroupLocked = !!(layer.groupId && groupLocked.get(layer.groupId))
            const isSelected = selectedLayerIds.includes(layer.id)
            const isHidden = !layer.visible || parentGroupHidden
            const isDimmed = !!(isolatedGroupId && layer.groupId !== isolatedGroupId && layer.id !== isolatedGroupId)
            
            return (
              <LayerDiv
                key={layer.id}
                layer={layer}
                isSelected={isSelected}
                isHidden={isHidden}
                parentGroupLocked={!!parentGroupLocked}
                cw={cw}
                ch={ch}
                layers={layers}
                background={background}
                px={px}
                toFilter={toFilter}
                toBlurFilter={toBlurFilter}
                toShadow={toShadow}
                toShadowFilter={toShadowFilter}
                outlineFilter={outlineFilter}
                parseCSSGradient={parseCSSGradient}
                onPointerDown={handleLayerPointerDown}
                onDoubleClick={handleLayerDoubleClick}
                bezierEditMode={bezierEditMode}
                isDimmed={isDimmed}
                isInteracting={isUiBusy}
              />
            )
          })}
          {editingTextId && (() => {
            const el = layers.find(l => l.id === editingTextId)
            if (!el || el.type !== 'text') return null
            const has3d = el.perspectiveX !== 0 || el.perspectiveY !== 0
            const transform3d = has3d ? `perspective(500px) rotateY(${el.perspectiveX}deg) rotateX(${-el.perspectiveY}deg)` : ''
            const transform = `${transform3d} rotate(${el.rotation}deg)${el.mirrorX ? ' scaleX(-1)' : ''}${el.mirrorY ? ' scaleY(-1)' : ''}`.trim()
            return (
              <div data-inline-text-edit style={{ position: 'absolute', left: `${el.x * 100}%`, top: `${el.y * 100}%`, width: `${el.width * 100}%`, height: `${el.height * 100}%`, transform: transform || undefined, transformOrigin: 'center center', zIndex: 100005, overflow: 'visible' }}>
                <InlineTextEditor
                  key={el.id}
                  layerId={el.id}
                  cw={cw}
                  ch={ch}
                  onExit={() => {
                    setEditingTextId(null)
                    try { useStore.getState().pushHistory() } catch {}
                  }}
                />
              </div>
            )
          })()}

        </div>

        {selBboxEl}
        {cropOverlayEl}
        {vectorPathOverlayEl}
      </div>
      {rubberBand && (() => {
        const x1 = Math.min(rubberBand.sx, rubberBand.cx) * 100
        const y1 = Math.min(rubberBand.sy, rubberBand.cy) * 100
        const w = Math.abs(rubberBand.cx - rubberBand.sx) * 100
        const h = Math.abs(rubberBand.cy - rubberBand.sy) * 100
        return (
          <div
            data-selection-box="true"
            style={{
              position: 'absolute',
              left: `${x1}%`,
              top: `${y1}%`,
              width: `${w}%`,
              height: `${h}%`,
              border: '1.5px dashed #3b82f6',
              background: 'rgba(59, 130, 246, 0.1)',
              pointerEvents: 'none',
              zIndex: 100001,
            }}
          />
        )
      })()}

      {contextMenu && createPortal((() => {
        const menuW = 180, menuH = 280
        const vx = Math.min(contextMenu.x, window.innerWidth - menuW)
        const vy = Math.min(contextMenu.y, window.innerHeight - menuH)
        return (
        <div
          id="ctx-menu-root"
          data-no-deselect="true"
          className="fixed z-[200000] bg-zinc-800 border border-zinc-600 rounded-lg shadow-2xl py-1 min-w-[180px]"
          style={{ left: Math.max(0, vx), top: Math.max(0, vy) }}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {(() => {
            const s = useStore.getState()
            const layerIds = s.selectedLayerIds.length > 0 ? s.selectedLayerIds : (s.selectedLayerId ? [s.selectedLayerId] : [])
            const allLocked = layerIds.length > 0 && layerIds.every((id) => s.layers.find((l) => l.id === id)?.locked)
            // Detect if any selected layer is a group OR belongs to a group
            const groupIds = new Set<string>()
            for (const id of layerIds) {
              const l = s.layers.find((x) => x.id === id)
              if (l?.type === 'group') groupIds.add(l.id)
              else if (l?.groupId) groupIds.add(l.groupId)
            }
            const hasGroup = groupIds.size > 0
            const hasBezier = layerIds.some((id) => {
              const l = s.layers.find((x) => x.id === id)
              return !!(l && (l as any).vectorPath)
            })
            const maxZ = Math.max(0, ...s.layers.map((l) => l.zIndex))
            const minZ = Math.min(0, ...s.layers.map((l) => l.zIndex))
            const items: { label: string; shortcut?: string; action: () => void; danger?: boolean; disabled?: boolean; divider?: boolean }[] = [
              { label: t('layers.duplicate'), shortcut: 'Ctrl+D', action: () => { const st = useStore.getState(); const ids = st.selectedLayerIds.length > 0 ? st.selectedLayerIds : (st.selectedLayerId ? [st.selectedLayerId] : []); if (ids.length > 0) st.duplicateLayerExact(ids) } },
              { label: allLocked ? t('layers.unlock') : t('layers.lock'), shortcut: 'Ctrl+L', action: () => { const st = useStore.getState(); if (layerIds.length > 0) st.toggleLockMultiple(layerIds) } },
              { label: t('layers.hide'), action: () => { const st = useStore.getState(); if (layerIds.length > 0) st.toggleVisibilityMultiple(layerIds) }, disabled: layerIds.length === 0 },
              { divider: true, label: '', action: () => {} },
              { label: '↑ ' + t('layers.moveUp'), shortcut: 'Ctrl+]', action: () => { const st = useStore.getState(); for (const id of layerIds) { const l = st.layers.find((x) => x.id === id); if (l && l.zIndex < maxZ) st.moveLayerToIndex(id, l.zIndex + 1) } }, disabled: allLocked },
              { label: '↓ ' + t('layers.moveDown'), shortcut: 'Ctrl+[', action: () => { const st = useStore.getState(); for (const id of layerIds) { const l = st.layers.find((x) => x.id === id); if (l && l.zIndex > minZ) st.moveLayerToIndex(id, l.zIndex - 1) } }, disabled: allLocked },
              { label: '⬆ ' + t('layers.moveUp') + ' (topo)', action: () => { const st = useStore.getState(); for (const id of layerIds) st.moveLayerToIndex(id, maxZ) }, disabled: allLocked },
              { label: '⬇ ' + t('layers.moveDown') + ' (fundo)', action: () => { const st = useStore.getState(); for (const id of layerIds) st.moveLayerToIndex(id, minZ) }, disabled: allLocked },
              ...(hasGroup ? [
                { divider: true, label: '', action: () => {} } as const,
                { label: t('layers.ungroup'), shortcut: 'Alt+Ctrl+G', action: () => {
                  const st = useStore.getState()
                  for (const gid of groupIds) st.ungroupGroup(gid)
                }, disabled: allLocked },
              ] : layerIds.length > 1 ? [
                { divider: true, label: '', action: () => {} } as const,
                { label: t('layers.group'), shortcut: 'Ctrl+G', action: () => {
                  const st = useStore.getState()
                  st.setGroupNameCallback((name: string) => {
                    if (!name) return
                    st.createGroup(name)
                    const curr = useStore.getState()
                    const group = curr.layers.find((l: Layer) => l.type === 'group' && l.name === name)
                    if (group) { for (const id of layerIds) curr.moveLayerToGroup(id, group.id) }
                  })
                }, disabled: allLocked },
              ] : []),
              ...(() => {
                const vectorIds = layerIds.filter((id) => {
                  const l = s.layers.find((x) => x.id === id)
                  return l?.type === 'vector'
                })
                if (vectorIds.length >= 2) return [{ label: t('vector.mergeVectors'), action: () => { const st = useStore.getState(); st.mergeVectors(vectorIds) } } as const]
                return []
              })(),
              ...(hasBezier ? [{
                label: t('vector.saveVector') || 'Guardar vetor', action: () => {
                  const st = useStore.getState()
                  const bezId = layerIds.find((id) => {
                    const l = st.layers.find((x) => x.id === id)
                    return !!(l && (l as any).vectorPath)
                  })
                  if (!bezId) return
                  const bezLayer = st.layers.find((x) => x.id === bezId) as any
                  if (!bezLayer?.vectorPath) return
                  st.saveCustomVector(bezLayer.vectorPath)
                  setContextMenu(null)
                }
              } as const] : []),
              ...(() => {
                const groupVectorIds = Array.from(groupIds).filter((gid) => s.layers.some((l) => l.groupId === gid && l.type === 'vector'))
                if (groupVectorIds.length > 0) return [{ label: t('vector.saveVector') || 'Guardar vetor', action: () => { const st = useStore.getState(); for (const gid of groupVectorIds) st.saveCustomVectorGroup(gid) } } as const]
                return []
              })(),
              { divider: true, label: '', action: () => {} },
              { label: t('layers.remove'), shortcut: 'Del', action: () => { const st = useStore.getState(); for (const id of layerIds) st.removeLayer(id) }, danger: true, disabled: allLocked },
            ]
            return items.map((item, i) => item.divider ? (
              <div key={i} className="h-px bg-zinc-700 my-1" />
            ) : (
              <button
                key={i}
                disabled={item.disabled}
                className={`w-full text-left px-3 py-1.5 text-[11px] flex items-center justify-between transition-colors
                  ${item.danger ? 'text-red-400 hover:bg-red-500/15' : 'text-zinc-300 hover:bg-zinc-700'}
                  ${item.disabled ? 'opacity-30 cursor-default' : 'cursor-pointer'}`}
                onClick={() => { if (!item.disabled) { item.action(); setContextMenu(null) } }}
              >
                <span>{item.label}</span>
                {item.shortcut && <span className="text-[9px] text-zinc-500 ml-4">{item.shortcut}</span>}
              </button>
            ))
          })()}
        </div>
        )
      })(), document.body)}

      {dragOver && (
        <div className="fixed inset-0 z-[250000] flex items-center justify-center pointer-events-none"
          style={{ background: 'rgba(59,130,246,0.15)', border: '3px dashed rgba(59,130,246,0.5)' }}>
          <span className="text-blue-400 text-sm font-medium">{t('image.dropHint') || 'Solte a imagem aqui'}</span>
        </div>
      )}

    </div>
  </div>
  )
}
