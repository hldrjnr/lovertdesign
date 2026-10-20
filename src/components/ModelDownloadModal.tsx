import { useState, useEffect, useCallback } from 'react'
import { t } from '@/i18n'

interface DownloadProgress {
  phase: string
  message: string
  progress: number
}

interface ModelDownloadModalProps {
  model: string
  onComplete: () => void
  onError: (msg: string) => void
}

const PHASE_ICONS: Record<string, string> = {
  checking: '🔍',
  downloading: '📥',
  download_complete: '✅',
  loading: '⚙️',
  complete: '✅',
  error: '❌',
}

export function ModelDownloadModal({ model, onComplete, onError }: ModelDownloadModalProps) {
  const [progress, setProgress] = useState<DownloadProgress>({ phase: 'checking', message: 'Iniciando...', progress: 0 })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let unlisten: (() => void) | undefined
    ;(async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event')
        unlisten = await listen<DownloadProgress>('model-download-progress', (event) => {
          const p = event.payload
          setProgress(p)
          if (p.phase === 'complete') {
            setTimeout(() => onComplete(), 600)
          } else if (p.phase === 'error') {
            onError(p.message)
          }
        })
      } catch {}
    })()
    return () => { unlisten?.() }
  }, [onComplete, onError])

  const handleCancel = useCallback(() => {
    setDismissed(true)
    onError('Download cancelado')
  }, [onError])

  if (dismissed) return null

  const icon = PHASE_ICONS[progress.phase] ?? '⏳'
  const pct = Math.round(progress.progress * 100)
  const isDone = progress.phase === 'complete'
  const isError = progress.phase === 'error'

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center">
      <div className="bg-zinc-900 rounded-xl border border-zinc-700 shadow-2xl w-[340px] overflow-hidden">
        {/* Header */}
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{icon}</span>
            <h3 className="text-sm font-semibold text-white">
              {t('download.title')}
            </h3>
          </div>
          <p className="text-[11px] text-zinc-400">
            {t('download.model', { model })}
          </p>
        </div>

        {/* Progress bar */}
        <div className="px-4 py-3">
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isError ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${isDone || isError ? 100 : Math.max(pct, 2)}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[10px] text-zinc-400">{progress.message}</p>
            {!isDone && !isError && (
              <p className="text-[10px] text-zinc-500 tabular-nums">{pct}%</p>
            )}
          </div>
        </div>

        {/* Phases */}
        <div className="px-4 pb-3 space-y-1">
          {[
            { key: 'checking', label: t('download.phaseCheck') },
            { key: 'downloading', label: t('download.phaseDownload') },
            { key: 'loading', label: t('download.phaseLoad') },
          ].map(({ key, label }, idx) => {
            const phaseOrder = ['checking', 'downloading', 'download_complete', 'loading', 'complete']
            const currentIdx = phaseOrder.indexOf(progress.phase)
            const thisIdx = phaseOrder.indexOf(key)
            const isDone2 = progress.phase === 'error' ? thisIdx < currentIdx : thisIdx < currentIdx || (progress.phase === key)
            const isCurrent = progress.phase === key || (key === 'downloading' && progress.phase === 'download_complete')
            return (
              <div key={key} className="flex items-center gap-2 text-[10px]">
                <span className={isDone2 ? 'text-green-400' : isCurrent ? 'text-blue-400' : 'text-zinc-600'}>
                  {isDone2 ? '✓' : isCurrent ? '●' : '○'}
                </span>
                <span className={isDone2 ? 'text-zinc-400' : isCurrent ? 'text-zinc-200' : 'text-zinc-500'}>
                  {label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-4 pb-3">
          {isError ? (
            <button
              onClick={handleCancel}
              className="w-full py-1.5 text-[10px] rounded-lg bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 transition-colors"
            >
              {t('download.close')}
            </button>
          ) : isDone ? null : (
            <button
              onClick={handleCancel}
              className="w-full py-1.5 text-[10px] rounded-lg bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 transition-colors"
            >
              {t('download.cancel')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
