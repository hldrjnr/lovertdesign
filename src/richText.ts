import type { TextSpan } from './types'

export type TextRun = { text: string; color: string | null }

/** Divide o texto em trechos (runs) com cor própria ou herdada (null). */
export function splitRuns(text: string, spans: TextSpan[] | null | undefined): TextRun[] {
  const src = typeof text === 'string' ? text : ''
  if (!src) return []
  const valid = clampSpans(spans, src.length)
  if (valid.length === 0) return [{ text: src, color: null }]
  const runs: TextRun[] = []
  let cursor = 0
  for (const sp of valid) {
    if (sp.s > cursor) runs.push({ text: src.slice(cursor, sp.s), color: null })
    runs.push({ text: src.slice(sp.s, sp.e), color: sp.color })
    cursor = sp.e
  }
  if (cursor < src.length) runs.push({ text: src.slice(cursor), color: null })
  return runs.filter((r) => r.text.length > 0)
}

/** Normaliza spans: ordena, corta para [0,len], remove vazios e funde adjacentes da mesma cor. */
export function clampSpans(spans: TextSpan[] | null | undefined, len: number): TextSpan[] {
  if (!Array.isArray(spans) || len <= 0) return []
  const out: TextSpan[] = []
  const sorted = [...spans]
    .filter((s) => s && typeof s.s === 'number' && typeof s.e === 'number' && typeof s.color === 'string' && s.color)
    .map((s) => ({ s: Math.max(0, Math.min(len, Math.floor(s.s))), e: Math.max(0, Math.min(len, Math.ceil(s.e))), color: s.color }))
    .filter((s) => s.e > s.s)
    .sort((a, b) => a.s - b.s || a.e - b.e)
  for (const s of sorted) {
    const last = out[out.length - 1]
    if (last && last.color === s.color && s.s <= last.e) last.e = Math.max(last.e, s.e)
    else out.push({ ...s })
  }
  return out
}

/** Sanitiza spans vindos de storage/projeto (sempre devolve null quando não há nada útil). */
export function sanitizeTextSpans(raw: unknown, text: string): TextSpan[] | null {
  const len = typeof text === 'string' ? text.length : 0
  const clean = clampSpans(raw as TextSpan[] | null, len)
  return clean.length > 0 ? clean : null
}

const RICH_ATTR = 'data-rich-color'
const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE'])

/** Converte rgb()/rgba()/#hex em #rrggbb; devolve a string original se já for cor CSS válida. */
export function normalizeColorToHex(raw: string): string | null {
  const v = (raw || '').trim()
  if (!v || v === 'transparent' || v === 'inherit' || v === 'initial') return null
  const hex = v.match(/^#([0-9a-fA-F]{3,8})$/)
  if (hex) {
    let h = hex[1]
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
    return '#' + h.slice(0, 6).toLowerCase()
  }
  const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (m) {
    const to = (n: string) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0')
    return '#' + to(m[1]) + to(m[2]) + to(m[3])
  }
  return v
}

function colorOfElement(el: HTMLElement, inherited: string | null): string | null {
  const attr = el.getAttribute(RICH_ATTR)
  const inline = (el.style && el.style.color) || ''
  const raw = attr || inline
  if (!raw) return inherited
  return normalizeColorToHex(raw) || inherited
}

/**
 * Walker único que espelha a serialização. Modelo em linhas:
 * - cada bloco contribui o seu conteúdo + exatamente um \n terminador
 *   (bloco vazio = uma linha vazia);
 * - um bloco a seguir a linha não-vazia começa nova linha (\n separador);
 * - <br> contribui \n, exceto quando é o último filho de um bloco
 *   (placeholder de linha vazia — o terminador do bloco já conta);
 * - `trailingBlockEnd` indica se o último \n veio do fecho de bloco
 *   (para correção de offsets; <br> nus no fim são intencionais e mantêm-se).
 */
function walkRich(
  root: Node,
  onText: (node: Text, base: number, color: string | null) => void,
): { text: string; trailingBlockEnd: boolean } {
  let text = ''
  let trailingBlockEnd = false
  const lineEmpty = () => text.length === 0 || text.endsWith('\n')
  // <br> placeholder de linha vazia: último da cadeia até ao bloco e nada antes produz conteúdo
  const isBlockPlaceholderBR = (blockEl: HTMLElement, br: Node): boolean => {
    if ((br as HTMLElement).tagName !== 'BR') return false
    let cur: Node | null = br
    let parent: Node | null = br.parentNode
    while (parent && parent !== blockEl) {
      const kids = parent.childNodes
      if (kids.length === 0 || kids[kids.length - 1] !== cur) return false
      for (let i = 0; i < kids.length - 1; i++) {
        if (((kids[i] as Node).textContent ?? '').length > 0) return false
      }
      cur = parent
      parent = parent.parentNode
    }
    if (parent !== blockEl) return false
    const kids = blockEl.childNodes
    const idx = Array.prototype.indexOf.call(kids, cur)
    if (idx < 0) return false
    for (let i = 0; i < idx; i++) {
      if (((kids[i] as Node).textContent ?? '').length > 0) return false
    }
    return true
  }
  const walk = (node: Node, inherited: string | null, inBlock: boolean, blockEl: HTMLElement | null) => {
    if (node.nodeType === 3) {
      const t = node.textContent ?? ''
      if (!t) return
      onText(node as Text, text.length, inherited)
      text += t
      trailingBlockEnd = false
      return
    }
    if (node.nodeType !== 1) return
    const el = node as HTMLElement
    if (el.tagName === 'BR') {
      // placeholder final de bloco vazio não conta (o terminador do bloco conta)
      if (inBlock && blockEl && isBlockPlaceholderBR(blockEl, node)) return
      text += '\n'
      trailingBlockEnd = false
      return
    }
    const color = colorOfElement(el, inherited)
    const isBlock = BLOCK_TAGS.has(el.tagName)
    if (isBlock && !lineEmpty()) {
      text += '\n'
      trailingBlockEnd = false
    }
    el.childNodes.forEach((ch) => walk(ch, color, isBlock || inBlock, isBlock ? el : blockEl))
    if (isBlock) {
      text += '\n'
      trailingBlockEnd = true
    }
  }
  root.childNodes.forEach((ch) => walk(ch, null, false, null))
  return { text, trailingBlockEnd }
}

/** Lê o contentEditable e devolve texto puro (\n por <br>/bloco) + spans por offsets. */
export function serializeRichElement(root: HTMLElement): { text: string; spans: TextSpan[] | null } {
  const spans: TextSpan[] = []
  const { text: raw, trailingBlockEnd } = walkRich(root, (node, base, color) => {
    if (!color) return
    const len = (node.textContent ?? '').length
    if (len > 0) spans.push({ s: base, e: base + len, color })
  })
  let out = raw
  if (trailingBlockEnd && out.endsWith('\n')) out = out.slice(0, -1)
  // Editor vazio (<br> solitário) → texto vazio
  if (out === '\n') out = ''
  return { text: out, spans: sanitizeTextSpans(spans, out) }
}

/** Reconstrói o DOM do editor a partir de texto + spans (linhas unidas por <br>, sem \n crus). */
export function setRichEditorContent(root: HTMLElement, text: string, spans: TextSpan[] | null | undefined): void {
  root.innerHTML = ''
  const src = typeof text === 'string' ? text : ''
  const doc = root.ownerDocument
  const appendTextWithBreaks = (parent: Node, s: string) => {
    const lines = s.split('\n')
    lines.forEach((line, i) => {
      if (line) parent.appendChild(doc.createTextNode(line))
      if (i < lines.length - 1) parent.appendChild(doc.createElement('br'))
    })
  }
  if (!src) {
    root.appendChild(doc.createElement('br'))
    return
  }
  for (const run of splitRuns(src, spans)) {
    if (!run.color) {
      appendTextWithBreaks(root, run.text)
    } else {
      const span = doc.createElement('span')
      span.setAttribute(RICH_ATTR, run.color)
      span.style.color = run.color
      // garante que o trecho é visível mesmo com textGradient ativo no editor
      ;(span.style as any).webkitTextFillColor = run.color
      appendTextWithBreaks(span, run.text)
      root.appendChild(span)
    }
  }
}

/**
 * Offset serializado de um ponto (nó, offset) dentro do editor.
 * Usa fragmento clonado + o mesmo walker: exato por construção.
 */
function offsetOfPoint(root: HTMLElement, node: Node, offset: number): number | null {
  try {
    const doc = root.ownerDocument
    const r = doc.createRange()
    r.selectNodeContents(root)
    r.setEnd(node, offset)
    const frag = r.cloneContents()
    const tmp = doc.createElement('div')
    tmp.appendChild(frag)
    const { text, trailingBlockEnd } = walkRich(tmp, () => {})
    let out = text
    if (trailingBlockEnd && out.endsWith('\n')) out = out.slice(0, -1)
    return out.length
  } catch {
    return null
  }
}

/** Localiza (nó de texto, offset) para um offset serializado (para restaurar a seleção). */
function pickAt(root: HTMLElement, target: number): { node: Text; offset: number } | null {
  const entries: { node: Text; base: number; len: number }[] = []
  walkRich(root, (node, base) => {
    entries.push({ node, base, len: (node.textContent ?? '').length })
  })
  for (const e of entries) {
    if (target >= e.base && target <= e.base + e.len) return { node: e.node, offset: target - e.base }
  }
  const last = entries[entries.length - 1]
  if (last) return { node: last.node, offset: last.len }
  return null
}

/** Offsets serializados da seleção atual dentro do editor (null se colapsada/fora). */
export function getEditorSelectionOffsets(root: HTMLElement): { start: number; end: number } | null {
  const sel = root.ownerDocument.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  if (!sel.anchorNode || !sel.focusNode) return null
  if (!root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null
  const anchor = offsetOfPoint(root, sel.anchorNode, sel.anchorOffset)
  const focus = offsetOfPoint(root, sel.focusNode, sel.focusOffset)
  if (anchor === null || focus === null) return null
  if (Math.abs(anchor - focus) < 1 && sel.toString().length === 0) return null
  return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) }
}

/** Há seleção não-colapsada dentro do editor? (para habilitar a toolbar) */
export function editorHasSelection(root: HTMLElement): boolean {
  return getEditorSelectionOffsets(root) !== null
}

/**
 * Aplica (ou remove, com color=null) a cor ao trecho selecionado.
 * Devolve o novo {text, spans} ou null quando não há seleção válida.
 */
export function applyRichColorToSelection(
  root: HTMLElement,
  color: string | null,
): { text: string; spans: TextSpan[] | null } | null {
  const selRange = getEditorSelectionOffsets(root)
  if (!selRange || selRange.end <= selRange.start) return null
  const { text, spans: prevRaw } = serializeRichElement(root)
  const prev = clampSpans(prevRaw, text.length)
  const next: TextSpan[] = []
  for (const sp of prev) {
    if (sp.e <= selRange.start || sp.s >= selRange.end) {
      next.push(sp)
      continue
    }
    if (sp.s < selRange.start) next.push({ s: sp.s, e: selRange.start, color: sp.color })
    if (sp.e > selRange.end) next.push({ s: selRange.end, e: sp.e, color: sp.color })
  }
  if (color) next.push({ s: selRange.start, e: selRange.end, color })
  const spans = sanitizeTextSpans(next, text)
  setRichEditorContent(root, text, spans)
  // restaura a seleção sobre o mesmo intervalo
  try {
    const doc = root.ownerDocument
    const a = pickAt(root, selRange.start)
    const b = pickAt(root, selRange.end)
    const sel = doc.getSelection()
    if (a && b && sel) {
      const r = doc.createRange()
      r.setStart(a.node, a.offset)
      r.setEnd(b.node, b.offset)
      sel.removeAllRanges()
      sel.addRange(r)
    }
  } catch {}
  try {
    root.focus({ preventScroll: true })
  } catch {}
  return { text, spans }
}

/** Coloca o caret no fim do editor. */
export function placeCaretAtEnd(root: HTMLElement): void {
  try {
    const doc = root.ownerDocument
    const r = doc.createRange()
    r.selectNodeContents(root)
    r.collapse(false)
    const sel = doc.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(r)
  } catch {}
}
