import { useState, useEffect, useMemo } from 'react'
import { open } from '@tauri-apps/plugin-shell'
import { t } from '@/i18n'
import { TEMPLATES } from '@/types'
import type { Template } from '@/types'
import { useStore } from '@/store'
import { APP_VERSION } from '@/version'
import { LicenseDialog } from './SaveDialog'
import { ReportModal } from './ReportModal'

const PLATFORM_ORDER = ['YouTube', 'Instagram', 'Facebook', 'Unity Asset Store', 'Fab', 'Gumroad', 'itch.io', 'LinkedIn', 'Custom']

const PLATFORM_ICON: Record<string, string> = {
  'YouTube': '/icons/youtube.png',
  'Instagram': '/icons/instagram.png',
  'Facebook': '/icons/facebook.png',
  'Unity Asset Store': '/icons/unity.png',
  'Fab': '/icons/fab.png',
  'Gumroad': '/icons/gumroad.png',
  'itch.io': '/icons/itchio.png',
  'LinkedIn': '/icons/linkedin.png',
  'Custom': '',
}

const ACCENTS = [
  { id: 'default', color: '#3b82f6' },
  { id: 'amber', color: '#f59e0b' },
  { id: 'emerald', color: '#10b981' },
  { id: 'violet', color: '#8b5cf6' },
  { id: 'rose', color: '#f43f5e' },
  { id: 'cyan', color: '#06b6d4' },
  { id: 'orange', color: '#f97316' },
  { id: 'pink', color: '#ec4899' },
]

const CUSTOM_TEMPLATE: Template = { id: 'custom', name: 'Custom', platform: 'Custom', width: 1920, height: 1080, icon: '', desc: '' }

function groupByPlatform(): Map<string, Template[]> {
  const map = new Map<string, Template[]>()
  for (const tpl of TEMPLATES) {
    if (!map.has(tpl.platform)) map.set(tpl.platform, [])
    map.get(tpl.platform)!.push(tpl)
  }
  if (!map.has('Custom')) map.set('Custom', [CUSTOM_TEMPLATE])
  return map
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

function AboutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
  )
}

function makeCustomId() {
  return 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

export function ResolutionPicker() {
  const setTemplate = useStore((s) => s.setTemplate)
  const loadProject = useStore((s) => s.loadProject)
  const batchImportTemplates = useStore((s) => s.batchImportTemplates)
  const batchImportFolder = useStore((s) => s.batchImportFolder)
  const customPresets = useStore((s) => s.customPresets)
  const loadPreset = useStore((s) => s.loadPreset)
  const removeCustomPreset = useStore((s) => s.removeCustomPreset)
  const renameCustomPreset = useStore((s) => s.renameCustomPreset)
  const language = useStore((s) => s.language)
  const setLanguage = useStore((s) => s.setLanguage)
  const uiScale = useStore((s) => s.uiScale)
  const setUiScale = useStore((s) => s.setUiScale)
  const uiTheme = useStore((s) => s.uiTheme)
  const setUiTheme = useStore((s) => s.setUiTheme)
  const baseTheme = useStore((s) => s.baseTheme)
  const setBaseTheme = useStore((s) => s.setBaseTheme)
  const licenseValid = useStore((s) => s.licenseValid)
  const licenseTier = useStore((s) => s.licenseTier)
  const licenseEmail = useStore((s) => s.licenseEmail)
  const licenseKey = useStore((s) => s.licenseKey)
  const setLicenseValid = useStore((s) => s.setLicenseValid)
  const setError = useStore((s) => s.setError)
  const showLicenseDialog = useStore((s) => s.showLicenseDialog)
  const setShowLicenseDialog = useStore((s) => s.setShowLicenseDialog)
  const setShowReportModal = useStore((s) => s.setShowReportModal)
  const checkCachedLicense = useStore((s) => s.checkCachedLicense)
  const platformGroups = groupByPlatform()
  const [activePlatform, setActivePlatform] = useState(PLATFORM_ORDER[0])
  const [showSettings, setShowSettings] = useState(false)
  const [showCustomRes, setShowCustomRes] = useState(false)
  const [customW, setCustomW] = useState('1920')
  const [customH, setCustomH] = useState('1080')
  const [showAbout, setShowAbout] = useState(false)
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [editingPresetDraft, setEditingPresetDraft] = useState('')

  const handleDeactivateLicense = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('deactivate_license', { licenseKey })
      setLicenseValid(false, 0, '', '')
      setShowLicenseDialog(true)
    } catch (e: any) {
      setError(typeof e === 'string' ? e : e?.message || 'Erro ao desativar licença.')
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r') {
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => { checkCachedLicense() }, [])

  const platformTemplates = platformGroups.get(activePlatform) || []

  const handlePlatformChange = (p: string) => {
    setActivePlatform(p)
  }

  // Group custom presets by exact resolution (W×H) — only show presets from Custom platform
  const customPresetsByRes = useMemo(() => {
    const filtered = customPresets.filter((p) => p.template.platform === 'Custom')
    const groups = new Map<string, { w: number; h: number; presets: typeof customPresets }>()
    for (const p of filtered) {
      const key = `${p.template.width}x${p.template.height}`
      if (!groups.has(key)) groups.set(key, { w: p.template.width, h: p.template.height, presets: [] })
      groups.get(key)!.presets.push(p)
    }
    return Array.from(groups.values()).sort((a, b) => a.w - b.w || a.h - b.h)
  }, [customPresets])

  // Imported presets for the current non-Custom platform, grouped by resolution
  const platformPresetsByRes = useMemo(() => {
    if (activePlatform === 'Custom') return []
    const filtered = customPresets.filter((p) => p.template.platform === activePlatform)
    const groups = new Map<string, { w: number; h: number; presets: typeof customPresets }>()
    for (const p of filtered) {
      const key = `${p.template.width}x${p.template.height}`
      if (!groups.has(key)) groups.set(key, { w: p.template.width, h: p.template.height, presets: [] })
      groups.get(key)!.presets.push(p)
    }
    return Array.from(groups.values()).sort((a, b) => a.w - b.w || a.h - b.h)
  }, [customPresets, activePlatform])

  return (
    <div className="h-screen flex flex-col select-none overflow-hidden" style={{ background: 'var(--bg-main)' }}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 shrink-0" style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3.5">
          <img src="/icon.png" alt="" className="w-9 h-9 rounded-lg" />
          <div>
            <span className="font-bold text-lg tracking-tight" style={{ color: 'var(--text-primary)' }}>{t('app.title')}</span>
            <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{t('app.tagline')}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadProject}
            className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg transition-all border active:scale-[0.97]"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', borderColor: 'var(--border-light)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            {t('header.openProject')}
          </button>
          <button
            onClick={batchImportTemplates}
            className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg transition-all border active:scale-[0.97]"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', borderColor: 'var(--border-light)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {t('header.import')}
          </button>
          <button
            onClick={batchImportFolder}
            className="flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-lg transition-all border active:scale-[0.97]"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', borderColor: 'var(--border-light)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
            {t('header.importFolder')}
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: Platform tabs */}
        <div className="w-52 shrink-0 flex flex-col" style={{ borderRight: '1px solid var(--border)' }}>
          <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
            {PLATFORM_ORDER.filter((p) => platformGroups.has(p)).map((platform) => {
              const isActive = activePlatform === platform
              const count = platformGroups.get(platform)!.length
              return (
                <button
                  key={platform}
                  onClick={() => handlePlatformChange(platform)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-left border ${
                    isActive ? 'bg-accent-15 border-accent-30' : 'border-transparent hover:bg-zinc-800/50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                    isActive ? 'bg-accent-20' : ''
                  }`} style={!isActive ? { background: 'var(--bg-elevated)' } : undefined}>
                    <img src={PLATFORM_ICON[platform]} alt="" className="w-5 h-5 object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold truncate" style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{platform}</div>
                    <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>{t('picker.sizes', { count })}</div>
                  </div>
                </button>
              )
            })}
          </div>
          <div className="px-2 py-2 space-y-0.5" style={{ borderTop: '1px solid var(--border)' }}>
            {!licenseValid && (
              <button
                onClick={() => setShowLicenseDialog(true)}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] transition-all"
                style={{ color: '#f59e0b' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.1)'; e.currentTarget.style.color = '#fbbf24' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#f59e0b' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {t('license.activate')}
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] transition-all"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              <SettingsIcon /> {t('app.settings')}
            </button>
            <button
              onClick={() => setShowAbout(true)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] transition-all"
              style={{ color: 'var(--text-secondary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              <AboutIcon /> {t('app.about')}
            </button>
          </div>
        </div>

        {/* Right: All resolutions + templates */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 overflow-y-auto p-5">
            {activePlatform === 'Custom' ? (
              <>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{t('picker.custom') || 'Custom'}</h2>
                </div>
                {/* Button to create a new custom resolution */}
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 mb-8">
                  <button
                    onClick={() => { setShowCustomRes(true); setCustomW('1920'); setCustomH('1080') }}
                    className="group border-2 border-dashed rounded-xl transition-all text-left flex flex-col items-center justify-center w-full"
                    style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
                  >
                    <div className="relative w-full flex items-center justify-center" style={{ aspectRatio: '16/9', background: 'var(--bg-main)' }}>
                      <div className="flex flex-col items-center justify-center">
                        <div className="text-3xl mb-2" style={{ opacity: 0.4 }}>➕</div>
                        <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('picker.blank')}</div>
                        <div className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--text-dim)' }}>{t('picker.customRes') || 'Resolução personalizada'}</div>
                      </div>
                    </div>
                  </button>
                </div>
                {/* Custom presets grouped by exact resolution */}
                {customPresetsByRes.length > 0 && customPresetsByRes.map((group) => (
                  <div key={`${group.w}x${group.h}`} className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-secondary)' }}>{group.w}×{group.h}</span>
                      <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
                    </div>
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                      {/* Create Blank for this resolution */}
                      <button
                        onClick={() => setTemplate({ id: `custom_${group.w}x${group.h}_${makeCustomId()}`, name: `${group.w}×${group.h}`, platform: 'Custom', width: group.w, height: group.h, icon: '', desc: '' })}
                        className="group border-2 border-dashed rounded-xl transition-all text-left flex flex-col items-center justify-center w-full"
                        style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
                      >
                        <div className="relative w-full flex items-center justify-center" style={{ aspectRatio: `${group.w}/${group.h}`, background: 'var(--bg-main)' }}>
                          <div className="flex flex-col items-center justify-center">
                            <div className="text-3xl mb-2" style={{ opacity: 0.4 }}>➕</div>
                            <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('picker.blank')}</div>
                            <div className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--text-dim)' }}>{group.w}×{group.h}</div>
                          </div>
                        </div>
                      </button>
                      {group.presets.map((p) => {
                        const isEditing = editingPresetId === p.id
                        return (
                          <div key={p.id} className="group relative rounded-xl overflow-hidden transition-all cursor-pointer" style={{ background: 'var(--bg-panel)', border: isEditing ? '1px solid var(--accent)' : '1px solid var(--border)' }} onClick={() => { if (!isEditing) loadPreset(p.id) }}>
                            <div className="relative w-full" style={{ aspectRatio: `${p.template.width}/${p.template.height}`, background: 'var(--bg-main)' }}>
                              {p.preview ? (
                                <img src={p.preview} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-2xl" style={{ opacity: 0.3 }}>{p.icon || '🎨'}</div>
                              )}
                              {!isEditing && (
                                <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100" style={{ background: 'rgba(0,0,0,0.4)' }}>
                                  <button onClick={(e) => { e.stopPropagation(); setEditingPresetId(p.id); setEditingPresetDraft(p.name) }} className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition-colors" style={{ background: 'rgba(255,255,255,0.2)' }} title={t('picker.edit')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); if (confirm(t('picker.confirmDelete', { name: p.name }))) removeCustomPreset(p.id) }} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }} title={t('picker.delete')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="px-3 py-2">
                              {isEditing ? (
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    autoFocus
                                    value={editingPresetDraft}
                                    onChange={(e) => setEditingPresetDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') { const v = editingPresetDraft.trim(); if (v && v !== p.name) renameCustomPreset(p.id, v); setEditingPresetId(null) }
                                      if (e.key === 'Escape') setEditingPresetId(null)
                                    }}
                                    onBlur={() => { const v = editingPresetDraft.trim(); if (v && v !== p.name) renameCustomPreset(p.id, v); setEditingPresetId(null) }}
                                    className="flex-1 min-w-0 rounded-md px-2 py-1 text-xs border focus:outline-none"
                                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', borderColor: 'var(--accent)' }}
                                    placeholder={t('header.promptTemplateName')}
                                  />
                                  <button onClick={() => { const v = editingPresetDraft.trim(); if (v && v !== p.name) renameCustomPreset(p.id, v); setEditingPresetId(null) }} className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-white text-xs" style={{ background: 'var(--accent)' }}>✓</button>
                                  <button onClick={() => setEditingPresetId(null)} className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>✕</button>
                                </div>
                              ) : (
                                <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }} onDoubleClick={(e) => { e.stopPropagation(); setEditingPresetId(p.id); setEditingPresetDraft(p.name) }}>{p.name}</div>
                              )}
                              <div className="text-[9px] font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>{p.template.width}×{p.template.height}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
                {customPresetsByRes.length === 0 && (
                  <div className="text-center py-12" style={{ color: 'var(--text-dim)' }}>
                    <div className="text-3xl mb-3">📂</div>
                    <div className="text-xs">{t('picker.noTemplates') || 'Nenhum template guardado ainda.'}</div>
                    <div className="text-[10px] mt-1">{t('picker.saveHint') || 'Crie um design e guarde como template.'}</div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Non-Custom platform: show ALL resolutions on one page */}
                {platformTemplates.length === 0 && (
                  <div className="text-center py-12" style={{ color: 'var(--text-dim)' }}>
                    <div className="text-xs">{t('picker.noResolutions') || 'Nenhuma resolução disponível.'}</div>
                  </div>
                )}
                {platformTemplates.map((tpl, idx) => {
                  const matchingPresets = platformPresetsByRes.find((g) => g.w === tpl.width && g.h === tpl.height)
                  return (
                  <div key={tpl.id} className={idx > 0 ? 'mt-6' : ''}>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: 'var(--text-secondary)' }}>{tpl.name}</span>
                      <span className="text-[9px] font-mono" style={{ color: 'var(--text-dim)' }}>{tpl.width}×{tpl.height}</span>
                      <div className="h-px flex-1" style={{ background: 'var(--border)' }} />
                    </div>
                    <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                      {/* Create Blank for this resolution */}
                      <button
                        onClick={() => setTemplate(tpl)}
                        className="group border-2 border-dashed rounded-xl transition-all text-left flex flex-col items-center justify-center w-full"
                        style={{ background: 'var(--bg-panel)', borderColor: 'var(--border)' }}
                      >
                        <div className="relative w-full flex items-center justify-center" style={{ aspectRatio: `${tpl.width}/${tpl.height}`, background: 'var(--bg-main)' }}>
                          <div className="flex flex-col items-center justify-center">
                            <div className="text-3xl mb-2" style={{ opacity: 0.4 }}>➕</div>
                            <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{t('picker.blank')}</div>
                            <div className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--text-dim)' }}>{tpl.width}×{tpl.height}</div>
                          </div>
                        </div>
                      </button>
                      {/* Imported presets for this resolution */}
                      {matchingPresets?.presets.map((p) => {
                        const isEditing2 = editingPresetId === p.id
                        return (
                          <div key={p.id} className="group relative rounded-xl overflow-hidden transition-all cursor-pointer" style={{ background: 'var(--bg-panel)', border: isEditing2 ? '1px solid var(--accent)' : '1px solid var(--border)' }} onClick={() => { if (!isEditing2) loadPreset(p.id) }}>
                            <div className="relative w-full" style={{ aspectRatio: `${p.template.width}/${p.template.height}`, background: 'var(--bg-main)' }}>
                              {p.preview ? (
                                <img src={p.preview} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-2xl" style={{ opacity: 0.3 }}>{p.icon || '🎨'}</div>
                              )}
                              {!isEditing2 && (
                                <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100" style={{ background: 'rgba(0,0,0,0.4)' }}>
                                  <button onClick={(e) => { e.stopPropagation(); setEditingPresetId(p.id); setEditingPresetDraft(p.name) }} className="w-8 h-8 rounded-lg flex items-center justify-center text-white transition-colors" style={{ background: 'rgba(255,255,255,0.2)' }} title={t('picker.edit')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); if (confirm(t('picker.confirmDelete', { name: p.name }))) removeCustomPreset(p.id) }} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }} title={t('picker.delete')}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="px-3 py-2">
                              {isEditing2 ? (
                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    autoFocus
                                    value={editingPresetDraft}
                                    onChange={(e) => setEditingPresetDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') { const v = editingPresetDraft.trim(); if (v && v !== p.name) renameCustomPreset(p.id, v); setEditingPresetId(null) }
                                      if (e.key === 'Escape') setEditingPresetId(null)
                                    }}
                                    onBlur={() => { const v = editingPresetDraft.trim(); if (v && v !== p.name) renameCustomPreset(p.id, v); setEditingPresetId(null) }}
                                    className="flex-1 min-w-0 rounded-md px-2 py-1 text-xs border focus:outline-none"
                                    style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', borderColor: 'var(--accent)' }}
                                    placeholder={t('header.promptTemplateName')}
                                  />
                                  <button onClick={() => { const v = editingPresetDraft.trim(); if (v && v !== p.name) renameCustomPreset(p.id, v); setEditingPresetId(null) }} className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-white text-xs" style={{ background: 'var(--accent)' }}>✓</button>
                                  <button onClick={() => setEditingPresetId(null)} className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>✕</button>
                                </div>
                              ) : (
                                <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }} onDoubleClick={(e) => { e.stopPropagation(); setEditingPresetId(p.id); setEditingPresetDraft(p.name) }}>{p.name}</div>
                              )}
                              <div className="text-[9px] font-mono mt-0.5" style={{ color: 'var(--text-dim)' }}>{p.template.width}×{p.template.height}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Settings popup */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowSettings(false)}>
          <div className="rounded-xl shadow-2xl w-80 p-5" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <h2 className="text-sm font-bold mb-5" style={{ color: 'var(--text-primary)' }}>{t('app.settings')}</h2>

            <div className="space-y-5">
              {/* Base Theme */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>{t('app.settingsTheme')}</label>
                <div className="flex gap-1.5">
                  {['padrao', 'dark', 'light'].map((th) => (
                    <button
                      key={th}
                      onClick={() => setBaseTheme(th)}
                      className={`flex-1 text-[11px] py-2 rounded-lg transition-all border ${
                        baseTheme === th ? 'text-accent bg-accent-15 border-accent-30' : ''
                      }`}
                      style={baseTheme !== th ? { color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderColor: 'transparent' } : {}}
                    >
                      {th === 'padrao' ? t('settings.themeDefault') : th.charAt(0).toUpperCase() + th.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent Color */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>{t('app.settingsAccent')}</label>
                <div className="flex gap-2">
                  {ACCENTS.map((ac) => (
                    <button
                      key={ac.id}
                      onClick={() => setUiTheme(ac.id)}
                      className="w-7 h-7 rounded-full transition-all"
                      style={{
                        background: ac.color,
                        outline: uiTheme === ac.id ? `2.5px solid ${ac.color}` : 'none',
                        outlineOffset: 2.5,
                        opacity: uiTheme === ac.id ? 1 : 0.5,
                      }}
                      title={ac.id}
                    />
                  ))}
                </div>
              </div>

              {/* Language */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>{t('app.settingsLanguage')}</label>
                <div className="flex gap-1.5">
                  {(['pt', 'en', 'es'] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLanguage(l)}
                      className={`flex-1 text-[11px] py-2 rounded-lg transition-all border ${
                        language === l ? 'text-accent bg-accent-15 border-accent-30' : ''
                      }`}
                      style={language !== l ? { color: 'var(--text-secondary)', background: 'var(--bg-elevated)', borderColor: 'transparent' } : {}}
                    >
                      {t('settings.lang' + l.charAt(0).toUpperCase() + l.slice(1))}
                    </button>
                  ))}
                </div>
              </div>

              {/* UI Scale */}
              <div>
                <label className="text-[10px] uppercase tracking-wider font-medium block mb-2" style={{ color: 'var(--text-secondary)' }}>{t('app.settingsScale')}</label>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] w-6 text-center" style={{ color: 'var(--text-secondary)' }}>{t('settings.scaleMin')}</span>
                  <input
                    type="range"
                    min="0.6"
                    max="1.5"
                    step="0.05"
                    value={uiScale}
                    onChange={(e) => setUiScale(parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-[10px] w-6 text-center" style={{ color: 'var(--text-secondary)' }}>{t('settings.scaleMax')}</span>
                </div>
                <div className="text-center mt-1" style={{ color: 'var(--text-dim)' }}>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>{Math.round(uiScale * 100)}%</span>
                </div>
              </div>
            </div>

            {licenseValid && (
              <div className="pt-3 border-t border-zinc-700/40 space-y-2">
                <div className="text-[10px] text-zinc-400 font-medium">{t('settings.licenseActive', { tier: licenseTier || '—' })}</div>
                <p className="text-[9px] text-zinc-500">{licenseEmail}</p>
                <button
                  onClick={handleDeactivateLicense}
                  className="text-[9px] px-2 py-1 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 w-full text-left"
                >
                  {t('settings.deactivateLicense')}
                </button>
              </div>
            )}
            <div className="mt-5 text-right">
              <button
                onClick={() => setShowSettings(false)}
                className="text-[10px] px-4 py-1.5 rounded-lg transition-colors"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
              >
                {t('app.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* License Dialog */}
      {showLicenseDialog && <LicenseDialog />}
      <ReportModal />

      {/* Custom Resolution popup */}
      {showCustomRes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowCustomRes(false)}>
          <div className="rounded-xl shadow-2xl w-72 p-5" onClick={(e) => e.stopPropagation()} style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: 'var(--text-primary)' }}>{t('picker.customRes') || 'Resolução personalizada'}</h3>
            <div className="flex items-center gap-2 mb-3">
              <input
                value={customW}
                onChange={(e) => setCustomW(e.target.value.replace(/\D/g, ''))}
                placeholder="1920"
                className="w-full bg-zinc-700/50 rounded px-3 py-2 text-sm text-white border border-zinc-600 focus:outline-none focus:border-blue-500 text-center font-mono"
                onKeyDown={(e) => e.key === 'Enter' && document.getElementById('custom-h-input')?.focus()}
                autoFocus
              />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>×</span>
              <input
                id="custom-h-input"
                value={customH}
                onChange={(e) => setCustomH(e.target.value.replace(/\D/g, ''))}
                placeholder="1080"
                className="w-full bg-zinc-700/50 rounded px-3 py-2 text-sm text-white border border-zinc-600 focus:outline-none focus:border-blue-500 text-center font-mono"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const w = parseInt(customW) || 1920
                    const h = parseInt(customH) || 1080
                    setTemplate({ id: `custom_${w}x${h}_${makeCustomId()}`, name: `${w}×${h}`, platform: 'Custom', width: w, height: h, icon: '', desc: '' })
                    setShowCustomRes(false)
                  }
                }}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCustomRes(false)} className="flex-1 text-[10px] py-2 rounded-lg" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{t('app.close')}</button>
              <button onClick={() => {
                const w = parseInt(customW) || 1920
                const h = parseInt(customH) || 1080
                setTemplate({ id: `custom_${w}x${h}_${makeCustomId()}`, name: `${w}×${h}`, platform: 'Custom', width: w, height: h, icon: '', desc: '' })
                setShowCustomRes(false)
              }} className="flex-1 text-[10px] py-2 rounded-lg text-white font-medium" style={{ background: 'var(--accent)' }}>{t('picker.blank')}</button>
            </div>
          </div>
        </div>
      )}

      {/* About popup */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowAbout(false)}>
          <div className="rounded-2xl shadow-2xl w-72 px-6 py-8 text-center"
            onClick={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
            {/* Logo */}
            <div className="flex justify-center mb-4">
              <img src="/icon.png" alt="Lovert Design" className="w-[72px] h-[72px] object-contain" />
            </div>

            <h3 className="text-base font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>{t('app.title')}</h3>
            <div className="text-[11px] mb-3" style={{ color: 'var(--text-dim)' }}>{t('app.version', { version: APP_VERSION })}</div>

            <p className="text-[11px] leading-relaxed mb-4 px-2" style={{ color: 'var(--text-secondary)' }}>
              {t('app.aboutDesc')}
            </p>

            <div className="text-[10px] mb-5" style={{ color: 'var(--text-dim)' }}>
              {t('app.footer')}
            </div>

            <div className="space-y-2">
              <button
                onClick={() => open('https://lovert.gumroad.com/')}
                className="w-full text-[10px] py-2 rounded-xl transition-all font-medium"
                style={{ background: 'var(--accent)', color: 'white' }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                {t('app.aboutLink')}
              </button>
              <button
                onClick={() => { setShowAbout(false); setShowReportModal(true) }}
                className="w-full text-[10px] py-2 rounded-xl transition-all"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              >
                🚩 {t('app.reportComplaint')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
