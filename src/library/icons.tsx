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
