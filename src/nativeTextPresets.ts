export interface NativePreset {
  id: string
  name: string
  font: string
  fontSize?: number
  color: string
  textGradient: string | null
  outline: { color: string; width: number } | null
  outlineWidthPx: number
  shadow: { color: string; blur: number; offsetX: number; offsetY: number; intensity: number; inset: boolean } | null
  innerShadow: { color: string; blur: number; offsetX: number; offsetY: number; intensity: number; inset: boolean } | null
  bevel: any | null
  lineHeight?: number
  letterSpacing?: number
  fontWeight?: number
  fontStyle?: 'normal'|'italic'|'oblique'
}

// Presets projetados para NÃO misturar outline + shadow com blur na mesma miniatura — evita artefactos de composição
// Cada estilo usa OU outline OU sombra externa, nunca ambos com blur>0 simultâneo
export const NATIVE_TEXT_PRESETS: NativePreset[] = [
  {
    id: 'impact-outline',
    name: 'Impact Contorno',
    font: 'Impact',
    color: '#FFFFFF',
    textGradient: null,
    outline: { color: '#000000', width: 6 },
    outlineWidthPx: 8,
    shadow: null,
    innerShadow: null,
    bevel: null,
    fontWeight: 900,
  },
  {
    id: 'impact-shadow',
    name: 'Impact Sombra',
    font: 'Impact',
    color: '#FFFFFF',
    textGradient: null,
    outline: null,
    outlineWidthPx: 0,
    shadow: { color: '#000000', blur: 12, offsetX: 0, offsetY: 6, intensity: 0.55, inset: false },
    innerShadow: null,
    bevel: null,
    fontWeight: 900,
  },
  {
    id: 'neon-glow',
    name: 'Neon Glow',
    font: 'Arial Black',
    color: '#FFFFFF',
    textGradient: 'linear-gradient(135deg, #00d2ff, #3a7bd5)',
    outline: null,
    outlineWidthPx: 0,
    shadow: { color: '#00d2ff', blur: 18, offsetX: 0, offsetY: 0, intensity: 0.75, inset: false },
    innerShadow: null,
    bevel: null,
  },
  {
    id: 'cartoon-hard',
    name: 'Cartoon Hard',
    font: 'Impact',
    color: '#FFEB3B',
    textGradient: null,
    outline: { color: '#000000', width: 5 },
    outlineWidthPx: 7,
    shadow: { color: '#000000', blur: 0, offsetX: 4, offsetY: 4, intensity: 1, inset: false },
    innerShadow: null,
    bevel: null,
  },
  {
    id: 'gold-bevel',
    name: 'Ouro Bevel',
    font: 'Impact',
    color: '#FFFFFF',
    textGradient: 'linear-gradient(135deg, #FFD700, #FF8C00)',
    outline: null,
    outlineWidthPx: 0,
    shadow: null,
    innerShadow: { color: '#000000', blur: 8, offsetX: 0, offsetY: 2, intensity: 0.4, inset: true },
    bevel: { enabled: true, size: 10, smoothing: 3, strength: 0.75, lightAngle: 120, highlightColor: 'rgba(255,255,255,0.9)', shadowColor: 'rgba(60,30,0,0.7)' },
  },
  {
    id: 'matrix-glow',
    name: 'Matrix Glow',
    font: 'Arial Black',
    color: '#00FF88',
    textGradient: null,
    outline: null,
    outlineWidthPx: 0,
    shadow: { color: '#00FF88', blur: 14, offsetX: 0, offsetY: 0, intensity: 0.7, inset: false },
    innerShadow: null,
    bevel: null,
  },
  {
    id: 'elegant-serif',
    name: 'Serif Elegante',
    font: 'Georgia',
    color: '#1a1a1a',
    textGradient: null,
    outline: null,
    outlineWidthPx: 0,
    shadow: { color: '#000000', blur: 14, offsetX: 0, offsetY: 8, intensity: 0.22, inset: false },
    innerShadow: null,
    bevel: null,
    fontWeight: 700,
  },
  {
    id: 'purple-grad',
    name: 'Roxo Gradiente',
    font: 'Arial Black',
    color: '#FFFFFF',
    textGradient: 'linear-gradient(135deg, #8A2387, #E94057, #F27121)',
    outline: null,
    outlineWidthPx: 0,
    shadow: { color: '#000000', blur: 10, offsetX: 2, offsetY: 4, intensity: 0.45, inset: false },
    innerShadow: null,
    bevel: null,
  },
  {
    id: 'ultra-contrast',
    name: 'Ultra Contraste',
    font: 'Impact',
    color: '#FFFFFF',
    textGradient: null,
    outline: { color: '#000000', width: 8 },
    outlineWidthPx: 10,
    shadow: null,
    innerShadow: null,
    bevel: null,
  },
  {
    id: 'ice-bevel',
    name: 'Gelo Bevel',
    font: 'Arial Black',
    color: '#FFFFFF',
    textGradient: 'linear-gradient(135deg, #E0EAFC, #CFDEF3)',
    outline: null,
    outlineWidthPx: 0,
    shadow: null,
    innerShadow: { color: '#3a7bd5', blur: 6, offsetX: 0, offsetY: 2, intensity: 0.35, inset: true },
    bevel: { enabled: true, size: 7, smoothing: 2, strength: 0.6, lightAngle: 120, highlightColor: 'rgba(255,255,255,1)', shadowColor: 'rgba(0,60,120,0.5)' },
  },
  {
    id: 'youtube-outline',
    name: 'YouTube Contorno',
    font: 'Impact',
    color: '#FF0000',
    textGradient: null,
    outline: { color: '#FFFFFF', width: 4 },
    outlineWidthPx: 6,
    shadow: null,
    innerShadow: null,
    bevel: null,
  },
  {
    id: 'comic-clean',
    name: 'HQ Limpo',
    font: 'Arial Black',
    color: '#FFFFFF',
    textGradient: null,
    outline: { color: '#000000', width: 5 },
    outlineWidthPx: 7,
    shadow: null,
    innerShadow: null,
    bevel: null,
    letterSpacing: 1,
    lineHeight: 1.1,
  },
]
