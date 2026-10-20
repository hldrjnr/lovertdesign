import { useState, useEffect, useRef } from 'react'
import { t } from '@/i18n'
import { useStore } from '@/store'
import type { Layer } from '@/types'
import { ColorPalette } from './ColorPalette'
import { GradientPickerInline } from './GradientPicker'
import { PanelCard, PanelSlider, PanelSwitch } from './Panel'
import { NATIVE_TEXT_PRESETS } from '@/nativeTextPresets'
import { computeWrappedTextHeight } from '@/store'
import { clampSpans } from '@/richText'

const STYLE_PRESETS_KEY = 'thumbnail-app.style-presets.v1'
interface TextStylePreset { id:string; name:string; font:string; fontSize:number; color:string; textGradient:string|null; lineHeight:number; letterSpacing:number; textTransform:'none'|'uppercase'|'lowercase'; fontStyle:'normal'|'italic'|'oblique'; fontWeight:number; opacity:number; outline:{color:string;width:number}|null; outlineWidthPx:number; shadow:{color:string;blur:number;offsetX:number;offsetY:number;intensity:number;inset:boolean}|null; innerShadow:{color:string;blur:number;offsetX:number;offsetY:number;intensity:number;inset:boolean}|null; bevel:any|null }
function readStylePresets(): TextStylePreset[] { try{ return JSON.parse(localStorage.getItem(STYLE_PRESETS_KEY)||'[]')}catch{return []}}
function writeStylePresets(p:TextStylePreset[]){ localStorage.setItem(STYLE_PRESETS_KEY, JSON.stringify(p))}
function makeId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,9)}
function recalcTextSize(text:string,font:string,fontSize:number,cw:number,ch:number,fontStyle='normal',fontWeight=700,lineHeight=1.2,letterSpacing=0,textTransform='none'): {width:number;height:number} {
  let tw=0.08,th=0.05; try{ const mc=document.createElement('canvas'); const ctx=mc.getContext('2d'); if(ctx){ ctx.font=`${fontStyle} ${fontWeight} ${fontSize}px ${font}`; const lines=text.split('\n'); let maxW=0; let totalH=0; for(let line of lines){ let l=line||' '; if(textTransform==='uppercase') l=l.toUpperCase(); else if(textTransform==='lowercase') l=l.toLowerCase(); const m:any=ctx.measureText(l); let w=m.width; if(letterSpacing>0) w+=(l.length-1)*letterSpacing; maxW=Math.max(maxW,w); const ascent=m.actualBoundingBoxAscent??fontSize*0.82; const descent=m.actualBoundingBoxDescent??fontSize*0.18; totalH+=Math.max(ascent+descent, fontSize*0.9)} if(lines.length>1) totalH+=(lines.length-1)*fontSize*(lineHeight-1); tw=Math.max(0.08,Math.min(maxW+fontSize*0.12,cw*0.98)/cw); th=Math.max(0.03,Math.min(totalH+fontSize*0.06,ch*0.98)/ch)}}catch{} return {width:tw,height:th}
}

function PresetThumb({ preset, onApply, onDelete, deletable }: { preset:any; onApply:()=>void; onDelete?:()=>void; deletable?:boolean }) {
  const hasOutline = !!preset.outline && (preset.outlineWidthPx ?? 0) > 0
  const hasShadow = !!preset.shadow && !preset.shadow.inset
  const hasInner = !!(preset.innerShadow)
  const hasBevel = !!preset.bevel?.enabled
  const text = 'AaBb'
  const innerId = hasInner ? `preview-inner-${preset.id}` : null
  const bevelId = hasBevel ? `preview-bevel-${preset.id}` : null
  // preview fiel ao canvas: efeitos aplicados no glyph (não em rect), sem cortar sombras
  return (
    <div className="group relative bg-zinc-900 border border-zinc-700 rounded-xl overflow-visible hover:border-zinc-600 hover:bg-zinc-800 transition-colors flex flex-col">
      <button onClick={onApply} className="flex-1 w-full flex items-center justify-center p-2 min-h-[68px] relative overflow-visible">
        {/* SVG filters para innerShadow/bevel — seguem o alpha do glyph, com fade para dentro */}
        {(hasInner || hasBevel) && (
          <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
            <defs>
              {hasInner && (() => {
                const eff = preset.innerShadow
                const blur = Math.max(0, eff.blur ?? 8)
                const dx = eff.offsetX ?? 0
                const dy = eff.offsetY ?? 0
                const intensity = Math.max(0, Math.min(1, eff.intensity ?? 0.5))
                const col = eff.color ?? '#000000'
                const std = Math.max(0.6, blur * 0.52)
                const erodeR = Math.max(0.3, Math.min(blur * 0.18, 6))
                return (
                  <filter id={innerId!} x="-60%" y="-60%" width="220%" height="220%" colorInterpolationFilters="sRGB">
                    <feMorphology operator="erode" radius={erodeR} in="SourceAlpha" result="eroded"/>
                    <feComposite operator="out" in="SourceAlpha" in2="eroded" result="ring"/>
                    <feOffset dx={dx*0.35} dy={dy*0.35} in="ring" result="off"/>
                    <feGaussianBlur in="off" stdDeviation={std} result="blur"/>
                    <feComposite operator="in" in="blur" in2="SourceAlpha" result="innerBlur"/>
                    <feFlood floodColor={col} floodOpacity={intensity} result="flood"/>
                    <feComposite operator="in" in="flood" in2="innerBlur" result="shadowInside"/>
                    <feComposite operator="over" in="shadowInside" in2="SourceGraphic" result="withShadow"/>
                  </filter>
                )
              })()}
              {hasBevel && (() => {
                const bv = preset.bevel
                // Preview precisa ser mais visível em texto pequeno (22px) — aumenta contraste e tamanho aparente
                const previewScale = 1.4
                const dx = Math.cos((bv.lightAngle*Math.PI)/180) * bv.size * 0.45 * previewScale
                const dy = Math.sin((bv.lightAngle*Math.PI)/180) * bv.size * 0.45 * previewScale
                const sx = -dx, sy = -dy
                const erodeR = Math.max(0.7, bv.size*0.35 * previewScale)
                return (
                  <filter id={bevelId!} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
                    <feGaussianBlur in="SourceAlpha" stdDeviation={bv.smoothing ?? 2} result="blur"/>
                    <feMorphology operator="erode" radius={erodeR} in="SourceAlpha" result="eroded"/>
                    <feOffset dx={dx} dy={dy} in="blur" result="offHi"/><feComposite in="offHi" in2="SourceAlpha" operator="in" result="hiInside"/><feComposite in="hiInside" in2="eroded" operator="out" result="hiEdge"/><feFlood floodColor={bv.highlightColor} floodOpacity={bv.strength} result="hiColor"/><feComposite in="hiColor" in2="hiEdge" operator="in" result="hi"/>
                    <feOffset dx={sx} dy={sy} in="blur" result="offSh"/><feComposite in="offSh" in2="SourceAlpha" operator="in" result="shInside"/><feComposite in="shInside" in2="eroded" operator="out" result="shEdge"/><feFlood floodColor={bv.shadowColor} floodOpacity={bv.strength*0.85} result="shColor"/><feComposite in="shColor" in2="shEdge" operator="in" result="sh"/>
                    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="hi"/><feMergeNode in="sh"/></feMerge>
                  </filter>
                )
              })()}
            </defs>
          </svg>
        )}
        <span className="relative inline-flex items-center justify-center leading-none text-[22px] px-2 py-2 text-center min-w-0 overflow-visible" style={{ fontFamily: preset.font, fontWeight: preset.fontWeight ?? 700, fontStyle: preset.fontStyle ?? 'normal', letterSpacing: preset.letterSpacing ? `${preset.letterSpacing}px` : undefined, lineHeight: preset.lineHeight ?? 1.1, whiteSpace: 'nowrap', filter: hasBevel ? `url(#${bevelId})` : undefined }}>
          {/* shadow layer (fundo) */}
          {hasShadow && (
            <span
              aria-hidden
              className="absolute inset-0 inline-flex items-center justify-center pointer-events-none select-none overflow-visible"
              style={{
                color: preset.color,
                WebkitTextFillColor: preset.textGradient ? 'transparent' as any : undefined,
                backgroundImage: preset.textGradient || undefined,
                WebkitBackgroundClip: preset.textGradient ? 'text' as any : undefined,
                backgroundClip: preset.textGradient ? 'text' as any : undefined,
                textShadow: `${preset.shadow.offsetX}px ${preset.shadow.offsetY}px ${preset.shadow.blur}px ${preset.shadow.color}`,
                opacity: preset.shadow.intensity ?? 0.6,
                letterSpacing: preset.letterSpacing ? `${preset.letterSpacing}px` : undefined,
                lineHeight: preset.lineHeight ?? 1.1,
                whiteSpace: 'nowrap',
              }}
            >{text}</span>
          )}
          {/* outline layer (meio) */}
          {hasOutline && (
            <span
              aria-hidden
              className="absolute inset-0 inline-flex items-center justify-center pointer-events-none select-none overflow-visible"
              style={{
                color: 'transparent',
                WebkitTextStroke: `${preset.outlineWidthPx ?? preset.outline.width}px ${preset.outline.color}`,
                paintOrder: 'stroke fill' as any,
                letterSpacing: preset.letterSpacing ? `${preset.letterSpacing}px` : undefined,
                lineHeight: preset.lineHeight ?? 1.1,
                whiteSpace: 'nowrap',
              }}
            >{text}</span>
          )}
          {/* fill on top — inner shadow via SVG filter segue alpha do glyph com fade */}
          <span
            className="relative inline-flex items-center justify-center overflow-visible"
            style={{
              color: preset.textGradient ? 'transparent' : preset.color,
              backgroundImage: preset.textGradient || undefined,
              WebkitBackgroundClip: preset.textGradient ? 'text' as any : undefined,
              backgroundClip: preset.textGradient ? 'text' as any : undefined,
              WebkitTextFillColor: preset.textGradient ? 'transparent' as any : undefined,
              opacity: preset.opacity ?? 1,
              letterSpacing: preset.letterSpacing ? `${preset.letterSpacing}px` : undefined,
              lineHeight: preset.lineHeight ?? 1.1,
              whiteSpace: 'nowrap',
              filter: hasInner ? `url(#${innerId})` : undefined,
            }}
          >{text}</span>
        </span>
      </button>
      <div className="px-2 pb-1.5 pt-0 flex items-center justify-between gap-1 border-t border-zinc-800/50 bg-zinc-900/50">
        <span className="text-[8px] text-zinc-400 truncate flex-1 text-center">{preset.name}</span>
        {deletable && onDelete && (
          <button onClick={(e)=>{ e.stopPropagation(); onDelete()}} className="shrink-0 w-4 h-4 rounded-full bg-zinc-800 hover:bg-red-600 text-zinc-400 hover:text-white text-[8px] flex items-center justify-center">✕</button>
        )}
      </div>
    </div>
  )
}

export function TextEditor(){
  const addTextLayer=useStore(s=>s.addTextLayer)
  const layers=useStore(s=>s.layers)
  const selectedLayerId=useStore(s=>s.selectedLayerId)
  const selectedLayerIds=useStore(s=>s.selectedLayerIds)
  const updateLayer=useStore(s=>s.updateLayer)
  const updateLayers=useStore(s=>s.updateLayers)
  const pushHistory=useStore(s=>s.pushHistory)
  const systemFonts=useStore(s=>s.systemFonts)
  const template=useStore(s=>s.template)
  const selectedLayer=layers.find(l=>l.id===selectedLayerId && l.type==='text')
  const [quickText,setQuickText]=useState('')
  const [stylePresets,setStylePresets]=useState(()=>readStylePresets())
  const [showFontSizes,setShowFontSizes]=useState(false)
  const fontSizeRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{ if(!showFontSizes) return; const h=(e:MouseEvent)=>{ if(fontSizeRef.current && !fontSizeRef.current.contains(e.target as Node)) setShowFontSizes(false)}; document.addEventListener('mousedown',h); return()=>document.removeEventListener('mousedown',h)},[showFontSizes])
  const FONT_SIZES=[16,20,24,28,32,36,40,48,56,64,72,80,96,100,120,150,200,250,300]
  const handleAddText=()=>{ const txt=quickText.trim()||t('text.defaultText'); addTextLayer(txt); setQuickText('')}
  const FALLBACK_FONTS=['Arial','Arial Black','Calibri','Georgia','Impact','Segoe UI','Times New Roman','Verdana']
  const fontList=systemFonts.length>0?systemFonts:FALLBACK_FONTS
  const updateTextLayers=(changes:Partial<Layer>,saveHistory=true)=>{ if(selectedLayerIds.length>1){ const ids=selectedLayerIds.filter(id=>layers.find(l=>l.id===id)?.type==='text'); if(ids.length>0) updateLayers(ids,changes,saveHistory)} else if(selectedLayer) updateLayer(selectedLayer.id,changes,saveHistory)}
  // Reajusta a bbox ao conteúdo enquanto digita (sem histórico; commit no blur)
  const refitPanelText=(l:Layer,val:string)=>{ if(!template||selectedLayerIds.length>1) return; if((l as any).autoFit===false){ const maxWpx=Math.max(20, l.width*template.width - l.fontSize*0.4); const hPx=computeWrappedTextHeight(val,l.font,l.fontSize,maxWpx,l.fontStyle,l.fontWeight,l.lineHeight,l.letterSpacing,l.textTransform)+l.fontSize*0.2; const height=Math.max(0.05,Math.min(hPx/template.height,0.98)); if(Math.abs(height-l.height)>0.001) updateLayer(l.id,{height} as any,false) } else { const {width,height}=recalcTextSize(val,l.font,l.fontSize,template.width,template.height,l.fontStyle,l.fontWeight,l.lineHeight,l.letterSpacing,l.textTransform); if(Math.abs(width-l.width)>0.0005||Math.abs(height-l.height)>0.0005) updateLayer(l.id,{width,height,x:l.x+(l.width-width)/2,y:l.y+(l.height-height)/2},false) } }
  const quickSavePreset=()=>{ if(!selectedLayer) return; const p:TextStylePreset={id:makeId(),name:`Estilo ${stylePresets.length+1}`,font:selectedLayer.font,fontSize:selectedLayer.fontSize,color:selectedLayer.color,textGradient:selectedLayer.textGradient,lineHeight:selectedLayer.lineHeight,letterSpacing:selectedLayer.letterSpacing,textTransform:selectedLayer.textTransform,fontStyle:selectedLayer.fontStyle,fontWeight:selectedLayer.fontWeight,opacity:selectedLayer.opacity,outline:selectedLayer.outline?{color:selectedLayer.outline.color,width:selectedLayer.outline.width}:null,outlineWidthPx:selectedLayer.outlineWidthPx??0,shadow:selectedLayer.shadow?{color:selectedLayer.shadow.color,blur:selectedLayer.shadow.blur,offsetX:selectedLayer.shadow.offsetX,offsetY:selectedLayer.shadow.offsetY,intensity:(selectedLayer.shadow as any).intensity ?? 0.6,inset:(selectedLayer.shadow as any).inset ?? false}:null,innerShadow:(selectedLayer as any).innerShadow?{color:(selectedLayer as any).innerShadow.color,blur:(selectedLayer as any).innerShadow.blur,offsetX:(selectedLayer as any).innerShadow.offsetX,offsetY:(selectedLayer as any).innerShadow.offsetY,intensity:(selectedLayer as any).innerShadow.intensity ?? 0.5,inset:true}:null,bevel:(selectedLayer as any).bevel ?? null}; const next=[p,...readStylePresets()]; writeStylePresets(next); setStylePresets(next)}
  const applyPreset=(preset:TextStylePreset)=>{ if(!selectedLayer||!template) return; const l=selectedLayer; const isWrapped=(l as any).autoFit===false; let width:number,height:number; if(isWrapped){ const maxWpx=Math.max(20, l.width*template.width - preset.fontSize*0.4); const hPx = computeWrappedTextHeight(l.text, preset.font, preset.fontSize, maxWpx, preset.fontStyle, preset.fontWeight, preset.lineHeight, preset.letterSpacing, preset.textTransform) + preset.fontSize*0.2; width=l.width; height=Math.max(0.05, Math.min(hPx/template.height,0.98)) } else { const r=recalcTextSize(l.text,preset.font,preset.fontSize,template.width,template.height,preset.fontStyle,preset.fontWeight,preset.lineHeight,preset.letterSpacing,preset.textTransform); width=r.width; height=r.height } updateLayer(l.id,{font:preset.font,fontSize:preset.fontSize,width,height,x:l.x+(l.width-width)/2,y:l.y+(l.height-height)/2,color:preset.color,textGradient:preset.textGradient,lineHeight:preset.lineHeight,letterSpacing:preset.letterSpacing,textTransform:preset.textTransform,fontStyle:preset.fontStyle,fontWeight:preset.fontWeight,opacity:preset.opacity,outline:preset.outline?{...preset.outline}:null,outlineWidthPx:preset.outlineWidthPx ?? (preset.outline?3:0),shadow:preset.shadow?{...preset.shadow}:null,innerShadow:preset.innerShadow?{...preset.innerShadow}:null,bevel: (preset as any).bevel ?? null} as any,true)}
  const applyNativePreset=(preset:any)=>{ if(!selectedLayer||!template) return; const l=selectedLayer; const isWrapped=(l as any).autoFit===false; let width:number,height:number; if(isWrapped){ const maxWpx=Math.max(20, l.width*template.width - l.fontSize*0.4); const hPx = computeWrappedTextHeight(l.text, preset.font, l.fontSize, maxWpx, preset.fontStyle ?? l.fontStyle, preset.fontWeight ?? l.fontWeight, preset.lineHeight ?? l.lineHeight, preset.letterSpacing ?? l.letterSpacing, preset.textTransform ?? l.textTransform) + l.fontSize*0.2; width=l.width; height=Math.max(0.05, Math.min(hPx/template.height,0.98)) } else { const r=recalcTextSize(l.text,preset.font,l.fontSize,template.width,template.height,preset.fontStyle ?? l.fontStyle,preset.fontWeight ?? l.fontWeight,preset.lineHeight ?? l.lineHeight,preset.letterSpacing ?? l.letterSpacing,preset.textTransform ?? l.textTransform); width=r.width; height=r.height } updateLayer(l.id,{font:preset.font,width,height,x:l.x+(l.width-width)/2,y:l.y+(l.height-height)/2,color:preset.color,textGradient:preset.textGradient,outline:preset.outline?{...preset.outline}:null,outlineWidthPx:preset.outlineWidthPx ?? 0,shadow:preset.shadow?{...preset.shadow}:null,innerShadow:preset.innerShadow?{...preset.innerShadow}:null,bevel:preset.bevel?{...preset.bevel}:null,lineHeight:preset.lineHeight ?? l.lineHeight,letterSpacing:preset.letterSpacing ?? l.letterSpacing,fontWeight:preset.fontWeight ?? l.fontWeight,fontStyle:preset.fontStyle ?? l.fontStyle} as any,true)}

  return (
    <div className="space-y-3">
      <PanelCard title={t('panel.newText')} icon="✏️">
        <div className="flex gap-2">
          <textarea value={quickText} onChange={e=>setQuickText(e.target.value)} placeholder={t('text.placeholder')} className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-[11px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-[var(--accent)] resize-none leading-tight" rows={1} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleAddText()}}}/>
          <button onClick={handleAddText} className="px-4 py-2 rounded-xl bg-white text-zinc-900 text-[11px] font-semibold hover:bg-zinc-100 whitespace-nowrap">{t('text.add')}</button>
        </div>
      </PanelCard>

      {selectedLayer && (
        <PanelCard title={t('text.presets')} icon="⭐">
          <div className="grid grid-cols-3 gap-2">
            {NATIVE_TEXT_PRESETS.map(p=> (
              <PresetThumb key={p.id} preset={p} onApply={()=>applyNativePreset(p)} />
            ))}
            {stylePresets.map(p=> (
              <PresetThumb key={p.id} preset={p} onApply={()=>applyPreset(p)} onDelete={()=>{ const next=stylePresets.filter(x=>x.id!==p.id); writeStylePresets(next); setStylePresets(next)}} deletable />
            ))}
            <button onClick={quickSavePreset} className="rounded-xl border-2 border-dashed border-zinc-600 hover:border-zinc-500 bg-zinc-800/30 hover:bg-zinc-800/50 flex flex-col items-center justify-center gap-1 p-2 min-h-[64px] transition-colors">
              <span className="w-6 h-6 rounded-full bg-white text-zinc-900 flex items-center justify-center text-sm">＋</span>
              <span className="text-[8px] text-zinc-400 text-center leading-tight">{t('text.savePreset')}</span>
            </button>
          </div>
          {stylePresets.length===0 && <p className="text-[10px] text-zinc-500 text-center pt-1">{t('text.noPresets')}</p>}
        </PanelCard>
      )}

      {selectedLayer && (
        <>
          <PanelCard title={t('panel.content')} icon="📝" hint={t('panel.hintTypography')}>
            <textarea value={selectedLayer.text} onChange={e=>{const val=e.target.value; const patch:Partial<Layer>={text:val}; const spans=(selectedLayer as any).textSpans; if(Array.isArray(spans)&&spans.length>0){ const clamped=clampSpans(spans,val.length); (patch as any).textSpans=clamped.length>0?clamped:null } updateTextLayers(patch,false); refitPanelText(selectedLayer,val)}}
              onBlur={e=>{ refitPanelText(selectedLayer,e.target.value); pushHistory() }}
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2.5 py-2 text-[11px] text-white focus:outline-none focus:border-[var(--accent)] resize-none leading-tight" rows={3}/>
          </PanelCard>

          <PanelCard title={t('panel.typography')} icon="Aa" hint={t('panel.hintTypography')}>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[10px] text-zinc-400">{t('text.font')}</span>
                <select value={fontList.includes(selectedLayer.font)?selectedLayer.font:''} onChange={e=>e.target.value&&updateTextLayers({font:e.target.value},true)} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1.5 text-[11px] text-white focus:border-[var(--accent)] outline-none" style={{fontFamily:selectedLayer.font}}>
                  {!fontList.includes(selectedLayer.font) && <option value="" disabled>{selectedLayer.font}</option>}
                  {fontList.map(f=> <option key={f} value={f} style={{fontFamily:f}}>{f}</option>)}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] text-zinc-400">{t('text.size')}</span>
                <div className="flex gap-1">
                  <input type="number" min={8} max={500} value={selectedLayer.fontSize} onChange={e=>{const fs=parseInt(e.target.value)||48; if(!template||selectedLayerIds.length>1){updateTextLayers({fontSize:fs},true);return} const {width,height}=recalcTextSize(selectedLayer.text,selectedLayer.font,fs,template.width,template.height,selectedLayer.fontStyle,selectedLayer.fontWeight,selectedLayer.lineHeight,selectedLayer.letterSpacing,selectedLayer.textTransform); updateTextLayers({fontSize:fs,width,height,x:selectedLayer.x+(selectedLayer.width-width)/2,y:selectedLayer.y+(selectedLayer.height-height)/2},true)}} className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1.5 text-[11px] text-white focus:border-[var(--accent)] outline-none"/>
                  <div className="relative" ref={fontSizeRef}>
                    <button onClick={()=>setShowFontSizes(!showFontSizes)} className="w-7 h-[30px] rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white text-[11px]">▾</button>
                    {showFontSizes && <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl py-1 min-w-[64px] max-h-[200px] overflow-y-auto">{FONT_SIZES.map(n=> <button key={n} onClick={()=>{setShowFontSizes(false); if(!template||selectedLayerIds.length>1){updateTextLayers({fontSize:n},true);return} const {width,height}=recalcTextSize(selectedLayer.text,selectedLayer.font,n,template.width,template.height,selectedLayer.fontStyle,selectedLayer.fontWeight,selectedLayer.lineHeight,selectedLayer.letterSpacing,selectedLayer.textTransform); updateTextLayers({fontSize:n,width,height,x:selectedLayer.x+(selectedLayer.width-width)/2,y:selectedLayer.y+(selectedLayer.height-height)/2},true)}} className={`w-full text-left px-3 py-1 text-[11px] ${selectedLayer?.fontSize===n?'text-white bg-[var(--accent)]':'text-zinc-300 hover:bg-zinc-700'}`}>{n}</button>)}</div>}
                  </div>
                </div>
              </label>
            </div>
            <div className="flex gap-1.5">
              <button onClick={()=>updateTextLayers({fontWeight: selectedLayer.fontWeight>=600 ? 400 : 700},true)} className={`w-8 py-2 rounded-xl text-[11px] font-bold border shrink-0 ${selectedLayer.fontWeight>=600?'bg-white text-zinc-900 border-white':'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'}`}>B</button>
              <button onClick={()=>updateTextLayers({fontStyle: selectedLayer.fontStyle==='italic'?'normal':'italic'},true)} className={`w-8 py-2 rounded-xl text-[11px] italic border shrink-0 ${selectedLayer.fontStyle==='italic'?'bg-white text-zinc-900 border-white':'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'}`}>I</button>
              <div className="flex-1 grid grid-cols-3 gap-1">
                {(['left','center','right'] as const).map(a=> (
                  <button key={a} onClick={()=>updateTextLayers({textAlign:a},true)} className={`rounded-xl border flex items-center justify-center py-2 text-[13px] ${selectedLayer.textAlign===a?'bg-white text-zinc-900 border-white':'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-white'}`}>{a==='left'?'⯇':a==='center'?'≡':'⯈'}</button>
                ))}
              </div>
            </div>
            <PanelSlider label={t('text.lineHeight')} value={selectedLayer.lineHeight} min={1} max={3} step={0.05} onChange={v=>updateTextLayers({lineHeight:v},false)} defaultValue={1.2} />
            <PanelSlider label={t('text.letterSpacing')} value={selectedLayer.letterSpacing} min={-5} max={20} step={0.5} onChange={v=>updateTextLayers({letterSpacing:v},false)} suffix="px" defaultValue={0} />
            <div>
              <span className="text-[11px] font-medium text-zinc-300 mb-1 block">{t('text.transform')}</span>
              <div className="grid grid-cols-3 gap-1">
                {(['none','uppercase','lowercase'] as const).map(v=> <button key={v} onClick={()=>updateTextLayers({textTransform:v as any},true)} className={`py-1.5 rounded-xl text-[11px] font-medium border ${selectedLayer.textTransform===v?'bg-white text-zinc-900 border-white':'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'}`}>{v==='none'?t('text.transformNone'):v==='uppercase'?t('text.transformUpper'):t('text.transformLower')}</button>)}
              </div>
            </div>
            <PanelSlider label={t('transform.opacity')} value={selectedLayer.opacity} min={0} max={1} step={0.01} onChange={v=>updateTextLayers({opacity:v},false)} suffix="%" defaultValue={1} />
          </PanelCard>

          <PanelCard title={t('panel.color')} icon="🎨" hint={selectedLayer.textGradient ? t('text.gradient') : t('panel.solidColor')}>
            <div className="flex items-center justify-between rounded-xl bg-zinc-900/30 border border-zinc-700/30 px-2.5 py-2">
              <span className="text-[11px] font-medium text-zinc-300">{t('text.gradient')}</span>
              <PanelSwitch checked={!!selectedLayer.textGradient} onChange={v=>updateTextLayers({textGradient: v ? 'linear-gradient(135deg, #00d2ff, #3a7bd5)' : null},true)} />
            </div>
            {selectedLayer.textGradient ? <GradientPickerInline selectedGradient={selectedLayer.textGradient} onSelect={g=>updateTextLayers({textGradient:g},true)} /> : <div className="flex items-center gap-2"><ColorPalette value={selectedLayer.color} onChange={c=>updateTextLayers({color:c},true)} /><span className="text-[11px] font-mono text-zinc-400">{selectedLayer.color}</span></div>}
          </PanelCard>

          <PanelCard title={t('panel.textEffects')} icon="✨" hint={t('panel.hintEffects')}>
            <div className="rounded-xl border p-2.5 bg-zinc-900/60 border-zinc-700/40">
              <div className="flex items-center justify-between"><span className="text-[11px] font-medium text-zinc-200">{t('text.outlineToggle')}</span><PanelSwitch checked={!!selectedLayer.outline} onChange={v=>updateTextLayers(v?{outline:{color:'#000000',width:3},outlineWidthPx:3}:{outline:null,outlineWidthPx:0},true)} /></div>
              {selectedLayer.outline && <div className="mt-2.5 space-y-2"><div className="flex items-center gap-2"><ColorPalette value={selectedLayer.outline.color} onChange={c=>updateTextLayers({outline:{...selectedLayer.outline!,color:c}},true)} /><span className="text-[11px] font-mono text-zinc-400">{selectedLayer.outline.color}</span></div><PanelSlider label={t('effect.thickness')} value={Math.round(selectedLayer.outlineWidthPx ?? 0)} min={0} max={50} step={1} onChange={v=>updateTextLayers({outlineWidthPx:v},true)} suffix="px" /></div>}
            </div>
            <div className="rounded-xl border p-2.5 bg-zinc-900/60 border-zinc-700/40">
              <div className="flex items-center justify-between"><span className="text-[11px] font-medium text-zinc-200 whitespace-nowrap truncate">{t('effect.shadowOuter')}</span><PanelSwitch checked={!!selectedLayer.shadow && !(selectedLayer.shadow as any).inset} onChange={v=>updateTextLayers({shadow: v?{color:'#000000',blur:12,offsetX:0,offsetY:6,intensity:0.45,inset:false} as any:null},true)} /></div>
              {selectedLayer.shadow && !(selectedLayer.shadow as any).inset && <div className="mt-2.5 space-y-2">
                <div className="flex gap-1 mb-1">{[
                  {l:t('effect.shadowSoft'),v:{blur:12,offsetX:0,offsetY:6,intensity:0.35}},
                  {l:t('effect.shadowStrong'),v:{blur:6,offsetX:0,offsetY:0,intensity:0.6}},
                  {l:t('effect.shadowLong'),v:{blur:4,offsetX:6,offsetY:6,intensity:0.5}},
                ].map(p=> <button key={p.l} onClick={()=>updateTextLayers({shadow:{...selectedLayer.shadow!, ...p.v} as any},true)} className="flex-1 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] text-zinc-400 whitespace-nowrap">{p.l}</button>)}
                </div>
                <div className="flex items-center gap-2"><ColorPalette value={selectedLayer.shadow.color} onChange={c=>updateTextLayers({shadow:{...selectedLayer.shadow!,color:c}},true)} /><span className="text-[11px] font-mono text-zinc-400">{selectedLayer.shadow.color}</span></div><div className="grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-[10px] text-zinc-400">{t('effect.offsetX')}</span><input type="number" value={selectedLayer.shadow.offsetX} onChange={e=>updateTextLayers({shadow:{...selectedLayer.shadow!,offsetX:parseInt(e.target.value)||0}},true)} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1 text-[11px] text-white"/></label><label className="space-y-1"><span className="text-[10px] text-zinc-400">{t('effect.offsetY')}</span><input type="number" value={selectedLayer.shadow.offsetY} onChange={e=>updateTextLayers({shadow:{...selectedLayer.shadow!,offsetY:parseInt(e.target.value)||0}},true)} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1 text-[11px] text-white"/></label></div><PanelSlider label={t('filter.blur')} value={selectedLayer.shadow.blur} min={0} max={50} step={1} onChange={v=>updateTextLayers({shadow:{...selectedLayer.shadow!,blur:v}},false)} suffix="px" /><PanelSlider label={t('effect.intensity')} value={Math.round(((selectedLayer.shadow as any).intensity ?? 0.6)*100)} min={0} max={100} step={5} onChange={v=>updateTextLayers({shadow:{...selectedLayer.shadow!,intensity:v/100} as any},true)} suffix="%" /></div>}
            </div>
            <div className="rounded-xl border p-2.5 bg-zinc-900/60 border-zinc-700/40">
              <div className="flex items-center justify-between"><span className="text-[11px] font-medium text-zinc-200 whitespace-nowrap truncate">{t('effect.innerShadow')}</span><PanelSwitch checked={!!(selectedLayer as any).innerShadow} onChange={v=>updateTextLayers({innerShadow: v?{color:'#000000',blur:12,offsetX:0,offsetY:0,intensity:0.5,inset:true} as any:null} as any,true)} /></div>
              {(selectedLayer as any).innerShadow && <div className="mt-2.5 space-y-2"><div className="flex gap-1 mb-1">{[
                {l:t('effect.shadowSoft'),v:{blur:12,offsetX:0,offsetY:3,intensity:0.35}},
                {l:t('effect.shadowStrong'),v:{blur:6,offsetX:0,offsetY:0,intensity:0.6}},
                {l:t('effect.shadowLong'),v:{blur:20,offsetX:0,offsetY:0,intensity:0.45}},
              ].map(p=> <button key={p.l} onClick={()=>updateTextLayers({innerShadow:{...(selectedLayer as any).innerShadow, ...p.v, inset:true} as any},true)} className="flex-1 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] text-zinc-400 whitespace-nowrap">{p.l}</button>)}
              </div><div className="flex items-center gap-2"><ColorPalette value={(selectedLayer as any).innerShadow.color} onChange={c=>updateTextLayers({innerShadow:{...(selectedLayer as any).innerShadow,color:c} as any},true)} /><span className="text-[11px] font-mono text-zinc-400">{(selectedLayer as any).innerShadow.color}</span></div><div className="grid grid-cols-2 gap-2"><label className="space-y-1"><span className="text-[10px] text-zinc-400">{t('effect.offsetX')}</span><input type="number" value={(selectedLayer as any).innerShadow.offsetX} onChange={e=>updateTextLayers({innerShadow:{...(selectedLayer as any).innerShadow,offsetX:parseInt(e.target.value)||0} as any},true)} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1 text-[11px] text-white"/></label><label className="space-y-1"><span className="text-[10px] text-zinc-400">{t('effect.offsetY')}</span><input type="number" value={(selectedLayer as any).innerShadow.offsetY} onChange={e=>updateTextLayers({innerShadow:{...(selectedLayer as any).innerShadow,offsetY:parseInt(e.target.value)||0} as any},true)} className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-2 py-1 text-[11px] text-white"/></label></div><PanelSlider label={t('filter.blur')} value={(selectedLayer as any).innerShadow.blur} min={0} max={50} step={1} onChange={v=>updateTextLayers({innerShadow:{...(selectedLayer as any).innerShadow,blur:v} as any},false)} suffix="px" /><PanelSlider label={t('effect.intensity')} value={Math.round(((selectedLayer as any).innerShadow.intensity ?? 0.5)*100)} min={0} max={100} step={5} onChange={v=>updateTextLayers({innerShadow:{...(selectedLayer as any).innerShadow,intensity:v/100} as any},true)} suffix="%" /></div>}
            </div>
            <div className="rounded-xl border p-2.5 bg-zinc-900/60 border-zinc-700/40">
              <div className="flex items-center justify-between"><span className="text-[11px] font-medium text-zinc-200 whitespace-nowrap truncate">{t('effect.bevelTitle')}</span><PanelSwitch checked={!!(selectedLayer as any).bevel?.enabled} onChange={v=>updateTextLayers({bevel: v?{enabled:true,size:8,smoothing:2,strength:0.7,lightAngle:135,highlightColor:'rgba(255,255,255,0.9)',shadowColor:'rgba(0,0,0,0.55)'} as any : null as any},true)} /></div>
              {(selectedLayer as any).bevel?.enabled && <div className="mt-2.5 space-y-2">
                <div className="flex gap-1">{[
                  {l:t('effect.bevelSubtle'),v:{size:4,strength:0.4}},
                  {l:t('effect.bevelMedium'),v:{size:8,strength:0.7}},
                  {l:t('effect.bevelStrong'),v:{size:14,strength:0.85}},
                ].map(p=> <button key={p.l} onClick={()=>updateTextLayers({bevel:{...(selectedLayer as any).bevel, ...p.v, enabled:true} as any},true)} className="flex-1 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] text-zinc-400 whitespace-nowrap">{p.l}</button>)}
                </div>
                <PanelSlider label={t('bevel.size')} value={(selectedLayer as any).bevel.size ?? 8} min={0} max={20} step={1} onChange={v=>updateTextLayers({bevel:{...(selectedLayer as any).bevel,size:v} as any},true)} suffix="px" />
                <PanelSlider label={t('bevel.smoothing')} value={(selectedLayer as any).bevel.smoothing ?? 2} min={0} max={10} step={0.5} onChange={v=>updateTextLayers({bevel:{...(selectedLayer as any).bevel,smoothing:v} as any},true)} />
                <PanelSlider label={t('bevel.strength')} value={Math.round(((selectedLayer as any).bevel.strength ?? 0.7)*100)} min={0} max={100} step={5} onChange={v=>updateTextLayers({bevel:{...(selectedLayer as any).bevel,strength:v/100} as any},true)} suffix="%" />
                <PanelSlider label={t('bevel.angle')} value={(selectedLayer as any).bevel.lightAngle ?? 135} min={0} max={360} step={5} onChange={v=>updateTextLayers({bevel:{...(selectedLayer as any).bevel,lightAngle:v} as any},true)} suffix="°" />
              </div>}
            </div>
          </PanelCard>
        </>
      )}
    </div>
  )
}
