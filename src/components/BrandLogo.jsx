/** Render the supplied artwork without its large outer photo margins. */
export default function BrandLogo({ icon = false, className = '' }) {
  return <svg role="img" aria-label="BizCTRL" viewBox={icon ? '30 395 370 420' : '30 395 1195 420'} className={`shrink-0 rounded-md bg-white ${className}`} style={{ aspectRatio: icon ? '370 / 420' : '1195 / 420' }}>
    <image href="/brand/bizctrl-logo.jpg" width="1254" height="1254" />
  </svg>;
}
