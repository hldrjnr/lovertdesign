export const CLOSE_COLOR_POPUPS_EVENT = 'lovert:close-color-popups'

/**
 * Fecha todos os popups de cor abertos (ColorPalette).
 * Devolve true se havia algum aberto — nesse caso o gesto atual deve ser
 * consumido (só fecha o popup, sem desselecionar nem sair de modos).
 */
export function closeOpenColorPopups(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false
  const open = document.querySelectorAll('[data-color-popup="true"]')
  if (open.length === 0) return false
  window.dispatchEvent(new CustomEvent(CLOSE_COLOR_POPUPS_EVENT))
  return true
}
