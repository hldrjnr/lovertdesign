export interface ShortcutBinding {
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
}

export interface ShortcutDef {
  id: string
  label: string
  default: ShortcutBinding
  scope?: 'global' | 'canvas'
}

const STORAGE_KEY = 'thumbnail-app.shortcuts.v1'

const DEFAULTS: ShortcutDef[] = [
  { id: 'undo', label: 'Desfazer', default: { key: 'z', ctrl: true, shift: false, alt: false } },
  { id: 'redo', label: 'Refazer', default: { key: 'z', ctrl: true, shift: true, alt: false } },
  { id: 'redo2', label: 'Refazer (alt)', default: { key: 'y', ctrl: true, shift: false, alt: false } },
  { id: 'duplicate', label: 'Duplicar', default: { key: 'd', ctrl: true, shift: false, alt: false } },
  { id: 'duplicateAlt', label: 'Duplicar (alt)', default: { key: 'd', ctrl: false, shift: false, alt: true } },
  { id: 'lock', label: 'Bloquear/Desbloquear', default: { key: 'l', ctrl: true, shift: false, alt: false } },
  { id: 'group', label: 'Agrupar', default: { key: 'g', ctrl: true, shift: false, alt: false } },
  { id: 'ungroup', label: 'Desagrupar', default: { key: 'g', ctrl: true, shift: false, alt: true } },
  { id: 'delete', label: 'Excluir', default: { key: 'delete', ctrl: false, shift: false, alt: false } },
  { id: 'backspace', label: 'Excluir (backspace)', default: { key: 'backspace', ctrl: false, shift: false, alt: false } },
  { id: 'selectAll', label: 'Selecionar Tudo', default: { key: 'a', ctrl: true, shift: false, alt: false } },
  { id: 'save', label: 'Salvar', default: { key: 's', ctrl: true, shift: false, alt: false } },
  { id: 'saveAs', label: 'Salvar Como / Exportar', default: { key: 's', ctrl: true, shift: true, alt: false } },
  { id: 'export', label: 'Exportar', default: { key: 'e', ctrl: true, shift: false, alt: false } },
  { id: 'newProject', label: 'Novo Projeto', default: { key: 'n', ctrl: true, shift: false, alt: false } },
  { id: 'moveUp', label: 'Mover Camada para Cima', default: { key: ']', ctrl: true, shift: false, alt: false } },
  { id: 'moveDown', label: 'Mover Camada para Baixo', default: { key: '[', ctrl: true, shift: false, alt: false } },
  { id: 'toggleLeftPanel', label: 'Alternar Painel Esquerdo', default: { key: 'arrowleft', ctrl: false, shift: false, alt: true } },
  { id: 'toggleRightPanel', label: 'Alternar Painel Direito', default: { key: 'arrowright', ctrl: false, shift: false, alt: true } },
  { id: 'zoomIn', label: 'Ampliar', default: { key: '=', ctrl: true, shift: false, alt: false } },
  { id: 'zoomOut', label: 'Reduzir', default: { key: '-', ctrl: true, shift: false, alt: false } },
  { id: 'resetZoom', label: 'Redefinir Zoom', default: { key: '0', ctrl: true, shift: false, alt: false } },
  { id: 'nudgeUp', label: 'Mover para Cima', default: { key: 'arrowup', ctrl: false, shift: false, alt: false }, scope: 'canvas' },
  { id: 'nudgeDown', label: 'Mover para Baixo', default: { key: 'arrowdown', ctrl: false, shift: false, alt: false }, scope: 'canvas' },
  { id: 'nudgeLeft', label: 'Mover para Esquerda', default: { key: 'arrowleft', ctrl: false, shift: false, alt: false }, scope: 'canvas' },
  { id: 'nudgeRight', label: 'Mover para Direita', default: { key: 'arrowright', ctrl: false, shift: false, alt: false }, scope: 'canvas' },
  { id: 'nudgeUpFast', label: 'Mover para Cima (rápido)', default: { key: 'arrowup', ctrl: false, shift: true, alt: false }, scope: 'canvas' },
  { id: 'nudgeDownFast', label: 'Mover para Baixo (rápido)', default: { key: 'arrowdown', ctrl: false, shift: true, alt: false }, scope: 'canvas' },
  { id: 'nudgeLeftFast', label: 'Mover para Esquerda (rápido)', default: { key: 'arrowleft', ctrl: false, shift: true, alt: false }, scope: 'canvas' },
  { id: 'nudgeRightFast', label: 'Mover para Direita (rápido)', default: { key: 'arrowright', ctrl: false, shift: true, alt: false }, scope: 'canvas' },
  { id: 'escape', label: 'Esc / Desselecionar', default: { key: 'escape', ctrl: false, shift: false, alt: false } },
  { id: 'bezierEdit', label: 'Editar Bezier (T)', default: { key: 't', ctrl: false, shift: false, alt: false } },
]

export function getDefaults(): ShortcutDef[] {
  return DEFAULTS
}

export function getShortcuts(): Record<string, ShortcutBinding> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      const map: Record<string, ShortcutBinding> = {}
      for (const def of DEFAULTS) {
        map[def.id] = saved[def.id] ?? def.default
      }
      return map
    }
  } catch {}
  const map: Record<string, ShortcutBinding> = {}
  for (const def of DEFAULTS) map[def.id] = def.default
  return map
}

export function setShortcut(id: string, binding: ShortcutBinding) {
  const all = getShortcuts()
  all[id] = binding
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function resetShortcuts() {
  localStorage.removeItem(STORAGE_KEY)
}

export function formatShortcut(b: ShortcutBinding): string {
  const parts: string[] = []
  if (b.ctrl) parts.push('Ctrl')
  if (b.shift) parts.push('Shift')
  if (b.alt) parts.push('Alt')
  const k = b.key.length === 1 ? b.key.toUpperCase() : b.key.charAt(0).toUpperCase() + b.key.slice(1)
  parts.push(k)
  return parts.join('+')
}

export function matchShortcut(e: KeyboardEvent, b: ShortcutBinding): boolean {
  const key = e.key.toLowerCase()
  const targetKey = b.key.toLowerCase()
  const isCtrl = e.ctrlKey || e.metaKey
  if (isCtrl !== b.ctrl) return false
  if (e.shiftKey !== b.shift) return false
  if (e.altKey !== b.alt) return false
  if (key !== targetKey) return false
  return true
}
