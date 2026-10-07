// One stroke family for every Library control: 24px grid, 2px round strokes,
// solid fills only for play/pause where weight signals the primary action.
type IconProps = { size?: number; className?: string }

const base = (size = 22) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
})

export function IconPlay({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.2-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconPause({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function SkipArc({ size, className, back, label }: IconProps & { back: boolean; label: string }) {
  return (
    <svg {...base(size)} className={className}>
      {back ? (
        <>
          <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
          <path d="M4.5 3.5v3.7h3.7" />
        </>
      ) : (
        <>
          <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
          <path d="M19.5 3.5v3.7h-3.7" />
        </>
      )}
      <text
        x="12"
        y="15.4"
        textAnchor="middle"
        fontSize="7.6"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
        fontFamily="system-ui, sans-serif"
      >
        {label}
      </text>
    </svg>
  )
}

export const IconBack15 = (p: IconProps) => <SkipArc {...p} back label="15" />
export const IconForward30 = (p: IconProps) => <SkipArc {...p} back={false} label="30" />

export function IconPrev({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 5v14" />
      <path d="M18 6.2v11.6a.8.8 0 0 1-1.25.66L9 12.66a.8.8 0 0 1 0-1.32l7.75-5.8A.8.8 0 0 1 18 6.2Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconNext({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M18 5v14" />
      <path d="M6 6.2v11.6a.8.8 0 0 0 1.25.66L15 12.66a.8.8 0 0 0 0-1.32L7.25 5.54A.8.8 0 0 0 6 6.2Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconMoon({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
    </svg>
  )
}

export function IconChevronDown({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function IconChevronLeft({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  )
}

export function IconBook({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5Z" />
      <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3" />
    </svg>
  )
}

export function IconChevronRight({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

export function IconClose({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

export function IconCheck({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  )
}

/** Speaker; `level` 0 draws no waves, 1 one wave, 2 two waves. */
export function IconVolume({ size, className, level = 2 }: IconProps & { level?: 0 | 1 | 2 }) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5Z" fill="currentColor" stroke="currentColor" strokeWidth={1.6} />
      {level >= 1 && <path d="M15.2 9.4a3.8 3.8 0 0 1 0 5.2" />}
      {level >= 2 && <path d="M17.9 6.8a7.6 7.6 0 0 1 0 10.4" />}
    </svg>
  )
}

export function IconMute({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5Z" fill="currentColor" stroke="currentColor" strokeWidth={1.6} />
      <path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
    </svg>
  )
}

export function IconHeadphones({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3.5" y="14" width="4.5" height="6.5" rx="1.6" />
      <rect x="16" y="14" width="4.5" height="6.5" rx="1.6" />
    </svg>
  )
}

export function IconBookOpen({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12 6.5C10 5 7.4 4.5 3.5 4.8v13.4c3.9-.3 6.5.2 8.5 1.8 2-1.6 4.6-2.1 8.5-1.8V4.8C16.6 4.5 14 5 12 6.5Z" />
      <path d="M12 6.5V20" />
    </svg>
  )
}

export function IconList({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth={2.6} />
    </svg>
  )
}

export function IconBookmark({ size, className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6.5 4.5h11a.5.5 0 0 1 .5.5v15.2l-6-4-6 4V5a.5.5 0 0 1 .5-.5Z" fill={filled ? 'currentColor' : 'none'} />
    </svg>
  )
}

export function IconTextSize({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3.5 18.5 8 7l4.5 11.5M5.2 14.5h5.6" />
      <path d="M14 18.5 17.2 10l3.3 8.5M15.2 15.6h4.2" />
    </svg>
  )
}

export function IconSearch({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </svg>
  )
}

export function IconHighlight({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="m14.5 4.5 5 5-8.8 8.8H5.7v-5Z" />
      <path d="M4 20.5h16" />
    </svg>
  )
}

export function IconTrash({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4.5 7h15M10 7V4.8h4V7M6.5 7l.9 12.2a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7" />
    </svg>
  )
}

export function IconRetry({ size, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5" />
      <path d="M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5" />
      <path d="M4 20v-4.5h4.5" />
    </svg>
  )
}
