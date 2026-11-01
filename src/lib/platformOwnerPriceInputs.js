// UI uses USD major currency units; all plan RPCs and Paddle prices use minor units.
// Keep the draft string separately so "12." and "12.0" remain editable.
export function centsToDollarInput(cents) {
  if (cents === null || cents === undefined || !Number.isSafeInteger(Number(cents)) || Number(cents) < 0) return '';
  return (Number(cents) / 100).toFixed(2);
}
export function dollarInputToCents(value) {
  const text = String(value ?? '').trim();
  if (!/^(0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(text)) return null;
  const [dollars, fraction = ''] = text.split('.');
  const whole = Number(dollars);
  if (!Number.isSafeInteger(whole) || whole > 21474836) return null;
  const result = whole * 100 + Number(fraction.padEnd(2, '0'));
  return result <= 2147483647 ? result : null;
}
