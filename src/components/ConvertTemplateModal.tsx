import { useState, useMemo } from 'react'
import { t } from '@/i18n'
import { TEMPLATES, type Template } from '@/types'
import { useStore } from '@/store'

interface ConvertTemplateModalProps {
  onClose: () => void
}

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

function groupByPlatform(): Map<string, Template[]> {
  const map = new Map<string, Template[]>()
  for (const tpl of TEMPLATES) {
    if (!map.has(tpl.platform)) map.set(tpl.platform, [])
    map.get(tpl.platform)!.push(tpl)
  }
  return map
}

export function ConvertTemplateModal({ onClose }: ConvertTemplateModalProps) {
  const currentTemplate = useStore((s) => s.template)
  const convertTemplate = useStore((s) => s.convertTemplate)
  const platformGroups = useMemo(() => groupByPlatform(), [])
  const [activePlatform, setActivePlatform] = useState<string>(
    currentTemplate?.platform && platformGroups.has(currentTemplate.platform)
      ? currentTemplate.platform
      : PLATFORM_ORDER[0]
  )
  const [customW, setCustomW] = useState(1920)
  const [customH, setCustomH] = useState(1080)
  const [showCustom, setShowCustom] = useState(false)

  if (!currentTemplate) return null

  const handleConvert = (target: Template) => {
    convertTemplate(target, t('header.convertCopySuffix'))
    onClose()
  }

  const handleCustomConvert = () => {
    const target: Template = {
      id: 'custom-' + Date.now().toString(36),
      name: `${customW}×${customH} ${t('header.customSuffix')}`,
      platform: 'Custom',
      width: customW,
      height: customH,
      icon: '',
      desc: '',
    }
    convertTemplate(target, t('header.convertCopySuffix'))
    onClose()
  }

  const resolutions = platformGroups.get(activePlatform) || []

  return (
    <div className="fixed inset-0 z-[300000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-zinc-800 shrink-0">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>🔄</span>
            <span>{t('header.convertTitle')}</span>
          </h2>
          <p className="text-[0.6875rem] text-zinc-400 mt-1">{t('header.convertDesc')}</p>
          <div className="mt-2 flex items-center gap-2 text-[0.625rem] text-zinc-500">
            <span>Actual:</span>
            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">{currentTemplate.name} · {currentTemplate.width}×{currentTemplate.height}</span>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="w-44 shrink-0 border-r border-zinc-800 p-2 overflow-y-auto">
            {PLATFORM_ORDER.map((plat) => {
              const list = platformGroups.get(plat) || (plat === 'Custom' ? [] : [])
              const isActive = activePlatform === plat
              const icon = PLATFORM_ICON[plat] || '/icon.png'
              return (
                <button
                  key={plat}
                  onClick={() => { setActivePlatform(plat); setShowCustom(false) }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[0.6875rem] font-medium transition-colors mb-0.5
                    ${isActive ? 'bg-blue-600/20 text-blue-300' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'}`}
                >
                  {plat === 'Custom' ? <span>✨</span> : <img src={icon} alt="" className="w-3.5 h-3.5 object-contain" />}
                  <span className="truncate flex-1 text-left">{plat}</span>
                  <span className="text-[0.5625rem] text-zinc-500">{list.length}</span>
                </button>
              )
            })}
          </div>

          <div className="flex-1 p-3 overflow-y-auto">
            {activePlatform === 'Custom' ? (
              <div className="space-y-3">
                <div className="bg-zinc-800/30 rounded-lg p-3">
                  <p className="text-[0.625rem] text-zinc-400 font-medium mb-2">{t('picker.customRes')}</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="text-[0.5625rem] text-zinc-500 block mb-0.5">Largura</label>
                      <input
                        type="number"
                        value={customW}
                        onChange={(e) => setCustomW(Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-full bg-zinc-700/50 rounded px-2 py-1 text-[0.6875rem] text-white border border-zinc-600 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[0.5625rem] text-zinc-500 block mb-0.5">Altura</label>
                      <input
                        type="number"
                        value={customH}
                        onChange={(e) => setCustomH(Math.max(1, parseInt(e.target.value) || 0))}
                        className="w-full bg-zinc-700/50 rounded px-2 py-1 text-[0.6875rem] text-white border border-zinc-600 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleCustomConvert}
                  className="w-full py-2 rounded-lg bg-blue-600/80 hover:bg-blue-600 text-white text-[0.6875rem] font-medium transition-colors"
                >
                  ✓ {t('picker.blank')} ({customW}×{customH})
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {resolutions.map((tpl) => {
                  const isCurrent = tpl.id === currentTemplate.id
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => !isCurrent && handleConvert(tpl)}
                      disabled={isCurrent}
                      className={`text-left p-2.5 rounded-lg border transition-colors
                        ${isCurrent
                          ? 'border-zinc-800 bg-zinc-800/20 opacity-50 cursor-not-allowed'
                          : 'border-zinc-700 bg-zinc-800/30 hover:bg-zinc-800/60 hover:border-blue-500/40'}`}
                    >
                      <div className="flex items-center gap-2">
                        {PLATFORM_ICON[tpl.platform] ? (
                          <img src={PLATFORM_ICON[tpl.platform]} alt="" className="w-4 h-4 object-contain" />
                        ) : (
                          <span className="w-4 h-4" />
                        )}
                        <span className="text-[0.6875rem] font-medium text-zinc-200 truncate flex-1">{tpl.name}</span>
                      </div>
                      <p className="text-[0.625rem] text-zinc-500 mt-1 ml-6">{tpl.width}×{tpl.height}</p>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="p-3 border-t border-zinc-800 shrink-0 flex items-center justify-between gap-3">
          <p className="text-[0.625rem] text-zinc-500">
            Tudo será redimensionado proporcionalmente para caber no novo canvas, como se tivesse selecionado todas as camadas e arrastado o canto — sem distorções nem alterações internas (contornos, cantos, etc.).
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[0.6875rem] transition-colors shrink-0"
          >
            {t('app.close')}
          </button>
        </div>
      </div>
    </div>
  )
}
