import jsPDF from 'jspdf';
import {
  drawLocalizedPdfText,
  localizePdfColumns,
  pdfColumnX,
  prepareLocalizedPdf,
  safePdfFilename,
} from './pdfLocalization';

// ─── CSV ──────────────────────────────────────────────────────────────────────

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCSV(filename, headers, rows) {
  const lines = [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(',')),
  ];
  const bom = '\uFEFF'; // UTF-8 BOM keeps Persian and Arabic readable in Excel.
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename);
}

// ─── PDF ──────────────────────────────────────────────────────────────────────

/**
 * Shared export table. Callers supply already-localized headings and values; the
 * direction and embedded Unicode font follow the selected application language.
 */
export function downloadPDF({
  filename,
  title,
  subtitle,
  headers,
  rows,
  totalsRow,
  lang = 'en',
  dir = 'ltr',
}) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', putOnlyUsedFonts: true });
  const { rtl } = prepareLocalizedPdf(doc, { lang, dir });
  const pageW = 210;
  const marginL = 14;
  const marginR = 14;
  const tableW = pageW - marginL - marginR;
  const colW = tableW / Math.max(headers.length, 1);
  const rowH = 8;
  let y = 14;

  const drawRow = (values, rowY, { header = false, totals = false } = {}) => {
    const columns = localizePdfColumns(values, rtl);
    columns.forEach((cell, index) => {
      drawLocalizedPdfText(doc, cell, pdfColumnX({ index, columnWidth: colW, marginLeft: marginL, rtl }), rowY + 5.4, {
        rtl,
        bold: header || totals,
        size: rtl ? 8.4 : 8,
        color: header ? [255, 255, 255] : [15, 23, 42],
        align: rtl ? 'right' : 'left',
        maxWidth: colW - 4,
      });
    });
  };

  drawLocalizedPdfText(doc, title, rtl ? pageW - marginR : marginL, y, {
    rtl,
    bold: true,
    size: rtl ? 16 : 15,
    color: [15, 23, 42],
  });
  y += 7;

  if (subtitle) {
    drawLocalizedPdfText(doc, subtitle, rtl ? pageW - marginR : marginL, y, {
      rtl,
      size: rtl ? 10 : 9,
      color: [100, 100, 100],
    });
    y += 7;
  }

  doc.setFillColor(37, 99, 235);
  doc.rect(marginL, y, tableW, rowH, 'F');
  drawRow(headers, y, { header: true });
  y += rowH;

  rows.forEach((row, rowIndex) => {
    if (y > 270) {
      doc.addPage();
      y = 14;
      doc.setFillColor(37, 99, 235);
      doc.rect(marginL, y, tableW, rowH, 'F');
      drawRow(headers, y, { header: true });
      y += rowH;
    }
    if (rowIndex % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginL, y, tableW, rowH, 'F');
    }
    drawRow(row, y);
    y += rowH;
  });

  if (totalsRow) {
    if (y > 270) {
      doc.addPage();
      y = 14;
    }
    doc.setFillColor(229, 231, 235);
    doc.rect(marginL, y, tableW, rowH, 'F');
    drawRow(totalsRow, y, { totals: true });
  }

  doc.save(safePdfFilename(filename, lang));
}

// ─── Trigger download ─────────────────────────────────────────────────────────

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Sales export builders ────────────────────────────────────────────────────

function salesSourceDailyTotal(record) {
  if (Number(record?.custom_sources_total) > 0) return Number(record.custom_sources_total);
  const raw = record?.sales_sources_json;
  try {
    const entries = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    return Array.isArray(entries) ? entries.reduce((sum, entry) => sum + (Number(entry?.amount) || 0), 0) : 0;
  } catch {
    return 0;
  }
}

export function buildSalesCSV(data, t, currency, branches) {
  const getBranchLabel = (key) => branches.find(b => b.key === key)?.label || key;
  const sourceLabel = t('salesClosing.sources.title') || 'Sales Sources';
  const headers = [t('date'), t('branch'), t('cash'), t('network'), t('credit'), sourceLabel, t('total_sales')];
  const rows = data.map(s => {
    const sCash = Number(s.restaurant_cash ?? s.cash ?? 0);
    const sNet = Number(s.restaurant_network ?? s.network ?? 0);
    const credit = Number(s.credit) || 0;
    const sources = salesSourceDailyTotal(s);
    const total = sCash + sNet + credit + sources;
    return [s.date, getBranchLabel(s.branch), sCash, sNet, credit, sources, total];
  });
  const totals = rows.reduce((acc, row) => acc.map((value, index) => index < 2 ? value : value + Number(row[index] || 0)), ['', '', 0, 0, 0, 0, 0]);
  rows.push(['', t('total_sales'), totals[2], totals[3], totals[4], totals[5], totals[6]]);
  return { headers, rows };
}

export function buildSalesPDF(data, t, currency, branches, subtitle) {
  const getBranchLabel = (key) => branches.find(b => b.key === key)?.label || key;
  const sourceLabel = t('salesClosing.sources.title') || 'Sales Sources';
  const headers = [t('date'), t('branch'), t('cash'), t('network'), t('credit'), sourceLabel, t('total_sales')];
  const rows = data.map(s => {
    const sCash = Number(s.restaurant_cash ?? s.cash ?? 0);
    const sNet = Number(s.restaurant_network ?? s.network ?? 0);
    const credit = Number(s.credit) || 0;
    const sources = salesSourceDailyTotal(s);
    const total = sCash + sNet + credit + sources;
    return [s.date, getBranchLabel(s.branch), `${currency}${sCash.toLocaleString()}`, `${currency}${sNet.toLocaleString()}`, `${currency}${credit.toLocaleString()}`, `${currency}${sources.toLocaleString()}`, `${currency}${total.toLocaleString()}`];
  });
  const totals = data.reduce((summary, record) => ({
    cash: summary.cash + Number(record.restaurant_cash ?? record.cash ?? 0),
    network: summary.network + Number(record.restaurant_network ?? record.network ?? 0),
    credit: summary.credit + (Number(record.credit) || 0),
    sources: summary.sources + salesSourceDailyTotal(record),
  }), { cash: 0, network: 0, credit: 0, sources: 0 });
  const grandTotal = totals.cash + totals.network + totals.credit + totals.sources;
  const totalsRow = [t('total_sales'), '', `${currency}${totals.cash.toLocaleString()}`, `${currency}${totals.network.toLocaleString()}`, `${currency}${totals.credit.toLocaleString()}`, `${currency}${totals.sources.toLocaleString()}`, `${currency}${grandTotal.toLocaleString()}`];
  return { headers, rows, totalsRow, subtitle };
}

// ─── Purchases export builders ─────────────────────────────────────────────────

export function buildPurchasesCSV(data, t, currency, branches) {
  const getBranchLabel = (key) => branches.find(b => b.key === key)?.label || key;
  const headers = [t('date'), t('branch'), t('product'), t('quantity'), t('used_price'), t('total_purchase_cost')];
  const rows = data.map(p => {
    const price = p.used_price || p.current_price || 0;
    const total = (p.qty || 0) * price;
    return [p.date, getBranchLabel(p.branch), p.product_name || p.product_id, p.qty || 0, price, total];
  });
  const grandTotal = rows.reduce((sum, row) => sum + Number(row[5]), 0);
  rows.push(['', t('total_purchase_cost'), '', '', '', grandTotal]);
  return { headers, rows };
}

export function buildPurchasesPDF(data, t, currency, branches, subtitle) {
  const getBranchLabel = (key) => branches.find(b => b.key === key)?.label || key;
  const headers = [t('date'), t('branch'), t('product'), t('quantity'), t('used_price'), t('total_purchase_cost')];
  const rows = data.map(p => {
    const price = p.used_price || p.current_price || 0;
    const total = (p.qty || 0) * price;
    return [p.date, getBranchLabel(p.branch), p.product_name || p.product_id, String(p.qty || 0), `${currency}${price.toLocaleString()}`, `${currency}${total.toLocaleString()}`];
  });
  const grandTotal = data.reduce((sum, purchase) => {
    const price = purchase.used_price || purchase.current_price || 0;
    return sum + (purchase.qty || 0) * price;
  }, 0);
  const totalsRow = [t('total_purchase_cost'), '', '', '', '', `${currency}${grandTotal.toLocaleString()}`];
  return { headers, rows, totalsRow, subtitle };
}
