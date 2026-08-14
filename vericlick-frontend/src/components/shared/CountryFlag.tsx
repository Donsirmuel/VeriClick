// Compact inline-SVG country flags (no emoji, no CDN). Covers the most common
// traffic-source countries; anything else falls back to a neutral badge with
// the ISO code. Flags are drawn from simple stripe/circle specs so the bundle
// stays tiny and dependency-free.

interface FlagSpec {
  // 'h' = horizontal stripes (top -> bottom), 'v' = vertical (left -> right).
  direction?: 'h' | 'v'
  colors: string[]
  // A centered circle overlay (e.g. Japan, India, Argentina).
  circle?: string
  circleY?: number
}

const FLAGS: Record<string, FlagSpec> = {
  US: { direction: 'h', colors: ['#B22234', '#fff', '#B22234', '#fff', '#B22234', '#fff', '#B22234', '#fff', '#B22234', '#fff', '#B22234', '#fff', '#B22234'] },
  GB: { direction: 'h', colors: ['#012169', '#012169', '#012169', '#fff', '#012169', '#012169', '#012169', '#012169', '#012169', '#fff', '#012169', '#012169', '#012169'] },
  CA: { direction: 'h', colors: ['#D52B1E', '#D52B1E', '#fff', '#fff', '#fff', '#fff', '#fff', '#fff', '#fff', '#fff', '#fff', '#D52B1E', '#D52B1E'] },
  NG: { direction: 'v', colors: ['#008751', '#fff', '#008751'] },
  CN: { colors: ['#DE2910'], circle: '#FFDE00', circleY: 0.5 },
  IN: { colors: ['#FF9933', '#fff', '#138808'], circle: '#000080', circleY: 0.5 },
  BR: { colors: ['#009C3B', '#FFDF00', '#002776', '#FFDF00', '#009C3B'], circle: '#002776', circleY: 0.5 },
  DE: { colors: ['#000', '#DD0000', '#FFCE00'] },
  FR: { direction: 'v', colors: ['#002654', '#fff', '#CE1126'] },
  IT: { direction: 'v', colors: ['#009246', '#fff', '#CE2B37'] },
  ES: { colors: ['#AA151B', '#F1BF00', '#AA151B'] },
  JP: { colors: ['#fff'], circle: '#BC002D', circleY: 0.5 },
  KR: { colors: ['#fff'], circle: '#CD2E3A', circleY: 0.35 },
  RU: { colors: ['#fff', '#0039A6', '#D52B1E'] },
  MX: { direction: 'v', colors: ['#006847', '#fff', '#CE1126'], circle: '#8B5A2B', circleY: 0.5 },
  AR: { colors: ['#74ACDF', '#fff', '#74ACDF'], circle: '#F6B40E', circleY: 0.5 },
  AU: { colors: ['#012169', '#fff', '#C8102E', '#fff', '#012169'] },
  ZA: { colors: ['#007A4D', '#FFB612', '#DE3831', '#FFB612', '#007A4D'] },
  AE: { direction: 'v', colors: ['#CE1126', '#00732F', '#fff', '#000'] },
  SA: { colors: ['#006C35', '#fff', '#006C35'] },
  TR: { colors: ['#E30A17'], circle: '#fff', circleY: 0.5 },
  ID: { colors: ['#CE1126', '#fff'] },
  PH: { colors: ['#0038A8', '#CE1126'] },
  VN: { colors: ['#DA251D'], circle: '#FFCD00', circleY: 0.5 },
  TH: { colors: ['#A51931', '#F4F5F8', '#A51931', '#F4F5F8', '#A51931'] },
  SG: { colors: ['#EF3340', '#fff'], circle: '#fff', circleY: 0.3 },
  PK: { colors: ['#01411C', '#fff'], circle: '#fff', circleY: 0.5 },
  BD: { colors: ['#006A4E'], circle: '#F42A41', circleY: 0.5 },
  CL: { colors: ['#fff', '#D52B1E'], circle: '#0039A6', circleY: 0.3 },
  CO: { colors: ['#FCD116', '#FCD116', '#003893', '#CE1126'] },
  PT: { colors: ['#046A38', '#FF293B', '#FF293B'], circle: '#FFE900', circleY: 0.5 },
  NL: { colors: ['#AE1C28', '#fff', '#21468B'] },
  BE: { direction: 'v', colors: ['#000', '#FDDA24', '#EF3340'] },
  GR: { colors: ['#0D5EAF', '#fff', '#0D5EAF'] },
  SE: { colors: ['#006AA7', '#FECC00', '#FECC00', '#006AA7', '#006AA7'] },
  NO: { colors: ['#BA0C2F', '#BA0C2F', '#00205B', '#fff', '#00205B', '#BA0C2F', '#BA0C2F'] },
  DK: { colors: ['#C8102E', '#C8102E', '#fff', '#C8102E', '#C8102E'] },
  FI: { colors: ['#fff', '#fff', '#003580', '#003580', '#fff', '#fff', '#fff'] },
  PL: { colors: ['#fff', '#DC143C'] },
  UA: { colors: ['#005BBB', '#FFD500'] },
  NZ: { colors: ['#00247D', '#fff', '#CC142B', '#fff', '#00247D'] },
  GH: { colors: ['#CE1126', '#FCD116', '#006B3F'] },
  KE: { colors: ['#000', '#fff', '#BB0000', '#fff', '#009A00'] },
  ET: { colors: ['#078930', '#FCDD09', '#DA121A'] },
  EG: { colors: ['#CE1126', '#fff', '#000'] },
}

// The US and GB stripes above render as approximate bars; give both proper
// rendered layouts so the two most-common sources look right.
const US_LAYOUT = (
  <>
    <rect width="16" height="11" fill="#B22234" />
    {Array.from({ length: 5 }, (_, i) => (
      <rect key={i} y={2 + i * 2} width="16" height="1" fill="#fff" />
    ))}
    <rect width="7" height="6" fill="#3C3B6E" />
  </>
)

const GB_LAYOUT = (
  <>
    <rect width="16" height="11" fill="#012169" />
    <path d="M0 0l16 11M16 0L0 11" stroke="#fff" strokeWidth="2.4" />
    <path d="M0 0l16 11M16 0L0 11" stroke="#C8102E" strokeWidth="1.2" />
    <path d="M8 0v11M0 5.5h16" stroke="#fff" strokeWidth="4" />
    <path d="M8 0v11M0 5.5h16" stroke="#C8102E" strokeWidth="2" />
  </>
)

function renderSpec(spec: FlagSpec): React.ReactNode {
  const stripes = spec.colors.map((color, i) => {
    if (spec.direction === 'v') {
      const w = 16 / spec.colors.length
      return <rect key={i} x={i * w} width={w} height="11" fill={color} />
    }
    const h = 11 / spec.colors.length
    return <rect key={i} y={i * h} width="16" height={h + 0.5} fill={color} />
  })
  const cy = (spec.circleY ?? 0.5) * 11
  return (
    <>
      {stripes}
      {spec.circle && <circle cx="8" cy={cy} r="2.4" fill={spec.circle} />}
    </>
  )
}

function FlagSvg({ code }: { code: string }) {
  const viewBox = '0 0 16 11'
  const spec = FLAGS[code]
  if (code === 'US') return <svg viewBox={viewBox}>{US_LAYOUT}</svg>
  if (code === 'GB') return <svg viewBox={viewBox}>{GB_LAYOUT}</svg>
  if (spec) return <svg viewBox={viewBox}>{renderSpec(spec)}</svg>
  // Unknown country: a neutral badge with the ISO code.
  return (
    <span className="inline-flex items-center justify-center rounded-[3px] bg-neutral-100 text-[8px] font-bold text-muted">
      {code}
    </span>
  )
}

export function CountryFlag({ code, className }: { code: string; className?: string }) {
  const c = (code || '').toUpperCase()
  return (
    <span
      className={className ?? 'inline-block w-6 h-4 rounded-[3px] overflow-hidden ring-1 ring-neutral-200 shrink-0'}
    >
      <FlagSvg code={c} />
    </span>
  )
}

export function countryName(code: string): string {
  const c = (code || '').toUpperCase()
  const names: Record<string, string> = {
    US: 'United States', GB: 'United Kingdom', CA: 'Canada', NG: 'Nigeria',
    CN: 'China', IN: 'India', BR: 'Brazil', DE: 'Germany', FR: 'France',
    JP: 'Japan', AU: 'Australia', ZA: 'South Africa', MX: 'Mexico', AR: 'Argentina',
    KR: 'South Korea', IT: 'Italy', ES: 'Spain', RU: 'Russia', AE: 'United Arab Emirates',
    SA: 'Saudi Arabia', TR: 'Turkey', ID: 'Indonesia', PH: 'Philippines', VN: 'Vietnam',
    TH: 'Thailand', SG: 'Singapore', PK: 'Pakistan', BD: 'Bangladesh', CL: 'Chile',
    CO: 'Colombia', PT: 'Portugal', NL: 'Netherlands', BE: 'Belgium', GR: 'Greece',
    SE: 'Sweden', NO: 'Norway', DK: 'Denmark', FI: 'Finland', PL: 'Poland',
    UA: 'Ukraine', NZ: 'New Zealand', GH: 'Ghana', KE: 'Kenya', ET: 'Ethiopia',
    EG: 'Egypt',
  }
  return names[c] ?? c
}
// A common list for the picker in the Countries tab and the dashboard block
// button, ordered roughly by global traffic.
export const COMMON_COUNTRIES: string[] = [
  'US', 'GB', 'CA', 'CN', 'IN', 'BR', 'DE', 'FR', 'JP', 'AU',
  'NG', 'ZA', 'MX', 'AR', 'KR', 'IT', 'ES', 'RU', 'AE', 'SA',
  'TR', 'ID', 'PH', 'VN', 'TH', 'SG', 'PK', 'BD', 'NL', 'PL',
]
