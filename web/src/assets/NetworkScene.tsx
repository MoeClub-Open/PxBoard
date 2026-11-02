export default function NetworkScene() {
  return (
    <svg viewBox="0 0 560 480" fill="none">
      <defs>
        <linearGradient id="orbit" x1="80" y1="40" x2="490" y2="420" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity=".18" />
          <stop offset=".5" stopColor="currentColor" stopOpacity=".7" />
          <stop offset="1" stopColor="currentColor" stopOpacity=".08" />
        </linearGradient>
        <linearGradient id="hub" x1="212" y1="163" x2="350" y2="302" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--px-primary-hover)" />
          <stop offset="1" stopColor="var(--px-primary)" />
        </linearGradient>
        <linearGradient
          id="panel"
          x1="75"
          y1="105"
          x2="135"
          y2="200"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="var(--px-surface)" />
          <stop offset="1" stopColor="var(--px-primary-soft)" />
        </linearGradient>
        <radialGradient id="halo">
          <stop stopColor="currentColor" stopOpacity=".19" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
        <filter id="shadow" x="150" y="100" width="270" height="280" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="16" />
        </filter>
      </defs>
      <circle cx="282" cy="234" r="225" fill="url(#halo)" />
      <circle cx="282" cy="234" r="196" stroke="url(#orbit)" />
      <circle cx="282" cy="234" r="148" stroke="url(#orbit)" strokeDasharray="3 8" />
      <ellipse
        cx="282"
        cy="234"
        rx="244"
        ry="102"
        transform="rotate(-31 282 234)"
        stroke="url(#orbit)"
      />
      <path
        d="M113 151C174 151 179 231 232 231M444 122C390 122 389 199 334 215M439 341C383 341 383 258 333 250M164 372C218 372 208 286 259 274"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="190" cy="204" r="4" fill="currentColor" />
      <circle cx="388" cy="165" r="4" fill="currentColor" />
      <circle cx="389" cy="299" r="4" fill="currentColor" />
      <circle cx="282" cy="250" r="67" fill="currentColor" opacity=".23" filter="url(#shadow)" />
      <rect x="214" y="166" width="136" height="136" rx="39" fill="url(#hub)" />
      <rect
        x="214.5"
        y="166.5"
        width="135"
        height="135"
        rx="38.5"
        stroke="var(--px-primary-border)"
        strokeOpacity=".6"
      />
      <circle cx="282" cy="234" r="34" stroke="#fff" strokeWidth="1.7" strokeOpacity=".95" />
      <ellipse
        cx="282"
        cy="234"
        rx="15"
        ry="34"
        stroke="#fff"
        strokeWidth="1.5"
        strokeOpacity=".8"
      />
      <path
        d="M249 225H315M249 244H315M282 200V268"
        stroke="#fff"
        strokeWidth="1.5"
        strokeOpacity=".8"
      />
      <rect
        x="61"
        y="111"
        width="104"
        height="80"
        rx="17"
        fill="url(#panel)"
        stroke="var(--px-primary-border)"
      />
      <rect x="83" y="129" width="60" height="38" rx="5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M100 175H126M113 168V175"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect
        x="412"
        y="77"
        width="65"
        height="95"
        rx="18"
        fill="url(#panel)"
        stroke="var(--px-primary-border)"
      />
      <rect x="423" y="89" width="43" height="63" rx="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M441 160H449" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect
        x="395"
        y="310"
        width="90"
        height="65"
        rx="17"
        fill="url(#panel)"
        stroke="var(--px-primary-border)"
      />
      <path
        d="M420 349H460V344C460 338 455 334 450 335C448 323 430 323 428 335C417 333 412 348 420 349Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="164" cy="372" r="28" fill="url(#panel)" stroke="var(--px-primary-border)" />
      <path
        d="M164 357L175 362V371C175 378 169 383 164 386C159 383 153 378 153 371V362L164 357Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M159 371L163 375L170 367"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="297" cy="39" r="4" fill="currentColor" />
      <circle cx="85" cy="280" r="3" fill="currentColor" />
      <circle cx="302" cy="430" r="3" fill="currentColor" />
      <circle cx="487" cy="218" r="3" fill="currentColor" />
    </svg>
  )
}
