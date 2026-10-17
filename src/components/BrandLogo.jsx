/** The approved glossy icon is an ordinary HTML image: iOS Safari must not
 * lay out Latin SVG text in an inherited RTL viewport. Business/tenant logos
 * are separate and unaffected by this corporate mark.
 */
export default function BrandLogo({ icon = false, tone = 'dark', className = '' }) {
  const file = '/icons/bizctrl-icon-192-v3.png';
  if (icon) {
    return (
      <img src={file} width="88" height="88" alt="BizCTRL"
        decoding="async" draggable="false" translate="no" dir="ltr"
        className={`block aspect-square shrink-0 object-contain ${className}`} />
    );
  }

  return (
    <span dir="ltr" translate="no" aria-label="BizCTRL"
      className={`inline-flex max-w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap align-middle notranslate ${className}`}>
      <img src={file} width="88" height="88" alt="" aria-hidden="true"
        decoding="async" draggable="false" className="block h-full max-h-20 w-auto shrink-0 aspect-square object-contain" />
      <span dir="ltr" className="inline-flex shrink-0 items-baseline text-[clamp(1.1rem,2.5vw,2.4rem)] font-extrabold leading-none tracking-tight"
        style={{ direction: 'ltr', unicodeBidi: 'isolate', fontFamily: '-apple-system, BlinkMacSystemFont, Inter, Arial, sans-serif' }}>
        <span style={{ color: tone === 'light' ? '#11274F' : '#FFFFFF' }}>Biz</span><span style={{ color: '#00C5EC' }}>CTRL</span>
      </span>
    </span>
  );
}
