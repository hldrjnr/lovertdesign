import type { Layer } from '@/types'

/** Projeta os 4 cantos [nw, ne, se, sw] da camada para o espaço do canvas (px),
 *  replicando exatamente o transform CSS: perspective(500px) rotateY(px)
 *  rotateX(-py) rotate(rot) + espelhos, origem no centro. */
export function projectLayerCorners(layer: Layer, cw: number, ch: number): { x: number; y: number }[] {
  const w = layer.width * cw
  const h = layer.height * ch
  const ccx = (layer.x + layer.width / 2) * cw
  const ccy = (layer.y + layer.height / 2) * ch
  const sx = layer.mirrorX ? -1 : 1
  const sy = layer.mirrorY ? -1 : 1
  const rad = ((layer.rotation || 0) * Math.PI) / 180
  const cosR = Math.cos(rad)
  const sinR = Math.sin(rad)
  const radY = ((layer.perspectiveX || 0) * Math.PI) / 180
  const radX = ((-(layer.perspectiveY || 0)) * Math.PI) / 180
  const cosY = Math.cos(radY)
  const sinY = Math.sin(radY)
  const cosX = Math.cos(radX)
  const sinX = Math.sin(radX)
  const D = 500
  const local: [number, number][] = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
  return local.map(([lx, ly]) => {
    const mx = lx * sx
    const my = ly * sy
    const rx = mx * cosR - my * sinR
    const ry = mx * sinR + my * cosR
    const y1 = ry * cosX
    const z1 = ry * sinX
    const x2 = rx * cosY + z1 * sinY
    const z2 = -rx * sinY + z1 * cosY
    const s = D / Math.max(1, D - z2)
    return { x: ccx + x2 * s, y: ccy + y1 * s }
  })
}

type Homo3 = [number, number, number, number, number, number, number, number, number]

/** @internal exportado para testes/validação numérica */
export const __homoForTest = { solveHomography, invertHomo, applyHomo, projectLayerCorners, isExtremeTilt, drawTextMaskOnCanvas, paintSourceFlat, computeSourcePlacement }

/** Tilt além do plano da câmara (z >= 75% da distância de perspectiva): a projeção
 *  explode — chamadores devem cair no caminho chapado. Limite superior de |z|. */
export function isExtremeTilt(layer: Layer, cw: number, ch: number): boolean {
  const px = (layer.perspectiveX || 0) * Math.PI / 180
  const py = (layer.perspectiveY || 0) * Math.PI / 180
  if (px === 0 && py === 0) return false
  const hw = (layer.width * cw) / 2
  const hh = (layer.height * ch) / 2
  const rad = ((layer.rotation || 0) * Math.PI) / 180
  const rxMax = hw * Math.abs(Math.cos(rad)) + hh * Math.abs(Math.sin(rad))
  const ryMax = hw * Math.abs(Math.sin(rad)) + hh * Math.abs(Math.cos(rad))
  const zMax = rxMax * Math.abs(Math.sin(px)) + ryMax * Math.abs(Math.sin(py))
  return zMax >= 500 * 0.75
}

/** Homografia por correspondência de 4 pontos (DLT, h[8]=1). Null se degenerada. */
function solveHomography(src: { x: number; y: number }[], dst: { x: number; y: number }[]): Homo3 | null {
  try {
    // Sistema 8x8: cada par gera 2 linhas
    const M: number[][] = []
    const v: number[] = []
    for (let i = 0; i < 4; i++) {
      const { x, y } = src[i]
      const { x: xp, y: yp } = dst[i]
      M.push([-x, -y, -1, 0, 0, 0, xp * x, xp * y]); v.push(-xp)
      M.push([0, 0, 0, -x, -y, -1, yp * x, yp * y]); v.push(-yp)
    }
    // Eliminação gaussiana com pivoteamento parcial
    const n = 8
    for (let col = 0; col < n; col++) {
      let piv = col
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(M[row][col]) > Math.abs(M[piv][col])) piv = row
      }
      if (Math.abs(M[piv][col]) < 1e-9) return null
      if (piv !== col) {
        const t = M[piv]; M[piv] = M[col]; M[col] = t
        const tv = v[piv]; v[piv] = v[col]; v[col] = tv
      }
      for (let row = col + 1; row < n; row++) {
        const f = M[row][col] / M[col][col]
        if (f === 0) continue
        for (let k = col; k < n; k++) M[row][k] -= f * M[col][k]
        v[row] -= f * v[col]
      }
    }
    const h = new Array<number>(n).fill(0)
    for (let row = n - 1; row >= 0; row--) {
      let s = v[row]
      for (let k = row + 1; k < n; k++) s -= M[row][k] * h[k]
      h[row] = s / M[row][row]
      if (!Number.isFinite(h[row])) return null
    }
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
  } catch {
    return null
  }
}

function invertHomo(H: Homo3): Homo3 | null {
  const [a, b, c, d, e, f, g, h, i] = H
  const A = e * i - f * h
  const B = f * g - d * i
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-9) return null
  return [
    A / det, (c * h - b * i) / det, (b * f - c * e) / det,
    B / det, (a * i - c * g) / det, (c * d - a * f) / det,
    C / det, (b * g - a * h) / det, (a * e - b * d) / det,
  ]
}

function applyHomo(H: Homo3, p: { x: number; y: number }): { x: number; y: number } {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w }
}

/** Afim que leva o triângulo s0,s1,s2 em d0,d1,d2 (para desenhar meio quad de cada vez). */
function affineForTriangles(
  ctx: CanvasRenderingContext2D,
  s0: { x: number; y: number }, s1: { x: number; y: number }, s2: { x: number; y: number },
  d0: { x: number; y: number }, d1: { x: number; y: number }, d2: { x: number; y: number },
): boolean {
  const denom = (s1.x - s0.x) * (s2.y - s0.y) - (s2.x - s0.x) * (s1.y - s0.y)
  if (Math.abs(denom) < 1e-6) return false
  const a = ((d1.x - d0.x) * (s2.y - s0.y) - (d2.x - d0.x) * (s1.y - s0.y)) / denom
  const b = ((d1.y - d0.y) * (s2.y - s0.y) - (d2.y - d0.y) * (s1.y - s0.y)) / denom
  const c = ((d2.x - d0.x) * (s1.x - s0.x) - (d1.x - d0.x) * (s2.x - s0.x)) / denom
  const d = ((d2.y - d0.y) * (s1.x - s0.x) - (d1.y - d0.y) * (s2.x - s0.x)) / denom
  const e = d0.x - a * s0.x - c * s0.y
  const f = d0.y - b * s0.x - d * s0.y
  if (![a, b, c, d, e, f].every(Number.isFinite)) return false
  ctx.transform(a, b, c, d, e, f)
  return true
}

/** Desenha `img` (WxH) sobre o quadrilátero `quad` via 2 metades afins (aprox. projetiva). */
function drawImageOnQuad(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  W: number,
  H: number,
  quad: { x: number; y: number }[],
): boolean {
  if (quad.length !== 4 || !quad.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return false
  // rejeita quads degenerados (área ~0)
  const area = Math.abs(
    (quad[2].x - quad[0].x) * (quad[3].y - quad[1].y) - (quad[3].x - quad[1].x) * (quad[2].y - quad[0].y),
  ) / 2
  if (area < 0.5) return false
  const tris: [{ x: number; y: number }[], { x: number; y: number }[]][] = [
    [[{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }], [quad[0], quad[1], quad[2]]],
    [[{ x: 0, y: 0 }, { x: W, y: H }, { x: 0, y: H }], [quad[0], quad[2], quad[3]]],
  ]
  for (const [s, q] of tris) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(q[0].x, q[0].y)
    ctx.lineTo(q[1].x, q[1].y)
    ctx.lineTo(q[2].x, q[2].y)
    ctx.closePath()
    ctx.clip()
    if (!affineForTriangles(ctx, s[0], s[1], s[2], q[0], q[1], q[2])) {
      ctx.restore()
      return false
    }
    ctx.drawImage(img, 0, 0)
    ctx.restore()
  }
  return true
}

export function canBeMaskSource(layer: Layer): boolean {
  if (layer.type === 'image') return true
  if (layer.type === 'vector') return !!(layer.vector || (layer as any).vectorPath)
  if (layer.type === 'text') return true
  if (layer.type === 'element') return true
  return false
}

function drawTextMaskOnCanvas(ctx: CanvasRenderingContext2D, layer: Layer, px: number, py: number, pw: number, ph: number) {
  const text = layer.text || ''
  if (!text) return
  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineJoin = 'round'
  ctx.textBaseline = 'middle'
  const fontSize = Math.max(8, layer.fontSize)
  const fontWeight = layer.fontWeight || 700
  const fontStyle = layer.fontStyle || 'normal'
  const family = layer.font || 'Impact'
  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${family}"`
  const cx = px + pw / 2, cy = py + ph / 2
  // Itálico no canvas leva skewX(-10deg) no DOM — replica para a máscara assentar
  if (fontStyle === 'italic' || (fontStyle as string) === 'oblique') {
    ctx.translate(cx, cy)
    ctx.transform(1, 0, -Math.tan((10 * Math.PI) / 180), 1, 0, 0)
    ctx.translate(-cx, -cy)
  }
  // Contorno visível faz parte do glyph no canvas — a máscara tem de o incluir
  const outlineW = layer.outline && (layer.outlineWidthPx ?? 0) > 0 ? (layer.outlineWidthPx ?? 0) : 0
  if (outlineW > 0) ctx.lineWidth = outlineW
  const drawLine = (txt: string, x: number, y: number) => {
    ctx.fillText(txt, x, y)
    if (outlineW > 0) ctx.strokeText(txt, x, y)
  }
  const drawLineSpaced = (txt: string, startX: number, y: number, ls: number) => {
    const prevAlign = ctx.textAlign
    ctx.textAlign = 'left' as any
    let curX = startX
    for (const ch of txt) {
      ctx.fillText(ch, curX, y)
      if (outlineW > 0) ctx.strokeText(ch, curX, y)
      curX += ctx.measureText(ch).width + ls
    }
    ctx.textAlign = prevAlign
  }
  const isWrapped = (layer as any).autoFit === false
  let lines: string[] = []
  if (isWrapped) {
    // Replica computeWrappedTextHeight / Canvas wrapping (parágrafo → palavras → quebra char a char)
    const paragraphs = text.split('\n')
    for (const para of paragraphs) {
      if (para === '') { lines.push(''); continue }
      const words = para.split(' ')
      let cur = ''
      const measure = (s: string) => {
        if (!s) return 0
        let t = s
        if (layer.textTransform === 'uppercase') t = t.toUpperCase()
        else if (layer.textTransform === 'lowercase') t = t.toLowerCase()
        const m = ctx.measureText(t)
        let w = m.width
        if (layer.letterSpacing) w += (t.length - 1) * (layer.letterSpacing as number)
        return w
      }
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w
        if (measure(test) <= pw) {
          cur = test
        } else {
          if (cur) lines.push(cur)
          if (measure(w) > pw) {
            let acc = ''
            for (const ch of w) {
              const t2 = acc + ch
              if (measure(t2) > pw) {
                if (acc) lines.push(acc)
                acc = ch
              } else acc = t2
            }
            cur = acc
          } else {
            cur = w
          }
        }
      }
      // mesmo quando cur vazio, garante pelo menos uma linha por parágrafo não vazio
      if (cur !== '' || lines.length === 0) lines.push(cur)
      else if (cur) lines.push(cur)
    }
    // se o texto termina com \n, garante linha extra vazia já tratada acima
  } else {
    lines = text.split('\n')
  }
  const lh = Math.max(1.0, layer.lineHeight || 1.2) * fontSize
  const totalH = lines.length * lh
  let startY = cy - totalH / 2 + lh / 2
  for (const rawLine of lines) {
    let txt = rawLine
    if (layer.textTransform === 'uppercase') txt = txt.toUpperCase()
    else if (layer.textTransform === 'lowercase') txt = txt.toLowerCase()
    if (layer.letterSpacing && (layer.letterSpacing as number) !== 0) {
      const ls = layer.letterSpacing as number
      const w = ctx.measureText(txt).width + (txt.length > 0 ? (txt.length - 1) * ls : 0)
      let curX: number
      if (layer.textAlign === 'center') curX = cx - w / 2
      else if (layer.textAlign === 'right') curX = px + pw - w
      else curX = px
      drawLineSpaced(txt, curX, startY, ls)
    } else {
      ctx.textAlign = layer.textAlign === 'left' ? 'left' : layer.textAlign === 'right' ? 'right' : 'center'
      let x = cx
      if (layer.textAlign === 'left') x = px
      else if (layer.textAlign === 'right') x = px + pw
      drawLine(txt, x, startY)
    }
    startY += lh
  }
  ctx.restore()
}

function drawElementMaskOnCanvas(ctx: CanvasRenderingContext2D, layer: Layer, px: number, py: number, pw: number, ph: number) {
  const content = layer.elementContent || ''
  if (!content) return
  ctx.save()
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const fontSize = Math.max(12, layer.fontSize || 48)
  // Usa a mesma pilha de fontes do Canvas para evitar deslocamento entre DOM e canvas
  const family = layer.font || '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
  // Se a layer tem font explícita de emoji, preserva; caso contrário usa stack do canvas
  const isEmojiStack = family.includes('Emoji')
  ctx.font = isEmojiStack ? `${fontSize}px ${family}` : `${fontSize}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
  // Garante centralização exata dentro da bbox (igual ao Canvas flex center)
  ctx.fillText(content, px + pw / 2, py + ph / 2)
  ctx.restore()
}

function drawVectorPathOnCanvas(
  ctx: CanvasRenderingContext2D,
  vp: any,
  offsetX: number,
  offsetY: number,
  w: number,
  h: number
) {
  const pts: any[] = vp.points || []
  if (pts.length === 0) return
  const sx = w / 100
  const sy = h / 100
  ctx.beginPath()
  ctx.moveTo(offsetX + pts[0].x * sx, offsetY + pts[0].y * sy)
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], cur = pts[i]
    const isBez = cur.type === 'bezier' || prev.type === 'bezier'
    if (isBez) {
      const cp1x = offsetX + (prev.x + (prev.handleOut?.x ?? 0)) * sx
      const cp1y = offsetY + (prev.y + (prev.handleOut?.y ?? 0)) * sy
      const cp2x = offsetX + (cur.x + (cur.handleIn?.x ?? 0)) * sx
      const cp2y = offsetY + (cur.y + (cur.handleIn?.y ?? 0)) * sy
      const x = offsetX + cur.x * sx
      const y = offsetY + cur.y * sy
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y)
    } else {
      ctx.lineTo(offsetX + cur.x * sx, offsetY + cur.y * sy)
    }
  }
  if (vp.closed) ctx.closePath()
  if (vp.closed) {
    ctx.fillStyle = '#fff'
    ctx.fill()
  } else {
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = Math.max(1, vp.strokeWidth ?? 2)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke()
  }
}

function drawVectorOnCanvas(
  ctx: CanvasRenderingContext2D,
  v: NonNullable<Layer['vector']>,
  offsetX: number,
  offsetY: number,
  w: number,
  h: number,
  fill: string,
  stroke: string
) {
  // Uniformização: 'line'/'arrow'/'cross' são abertos (só traço), 'bloom' é radial, restantes são fechados preenchidos
  const isOpenStroke = v.shape === 'line' || v.shape === 'arrow' || v.shape === 'cross'
  const isBloom = v.shape === 'bloom'
  const filled = !isOpenStroke && !isBloom && v.filled

  ctx.save()
  ctx.translate(offsetX, offsetY)
  ctx.fillStyle = fill
  ctx.strokeStyle = stroke
  ctx.lineWidth = Math.max(v.strokeWidth, 1)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  const drawPath = () => {
    switch (v.shape) {
      case 'rounded-rect': {
        const r = Math.min(v.cornerRadius ?? 0, Math.min(w, h) / 2)
        ctx.beginPath()
        ctx.roundRect(0, 0, w, h, r)
        break
      }
      case 'circle': {
        ctx.beginPath()
        ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
        break
      }
      case 'line':
        ctx.beginPath()
        ctx.moveTo(0, h / 2)
        ctx.lineTo(w, h / 2)
        break
      case 'arrow':
        ctx.beginPath()
        ctx.moveTo(0, h / 2)
        ctx.lineTo(w * 0.82, h / 2)
        break
      case 'arrow-right': {
        ctx.beginPath()
        ctx.moveTo(0, h * 0.3)
        ctx.lineTo(w * 0.58, h * 0.3)
        ctx.lineTo(w * 0.58, h * 0.05)
        ctx.lineTo(w, h * 0.5)
        ctx.lineTo(w * 0.58, h * 0.95)
        ctx.lineTo(w * 0.58, h * 0.7)
        ctx.lineTo(0, h * 0.7)
        ctx.closePath()
        break
      }
      case 'diamond':
        ctx.beginPath()
        ctx.moveTo(w / 2, 0)
        ctx.lineTo(w, h / 2)
        ctx.lineTo(w / 2, h)
        ctx.lineTo(0, h / 2)
        ctx.closePath()
        break
      case 'triangle':
        ctx.beginPath()
        ctx.moveTo(w / 2, 0)
        ctx.lineTo(w, h)
        ctx.lineTo(0, h)
        ctx.closePath()
        break
      case 'pentagon': {
        ctx.beginPath()
        for (let i = 0; i < 5; i++) {
          const a = (i * Math.PI * 2) / 5 - Math.PI / 2
          const px = w / 2 + (w / 2) * Math.cos(a)
          const py = h / 2 + (h / 2) * Math.sin(a)
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
        }
        ctx.closePath()
        break
      }
      case 'hexagon': {
        ctx.beginPath()
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3 - Math.PI / 2
          const px = w / 2 + (w / 2) * Math.cos(a)
          const py = h / 2 + (h / 2) * Math.sin(a)
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
        }
        ctx.closePath()
        break
      }
      case 'star': {
        ctx.beginPath()
        for (let i = 0; i < 10; i++) {
          const a = (i * Math.PI) / 5 - Math.PI / 2
          const rr = i % 2 === 0 ? 0.48 : 0.2
          const px = w / 2 + w * rr * Math.cos(a)
          const py = h / 2 + h * rr * Math.sin(a)
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
        }
        ctx.closePath()
        break
      }
      case 'plus': {
        // plus preenchido igual ao Canvas (src/components/Canvas.tsx:427)
        ctx.beginPath()
        ctx.moveTo(w * 0.30, 0)
        ctx.lineTo(w * 0.70, 0)
        ctx.lineTo(w * 0.70, h * 0.30)
        ctx.lineTo(w, h * 0.30)
        ctx.lineTo(w, h * 0.70)
        ctx.lineTo(w * 0.70, h * 0.70)
        ctx.lineTo(w * 0.70, h)
        ctx.lineTo(w * 0.30, h)
        ctx.lineTo(w * 0.30, h * 0.70)
        ctx.lineTo(0, h * 0.70)
        ctx.lineTo(0, h * 0.30)
        ctx.lineTo(w * 0.30, h * 0.30)
        ctx.closePath()
        break
      }
      case 'cross': {
        // cross em X (duas diagonais) — igual ao Canvas, stroke only, não fill
        // Não cria path fechado; será stroked no branch isOpenStroke
        ctx.beginPath()
        ctx.moveTo(w * 0.20, h * 0.20)
        ctx.lineTo(w * 0.80, h * 0.80)
        ctx.moveTo(w * 0.80, h * 0.20)
        ctx.lineTo(w * 0.20, h * 0.80)
        break
      }
      case 'lightning': {
        ctx.beginPath()
        ctx.moveTo(w * 0.62, 0)
        ctx.lineTo(w * 0.18, h * 0.55)
        ctx.lineTo(w * 0.4, h * 0.55)
        ctx.lineTo(w * 0.28, h)
        ctx.lineTo(w * 0.82, h * 0.42)
        ctx.lineTo(w * 0.6, h * 0.42)
        ctx.closePath()
        break
      }
      case 'heart': {
        ctx.beginPath()
        ctx.moveTo(w / 2, h * 0.35)
        ctx.bezierCurveTo(w / 2, h * 0.2, w * 0.2, h * 0.2, w * 0.2, h * 0.45)
        ctx.bezierCurveTo(w * 0.2, h * 0.65, w / 2, h * 0.85, w / 2, h * 0.85)
        ctx.bezierCurveTo(w / 2, h * 0.85, w * 0.8, h * 0.65, w * 0.8, h * 0.45)
        ctx.bezierCurveTo(w * 0.8, h * 0.2, w / 2, h * 0.2, w / 2, h * 0.35)
        ctx.closePath()
        break
      }
      case 'curved-arrow': {
        ctx.beginPath()
        ctx.moveTo(0, h * 0.5)
        ctx.bezierCurveTo(w * 0.1, h * 0.2, w * 0.5, h * 0.1, w * 0.8, h * 0.5)
        ctx.lineTo(w * 0.9, h * 0.3)
        ctx.lineTo(w * 0.95, h * 0.7)
        ctx.lineTo(w * 0.55, h * 0.63)
        ctx.lineTo(w * 0.73, h * 0.56)
        ctx.bezierCurveTo(w * 0.6, h * 0.5, w * 0.4, h * 0.4, w * 0.05, h * 0.55)
        ctx.closePath()
        break
      }
      case 'bloom': {
        ctx.beginPath()
        ctx.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
        break
      }
      case 'speech-bubble-left': {
        const r = Math.min(12 * Math.min(w, h) / 100, w * 0.12, h * 0.12)
        const tailH = h * 0.18, rectH = h - tailH
        ctx.beginPath()
        ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.arcTo(w, 0, w, r, r); ctx.lineTo(w, rectH - r); ctx.arcTo(w, rectH, w - r, rectH, r)
        ctx.lineTo(w * 0.28, rectH); ctx.lineTo(w * 0.12, h); ctx.lineTo(w * 0.2, rectH)
        ctx.lineTo(r, rectH); ctx.arcTo(0, rectH, 0, rectH - r, r); ctx.lineTo(0, r); ctx.arcTo(0, 0, r, 0, r); ctx.closePath()
        break
      }
      case 'speech-bubble-right': {
        const r = Math.min(12 * Math.min(w, h) / 100, w * 0.12, h * 0.12)
        const tailH = h * 0.18, rectH = h - tailH
        ctx.beginPath()
        ctx.moveTo(r, 0); ctx.lineTo(w - r, 0); ctx.arcTo(w, 0, w, r, r); ctx.lineTo(w, rectH - r); ctx.arcTo(w, rectH, w - r, rectH, r)
        ctx.lineTo(w * 0.8, rectH); ctx.lineTo(w * 0.88, h); ctx.lineTo(w * 0.72, rectH)
        ctx.lineTo(r, rectH); ctx.arcTo(0, rectH, 0, rectH - r, r); ctx.lineTo(0, r); ctx.arcTo(0, 0, r, 0, r); ctx.closePath()
        break
      }
      case 'thought-bubble': {
        ctx.beginPath()
        ctx.ellipse(w * 0.5, h * 0.38, w * 0.42, h * 0.28, 0, 0, Math.PI * 2)
        ctx.ellipse(w * 0.28, h * 0.72, w * 0.1, h * 0.08, 0, 0, Math.PI * 2)
        ctx.ellipse(w * 0.14, h * 0.88, w * 0.06, h * 0.05, 0, 0, Math.PI * 2)
        break
      }
      case 'speech-bubble-wide': {
        const r = Math.min(4 * Math.min(w,h)/100, w*0.04, h*0.06)
        const rectH = h * 0.68
        ctx.beginPath()
        ctx.moveTo(r,0); ctx.lineTo(w-r,0); ctx.arcTo(w,0,w,r,r); ctx.lineTo(w,rectH-r); ctx.arcTo(w,rectH,w-r,rectH,r)
        ctx.lineTo(w*0.58,rectH); ctx.lineTo(w*0.5, h*0.90); ctx.lineTo(w*0.42,rectH)
        ctx.lineTo(r,rectH); ctx.arcTo(0,rectH,0,rectH-r,r); ctx.lineTo(0,r); ctx.arcTo(0,0,r,0,r); ctx.closePath()
        break
      }
      case 'speech-bubble-wide-left': {
        const r = Math.min(4 * Math.min(w,h)/100, w*0.04, h*0.06)
        const rectH = h * 0.68
        ctx.beginPath()
        ctx.moveTo(r,0); ctx.lineTo(w-r,0); ctx.arcTo(w,0,w,r,r); ctx.lineTo(w,rectH-r); ctx.arcTo(w,rectH,w-r,rectH,r)
        ctx.lineTo(w*0.28,rectH); ctx.lineTo(w*0.10, h*0.90); ctx.lineTo(w*0.20,rectH)
        ctx.lineTo(r,rectH); ctx.arcTo(0,rectH,0,rectH-r,r); ctx.lineTo(0,r); ctx.arcTo(0,0,r,0,r); ctx.closePath()
        break
      }
      case 'speech-bubble-wide-right': {
        const r = Math.min(4 * Math.min(w,h)/100, w*0.04, h*0.06)
        const rectH = h * 0.68
        ctx.beginPath()
        ctx.moveTo(r,0); ctx.lineTo(w-r,0); ctx.arcTo(w,0,w,r,r); ctx.lineTo(w,rectH-r); ctx.arcTo(w,rectH,w-r,rectH,r)
        ctx.lineTo(w*0.80,rectH); ctx.lineTo(w*0.90, h*0.90); ctx.lineTo(w*0.72,rectH)
        ctx.lineTo(r,rectH); ctx.arcTo(0,rectH,0,rectH-r,r); ctx.lineTo(0,r); ctx.arcTo(0,0,r,0,r); ctx.closePath()
        break
      }
      case 'speech-bubble-tall': {
        const r = Math.min(12 * Math.min(w,h)/100, w*0.12, h*0.12)
        ctx.beginPath()
        ctx.moveTo(r,0); ctx.lineTo(w*0.70,0); ctx.arcTo(w*0.82,0,w*0.82,r,r); ctx.lineTo(w*0.82,h*0.40); ctx.lineTo(w, h*0.50); ctx.lineTo(w*0.82,h*0.60)
        ctx.lineTo(w*0.82,h-r); ctx.arcTo(w*0.82,h,w*0.70,h,r); ctx.lineTo(r,h); ctx.arcTo(0,h,0,h-r,r); ctx.lineTo(0,r); ctx.arcTo(0,0,r,0,r); ctx.closePath()
        break
      }
      default: {
        ctx.beginPath()
        ctx.rect(0, 0, w, h)
        break
      }
    }
  }

  drawPath()
  if (isOpenStroke) {
    ctx.stroke()
  } else if (isBloom) {
    ctx.fill()
  } else if (filled) {
    if (v.strokeWidth > 0 && stroke !== 'none') {
      ctx.fill()
      ctx.stroke()
    } else {
      ctx.fill()
    }
  } else {
    ctx.stroke()
  }

  ctx.restore()
}

export function renderMaskCanvas(
  target: Layer,
  source: Layer,
  mode: 'intersection' | 'difference',
  canvasW: number,
  canvasH: number
): string | null {
  const maskW = Math.max(1, Math.round(target.width * canvasW))
  const maskH = Math.max(1, Math.round(target.height * canvasH))

  const c = document.createElement('canvas')
  c.width = maskW
  c.height = maskH
  const ctx = c.getContext('2d')
  if (!ctx) return null

  if (mode === 'difference') {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, maskW, maskH)
    ctx.globalCompositeOperation = 'destination-out'
  }

  const tcx = (target.x + target.width / 2) * canvasW
  const tcy = (target.y + target.height / 2) * canvasH
  const scx = (source.x + source.width / 2) * canvasW
  const scy = (source.y + source.height / 2) * canvasH
  const tr = (target.rotation || 0) * Math.PI / 180
  const cos = Math.cos(-tr)
  const sin = Math.sin(-tr)
  const ddx = scx - tcx
  const ddy = scy - tcy
  const lcx = tcx + ddx * cos - ddy * sin
  const lcy = tcy + ddx * sin + ddy * cos
  const sw = source.width * canvasW
  const sh = source.height * canvasH
  const px = lcx - tcx + maskW / 2 - sw / 2
  const py = lcy - tcy + maskH / 2 - sh / 2
  const pw = sw
  const ph = sh

  const rotRad = ((source.rotation || 0) - (target.rotation || 0)) * Math.PI / 180
  if (rotRad !== 0) {
    ctx.save()
    ctx.translate(px + pw / 2, py + ph / 2)
    ctx.rotate(rotRad)
    ctx.translate(-(px + pw / 2), -(py + ph / 2))
  }

  if (source.type === 'image' && source.preview) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    try {
      ctx.drawImage(img, px, py, pw, ph)
    } catch {}
    if (rotRad !== 0) ctx.restore()
    if (mode === 'difference') ctx.globalCompositeOperation = 'source-over'
    return null
  }

  if (source.type === 'vector' && source.vector) {
    drawVectorOnCanvas(ctx, source.vector, px, py, pw, ph, '#fff', '#fff')
    if (rotRad !== 0) ctx.restore()
    if (mode === 'difference') ctx.globalCompositeOperation = 'source-over'
    return c.toDataURL('image/png')
  }

  if (rotRad !== 0) ctx.restore()
  if (mode === 'difference') ctx.globalCompositeOperation = 'source-over'
  return null
}

let maskImageCache = new Map<string, HTMLImageElement>()

function loadImageCached(src: string): HTMLImageElement | null {
  const cached = maskImageCache.get(src)
  if (cached) return cached.naturalWidth > 0 ? cached : null
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = src
  maskImageCache.set(src, img)
  return null
}

/** Resolve the image URL a layer should be loaded from when used as a mask
 *  source. Loads the FULL object (originalPreview) even when the layer has a
 *  non-destructive crop — the crop window is applied at draw time. */
function resolveMaskImageSrc(layer: Layer): string | null {
  if (layer.type !== 'image') return null
  return layer.originalPreview ?? layer.preview ?? null
}

/** Draw a mask-source image into the source box. If the source layer has a
 *  non-destructive crop, only the CROPPED window is drawn (matching what the
 *  canvas shows), not the full original image. The image is scaled so that the
 *  crop region spans the source box, exactly like the canvas background render. */
function drawSourceImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  source: Layer,
  px: number,
  py: number,
  pw: number,
  ph: number
) {
  const crop = source.crop
  if (crop && crop.w > 0 && crop.h > 0 && crop.imgW > 0 && crop.imgH > 0) {
    const sx = px - crop.x * (pw / crop.w)
    const sy = py - crop.y * (ph / crop.h)
    const dw = crop.imgW * (pw / crop.w)
    const dh = crop.imgH * (ph / crop.h)
    ctx.drawImage(img, sx, sy, dw, dh)
  } else {
    ctx.drawImage(img, px, py, pw, ph)
  }
}

export interface MaskDrawDef {
  sourceId: string
  mode: 'intersection' | 'difference'
}

/** Projeção direta com rotação: máscara respeita posição e rotação dos objetos.
 *  Igual ao renderMaskCanvas, mas usado pelo caminho vivo getCompositeMaskDataUrl. */
function computeSourcePlacement(
  target: Layer,
  source: Layer,
  canvasW: number,
  canvasH: number,
  maskW: number,
  maskH: number
): { px: number; py: number; pw: number; ph: number; rotRad: number } {
  const tcx = (target.x + target.width / 2) * canvasW
  const tcy = (target.y + target.height / 2) * canvasH
  const scx = (source.x + source.width / 2) * canvasW
  const scy = (source.y + source.height / 2) * canvasH
  const tr = (target.rotation || 0) * Math.PI / 180
  const cos = Math.cos(-tr)
  const sin = Math.sin(-tr)
  const ddx = scx - tcx
  const ddy = scy - tcy
  const ldx = ddx * cos - ddy * sin
  const ldy = ddx * sin + ddy * cos
  const pw = source.width * canvasW
  const ph = source.height * canvasH
  const px = maskW / 2 + ldx - pw / 2
  const py = maskH / 2 + ldy - ph / 2
  const rotRad = ((source.rotation || 0) - (target.rotation || 0)) * Math.PI / 180
  return { px, py, pw, ph, rotRad }
}

/** Filtros da source para a máscara (só blur explícito; brilho/contraste seguem o objeto).
 *  Sem blur por omissão: precisão direta 1:1 com o glyph visível. */
function maskFilterFor(source: Layer): string | undefined {
  const filters: string[] = []
  if (source.blur > 0.01) filters.push(`blur(${source.blur}px)`)
  if (source.brightness !== 1) filters.push(`brightness(${source.brightness})`)
  if (source.contrast !== 1) filters.push(`contrast(${source.contrast})`)
  if (source.saturation !== 1) filters.push(`saturate(${source.saturation})`)
  if (source.hueRotate) filters.push(`hue-rotate(${source.hueRotate}deg)`)
  if (source.sepia) filters.push(`sepia(${source.sepia})`)
  if (source.negative) filters.push('invert(1)')
  return filters.length ? filters.join(' ') : undefined
}

/** Desenha o conteúdo da source (chapado, sem rotação/espelho/perspectiva) em `octx`
 *  no retângulo (ox, oy, ow, oh). Inclui clip de cantos arredondados para imagem. */
function paintSourceFlat(
  octx: CanvasRenderingContext2D,
  source: Layer,
  ox: number, oy: number, ow: number, oh: number,
  loadedImage?: HTMLImageElement,
): boolean {
  if (source.type === 'image' && (source.borderRadiusPx ?? 0) > 0) {
    const r = Math.min(source.borderRadiusPx ?? 0, ow / 2, oh / 2)
    octx.beginPath()
    // @ts-ignore roundRect pode não existir em alguns contextos
    if ((octx as any).roundRect) (octx as any).roundRect(ox, oy, ow, oh, r)
    else {
      octx.moveTo(ox + r, oy); octx.lineTo(ox + ow - r, oy); octx.arcTo(ox + ow, oy, ox + ow, oy + r, r)
      octx.lineTo(ox + ow, oy + oh - r); octx.arcTo(ox + ow, oy + oh, ox + ow - r, oy + oh, r)
      octx.lineTo(ox + r, oy + oh); octx.arcTo(ox, oy + oh, ox, oy + oh - r, r)
      octx.lineTo(ox, oy + r); octx.arcTo(ox, oy, ox + r, oy, r); octx.closePath()
    }
    octx.clip()
  }
  if (source.type === 'image') {
    const src = resolveMaskImageSrc(source) || source.preview
    if (!src) return false
    const img = loadedImage || loadImageCached(src)
    if (!img || !(img.complete && img.naturalWidth > 0)) return false
    drawSourceImage(octx, img, source, ox, oy, ow, oh)
    return true
  }
  if (source.type === 'vector') {
    if ((source as any).vectorPath) {
      drawVectorPathOnCanvas(octx, (source as any).vectorPath, ox, oy, ow, oh)
      return true
    }
    if (source.vector) {
      // máscara segue o visível: respeita `filled` (anel oco continua oco)
      const vForMask = { ...source.vector, strokeWidth: Math.max(1, source.vector.strokeWidth) }
      drawVectorOnCanvas(octx, vForMask as any, ox, oy, ow, oh, '#fff', '#fff')
      return true
    }
    return false
  }
  if (source.type === 'text') {
    drawTextMaskOnCanvas(octx, source, ox, oy, ow, oh)
    return true
  }
  if (source.type === 'element') {
    drawElementMaskOnCanvas(octx, source, ox, oy, ow, oh)
    return true
  }
  return false
}

/** Caminho projetivo: inclinação 3D real da source mapeada para o espaço local do alvo.
 *  Devolve true se desenhou (ou se a source projeta para vazio = máscara vazia, tratada
 *  pelo chamador), false para cair no caminho afim. */
function drawMaskSourceProjective(
  ctx: CanvasRenderingContext2D,
  target: Layer,
  source: Layer,
  mode: 'intersection' | 'difference',
  canvasW: number,
  canvasH: number,
  maskW: number,
  maskH: number,
  pw: number,
  ph: number,
  loadedImage?: HTMLImageElement,
): boolean {
  const iw = Math.max(1, Math.round(pw))
  const ih = Math.max(1, Math.round(ph))
  if (iw > 4096 || ih > 4096) return false
  const off = document.createElement('canvas')
  off.width = iw
  off.height = ih
  const octx = off.getContext('2d')
  if (!octx) return false
  // conteúdo chapado da source (rotação/espelho/perspectiva entram via quad)
  if (!paintSourceFlat(octx, source, 0, 0, iw, ih, loadedImage)) return false
  // Homografia espaço-local-do-alvo -> ecrã (projeção real do alvo), invertida:
  // cantos da source no ecrã -> cantos no espaço local do alvo.
  // Alvo extremo (atrás da câmara): homografia degenerada — desiste.
  if (isExtremeTilt(target, canvasW, canvasH)) return false
  const tgtLocal = [{ x: 0, y: 0 }, { x: maskW, y: 0 }, { x: maskW, y: maskH }, { x: 0, y: maskH }]
  const tgtScreen = projectLayerCorners(target, canvasW, canvasH)
  const H = solveHomography(tgtLocal, tgtScreen)
  if (!H) return false
  const Hi = invertHomo(H)
  if (!Hi) return false
  const srcScreen = projectLayerCorners(source, canvasW, canvasH)
  const quad = srcScreen.map((p) => applyHomo(Hi, p))
  if (!quad.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return false
  // quad fora de escala plausível (explosão numérica): cai no caminho chapado
  const bound = 16 * Math.max(maskW, maskH)
  if (!quad.every((p) => Math.abs(p.x) <= bound && Math.abs(p.y) <= bound)) return false
  ctx.save()
  ctx.globalCompositeOperation = mode === 'intersection' ? 'source-in' : 'destination-out'
  const prevAlpha = ctx.globalAlpha
  ctx.globalAlpha = prevAlpha * (source.opacity ?? 1)
  const f = maskFilterFor(source)
  if (f) (ctx as any).filter = f
  const ok = drawImageOnQuad(ctx, off, iw, ih, quad)
  ctx.restore()
  return ok
}
/** Draw a single mask source (vector shape or image alpha) into `ctx` using the
 *  composite operation implied by `mode`. Returns false when the source could
 *  not be drawn (e.g. image not loaded). `ctx` must be sized to the target box.
 *  Com inclinação 3D na source ou no alvo, usa projeção verdadeira (homografia);
 *  sem 3D, caminho afim direto (idêntico ao anterior). */
export function drawMaskSourceOnContext(
  ctx: CanvasRenderingContext2D,
  target: Layer,
  source: Layer,
  mode: 'intersection' | 'difference',
  canvasW: number,
  canvasH: number,
  loadedImage?: HTMLImageElement
): boolean {
  const maskW = ctx.canvas.width
  const maskH = ctx.canvas.height
  const { px, py, pw, ph, rotRad } = computeSourcePlacement(target, source, canvasW, canvasH, maskW, maskH)
  const srcCx = px + pw / 2
  const srcCy = py + ph / 2

  // Caminho projetivo quando há 3D em jogo (source ou alvo inclinado)
  const has3d =
    ((source.perspectiveX || 0) !== 0 || (source.perspectiveY || 0) !== 0 ||
      (target.perspectiveX || 0) !== 0 || (target.perspectiveY || 0) !== 0) &&
    pw > 1 && ph > 1
  if (has3d) {
    if (drawMaskSourceProjective(ctx, target, source, mode, canvasW, canvasH, maskW, maskH, pw, ph, loadedImage)) {
      return true
    }
    // se a projeção falhar (caso degenerado), cai no caminho afim abaixo
  }

  // IMPORTANTE: com 'source-in', cada draw SUBSTITUI o canvas pela interseção —
  // desenhar fill e depois stroke resultaria em fill ∩ stroke (só o anel interno,
  // "comendo" o preenchimento). Por isso pinta-se TUDO (fill ∪ stroke) num offscreen
  // com 'source-over' e compõe-se UMA única vez no canvas da máscara.
  const off = document.createElement('canvas')
  off.width = Math.max(1, maskW)
  off.height = Math.max(1, maskH)
  const octx = off.getContext('2d')
  if (!octx) return false
  octx.save()
  // transformações: rotação + espelho respeitam o visual real.
  // A máscara vive no espaço local do alvo e o browser aplica o 3D real do alvo
  // (CSS) ao resultado mascarado — sem inclinação falsa aqui.
  octx.translate(srcCx, srcCy)
  if (rotRad !== 0) octx.rotate(rotRad)
  if (source.mirrorX) octx.scale(-1, 1)
  if (source.mirrorY) octx.scale(1, -1)
  octx.translate(-srcCx, -srcCy)
  // blur e brilho seguem o objeto
  const f = maskFilterFor(source)
  if (f) (octx as any).filter = f
  octx.globalAlpha = source.opacity ?? 1
  const drawn = paintSourceFlat(octx, source, px, py, pw, ph, loadedImage)
  octx.restore()
  if (!drawn) return false
  ctx.save()
  ctx.globalCompositeOperation = mode === 'intersection' ? 'source-in' : 'destination-out'
  ctx.drawImage(off, 0, 0)
  ctx.restore()
  return true
}

/** Combine ANY number of masks into a single alpha image for CSS mask-image.
 *  Order is deterministic (the order of `masks`) and every mask is honoured:
 *  intersection keeps only the overlap, difference subtracts. Returns a data
 *  URL sized to the target box, or null when nothing was drawn. */
export function getCompositeMaskDataUrl(
  target: Layer,
  masks: MaskDrawDef[],
  layers: Layer[],
  canvasW: number,
  canvasH: number,
  loadedImages?: Map<string, HTMLImageElement>
): string | null {
  if (masks.length === 0) return null
  const maskW = Math.max(1, Math.round(target.width * canvasW))
  const maskH = Math.max(1, Math.round(target.height * canvasH))
  const c = document.createElement('canvas')
  c.width = maskW
  c.height = maskH
  const ctx = c.getContext('2d')
  if (!ctx) return null

  // Start fully visible; the first intersection keeps only its shape, each
  // following mask intersects (source-in) or subtracts (destination-out).
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, maskW, maskH)

  let anyDrawn = false
  for (const def of masks) {
    const src = layers.find((s) => s.id === def.sourceId)
    if (!src || !canBeMaskSource(src)) continue
    let img: HTMLImageElement | null | undefined
    if (src.type === 'image') {
      const srcUrl = resolveMaskImageSrc(src) || src.preview
      if (!srcUrl) continue
      img = loadedImages?.get(srcUrl) ?? loadImageCached(srcUrl)
      if (!img || !(img.complete && img.naturalWidth > 0)) continue
    }
    if (drawMaskSourceOnContext(ctx, target, src, def.mode, canvasW, canvasH, img ?? undefined)) {
      anyDrawn = true
    }
  }
  return anyDrawn ? c.toDataURL('image/png') : null
}

export function getMaskDataUrl(
  target: Layer,
  source: Layer,
  mode: 'intersection' | 'difference',
  canvasW: number,
  canvasH: number,
  loadedImage?: HTMLImageElement
): string | null {
  const maskW = Math.max(1, Math.round(target.width * canvasW))
  const maskH = Math.max(1, Math.round(target.height * canvasH))

  const c = document.createElement('canvas')
  c.width = maskW
  c.height = maskH
  const ctx = c.getContext('2d')
  if (!ctx) return null

  if (mode === 'difference') {
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, maskW, maskH)
    ctx.globalCompositeOperation = 'destination-out'
  }

  // Projeção com rotação relativa (igual a computeSourcePlacement)
  const tcx = (target.x + target.width / 2) * canvasW
  const tcy = (target.y + target.height / 2) * canvasH
  const scx = (source.x + source.width / 2) * canvasW
  const scy = (source.y + source.height / 2) * canvasH
  const tr = (target.rotation || 0) * Math.PI / 180
  const cos = Math.cos(-tr)
  const sin = Math.sin(-tr)
  const ddx = scx - tcx
  const ddy = scy - tcy
  const ldx = ddx * cos - ddy * sin
  const ldy = ddx * sin + ddy * cos
  const pw = source.width * canvasW
  const ph = source.height * canvasH
  const px = maskW / 2 + ldx - pw / 2
  const py = maskH / 2 + ldy - ph / 2
  const rotRad = ((source.rotation || 0) - (target.rotation || 0)) * Math.PI / 180
  const srcCx = px + pw / 2
  const srcCy = py + ph / 2
  if (rotRad !== 0) {
    ctx.save()
    ctx.translate(srcCx, srcCy)
    ctx.rotate(rotRad)
    ctx.translate(-srcCx, -srcCy)
  }

  if (source.type === 'image' && source.preview) {
    const src = resolveMaskImageSrc(source) || source.preview
    const img = loadedImage || loadImageCached(src)
    if (img) {
      drawSourceImage(ctx, img, source, px, py, pw, ph)
    } else {
      const img2 = new Image()
      img2.crossOrigin = 'anonymous'
      img2.src = src
      maskImageCache.set(src, img2)
      if (rotRad !== 0) ctx.restore()
      return null
    }
    if (rotRad !== 0) ctx.restore()
    if (mode === 'difference') ctx.globalCompositeOperation = 'source-over'
    return c.toDataURL('image/png')
  }

  if (source.type === 'vector') {
    if ((source as any).vectorPath) {
      drawVectorPathOnCanvas(ctx, (source as any).vectorPath, px, py, pw, ph)
      if (rotRad !== 0) ctx.restore()
      if (mode === 'difference') ctx.globalCompositeOperation = 'source-over'
      return c.toDataURL('image/png')
    } else if (source.vector) {
      drawVectorOnCanvas(ctx, source.vector, px, py, pw, ph, '#fff', '#fff')
      if (rotRad !== 0) ctx.restore()
      if (mode === 'difference') ctx.globalCompositeOperation = 'source-over'
      return c.toDataURL('image/png')
    }
  }

  if (rotRad !== 0) ctx.restore()
  if (mode === 'difference') ctx.globalCompositeOperation = 'source-over'
  return null
}

export function getMaskCss(dataUrl: string | null): Record<string, string> {
  if (!dataUrl) return {}
  return {
    WebkitMaskImage: `url("${dataUrl}")`,
    maskImage: `url("${dataUrl}")`,
    WebkitMaskPosition: '0% 0%',
    maskPosition: '0% 0%',
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskOrigin: 'border-box',
    maskOrigin: 'border-box',
    WebkitMaskClip: 'border-box',
    maskClip: 'border-box',
    WebkitMaskMode: 'alpha',
    maskMode: 'alpha',
  }
}
