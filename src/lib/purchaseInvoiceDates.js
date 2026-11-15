/**
 * Canonical Purchase Invoice dates. PostgreSQL DATE columns accept ISO date
 * or NULL, never an empty HTML date-input string. Never invent a required
 * purchase date; callers must provide one valid calendar date.
 */
export function validPurchaseISODate(value) {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day] = value.split('-').map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year,month-1,day));
  return d.getUTCFullYear()===year && d.getUTCMonth()+1===month && d.getUTCDate()===day;
}

export function normalizePurchaseInvoiceDates(invoiceData = {}) {
  const date = typeof invoiceData.date === 'string' ? invoiceData.date.trim() : '';
  const dueDate = typeof invoiceData.due_date === 'string'
    ? invoiceData.due_date.trim()
    : (invoiceData.due_date == null ? '' : String(invoiceData.due_date).trim());
  if (!validPurchaseISODate(date)) {
    throw new Error('Select a valid purchase date (YYYY-MM-DD) before saving the invoice.');
  }
  if (dueDate && !validPurchaseISODate(dueDate)) {
    throw new Error('Due date must be a valid date (YYYY-MM-DD), or leave it empty.');
  }
  return {date, due_date: dueDate || null};
}
