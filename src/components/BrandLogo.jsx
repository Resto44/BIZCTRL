/** Single canonical BizCTRL corporate mark; tenant restaurant logos are separate. */
export default function BrandLogo({ icon = false, tone = 'dark', className = '' }) {
  const foreground = tone === 'light' ? '#11274F' : '#FFFFFF';
  return <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="BizCTRL"
    viewBox={icon ? '0 0 88 88' : '0 0 430 88'}
    className={`shrink-0 ${className}`}
    style={{ aspectRatio: icon ? '1' : '430 / 88' }}>
    <image href="/icons/bizctrl-icon-192-v3.png" x="0" y="0" width="88" height="88"
      preserveAspectRatio="xMidYMid meet" />
    {!icon && <text x="100" y="67" textLength="320" lengthAdjust="spacingAndGlyphs"
      fontFamily="-apple-system, BlinkMacSystemFont, Arial, sans-serif"
      fontWeight="800" fontSize="76">
      <tspan fill={foreground}>Biz</tspan><tspan fill="#00C5EC">CTRL</tspan>
    </text>}
  </svg>;
}
