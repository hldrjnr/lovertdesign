import { useState, useEffect, useCallback } from 'react'
import { getDefaults, getShortcuts, setShortcut, resetShortcuts, formatShortcut } from '@/shortcuts'
import type { ShortcutBinding } from '@/shortcuts'
import { t } from '@/i18n'

export function ShortcutSettings() {
  const [bindings, setBindings] = useState<Record<string, ShortcutBinding>>(getShortcuts())
  const [recording, setRecording] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setBindings({ ...getShortcuts() })
  }, [])

  useEffect(() => {
    if (!recording) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') { setRecording(null); return }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const b: ShortcutBinding = { key: '', ctrl: false, shift: false, alt: false }
        setShortcut(recording, b)
        setRecording(null)
        refresh()
        return
      }
      // Ignore modifier-only keys (Ctrl, Shift, Alt, Meta, AltGr) — wait for a normal key
      if (['control', 'shift', 'alt', 'meta', 'altgraph'].includes(e.key.toLowerCase())) {
        return
      }
      const b: ShortcutBinding = {
        key: e.key,
        ctrl: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
        alt: e.altKey,
      }
      setShortcut(recording, b)
      setRecording(null)
      refresh()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [recording, refresh])

  const defaults = getDefaults()

  return (
    <div className="space-y-1">
      {defaults.map((def) => {
        const current = bindings[def.id] ?? def.default
        const hasKey = current.key !== ''
        const translated = t(`shortcuts.${def.id}`)
        const label = translated !== `shortcuts.${def.id}` ? translated : def.label
        return (
          <div key={def.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-zinc-800/50">
            <span className="text-[0.6875rem]" style={{ color: 'var(--text-primary)' }}>{label}</span>
            <button
              onClick={() => setRecording(recording === def.id ? null : def.id)}
              className={`text-[0.625rem] px-2 py-0.5 rounded border transition-all min-w-[80px] text-center
                ${recording === def.id ? 'border-blue-500 bg-blue-500/10 text-blue-300' : hasKey ? 'border-zinc-600 text-zinc-300 hover:border-zinc-500' : 'border-zinc-700 text-zinc-500 italic'}`}
            >
              {recording === def.id ? '...' : hasKey ? formatShortcut(current) : t('shortcuts.none')}
            </button>
          </div>
        )
      })}
      <div className="pt-3 text-right">
        <button
          onClick={() => { resetShortcuts(); refresh() }}
          className="text-[0.625rem] px-3 py-1 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
        >
          {t('shortcuts.reset')}
        </button>
      </div>
    </div>
  )
}
