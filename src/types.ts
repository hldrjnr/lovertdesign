export type TemplateId =
  | 'youtube' | 'youtube-hd' | 'youtube-2k'
  | 'instagram-post' | 'instagram-story'
  | 'facebook-post' | 'facebook-cover'
  | 'unity-as-card' | 'unity-as-cover'
  | 'fab' | 'fab-hd'
  | 'gumroad-square' | 'gumroad-cover'
  | 'itchio-cover' | 'itchio-square' | 'itchio-banner'
  | 'linkedin-square' | 'linkedin-portrait' | 'linkedin-link'
  | (string & {})

export interface Template {
  id: TemplateId
  name: string
  width: number
  height: number
  icon: string
  desc: string
  platform: string
}

export const TEMPLATES: Template[] = [
  { id: 'youtube', name: 'YouTube', width: 1920, height: 1080, icon: '▶️', desc: '1920×1080', platform: 'YouTube' },
  { id: 'youtube-hd', name: 'YouTube HD', width: 1280, height: 720, icon: '▶️', desc: '1280×720', platform: 'YouTube' },
  { id: 'youtube-2k', name: 'YouTube 2K', width: 2560, height: 1440, icon: '▶️', desc: '2560×1440', platform: 'YouTube' },
  { id: 'instagram-post', name: 'Instagram Post', width: 1080, height: 1080, icon: '📸', desc: '1080×1080', platform: 'Instagram' },
  { id: 'instagram-story', name: 'Instagram Story', width: 1080, height: 1920, icon: '📸', desc: '1080×1920', platform: 'Instagram' },
  { id: 'facebook-post', name: 'Facebook Post', width: 1200, height: 630, icon: '👥', desc: '1200×630', platform: 'Facebook' },
  { id: 'facebook-cover', name: 'Facebook Cover', width: 820, height: 312, icon: '👥', desc: '820×312', platform: 'Facebook' },
  { id: 'unity-as-card', name: 'Unity Card', width: 420, height: 280, icon: '🎮', desc: '420×280', platform: 'Unity Asset Store' },
  { id: 'unity-as-cover', name: 'Unity Cover', width: 1950, height: 1300, icon: '🎮', desc: '1950×1300', platform: 'Unity Asset Store' },
  { id: 'fab', name: 'Fab', width: 960, height: 540, icon: '🏪', desc: '960×540', platform: 'Fab' },
  { id: 'fab-hd', name: 'Fab HD', width: 1920, height: 1080, icon: '🏪', desc: '1920×1080', platform: 'Fab' },
  { id: 'gumroad-square', name: 'Gumroad Square', width: 600, height: 600, icon: '🛒', desc: '600×600', platform: 'Gumroad' },
  { id: 'gumroad-cover', name: 'Gumroad Cover', width: 1280, height: 720, icon: '🛒', desc: '1280×720', platform: 'Gumroad' },
  { id: 'itchio-cover', name: 'itch.io Cover', width: 630, height: 500, icon: '🎮', desc: '630×500', platform: 'itch.io' },
  { id: 'itchio-square', name: 'itch.io Square', width: 1280, height: 720, icon: '🎮', desc: '1280×720', platform: 'itch.io' },
  { id: 'itchio-banner', name: 'itch.io Banner', width: 960, height: 400, icon: '🎮', desc: '960×400', platform: 'itch.io' },
  { id: 'linkedin-square', name: 'LinkedIn Square', width: 1200, height: 1200, icon: '💼', desc: '1200×1200', platform: 'LinkedIn' },
  { id: 'linkedin-portrait', name: 'LinkedIn Portrait', width: 1080, height: 1350, icon: '💼', desc: '1080×1350', platform: 'LinkedIn' },
  { id: 'linkedin-link', name: 'LinkedIn Link', width: 1200, height: 627, icon: '💼', desc: '1200×627', platform: 'LinkedIn' },
]

export interface TemplatePreset {
  id: string
  name: string
  icon: string
  templateId: TemplateId
  category: string
  theme: string
  background: BackgroundState
  getLayers: () => Omit<Layer, 'id' | 'zIndex'>[]
}

function makeLayer(type: Layer['type'], overrides: Partial<Omit<Layer, 'id' | 'zIndex'>>): Omit<Layer, 'id' | 'zIndex'> {
  const base: Omit<Layer, 'id' | 'zIndex'> = {
    type, name: type === 'image' ? 'Imagem' : type === 'text' ? 'Texto' : 'Elemento',
    visible: true, locked: false,
    x: 0.5, y: 0.5, width: 0.5, height: 0.5,
    rotation: 0, opacity: 1,
    shadow: null, innerShadow: null, outline: null, borderRadius: 0, borderRadiusPx: 0, outlineWidthPx: 0, brightness: 1, blur: 0, contrast: 1, saturation: 1, hueRotate: 0, sepia: 0, negative: false,
    autoFit: true,
    source: '', preview: '',
    text: '', font: 'Impact', fontSize: 72, color: '#FFFFFF', textAlign: 'center',
    lineHeight: 1.2, letterSpacing: 0, textTransform: 'none', textGradient: null, textSpans: null,
    fontStyle: 'normal', fontWeight: 700,
    elementContent: '', elementName: '',
    vector: null,
    vectorPath: null,
    mirrorX: false,
    mirrorY: false,
    perspectiveX: 0,
    perspectiveY: 0,
    bevel: null,
  }
  return { ...base, ...overrides }
}

export const TEMPLATE_PRESETS: TemplatePreset[] = []

export type VectorShape = 'line' | 'rounded-rect' | 'circle' | 'triangle' | 'hexagon' | 'star' | 'plus' | 'arrow-right' | 'arrow' | 'curved-arrow' | 'diamond' | 'pentagon' | 'cross' | 'lightning' | 'heart' | 'bloom' | 'speech-bubble-left' | 'speech-bubble-right' | 'thought-bubble' | 'speech-bubble-wide' | 'speech-bubble-tall' | 'speech-bubble-wide-left' | 'speech-bubble-wide-right'

export interface VectorData {
  shape: VectorShape
  color: string
  fillGradient: string | null
  strokeColor: string
  strokeWidth: number
  filled: boolean
  cornerRadius: number
  strokeDash: 'solid' | 'dashed' | 'dotted' | 'dash-dot'
  skewX: number
  imagePreview?: string
}

export interface VectorAnchorPoint {
  id: string
  x: number
  y: number
  type: 'corner' | 'bezier'
  handleIn?: { x: number; y: number }
  handleOut?: { x: number; y: number }
}

export interface VectorPathData {
  points: VectorAnchorPoint[]
  closed: boolean
  fillColor: string
  strokeColor: string
  strokeWidth: number
  strokeDash?: 'solid' | 'dashed' | 'dotted' | 'dash-dot'
  startCap?: 'none' | 'arrow' | 'round'
  endCap?: 'none' | 'arrow' | 'round'
  startCapSize?: number
  endCapSize?: number
}

export const VECTOR_SHAPES: { id: VectorShape; name: string; icon: string }[] = [
  { id: 'line', name: 'Linha', icon: '━' },
  { id: 'curved-arrow', name: 'Seta Curva', icon: '↪' },
  { id: 'rounded-rect', name: 'Rect. Arredondado', icon: '▭' },
  { id: 'circle', name: 'Círculo', icon: '●' },
  { id: 'diamond', name: 'Losango', icon: '◆' },
  { id: 'triangle', name: 'Triângulo', icon: '▲' },
  { id: 'pentagon', name: 'Pentágono', icon: '⬠' },
  { id: 'hexagon', name: 'Hexágono', icon: '⬡' },
  { id: 'star', name: 'Estrela', icon: '★' },
  { id: 'cross', name: 'X', icon: '✕' },
  { id: 'plus', name: 'Cruz', icon: '✚' },
  { id: 'lightning', name: 'Raio', icon: '⚡' },
  { id: 'heart', name: 'Coração', icon: '♥' },
  { id: 'bloom', name: 'Bloom', icon: '◎' },
  { id: 'speech-bubble-left', name: 'Balão Esq.', icon: '🗨️' },
  { id: 'speech-bubble-right', name: 'Balão Dir.', icon: '💭' },
  { id: 'thought-bubble', name: 'Balão Pensamento', icon: '💭' },
  { id: 'speech-bubble-wide', name: 'Balão Largo', icon: '🗯️' },
  { id: 'speech-bubble-wide-left', name: 'Balão Largo Esq.', icon: '🗯️' },
  { id: 'speech-bubble-wide-right', name: 'Balão Largo Dir.', icon: '🗯️' },
  { id: 'speech-bubble-tall', name: 'Balão Alto', icon: '🎈' },
]

/** Trecho de texto com cor própria (offsets sobre `Layer.text`). */
export interface TextSpan {
  s: number
  e: number
  color: string
}

export interface ShadowEffect {  color: string
  blur: number
  offsetX: number
  offsetY: number
  intensity: number // 0..1 (opacidade/força da sombra)
  inset: boolean // true = inner shadow
  spread?: number // expansão opcional para compatibilidade futura (-20..20)
}

export interface OutlineEffect {
  color: string
  width: number
}

export interface BevelEffect {
  enabled: boolean
  size: number // 0..20
  smoothing: number // 0..10
  strength: number // 0..1
  lightAngle: number // 0..360
  highlightColor: string
  shadowColor: string
}

export interface Layer {
  id: string
  type: 'image' | 'text' | 'element' | 'vector' | 'group' | 'mask'
  name: string
  visible: boolean
  locked: boolean
  groupId?: string
  zIndex: number
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  shadow: ShadowEffect | null
  innerShadow: ShadowEffect | null
  outline: OutlineEffect | null
  outlineWidthPx: number
  borderRadius: number
  borderRadiusPx: number
  brightness: number
  blur: number
  contrast: number
  saturation: number
  hueRotate: number
  sepia: number
  negative: boolean
  autoFit: boolean
  source: string
  preview: string
  text: string
  font: string
  fontSize: number
  color: string
  textAlign: 'left' | 'center' | 'right'
  lineHeight: number
  letterSpacing: number
  textTransform: 'none' | 'uppercase' | 'lowercase'
  textGradient: string | null
  textSpans?: TextSpan[] | null
  fontStyle: 'normal' | 'italic' | 'oblique'
  fontWeight: number
  elementContent: string
  elementName: string
  vector: VectorData | null
  vectorPath?: VectorPathData | null
  mirrorX: boolean
  mirrorY: boolean
  isBackground?: boolean
  // ── Mask model ───────────────────────────────────────────────────
  // Masks live on the layer itself as `masks[]` (or legacy `mask`). The
  // renderer composites them onto one canvas using the source layer's geometry.
  // `type:'mask'` sub-layers may still appear in old v4 files — they are
  // demigrated back into `masks[]` when loading.
  parentId?: string
  maskMode?: 'intersection' | 'difference'
  sourceId?: string
  mask?: MaskConfig | null
  masks?: MaskConfig[]
  perspectiveX: number
  perspectiveY: number
  // Non-destructive crop: original image is preserved, only the visible region
  // changes. Coords are in the original image's pixel space, plus the original
  // dimensions so the canvas can recompute the bounding box aspect.
  crop?: { x: number; y: number; w: number; h: number; imgW: number; imgH: number } | null
  originalPreview?: string
  originalWidth?: number
  originalHeight?: number
  bevel?: BevelEffect | null
  // boundingBox recalculation helper - implicit via autoFit + font changes
}

export interface MaskConfig {
  id: string
  mode: 'intersection' | 'difference'
  sourceId: string
}

export interface BackgroundState {
  type: 'color' | 'gradient' | 'image'
  color: string
  gradient: string
  imagePath: string
  imagePreview: string
  brightness: number
  blur: number
  contrast: number
  saturation: number
  hueRotate: number
  sepia: number
  bgPosition: string
  bgSize: string
}

export interface ElementCategory {
  name: string
  items: { name: string; content: string }[]
}

export const EMOJI_CATEGORIES: ElementCategory[] = [
  { name: 'Sorrisos', items: [
    { name: 'Riso', content: '😄' }, { name: 'Sorriso', content: '😊' },
    { name: 'Gargalhada', content: '😂' }, { name: 'Olhos Coração', content: '😍' },
    { name: 'Cool', content: '😎' }, { name: 'Piscadela', content: '😉' },
    { name: 'Língua', content: '😛' }, { name: 'Beijo', content: '😘' },
    { name: 'Pensativo', content: '🤔' }, { name: 'Choro', content: '😢' },
    { name: 'Bravo', content: '😠' }, { name: 'Grito', content: '😱' },
    { name: 'Sorriso Aberto', content: '😁' }, { name: 'Malvado', content: '😈' },
    { name: 'Morto', content: '😵' }, { name: 'Frio', content: '🥶' },
    { name: 'Medo', content: '😨' }, { name: 'Nojo', content: '🤢' },
    { name: 'Dormir', content: '😴' }, { name: 'Silêncio', content: '🤫' },
    { name: 'Olhos Abertos', content: '🤩' }, { name: 'Careta', content: '😬' },
    { name: 'Suor', content: '😅' }, { name: 'Revirar Olhos', content: '🙄' },
    { name: 'Maroto', content: '😏' }, { name: 'Apaixonado', content: '🥰' },
    { name: 'Delícia', content: '😋' }, { name: 'Piscar', content: '😜' },
    { name: 'Louco', content: '🤪' }, { name: 'Náusea', content: '🤮' },
    { name: 'Espirro', content: '🤧' }, { name: 'Mascarado', content: '😷' },
  ]},
  { name: 'Animais', items: [
    { name: 'Cão', content: '🐶' }, { name: 'Gato', content: '🐱' },
    { name: 'Leão', content: '🦁' }, { name: 'Tigre', content: '🐯' },
    { name: 'Urso', content: '🐻' }, { name: 'Panda', content: '🐼' },
    { name: 'Coelho', content: '🐰' }, { name: 'Macaco', content: '🐵' },
    { name: 'Águia', content: '🦅' }, { name: 'Peixe', content: '🐟' },
    { name: 'Golfinho', content: '🐬' }, { name: 'Borboleta', content: '🦋' },
    { name: 'Cavalo', content: '🐴' }, { name: 'Vaca', content: '🐮' },
    { name: 'Porco', content: '🐷' }, { name: 'Rato', content: '🐭' },
    { name: 'Sapo', content: '🐸' }, { name: 'Pato', content: '🦆' },
    { name: 'Coruja', content: '🦉' }, { name: 'Tubarão', content: '🦈' },
    { name: 'Cobra', content: '🐍' }, { name: 'Tartaruga', content: '🐢' },
    { name: 'Baleia', content: '🐳' }, { name: 'Unicórnio', content: '🦄' },
    { name: 'Lobo', content: '🐺' }, { name: 'Coala', content: '🐨' },
    { name: 'Hamster', content: '🐹' }, { name: 'Canguru', content: '🦘' },
    { name: 'Girafa', content: '🦒' }, { name: 'Ouriço', content: '🦔' },
    { name: 'Raposa', content: '🦊' }, { name: 'Galinha', content: '🐔' },
    { name: 'Pinguim', content: '🐧' }, { name: 'Polvo', content: '🐙' },
  ]},
  { name: 'Pessoas', items: [
    { name: 'Like', content: '👍' }, { name: 'Força', content: '💪' },
    { name: 'Mãos', content: '👏' }, { name: 'Paz', content: '✌️' },
    { name: 'Aplauso', content: '🙌' }, { name: 'Rezar', content: '🙏' },
    { name: 'Acenar', content: '👋' }, { name: 'Apontar', content: '👉' },
    { name: 'Correr', content: '🏃' }, { name: 'Dançar', content: '💃' },
    { name: 'Grupo', content: '👥' }, { name: 'Festa', content: '🎉' },
    { name: 'Sinal OK', content: '👌' }, { name: 'Rock', content: '🤘' },
    { name: 'Unhas', content: '💅' }, { name: 'Ouvir', content: '👂' },
    { name: 'Nariz', content: '👃' }, { name: 'Olhos', content: '👀' },
    { name: 'Boca', content: '👄' }, { name: 'Marreta', content: '🔨' },
    { name: 'Braço', content: '🦾' }, { name: 'Perna', content: '🦵' },
    { name: 'Aperto', content: '🤝' }, { name: 'Bebê', content: '👶' },
    { name: 'Criança', content: '👦' }, { name: 'Homem', content: '👨' },
    { name: 'Mulher', content: '👩' }, { name: 'Idoso', content: '👴' },
    { name: 'Idosa', content: '👵' }, { name: 'Policial', content: '👮' },
    { name: 'Médico', content: '👨‍⚕️' }, { name: 'Operário', content: '👷' },
  ]},
  { name: 'Natureza', items: [
    { name: 'Sol', content: '☀️' }, { name: 'Lua', content: '🌙' },
    { name: 'Estrela', content: '⭐' }, { name: 'Brilho', content: '✨' },
    { name: 'Fogo', content: '🔥' }, { name: 'Raio', content: '⚡' },
    { name: 'Árvore', content: '🌳' }, { name: 'Flor', content: '🌸' },
    { name: 'Folha', content: '🍃' }, { name: 'Montanha', content: '⛰️' },
    { name: 'Onda', content: '🌊' }, { name: 'Nuvem', content: '☁️' },
    { name: 'Chuva', content: '🌧️' }, { name: 'Neve', content: '❄️' },
    { name: 'Arco-Íris', content: '🌈' }, { name: 'Lua Cheia', content: '🌕' },
    { name: 'Girassol', content: '🌻' }, { name: 'Cogumelo', content: '🍄' },
    { name: 'Planeta', content: '🌍' }, { name: 'Vulcão', content: '🌋' },
    { name: 'Palmeira', content: '🌴' }, { name: 'Deserto', content: '🏜️' },
    { name: 'Hibisco', content: '🌺' }, { name: 'Cacto', content: '🌵' },
    { name: 'Folha Morta', content: '🍂' }, { name: 'Tornado', content: '🌪️' },
    { name: 'Nascer Sol', content: '🌅' }, { name: 'Pôr Sol', content: '🌇' },
    { name: 'Galáxia', content: '🌌' }, { name: 'Gota', content: '💧' },
    { name: 'Semente', content: '🌱' }, { name: 'Trevo', content: '🍀' },
    { name: 'Rosa', content: '🌹' }, { name: 'Tulipa', content: '🌷' },
  ]},
  { name: 'Comida', items: [
    { name: 'Maçã', content: '🍎' }, { name: 'Banana', content: '🍌' },
    { name: 'Uva', content: '🍇' }, { name: 'Laranja', content: '🍊' },
    { name: 'Pizza', content: '🍕' }, { name: 'Hambúrguer', content: '🍔' },
    { name: 'Batata Frita', content: '🍟' }, { name: 'Sushi', content: '🍣' },
    { name: 'Bolo', content: '🎂' }, { name: 'Gelado', content: '🍦' },
    { name: 'Café', content: '☕' }, { name: 'Refrigerante', content: '🥤' },
    { name: 'Cerveja', content: '🍺' }, { name: 'Vinho', content: '🍷' },
    { name: 'Taco', content: '🌮' }, { name: 'Bife', content: '🥩' },
    { name: 'Ovo', content: '🥚' }, { name: 'Pão', content: '🍞' },
    { name: 'Donut', content: '🍩' }, { name: 'Chocolate', content: '🍫' },
    { name: 'Cereja', content: '🍒' }, { name: 'Ananás', content: '🍍' },
    { name: 'Pipoca', content: '🍿' }, { name: 'Melancia', content: '🍉' },
    { name: 'Abacate', content: '🥑' }, { name: 'Coco', content: '🥥' },
    { name: 'Cenoura', content: '🥕' }, { name: 'Milho', content: '🌽' },
    { name: 'Brócolis', content: '🥦' }, { name: 'Morango', content: '🍓' },
    { name: 'Pêssego', content: '🍑' }, { name: 'Melancia Pedaço', content: '🍈' },
  ]},
  { name: 'Objectos', items: [
    { name: 'Alvo', content: '🎯' }, { name: 'Troféu', content: '🏆' },
    { name: 'Coroa', content: '👑' }, { name: 'Diamante', content: '💎' },
    { name: 'Câmera', content: '📷' }, { name: 'Nota Musical', content: '🎵' },
    { name: 'Play', content: '▶️' }, { name: 'Sino', content: '🔔' },
    { name: 'Relógio', content: '⏰' }, { name: 'Livro', content: '📚' },
    { name: 'Presente', content: '🎁' }, { name: 'Íman', content: '🧲' },
    { name: 'Chave', content: '🔑' }, { name: 'Cadeado', content: '🔒' },
    { name: 'Lâmpada', content: '💡' }, { name: 'Telefone', content: '📞' },
    { name: 'Computador', content: '💻' }, { name: 'Rato PC', content: '🖱️' },
    { name: 'Joystick', content: '🎮' }, { name: 'Microfone', content: '🎤' },
    { name: 'Bomba', content: '💣' }, { name: 'Faca', content: '🔪' },
    { name: 'Bússola', content: '🧭' }, { name: 'Lupa', content: '🔍' },
    { name: 'Mochila', content: '🎒' }, { name: 'Óculos', content: '👓' },
    { name: 'Óculos Sol', content: '🕶️' }, { name: 'Escudo', content: '🛡️' },
    { name: 'Espada', content: '⚔️' }, { name: 'Arco Flecha', content: '🏹' },
    { name: 'Martelo', content: '🔧' }, { name: 'Serrote', content: '🪚' },
    { name: 'Ampulheta', content: '⏳' }, { name: 'Bateria', content: '🔋' },
  ]},
  { name: 'Símbolos', items: [
    { name: 'Check', content: '✅' }, { name: 'X', content: '❌' },
    { name: '100', content: '💯' }, { name: 'Coração', content: '❤️' },
    { name: 'Seta Dir', content: '➡️' }, { name: 'Seta Cima', content: '⬆️' },
    { name: 'Explosão', content: '💥' }, { name: 'Proibido', content: '🚫' },
    { name: 'Info', content: 'ℹ️' }, { name: 'Mais', content: '➕' },
    { name: 'Menos', content: '➖' }, { name: 'Coração Partido', content: '💔' },
    { name: 'Coração Fogo', content: '❤️‍🔥' }, { name: 'Coração Roxo', content: '💜' },
    { name: 'Seta Baixo', content: '⬇️' }, { name: 'Seta Esq', content: '⬅️' },
    { name: 'Reciclar', content: '♻️' }, { name: 'ATM', content: '🏧' },
    { name: 'Interrogação', content: '❓' }, { name: 'Exclamação', content: '❗' },
    { name: 'SOS', content: '🆘' }, { name: 'Top', content: '🔝' },
    { name: 'FREE', content: '🆓' }, { name: 'NEW', content: '🆕' },
    { name: 'Paz Símbolo', content: '☮️' }, { name: 'Yin Yang', content: '☯️' },
    { name: 'Estrela Judaica', content: '✡️' }, { name: 'Cruzar', content: '❎' },
    { name: 'Estrela Ouro', content: '🌟' }, { name: 'Brilho Forte', content: '💫' },
    { name: 'Brilhar', content: '🔆' }, { name: 'Alto Brilho', content: '🔅' },
    { name: 'Balão Fala', content: '💬' }, { name: 'Balão Pensamento', content: '💭' },
  ]},
  { name: 'Dinheiro', items: [
    { name: 'Saco Dinheiro', content: '💰' }, { name: 'Dólar', content: '💵' },
    { name: 'Euro', content: '💶' }, { name: 'Libra', content: '💷' },
    { name: 'Iene', content: '💴' }, { name: 'Cartão Crédito', content: '💳' },
    { name: 'Moeda', content: '🪙' }, { name: 'Gráfico Alta', content: '📈' },
    { name: 'Gráfico Baixa', content: '📉' }, { name: 'Gráfico', content: '📊' },
    { name: 'Nota', content: '🧾' }, { name: 'Calculadora', content: '🧮' },
    { name: 'Etiqueta Preço', content: '🏷️' }, { name: 'Presente', content: '🎁' },
    { name: 'Cofrinho', content: '🐷' }, { name: 'Banco', content: '🏦' },
    { name: 'Balança', content: '⚖️' }, { name: 'Mão Dinheiro', content: '🤑' },
    { name: 'Mala', content: '💼' }, { name: 'Elfo Natal', content: '🧝' },
    { name: 'Diamante', content: '💎' }, { name: 'Cifrão', content: '💲' },
    { name: 'Troféu', content: '🏆' }, { name: 'Chave Ouro', content: '🔑' },
    { name: 'Contrato', content: '📝' }, { name: 'Carimbo', content: '📬' },
    { name: 'Mão Abrindo', content: '👐' }, { name: 'Aperto Mão', content: '🤝' },
    { name: 'Seta Certa', content: '✅' }, { name: 'Percentagem', content: '💯' },
    { name: 'Alvo', content: '🎯' }, { name: 'Lâmpada', content: '💡' },
  ]},
  { name: 'Desporto', items: [
    { name: 'Futebol', content: '⚽' }, { name: 'Basquete', content: '🏀' },
    { name: 'Vôlei', content: '🏐' }, { name: 'Ténis', content: '🎾' },
    { name: 'Boxe', content: '🥊' }, { name: 'Medalha Ouro', content: '🥇' },
    { name: 'Bicicleta', content: '🚴' }, { name: 'Natação', content: '🏊' },
    { name: 'Ski', content: '⛷️' }, { name: 'Golfe', content: '⛳' },
    { name: 'Basebol', content: '⚾' }, { name: 'Hóquei', content: '🏒' },
    { name: 'Badminton', content: '🏸' }, { name: 'Boliche', content: '🎳' },
    { name: 'Peso', content: '🏋️' }, { name: 'Mergulho', content: '🤿' },
    { name: 'Escalar', content: '🧗' }, { name: 'Surfar', content: '🏄' },
    { name: 'Remo', content: '🚣' }, { name: 'Corrida Cavalo', content: '🏇' },
    { name: 'Xadrez', content: '♟️' }, { name: 'Pesca', content: '🎣' },
    { name: 'Skate', content: '🛹' }, { name: 'Karaté', content: '🥋' },
    { name: 'Esgrima', content: '🤺' }, { name: 'Estádio', content: '🏟️' },
    { name: 'Camisola', content: '🎽' }, { name: 'BTT', content: '🚵' },
    { name: 'Anel Basquete', content: '⛹️' }, { name: 'Golo', content: '🥅' },
    { name: 'Cricket', content: '🏏' }, { name: 'Andebol', content: '🤾' },
  ]},
]

export const GRADIENT_PRESETS = [
  { name: 'Neon Azul', value: 'linear-gradient(135deg, #00d2ff, #3a7bd5)' },
  { name: 'Fogo', value: 'linear-gradient(135deg, #f12711, #f5af19)' },
  { name: 'Roxo Neon', value: 'linear-gradient(135deg, #a18cd1, #fbc2eb)' },
  { name: 'Verde Neon', value: 'linear-gradient(135deg, #11998e, #38ef7d)' },
  { name: 'Cyberpunk', value: 'linear-gradient(135deg, #f093fb, #f5576c)' },
  { name: 'Oceano', value: 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)' },
  { name: 'Matrix', value: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' },
  { name: 'Sunset', value: 'linear-gradient(135deg, #ff6b6b, #feca57, #48dbfb)' },
  { name: 'Midnight', value: 'linear-gradient(135deg, #0f0f0f, #1a1a2e)' },
  { name: 'Gamer', value: 'linear-gradient(135deg, #8A2387, #E94057, #F27121)' },
  { name: 'Aurora', value: 'linear-gradient(135deg, #00c6ff, #0072ff)' },
  { name: 'Candy', value: 'linear-gradient(135deg, #ff9a9e, #fecfef)' },
  { name: 'Peach', value: 'linear-gradient(135deg, #ffecd2, #fcb69f)' },
  { name: 'Mint', value: 'linear-gradient(135deg, #a8edea, #fed6e3)' },
  { name: 'Lava', value: 'linear-gradient(135deg, #ff0844, #ffb199)' },
  { name: 'Ice', value: 'linear-gradient(135deg, #74ebd5, #acb6e5)' },
  { name: 'Royal', value: 'linear-gradient(135deg, #654ea3, #eaafc8)' },
  { name: 'Sunset 2', value: 'linear-gradient(135deg, #ff7e5f, #feb47b)' },
  { name: 'Oceano 2', value: 'linear-gradient(135deg, #2193b0, #6dd5ed)' },
  { name: 'Roxo Profundo', value: 'linear-gradient(135deg, #8e2de2, #4a00e0)' },
]

export const COLOR_PRESETS = [
  // ── Favoritos: alto CTR (fundo escuro + acento neon + dourado) ──
  '#FFFFFF', '#F5F0E8', '#0A1628', '#1A1A2E', '#000000', '#475569',
  '#FFE000', '#FF0000', '#FF6B00', '#39FF14', '#00E5FF', '#FFD700',
  '#FACC15', '#F97316', '#EF4444', '#22C55E', '#0EA5E9', '#2563EB',
  '#8B5CF6', '#EC4899', '#F43F5E', '#D4A843', '#F0C040', '#8FFF00',
]

export interface ColorSection { title: string; colors: string[] }

// Espectro completo organizado por família (claro → escuro).
// Usado pelo ColorPalette e pelo seletor de fundo.
export const COLOR_SECTIONS: ColorSection[] = [
  { title: 'Vermelhos', colors: ['#FFEBEE', '#FFCDD2', '#EF9A9A', '#EF4444', '#FF0000', '#C62828', '#7F1D1D', '#4A0E0E'] },
  { title: 'Laranjas', colors: ['#FFF3E0', '#FFCC80', '#FF9800', '#FF6B00', '#F97316', '#E65100', '#7C2D12', '#3E2700'] },
  { title: 'Amarelos', colors: ['#FFFDE7', '#FFF176', '#FFEB3B', '#FFE000', '#FFD700', '#FACC15', '#F9A825', '#A16207'] },
  { title: 'Verdes', colors: ['#E8F5E9', '#A5D6A7', '#4CAF50', '#22C55E', '#39FF14', '#1B5E20', '#14532D', '#0A2E12'] },
  { title: 'Turquesa', colors: ['#E0F2F1', '#80CBC4', '#26A69A', '#14B8A6', '#00695C', '#134E4A', '#00332E'] },
  { title: 'Ciano / Céu', colors: ['#E1F5FE', '#BAE6FD', '#81D4FA', '#29B6F6', '#00E5FF', '#0EA5E9', '#0277BD', '#0C4A6E'] },
  { title: 'Azuis', colors: ['#E3F2FD', '#90CAF9', '#42A5F5', '#2563EB', '#1565C0', '#1E3A8A', '#0A1F44'] },
  { title: 'Roxos', colors: ['#EDE7F6', '#DDD6FE', '#B39DDB', '#7E57C2', '#8B5CF6', '#4527A0', '#4C1D95', '#1F1047'] },
  { title: 'Rosas', colors: ['#FCE4EC', '#FBCFE8', '#F48FB1', '#EC407A', '#EC4899', '#F43F5E', '#AD1457', '#831843', '#881337'] },
  { title: 'Neutros', colors: ['#F8FAFC', '#E2E8F0', '#94A3B8', '#475569', '#020617'] },
  { title: 'Terrosos', colors: ['#EFEBE9', '#BCAAA4', '#FFEDD5', '#FDBA74', '#8D6E63', '#C1440E', '#4E342E', '#78350F', '#451A03'] },
  { title: 'Pastéis', colors: ['#FDE68A', '#A7F3D0', '#BAE6FD', '#DDD6FE', '#FBCFE8'] },
]
