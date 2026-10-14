// Fictional company logo marks for the demo customers (simple geometric SVGs in each tenant's color).
const MARKS = {
  // Northstar — four-point star
  northstar: <path d="M20 5l3.2 11.8L35 20l-11.8 3.2L20 35l-3.2-11.8L5 20l11.8-3.2z" fill="#fff" />,
  // Crestline — two mountain crests
  crestline: (
    <>
      <path d="M6 29l9-13 6 8 4-5 9 10z" fill="#fff" />
      <path d="M15 16l3 4.3-3-1.3-3 1.3z" fill="currentColor" opacity=".35" />
    </>
  ),
  // Meridian — globe with a meridian
  meridian: (
    <>
      <circle cx="20" cy="20" r="12" fill="none" stroke="#fff" strokeWidth="3" />
      <ellipse cx="20" cy="20" rx="5" ry="12" fill="none" stroke="#fff" strokeWidth="2.4" />
      <path d="M8 20h24" stroke="#fff" strokeWidth="2.4" />
    </>
  ),
  // Vantage — forward chevrons
  vantage: (
    <>
      <path d="M9 11h6l7 9-7 9H9l7-9z" fill="#fff" />
      <path d="M19 11h6l7 9-7 9h-6l7-9z" fill="#fff" opacity=".55" />
    </>
  ),
  // Helix — interlocking strands
  helix: (
    <>
      <path d="M13 7c0 9 14 9 14 13s-14 4-14 13" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M27 7c0 9-14 9-14 13s14 4 14 13" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" opacity=".55" />
    </>
  ),
  // West Region Portfolio — stacked tiles
  'west-portfolio': (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2.5" fill="#fff" />
      <rect x="21" y="8" width="11" height="11" rx="2.5" fill="#fff" opacity=".55" />
      <rect x="8" y="21" width="11" height="11" rx="2.5" fill="#fff" opacity=".55" />
      <rect x="21" y="21" width="11" height="11" rx="2.5" fill="#fff" />
    </>
  )
};

export default function CompanyLogo({ tenantId, color, size = 40 }) {
  return (
    <svg className="co-logo" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" style={{ color }}>
      <rect width="40" height="40" rx="11" fill={color} />
      {MARKS[tenantId] || <circle cx="20" cy="20" r="8" fill="#fff" />}
    </svg>
  );
}
