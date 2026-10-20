import { useState, useEffect } from 'react'
import { t } from '@/i18n'
import { useStore } from '@/store'
import { toCanvas } from 'html-to-image'

function dateStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sanitizeName(s: string) {
  return s.replace(/[^a-zA-Z0-9]/g, '').trim() || t('save.defaultName')
}

export function SaveDialog() {
  const template = useStore((s) => s.template)
  const layers = useStore((s) => s.layers)
  const setShowSaveDialog = useStore((s) => s.setShowSaveDialog)
  const setError = useStore((s) => s.setError)
  const licenseValid = useStore((s) => s.licenseValid)
  const exportCount = useStore((s) => s.exportCount)
  const setExportCount = useStore((s) => s.setExportCount)
  const setShowLicenseDialog = useStore((s) => s.setShowLicenseDialog)

  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp'>('png')
  const [quality, setQuality] = useState(95)
  const [scale, setScale] = useState(1)
  const [saving, setSaving] = useState(false)
  const [exportLimit, setExportLimit] = useState(5)

  useEffect(() => {
    (async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const limit = await invoke<number>('get_export_limit')
        setExportLimit(limit)
      } catch {}
    })()
  }, [])

  if (!template) return null

  const remaining = exportLimit - exportCount
  const isLimited = !licenseValid && remaining <= 0

  const handleSave = async () => {
    if (isLimited) { setShowLicenseDialog(true); return }
    setSaving(true)
    try {
      const exportEl = document.getElementById('canvas-export-target')
      if (!exportEl) throw new Error(t('save.exportTargetNotFound'))

      const { save } = await import('@tauri-apps/plugin-dialog')
      const ext = format === 'jpeg' ? 'jpg' : format
      const baseName = `${sanitizeName(template.name)}_${dateStr()}(${template.width}x${template.height})`
      const outputPath = await save({
        filters: [{ name: format.toUpperCase(), extensions: [ext] }],
        defaultPath: `${baseName}.${ext}`,
      })
      if (!outputPath) { setSaving(false); return }

      // Use a safe scale — html-to-image can fail on very large canvases
      const maxDim = 8000
      const safeScale = (template.width * scale > maxDim || template.height * scale > maxDim)
        ? Math.min(scale, Math.floor(maxDim / Math.max(template.width, template.height)))
        : scale

      const sourceCanvas = await toCanvas(exportEl as HTMLElement, {
        width: template.width,
        height: template.height,
        pixelRatio: safeScale,
      }).catch(async () => {
        // If toCanvas fails (e.g. canvas too large), fallback to 1x
        return toCanvas(exportEl as HTMLElement, {
          width: template.width,
          height: template.height,
          pixelRatio: 1,
        })
      })

      const outW = template.width * safeScale
      const outH = template.height * safeScale
      const finalCanvas = document.createElement('canvas')
      finalCanvas.width = outW
      finalCanvas.height = outH
      const ctx = finalCanvas.getContext('2d')!
      ctx.drawImage(sourceCanvas, 0, 0, outW, outH)

      if (!licenseValid) {
        const w = finalCanvas.width
        const h = finalCanvas.height
        ctx.save()
        ctx.globalAlpha = 0.08
        const wmSize = Math.round(Math.min(w, h) * 0.18)
        ctx.font = `bold ${wmSize}px Arial, sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.save()
        ctx.translate(w / 2, h / 2)
        ctx.rotate(-Math.PI / 6)
        ctx.fillText('LOVERT DESIGN', 0, 0)
        ctx.restore()
        ctx.restore()

        const { invoke } = await import('@tauri-apps/api/core')
        const newCount = await invoke<number>('increment_export_count')
        setExportCount(newCount)
      }

      const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png'
      const blob = await new Promise<Blob>((resolve, reject) => {
        finalCanvas.toBlob((b) => {
          if (b) resolve(b)
          else reject(new Error(t('save.failedCreateBlob')))
        }, mimeType, quality / 100)
      })

      const buf = await blob.arrayBuffer()
      const { writeFile } = await import('@tauri-apps/plugin-fs')
      await writeFile(outputPath, new Uint8Array(buf))

      setShowSaveDialog(false)
      setError(t('save.done'))
      setTimeout(() => setError(null), 3000)
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || e?.toString ? e.toString() : t('error.unknown')
      setError(t('save.error', { msg }))
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={() => setShowSaveDialog(false)}>
      <div className="bg-zinc-800 rounded-xl p-6 w-80 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-white font-semibold mb-4">{t('save.title')}</h2>

        {saving ? (
          <div className="py-4 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-zinc-400">{t('save.rendering')}</p>
            <div className="w-full bg-zinc-700 rounded-full h-1.5 overflow-hidden">
              <div className="bg-blue-500 h-full rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-zinc-400 mb-1">{t('save.format')}</p>
              <div className="flex gap-2">
                {(['png', 'jpeg', 'webp'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={`btn flex-1 text-xs ${format === f ? 'btn-primary' : 'btn-ghost'}`}
                  >
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {!licenseValid && (
              <div className={`text-[10px] px-2 py-1.5 rounded-lg ${remaining <= 0 ? 'bg-red-500/15 text-red-400' : remaining <= 2 ? 'bg-amber-500/15 text-amber-400' : 'bg-zinc-700/50 text-zinc-400'}`}>
                {remaining > 0
                  ? `Exportações restantes sem licença: ${remaining}/${exportLimit} — watermark será adicionado`
                  : 'Limite de exportações sem licença atingido.'
                }
                {remaining <= 0 && (
                  <button
                    onClick={() => { window.open('https://lovert.gumroad.com/l/design', '_blank'); setShowLicenseDialog(true) }}
                    className="ml-2 underline hover:text-white transition-colors"
                  >
                    Comprar licença
                  </button>
                )}
              </div>
            )}

            {format !== 'png' && (
              <div>
                <p className="text-xs text-zinc-400 mb-1">{t('save.quality', { n: quality })}</p>
                <input
                  type="range"
                  min={30}
                  max={100}
                  value={quality}
                  onChange={(e) => setQuality(parseInt(e.target.value))}
                />
              </div>
            )}

            <div>
              <p className="text-xs text-zinc-400 mb-1">{t('save.scale')}</p>
              <div className="flex gap-2">
                {([1, 2, 3] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScale(s)}
                    className={`btn flex-1 text-xs ${scale === s ? 'btn-primary' : 'btn-ghost'}`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-zinc-500">
              {t('save.info', { n: layers.filter(l => l.visible).length, width: template.width * scale, height: template.height * scale })}
            </p>
          </div>
        )}

        <div className="flex gap-2 mt-6">
          {!saving && (
            <>
              <button onClick={() => setShowSaveDialog(false)} className="btn btn-ghost flex-1 text-xs">
                {t('save.cancel')}
              </button>
              <button onClick={handleSave} className={`btn flex-1 text-xs ${isLimited ? 'btn-ghost' : 'btn-green'}`}>
                {isLimited ? 'Ativar licença' : t('save.save')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

type LicenseStatus = 'idle' | 'validating' | 'success' | 'error'

export function LicenseDialog() {
  const showLicenseDialog = useStore((s) => s.showLicenseDialog)
  const setShowLicenseDialog = useStore((s) => s.setShowLicenseDialog)
  const setLicenseValid = useStore((s) => s.setLicenseValid)
  const exportCount = useStore((s) => s.exportCount)

  const [key, setKey] = useState('')
  const [status, setStatus] = useState<LicenseStatus>('idle')
  const [message, setMessage] = useState('')

  if (!showLicenseDialog) return null

  const handleActivate = async () => {
    const trimmed = key.trim()
    if (!trimmed) { setStatus('error'); setMessage('Insira uma chave de licença.'); return }
    setStatus('validating')
    setMessage('')
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const result = await invoke<{success: boolean; message: string; uses?: number; email?: string; tier?: string}>('verify_license_key', { licenseKey: trimmed })
      if (result.success) {
        setStatus('success')
        setMessage(result.message)
        setLicenseValid(true, result.uses ?? 0, result.email ?? '', result.tier ?? '')
        setTimeout(() => setShowLicenseDialog(false), 1200)
      } else {
        setStatus('error')
        setMessage(result.message)
      }
    } catch (e: any) {
      setStatus('error')
      setMessage(typeof e === 'string' ? e : e?.message || 'Erro de conexão. Tente novamente.')
    }
  }

  return (
    <div className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center" onClick={() => setShowLicenseDialog(false)}>
      <div className="bg-zinc-800 rounded-xl p-6 w-96 shadow-2xl border border-zinc-700" onClick={(e) => e.stopPropagation()}>
        <div className="text-center mb-5">
          <div className="text-3xl mb-2">
            {status === 'validating' ? '⏳' : status === 'success' ? '✅' : status === 'error' ? '❌' : '🔑'}
          </div>
          <h2 className="text-white font-bold text-base">Ativar Lovert Design</h2>
          <p className="text-[11px] text-zinc-400 mt-1">Insira sua chave de licença para remover a marca d'água e o limite de exportações.</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] text-zinc-500 block mb-1">Chave de Licença</label>
            <input
              value={key}
              onChange={(e) => { setKey(e.target.value); setStatus('idle'); setMessage('') }}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              disabled={status === 'validating' || status === 'success'}
              className="w-full bg-zinc-700/50 rounded-lg px-3 py-2 text-sm text-white border border-zinc-600 focus:outline-none focus:border-blue-500 font-mono tracking-wider disabled:opacity-50"
              onKeyDown={(e) => e.key === 'Enter' && status !== 'validating' && handleActivate()}
              autoFocus
            />
            {message && (
              <p className={`text-[10px] mt-1 ${status === 'error' ? 'text-red-400' : status === 'success' ? 'text-green-400' : 'text-zinc-400'}`}>
                {message}
              </p>
            )}
          </div>

          {exportCount > 0 && (
            <p className="text-[10px] text-zinc-500 text-center">Exportações realizadas: {exportCount}</p>
          )}

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => window.open('https://lovert.gumroad.com/l/design', '_blank')}
              disabled={status === 'validating'}
              className="btn flex-1 text-xs disabled:opacity-50 bg-zinc-700 hover:bg-zinc-600 text-white"
            >
              Comprar licença
            </button>
            <button
              onClick={() => setShowLicenseDialog(false)}
              disabled={status === 'validating'}
              className="btn btn-ghost flex-1 text-xs disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleActivate}
              disabled={status === 'validating' || status === 'success'}
              className={`btn flex-1 text-xs disabled:opacity-50 ${
                status === 'success' ? 'btn-green' : 'btn-primary'
              }`}
            >
              {status === 'validating' ? 'A validar...' : status === 'success' ? 'Ativada!' : 'Ativar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
