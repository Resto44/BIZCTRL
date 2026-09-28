/** Approved option 4: a scalable four-tile mark and high-contrast wordmark. */
export default function BrandLogo({ icon = false, tone = 'dark', className = '' }) {
  return <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="BizCTRL" viewBox={icon ? '0 0 88 88' : '0 0 430 88'} className={`shrink-0 ${className}`} style={{ aspectRatio: icon ? '1' : '430 / 88' }}>
    <path fill="#009CF5" d="M4 29a14 14 0 0 1 14-14h18v30H4Z" />
    <path fill="#00CEE8" d="M43 17A17 17 0 0 1 60 0h24v27a18 18 0 0 1-18 18H43Z" />
    <path fill="#0089F4" d="M4 51h32v33H18A14 14 0 0 1 4 70Z" />
    <path fill="#00B4F2" d="M43 51h23a18 18 0 0 1 18 18v15H43Z" />
    {!icon && <text x="100" y="70" textLength="325" lengthAdjust="spacingAndGlyphs" fontFamily="Arial, Helvetica, sans-serif" fontWeight="800" fontSize="76"><tspan fill={tone === 'light' ? '#102541' : '#FFFFFF'}>Biz</tspan><tspan fill="#00C5EC">CTRL</tspan></text>}
  </svg>;
}
