// Keep built-in accounting channels available even in tenants with only custom methods.
export const validPaymentCode = (code) => typeof code === 'string' && /^[a-z0-9_]{1,64}$/.test(code) && /[a-z]/.test(code);
const standardMethods = [
  ['cash', 'Cash', 'نقدي', 'نقد'],
  ['card', 'Card / Network', 'بطاقة / شبكة', 'کارت / شبکه'],
  ['bank_transfer', 'Bank transfer', 'تحويل بنكي', 'انتقال بانکی'],
  ['online', 'Online', 'إلكتروني', 'آنلاین'],
  ['wallet', 'Wallet', 'محفظة', 'کیف پول'],
  ['credit', 'Customer credit', 'آجل', 'فروش قرضه'],
  ['other', 'Other', 'أخرى', 'سایر'],
].map(([code, name_en, name_ar, name_fa]) => ({ id: `standard-${code}`, code, name_en, name_ar, name_fa, is_active: true }));
export const salesPaymentOptions = (methods = []) => {
  const configured = methods.filter(method => method && validPaymentCode(method.code));
  const codes = new Set(configured.map(method => method.code));
  return [...standardMethods.filter(method => !codes.has(method.code)), ...configured]
    .filter(method => method.is_active !== false);
};
