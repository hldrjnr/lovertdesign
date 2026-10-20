import React, { useEffect } from 'react'
import { ResolutionPicker } from './components/ResolutionPicker'
import { Editor } from './components/Editor'
import { useStore } from './store'
import { t } from './i18n'

const ACCENT_COLORS: Record<string, string> = {
  default: '#3b82f6',
  amber: '#f59e0b',
  emerald: '#10b981',
  violet: '#8b5cf6',
  rose: '#f43f5e',
  cyan: '#06b6d4',
  orange: '#f97316',
  pink: '#ec4899',
}

const BASE_THEMES: Record<string, Record<string, string>> = {
  // Padrão: uniforme cinza, sem azul — elegante e neutro
  padrao: {
    '--bg-main': '#1e1e20', '--bg-panel': '#252529', '--bg-elevated': '#2f2f33', '--bg-hover': '#3a3a3e',
    '--text-primary': '#ffffff', '--text-white': '#ffffff', '--text-secondary': '#a1a1aa', '--text-muted': '#71717a', '--text-dim': '#52525b',
    '--border': '#2f2f33', '--border-light': '#3a3a3e', '--icon-filter': 'none',
    '--canvas-shadow': '0 8px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.05)',
    '--canvas-bg': '#1e1e20',
  },
  // Dark: mais contrastante que o padrão, ainda escuro
  dark: {
    '--bg-main': '#09090b', '--bg-panel': '#141416', '--bg-elevated': '#1e1e20', '--bg-hover': '#27272a',
    '--text-primary': '#ffffff', '--text-white': '#ffffff', '--text-secondary': '#a1a1aa', '--text-muted': '#71717a', '--text-dim': '#52525b',
    '--border': '#1e1e20', '--border-light': '#27272a', '--icon-filter': 'none',
    '--canvas-shadow': '0 0 0 1px rgba(255,255,255,0.14), 0 12px 48px rgba(0,0,0,0.9), 0 4px 16px rgba(0,0,0,0.6)',
    '--canvas-bg': '#000000',
  },
  // Light: consistente — nenhum painel fica preto
  light: {
    '--bg-main': '#f4f4f5', '--bg-panel': '#ffffff', '--bg-elevated': '#ededee', '--bg-hover': '#e4e4e7',
    '--text-primary': '#18181b', '--text-white': '#ffffff', '--text-secondary': '#52525b', '--text-muted': '#71717a', '--text-dim': '#71717a',
    '--border': '#e4e4e7', '--border-light': '#d4d4d8', '--icon-filter': 'invert(1)',
    '--canvas-shadow': '0 4px 24px rgba(0,0,0,0.10), 0 0 0 1px rgba(0,0,0,0.07)',
    '--canvas-bg': '#f4f4f5',
  },
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}

// Global overlay shown on every screen: a "loading project" spinner when opening
// a project externally, and a dismissible error/notification toast.
function ProjectOverlay() {
  const loadingProject = useStore((s) => s.loadingProject)
  const errorMsg = useStore((s) => s.errorMsg)
  const setError = useStore((s) => s.setError)
  return (
    <>
      {loadingProject && (
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            <div className="text-white text-sm font-medium">{t('app.loadingProject')}</div>
          </div>
        </div>
      )}
      {errorMsg && !loadingProject && (() => {
        const isSuccess = errorMsg.startsWith('✅')
        return (
          <div className={`fixed top-4 right-4 z-[9999] text-white px-4 py-2 rounded-lg shadow-2xl text-sm max-w-md flex items-center gap-3 ${isSuccess ? 'bg-emerald-600/95' : 'bg-red-600/90'}`}>
            <span>{errorMsg}</span>
            <button onClick={() => setError(null)} className="text-white/70 hover:text-white text-lg leading-none">✕</button>
          </div>
        )
      })()}
    </>
  )
}

function InlinePromptOverlay() {
  const prompt = useStore((s) => s.inlinePrompt)
  const setPrompt = useStore((s) => s.setInlinePrompt)
  const [val, setVal] = React.useState('')
  React.useEffect(() => { if (prompt) setVal(prompt.defaultValue) }, [prompt])
  if (!prompt) return null
  const confirm = () => { const v = val.trim(); if (v) prompt.onConfirm(v); setPrompt(null) }
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => prompt.onCancel()}>
      <div className="rounded-xl shadow-2xl w-72 p-4" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{prompt.title}</h3>
        <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') prompt.onCancel() }} placeholder={prompt.placeholder} className="w-full rounded-lg px-3 py-2 text-sm border focus:outline-none focus:border-[var(--accent)]" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', borderColor: 'var(--border-light)' }} />
        <div className="flex gap-2 mt-3">
          <button onClick={() => prompt.onCancel()} className="flex-1 py-2 rounded-lg text-xs" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{t('text.cancel')}</button>
          <button onClick={confirm} className="flex-1 py-2 rounded-lg text-white text-xs font-medium" style={{ background: 'var(--accent)' }}>OK</button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const template = useStore((s) => s.template)
  const uiScale = useStore((s) => s.uiScale)
  const uiTheme = useStore((s) => s.uiTheme)
  const baseTheme = useStore((s) => s.baseTheme)

  const accent = ACCENT_COLORS[uiTheme] || ACCENT_COLORS.default
  const rgb = hexToRgb(accent)
  const bt = BASE_THEMES[baseTheme] || BASE_THEMES.padrao
  const bgVars = Object.entries(bt).map(([k, v]) => `${k}: ${v}`).join(';')

  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * uiScale}px`
  }, [uiScale])

  useEffect(() => {
    const handler = (e: MouseEvent) => { e.preventDefault() }
    document.addEventListener('contextmenu', handler)
    return () => document.removeEventListener('contextmenu', handler)
  }, [])

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const state = useStore.getState()
      if (state.template && state.isDirty()) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        const { invoke } = await import('@tauri-apps/api/core')
        unlisten = await listen<string>('open-project-file', (event) => {
          useStore.getState().loadProjectFromFile(event.payload)
        })
        // A second .lovd was opened (Explorer) while this instance is running.
        // If a project is already open, spawn a brand-new window instead of
        // silently discarding the current work; otherwise load it right here.
        const unlisten2 = await listen<string>('open-project-file-new-window', (event) => {
          const state = useStore.getState()
          if (state.template) {
            invoke('open_project_in_new_window', { path: event.payload }).catch(() => {})
          } else {
            state.loadProjectFromFile(event.payload)
          }
        })
        const prev = unlisten
        unlisten = () => { prev?.(); unlisten2() }
      } catch {}
    })()
    return () => { unlisten?.() }
  }, [])

  // A brand-new window opened via `open_project_in_new_window` carries the
  // .lovd path in the URL (index.html?project=<urlencoded>). Reading it here is
  // synchronous and race-free, unlike the `open-project-file` event.
  useEffect(() => {
    const project = new URLSearchParams(window.location.search).get('project')
    if (project) {
      useStore.getState().loadProjectFromFile(project).catch(() => {})
    }
  }, [])

  // Read any project path passed via CLI at startup (OS "Open with" / double-click).
  // Consuming it here guarantees the project loads even if the emitted event
  // arrived before React was ready to listen.
  useEffect(() => {
    ;(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const path = await invoke<string | null>('take_initial_project_path')
        if (path) {
          useStore.getState().loadProjectFromFile(path)
        }
      } catch {}
    })()
  }, [])

  // Splash: some rápido assim que React montou — já visível desde o HTML
  useEffect(() => {
    const t = setTimeout(() => {
      try { (window as unknown as { __hideSplash?: () => void }).__hideSplash?.() } catch {}
    }, 160)
    return () => clearTimeout(t)
  }, [])

  // Load template preview JPGs from disk after store initialisation.
  useEffect(() => { useStore.getState().loadPresetPreviews() }, [])

  // Kill the rembg session process when the app unloads.
  useEffect(() => {
    const cleanup = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('kill_bg_session')
      } catch {}
    }
    window.addEventListener('beforeunload', cleanup)
    return () => { window.removeEventListener('beforeunload', cleanup); void cleanup() }
  }, [])

  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen('close-requested', async () => {
          const state = useStore.getState()
          if (!state.template) {
            try {
              const { invoke } = await import('@tauri-apps/api/core')
              await invoke('allow_close')
            } catch {}
            return
          }
          if (state.isDirty()) {
            state.setShowCloseConfirm(true)
          } else {
            try {
              const { invoke } = await import('@tauri-apps/api/core')
              await invoke('allow_close')
            } catch {}
          }
        })
      } catch {}
    })()
    return () => { unlisten?.() }
  }, [])

  return (
    <div className="h-screen overflow-hidden flex flex-col" style={{ background: 'var(--bg-main)' }}>
      <ProjectOverlay />
      <InlinePromptOverlay />
      <style>{`
        :root {
          --accent: ${accent};
          --accent-rgb: ${rgb};
          --accent-15: rgba(${rgb},0.15);
          --accent-20: rgba(${rgb},0.2);
          --accent-30: rgba(${rgb},0.3);
          --accent-50: rgba(${rgb},0.5);
          --accent-80: rgba(${rgb},0.8);
          ${bgVars}
        }
        /* base theme background/border overrides — cobre todas as variações com opacidade */
        .bg-\\[\\#0f0f1a\\], .bg-\\[\\#0c0c14\\], [class*="bg-\\[\\#0f0f"] { background: var(--bg-main) !important; }
        .bg-zinc-900, [class*="bg-zinc-900"] { background: var(--bg-panel) !important; }
        .bg-zinc-800, [class*="bg-zinc-800"] { background: var(--bg-elevated) !important; }
        .bg-zinc-700, [class*="bg-zinc-700"] { background: var(--bg-hover) !important; }
        .bg-zinc-600, [class*="bg-zinc-600"] { background: var(--bg-hover) !important; }
        .border-zinc-800, [class*="border-zinc-800"] { border-color: var(--border) !important; }
        .border-zinc-700, [class*="border-zinc-700"] { border-color: var(--border-light) !important; }
        .border-zinc-600, [class*="border-zinc-600"] { border-color: var(--border-light) !important; }
        .hover\\:bg-zinc-800\\/50:hover, [class*="hover:bg-zinc-800"]:hover { background: var(--bg-elevated) !important; }
        .hover\\:bg-zinc-700\\/50:hover, [class*="hover:bg-zinc-700"]:hover { background: var(--bg-hover) !important; }
        /* gradientes da área direita e workArea */
        .from-zinc-900 { --tw-gradient-from: var(--bg-panel) !important; }
        .to-\\[\\#0f0f14\\], [class*="to-\\[\\#0f"] { --tw-gradient-to: var(--bg-main) !important; }
        .bg-gradient-to-b { background: linear-gradient(to bottom, var(--bg-panel), var(--bg-main)) !important; }
        /* canvas: contorno sem arredondamento, 100% alinhado ao canvas (sem border que altera tamanho) */
        .canvas-container { box-shadow: var(--canvas-shadow) !important; border: none !important; border-radius: 0 !important; outline: 1px solid var(--border) !important; outline-offset: -1px !important; }
        [data-canvas-area="true"] { background: var(--canvas-bg) !important; }
        /* text overrides — content text adapts to theme */
        .text-white { color: var(--text-primary) !important; }
        .text-zinc-300, .text-zinc-200 { color: var(--text-primary) !important; }
        .text-zinc-400 { color: var(--text-secondary) !important; }
        .text-zinc-500 { color: var(--text-muted) !important; }
        .text-zinc-600 { color: var(--text-dim) !important; }
        .hover\\:text-white:hover { color: var(--text-primary) !important; }
        /* accent buttons keep white text */
        .bg-blue-600.text-white, .bg-red-600.text-white,
        .bg-blue-600\\/80.text-white, .bg-red-600\\/80.text-white,
        .bg-blue-600\\/90.text-white, .bg-red-600\\/90.text-white { color: #fff !important; }
        .bg-blue-600.hover\\:text-white:hover, .bg-red-600.hover\\:text-white:hover,
        .bg-blue-600\\/80.hover\\:text-white:hover, .bg-red-600\\/80.hover\\:text-white:hover { color: #fff !important; }
        /* accent overrides */
        .bg-blue-600\\/80, .bg-accent-80 { background: var(--accent-80) !important; }
        .bg-blue-600\\/15, .bg-accent-15 { background: var(--accent-15) !important; }
        .bg-blue-600\\/20, .bg-accent-20 { background: var(--accent-20) !important; }
        .border-blue-500\\/30, .border-accent-30 { border-color: var(--accent-30) !important; }
        .border-blue-500\\/50 { border-color: var(--accent-50) !important; }
        .border-blue-500\\/40 { border-color: var(--accent-30) !important; }
        .text-blue-300, .text-blue-400, .text-accent { color: var(--accent) !important; }
        .ring-blue-500 { --tw-ring-color: var(--accent) !important; }
        .bg-blue-500 { background: var(--accent) !important; }
        .hover\\:bg-blue-600:hover { background: var(--accent) !important; }
        .hover\\:bg-blue-500:hover { background: var(--accent) !important; }
        img[src*="/icons/unity.png"], img[src*="/icons/fab.png"] { filter: var(--icon-filter) !important; }
      `}</style>
      {template ? <Editor /> : <ResolutionPicker />}
    </div>
  )
}
