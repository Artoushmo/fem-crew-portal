/* Icons lifted verbatim from the Claude Design source. They inherit colour via
   currentColor so nav state and card accents stay driven by CSS. */

type IconProps = { size?: number };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  'aria-hidden': true,
} as const;

export function DashboardIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11.5L12 4l9 7.5" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9"
      />
    </svg>
  );
}

export function AssignmentsIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  );
}

export function DocumentsIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3h9l3 3v15H6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 3v3h3" />
    </svg>
  );
}

export function ProfileIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="8" r="3.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 20c0-3.5 3.5-6 7-6s7 2.5 7 6" />
    </svg>
  );
}

export function CalendarIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function LocationIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21s-7-6.5-7-11a7 7 0 1114 0c0 4.5-7 11-7 11z"
      />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function CameraIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.83 6.18A2.31 2.31 0 019 4.75h6a2.31 2.31 0 012.17 1.43l.48 1.44a1 1 0 00.95.68h1.9c1.44 0 2.6 1.16 2.6 2.6v7.5c0 1.44-1.16 2.6-2.6 2.6H3.5c-1.44 0-2.6-1.16-2.6-2.6v-7.5c0-1.44 1.16-2.6 2.6-2.6h1.9a1 1 0 00.95-.68l.48-1.44z"
      />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

export function FeeIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <circle cx="12" cy="12" r="9" />
      <path
        strokeLinecap="round"
        d="M9.5 15.5c0 1 1 1.75 2.5 1.75s2.5-.6 2.5-1.6c0-2.4-5-1-5-3.4 0-1 1-1.6 2.5-1.6s2.5.75 2.5 1.75M12 7.25v1.25M12 15.5v1.25"
      />
    </svg>
  );
}

export function ChevronIcon({ size = 13 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
    </svg>
  );
}

/** Collapse / expand control for the sidebar rail. */
export function PanelIcon({ size = 18 }: IconProps) {
  return (
    <svg width={size} height={size} {...base}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="10" y1="4" x2="10" y2="20" />
    </svg>
  );
}

export function CheckIcon({ size = 16 }: IconProps) {
  return (
    <svg width={size} height={size} {...base} strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 6L9 17l-5-5" />
    </svg>
  );
}
