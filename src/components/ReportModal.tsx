import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { t } from '@/i18n'
import { useStore } from '@/store'

export function ReportModal() {
  const showReportModal = useStore((s) => s.showReportModal)
  const setShowReportModal = useStore((s) => s.setShowReportModal)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  if (!showReportModal) return null

  const handleSubmit = async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setStatus('sending')
    try {
      const result = await invoke<boolean>('submit_complaint', { message: trimmed })
      if (result) {
        setStatus('sent')
        setTimeout(() => { setShowReportModal(false); setStatus('idle'); setText('') }, 2000)
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-[999] bg-black/60 flex items-center justify-center" onClick={() => { setShowReportModal(false); setStatus('idle'); setText('') }}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-md mx-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-bold text-zinc-200 mb-2">{t('app.reportTitle')}</h2>
        <p className="text-[11px] text-zinc-500 mb-3">{t('app.reportDesc')}</p>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('app.reportPlaceholder')}
          rows={4}
          disabled={status === 'sending' || status === 'sent'}
          className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-[12px] text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-blue-500"
        />

        {status === 'error' && <p className="text-[10px] text-red-400 mt-1">{t('app.reportError')}</p>}
        {status === 'sent' && <p className="text-[10px] text-green-400 mt-1">{t('app.reportSent')}</p>}

        <div className="flex gap-2 mt-3">
          <button
            onClick={handleSubmit}
            disabled={!text.trim() || status === 'sending' || status === 'sent'}
            className="flex-1 text-[10px] py-2 rounded-lg font-medium bg-blue-600/80 hover:bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {status === 'sending' ? t('app.reportSending') : t('app.reportComplaint')}
          </button>
          <button
            onClick={() => { setShowReportModal(false); setStatus('idle'); setText('') }}
            className="text-[10px] py-2 px-4 rounded-lg bg-zinc-700/50 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
          >
            {t('app.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
