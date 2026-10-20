export function AppLogo({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" fill="none">
      <rect x="8" y="8" width="240" height="240" rx="48" fill="#14141A" />
      <defs>
        <linearGradient id="logoWarm" x1="0.15" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#FFC107" />
          <stop offset="40%" stopColor="#FF6B2B" />
          <stop offset="100%" stopColor="#E8365D" />
        </linearGradient>
        <linearGradient id="logoCool" x1="0.85" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#02A4F7" />
          <stop offset="50%" stopColor="#006FEE" />
          <stop offset="100%" stopColor="#1A237E" />
        </linearGradient>
      </defs>
      <path d="M48 64 C48 48, 64 40, 80 48 L180 100 C196 108, 208 124, 208 140 L208 180 C208 196, 192 208, 176 200 L76 148 C60 140, 48 124, 48 108 Z" fill="url(#logoWarm)" />
      <path d="M208 64 C208 48, 192 40, 176 48 L76 100 C60 108, 48 124, 48 140 L48 180 C48 196, 64 208, 80 200 L180 148 C196 140, 208 124, 208 108 Z" fill="url(#logoCool)" opacity="0.85" />
      <ellipse cx="172" cy="180" rx="24" ry="28" fill="#F0F0F5" opacity="0.95" />
    </svg>
  )
}

export function IconBackground({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

export function IconImage({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-4l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  )
}

export function IconText({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </svg>
  )
}

export function IconElements({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}
