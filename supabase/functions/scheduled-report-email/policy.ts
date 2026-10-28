export function validRecipients(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 5 && value.every(v =>
    typeof v === 'string' && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v));
}
export function validPDF(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 6_000_000 && value.startsWith('JVBERi0') && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}
