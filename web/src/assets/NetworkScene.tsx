import { useId } from 'react'

export default function NetworkScene() {
  const uid = useId().replaceAll(':', '')
  const ringId = `${uid}-ring`
  const coreId = `${uid}-core`
  const glowId = `${uid}-glow`
  const cardId = `${uid}-card`
  return (
    <svg viewBox="0 0 520 380" fill="none">
      <defs>
        <linearGradient
          id={ringId}
          x1="90"
          y1="30"
          x2="430"
          y2="350"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="currentColor" stopOpacity=".14" />
          <stop offset=".5" stopColor="currentColor" stopOpacity=".48" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".12" />
        </linearGradient>
        <linearGradient
          id={coreId}
          x1="212"
          y1="142"
          x2="308"
          y2="238"
          gradientUnits="userSpaceOnUse"
        >
          <stop style={{ stopColor: 'var(--px-primary-hover)' }} />
          <stop offset="1" style={{ stopColor: 'var(--px-primary)' }} />
        </linearGradient>
        <linearGradient id={cardId} x1="0" y1="0" x2="0" y2="1">
          <stop style={{ stopColor: 'var(--px-surface)' }} />
          <stop offset="1" style={{ stopColor: 'var(--px-primary-soft)', stopOpacity: 0.65 }} />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop stopColor="currentColor" stopOpacity=".18" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="260" cy="190" r="172" fill={`url(#${glowId})`} />
      <circle cx="260" cy="190" r="148" stroke={`url(#${ringId})`} />
      <circle cx="260" cy="190" r="106" stroke={`url(#${ringId})`} strokeDasharray="3 6" />
      <path
        d="M260 28V42M260 338V352M98 190H112M408 190H422"
        stroke="currentColor"
        strokeOpacity=".28"
        strokeLinecap="round"
      />
      <path
        d="M168 96H198C210 96 218 104 218 116V146M352 96H322C310 96 302 104 302 116V146M168 284H198C210 284 218 276 218 264V234M352 284H322C310 284 302 276 302 264V234"
        stroke="currentColor"
        strokeOpacity=".55"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="218" cy="124" r="3" fill="currentColor" />
      <circle cx="302" cy="124" r="3" fill="currentColor" />
      <circle cx="218" cy="256" r="3" fill="currentColor" />
      <circle cx="302" cy="256" r="3" fill="currentColor" />
      <rect
        x="196"
        y="126"
        width="128"
        height="128"
        rx="28"
        fill="var(--px-surface)"
        stroke="var(--px-primary-border)"
      />
      <rect x="208" y="138" width="104" height="104" rx="22" fill={`url(#${coreId})`} />
      <circle cx="260" cy="190" r="28" stroke="#fff" strokeWidth="1.6" strokeOpacity=".95" />
      <ellipse
        cx="260"
        cy="190"
        rx="12.5"
        ry="28"
        stroke="#fff"
        strokeWidth="1.35"
        strokeOpacity=".82"
      />
      <path
        d="M233 182H287M233 198H287M260 162V218"
        stroke="#fff"
        strokeWidth="1.35"
        strokeOpacity=".82"
      />
      <rect
        x="56"
        y="58"
        width="112"
        height="76"
        rx="12"
        fill={`url(#${cardId})`}
        stroke="var(--px-border)"
      />
      <circle cx="72" cy="72" r="2.2" fill="currentColor" fillOpacity=".55" />
      <circle cx="80" cy="72" r="2.2" fill="currentColor" fillOpacity=".3" />
      <rect x="72" y="82" width="48" height="32" rx="4" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M88 120H104M96 114V120M130 90H150M130 98H145M130 106H148"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <rect
        x="352"
        y="58"
        width="112"
        height="76"
        rx="12"
        fill={`url(#${cardId})`}
        stroke="var(--px-border)"
      />
      <rect x="370" y="71" width="30" height="50" rx="5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M382 114H388M412 84H444M412 94H436M412 104H440"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="444" cy="72" r="3" fill="currentColor" />
      <rect
        x="56"
        y="246"
        width="112"
        height="76"
        rx="12"
        fill={`url(#${cardId})`}
        stroke="var(--px-border)"
      />
      <path
        d="M88 268L101 273V283C101 291.5 94.8 297.6 88 301C81.2 297.6 75 291.5 75 283V273L88 268Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M83.5 284L86.8 287.3L93 280.5M114 278H148M114 288H140"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="352"
        y="246"
        width="112"
        height="76"
        rx="12"
        fill={`url(#${cardId})`}
        stroke="var(--px-border)"
      />
      <rect
        x="370"
        y="264"
        width="76"
        height="16"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <rect
        x="370"
        y="286"
        width="76"
        height="16"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.35"
      />
      <circle cx="379" cy="272" r="2.2" fill="currentColor" />
      <circle cx="379" cy="294" r="2.2" fill="currentColor" />
      <path
        d="M390 272H434M390 294H426"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  )
}
