/**
 * Ultimate PDF Generator — 10-page executive report
 * Persian/Arabic text rendered via Canvas with Vazirmatn font preloading
 * All charts rendered via Canvas API (bar/line/pie)
 */
import jsPDF from 'jspdf';
import { computeDashboardMetrics, buildDailyProfitTrend, formatCurrency, formatPct, tagExpensesWithCategories } from './helpers';
import { computeBranchSettlements } from '../components/treasury/BranchSettlementLedger';
import { drawLocalizedPdfText, prepareLocalizedPdf, safePdfFilename } from './pdfLocalization';

// ─── Color palette ────────────────────────────────────────────────────────────
let C = {
  primary: [37, 99, 235],
  success: [16, 185, 129],
  warning: [245, 158, 11],
  danger: [239, 68, 68],
  muted: [100, 116, 139],
  light: [248, 250, 252],
  border: [226, 232, 240],
  dark: [15, 23, 42],
  white: [255, 255, 255],
};

// ─── Vazirmatn font preloader ─────────────────────────────────────────────────
let vazirFontLoaded = false;

async function preloadVazirmatn() {
  if (vazirFontLoaded) return;
  try {
    // Inject @font-face for Vazirmatn from Google Fonts CDN
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: 'Vazirmatn';
        font-style: normal;
        font-weight: 400;
        src: url('https://fonts.gstatic.com/s/vazirmatn/v13/Dani12bWhVDUu3-J599VYFQ.woff2') format('woff2');
        unicode-range: U+0600-06FF, U+200C-200E, U+2010-2011, U+204F, U+2212, U+0000-00FF;
      }
      @font-face {
        font-family: 'Vazirmatn';
        font-style: normal;
        font-weight: 700;
        src: url('https://fonts.gstatic.com/s/vazirmatn/v13/Dani52bWhVDUu3-J599VYFQ.woff2') format('woff2');
        unicode-range: U+0600-06FF, U+200C-200E, U+2010-2011, U+204F, U+2212, U+0000-00FF;
      }
    `;
    if (!document.getElementById('vazirmatn-face')) {
      style.id = 'vazirmatn-face';
      document.head.appendChild(style);
    }
    // Force browser to load the font by rendering it
    await document.fonts.load('16px Vazirmatn');
    await document.fonts.load('bold 16px Vazirmatn');
    vazirFontLoaded = true;
  } catch (e) {
    console.warn('Vazirmatn font load failed, falling back to system Arabic font', e);
    vazirFontLoaded = true; // proceed anyway
  }
}

// ─── Safe number guard ────────────────────────────────────────────────────────
function safeNum(v) { return isFinite(v) && !isNaN(v) ? v : 0; }
function safePct(num, denom) {
  if (!denom || denom === 0) return null; // null => "داده کافی نیست"
  const r = (num / denom) * 100;
  return isFinite(r) ? r : null;
}

// ─── RTL text renderer via Canvas ────────────────────────────────────────────
async function textToPng(text, opts = {}) {
  const {
    fontSize = 13,
    color = '#0f172a',
    bold = false,
    maxWidthPx = 520,
  } = opts;

  const DPR = 2.5;
  const fontFamily = 'Vazirmatn, "Noto Naskh Arabic", "Segoe UI", Tahoma, Arial';
  const weight = bold ? 'bold' : 'normal';
  const fontStr = `${weight} ${fontSize * DPR}px ${fontFamily}`;

  // Measure on temp canvas
  const tmp = document.createElement('canvas').getContext('2d');
  tmp.font = fontStr;
  const measured = tmp.measureText(String(text ?? ''));
  const rawW = Math.ceil(measured.width);
  const canvasW = Math.min(rawW + 24, maxWidthPx * DPR);
  const lineH = Math.ceil(fontSize * DPR * 1.6);

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = lineH;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = fontStr;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillText(String(text ?? ''), canvasW - 6, lineH / 2);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    wPx: canvasW,
    hPx: lineH,
    wMm: canvasW / DPR / 3.7795,
    hMm: lineH / DPR / 3.7795,
  };
}

// ─── txt helper ───────────────────────────────────────────────────────────────
// For RTL: renders canvas PNG. For LTR: uses jsPDF text.
async function txt(doc, text, x, y, opts = {}, dir = 'ltr') {
  const { size = 9, bold = false, color = C.dark, align, maxWidth } = opts;
  drawLocalizedPdfText(doc, text, x, y, {
    rtl: dir === 'rtl',
    size,
    bold,
    color,
    align,
    maxWidth,
  });
}

// ─── Drawing primitives ───────────────────────────────────────────────────────
function fillRect(doc, x, y, w, h, rgb) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  doc.rect(x, y, w, h, 'F');
}
function strokeRect(doc, x, y, w, h, rgb, lw = 0.3) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(lw);
  doc.rect(x, y, w, h, 'D');
}

function checkBreak(doc, y, needed, headerFn) {
  if (y + needed > 278) {
    doc.addPage();
    headerFn && headerFn();
    return 20;
  }
  return y;
}

// ─── Section header ───────────────────────────────────────────────────────────
async function sectionHeader(doc, title, y, dir, W = 210, ML = 14) {
  fillRect(doc, ML, y, W - ML * 2, 8, C.primary);
  const tx = dir === 'rtl' ? W - ML - 2 : ML + 2;
  const align = dir === 'rtl' ? 'right' : 'left';
  await txt(doc, title, tx, y + 5.5, { size: 8, bold: true, color: C.white, align }, dir);
  return y + 12;
}

// ─── KPI boxes row ────────────────────────────────────────────────────────────
async function kpiRow(doc, items, y, ML, TW, dir) {
  const colW = TW / items.length;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const x = ML + i * colW;
    fillRect(doc, x, y, colW - 1.5, 20, C.light);
    strokeRect(doc, x, y, colW - 1.5, 20, C.border);
    const lx = dir === 'rtl' ? x + colW - 4 : x + 3;
    const align = dir === 'rtl' ? 'right' : 'left';
    await txt(doc, item.label, lx, y + 6, { size: 7, color: C.muted, align }, dir);
    await txt(doc, item.value, lx, y + 14, { size: 9, bold: true, color: item.color || C.dark, align }, dir);
  }
  return y + 24;
}

// ─── Chart: Bar ───────────────────────────────────────────────────────────────
function chartBar(doc, data, x, y, w, h, label = '') {
  const rtl = Boolean(doc.__erpPdfRTL);
  if (!data || data.length === 0) return y + h + 4;
  const max = Math.max(...data.map(d => Math.abs(safeNum(d.value))), 1);
  const barW = Math.max(3, Math.floor((w - 14) / data.length) - 2);
  const chartH = h - 16;
  const base = y + chartH;

  fillRect(doc, x, y, w, h, [252, 253, 254]);
  strokeRect(doc, x, y, w, h, C.border);

  // Grid lines
  doc.setDrawColor(220, 228, 240);
  doc.setLineWidth(0.2);
  for (let g = 1; g <= 4; g++) {
    const gy = y + (chartH / 4) * g;
    doc.line(x + 7, gy, x + w - 3, gy);
  }

  data.forEach((d, i) => {
    const bx = x + 7 + i * (barW + 2);
    const bh = Math.max(2, (Math.abs(safeNum(d.value)) / max) * (chartH - 8));
    const by = base - bh;
    const rgb = d.value < 0 ? C.danger : (d.color || C.primary);
    fillRect(doc, bx, by, barW, bh, rgb);
    const lbl = String(d.name || '').slice(0, 7);
    drawLocalizedPdfText(doc, lbl, bx + barW / 2, base + 5, { rtl, size: 5.5, color: C.muted, align: 'center' });
  });

  if (label) drawLocalizedPdfText(doc, label, rtl ? x + w - 2 : x + 2, y + 6, { rtl, size: 6.5, color: C.muted });
  return y + h + 4;
}

// ─── Chart: Line ─────────────────────────────────────────────────────────────
function chartLine(doc, data, x, y, w, h, seriesKey = 'value') {
  if (!data || data.length < 2) return y + h + 4;
  const vals = data.map(d => safeNum(d[seriesKey]));
  const maxV = Math.max(...vals, 1);
  const minV = Math.min(...vals, 0);
  const range = maxV - minV || 1;
  const chartH = h - 12;
  const chartW = w - 10;

  fillRect(doc, x, y, w, h, [252, 253, 254]);
  strokeRect(doc, x, y, w, h, C.border);

  doc.setDrawColor(220, 228, 240);
  doc.setLineWidth(0.2);
  for (let g = 1; g <= 4; g++) {
    const gy = y + (chartH / 4) * g;
    doc.line(x + 5, gy, x + w - 5, gy);
  }

  const pts = data.map((d, i) => ({
    px: x + 5 + (i / (data.length - 1)) * chartW,
    py: y + chartH - ((safeNum(d[seriesKey]) - minV) / range) * (chartH - 6),
  }));

  // Area fill
  doc.setFillColor(37, 99, 235, 0.08);
  doc.setDrawColor(C.primary[0], C.primary[1], C.primary[2]);
  doc.setLineWidth(0.7);
  for (let i = 0; i < pts.length - 1; i++) {
    doc.line(pts[i].px, pts[i].py, pts[i + 1].px, pts[i + 1].py);
  }
  return y + h + 4;
}

// ─── Chart: Horizontal bars (for rankings) ────────────────────────────────────
async function chartHorizBar(doc, data, x, y, w, dir) {
  if (!data || data.length === 0) return y;
  const max = Math.max(...data.map(d => safeNum(d.value)), 1);
  const rowH = 10;
  for (let i = 0; i < data.length; i++) {
    const ry = y + i * rowH;
    const barMaxW = w * 0.55;
    const bw = Math.max(2, (safeNum(data[i].value) / max) * barMaxW);
    const bx = dir === 'rtl' ? x + w - bw : x + w * 0.35;
    const col = data[i].color || C.primary;
    fillRect(doc, bx, ry + 1.5, bw, rowH - 3, col);

    // label
    const lx = dir === 'rtl' ? x + w - 2 : x;
    const align = dir === 'rtl' ? 'right' : 'left';
    await txt(doc, data[i].name, lx, ry + rowH * 0.65, { size: 7, align }, dir);

    // value
    const vx = dir === 'rtl' ? x : x + w;
    const valign = dir === 'rtl' ? 'left' : 'right';
    drawLocalizedPdfText(doc, String(data[i].label || ''), vx, ry + rowH * 0.65, {
      rtl: false,
      bold: true,
      size: 7,
      color: col,
      align: valign,
    });
  }
  return y + data.length * rowH + 4;
}

// ─── Chart: Pie (as segmented bar) ───────────────────────────────────────────
async function chartPie(doc, segments, x, y, w, h, dir) {
  const total = segments.reduce((s, d) => s + safeNum(d.value), 0);
  if (!total) return y + h + 14;
  const SEG_COLORS = [C.primary, C.success, C.warning, C.danger];
  let cx = x;
  segments.forEach((seg, i) => {
    const sw = (safeNum(seg.value) / total) * w;
    fillRect(doc, cx, y, sw, h, SEG_COLORS[i % SEG_COLORS.length]);
    cx += sw;
  });
  // Legend
  let lx = x;
  const ly = y + h + 5;
  for (let i = 0; i < segments.length; i++) {
    const pct2 = ((safeNum(segments[i].value) / total) * 100).toFixed(0);
    fillRect(doc, lx, ly, 4, 4, SEG_COLORS[i % SEG_COLORS.length]);
    const label = `${pct2}%`;
    doc.setFontSize(7);
    doc.setTextColor(50, 50, 50);
    doc.text(label, lx + 5, ly + 3.5);
    lx += 22;
  }
  return y + h + 14;
}

// ─── Table renderer ───────────────────────────────────────────────────────────
async function drawTable(doc, headers, rows, x, y, colWidths, dir, hdrFn) {
  const rowH = 7;
  const totalW = colWidths.reduce((a, b) => a + b, 0);

  fillRect(doc, x, y, totalW, rowH, C.primary);

  if (dir === 'rtl') {
    let cx = x + totalW;
    for (let i = 0; i < headers.length; i++) {
      cx -= colWidths[i];
      await txt(doc, String(headers[i] ?? ''), cx + colWidths[i] - 2, y + 5, { size: 6.5, bold: true, color: C.white, align: 'right' }, dir);
    }
  } else {
    let cx = x;
    for (let i = 0; i < headers.length; i++) {
      await txt(doc, String(headers[i] ?? ''), cx + 2, y + 5, { size: 6.5, bold: true, color: C.white }, dir);
      cx += colWidths[i];
    }
  }
  y += rowH;

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    y = checkBreak(doc, y, rowH + 2, hdrFn);
    if (ri % 2 === 1) fillRect(doc, x, y, totalW, rowH, C.light);
    strokeRect(doc, x, y, totalW, rowH, [235, 240, 248], 0.2);

    if (dir === 'rtl') {
      let cx = x + totalW;
      for (let ci = 0; ci < row.length; ci++) {
        cx -= colWidths[ci];
        await txt(doc, String(row[ci] ?? ''), cx + colWidths[ci] - 2, y + 5, { size: 6.5, align: 'right' }, dir);
      }
    } else {
      let cx = x;
      for (let ci = 0; ci < row.length; ci++) {
        await txt(doc, String(row[ci] ?? ''), cx + 2, y + 5, { size: 6.5, color: C.dark, maxWidth: colWidths[ci] - 3 }, dir);
        cx += colWidths[ci];
      }
    }
    y += rowH;
  }
  return y + 3;
}

// ─── Guidance box ─────────────────────────────────────────────────────────────
async function guidanceBox(doc, lines, x, y, w, dir) {
  const lineH = 7.5;
  const pad = 4;
  const boxH = pad * 2 + lines.length * lineH;
  doc.setFillColor(255, 251, 235); doc.rect(x, y, w, boxH, 'F');
  doc.setDrawColor(245, 158, 11); doc.setLineWidth(0.5); doc.rect(x, y, w, boxH, 'D');

  for (let i = 0; i < lines.length; i++) {
    const ly = y + pad + 5 + i * lineH;
    if (dir === 'rtl') {
      await txt(doc, `• ${lines[i]}`, x + w - pad, ly, { size: 7, color: [92, 60, 0], align: 'right' }, dir);
    } else {
      await txt(doc, `• ${lines[i]}`, x + pad, ly, { size: 7, color: [92, 60, 0], maxWidth: w - pad * 2 }, dir);
    }
  }
  return y + boxH + 4;
}

// ─── Footer/page number ───────────────────────────────────────────────────────
async function addFooter(doc, brandName, pageN, totalN, fromStr, toStr, dir, lang = 'en', W = 210) {
  const ph = doc.internal.pageSize.getHeight();
  fillRect(doc, 0, ph - 9, W, 9, [245, 247, 250]);
  doc.setDrawColor(200, 210, 230); doc.setLineWidth(0.3);
  doc.line(0, ph - 9, W, ph - 9);
  // Report numbers and dates intentionally remain LTR values; only display
  // labels are translated, which keeps mixed-direction footers readable.
  const dateStr = new Date().toLocaleDateString('en-GB');
  if (dir === 'rtl') {
    await txt(doc, `${pageN} / ${totalN}`, W - 14, ph - 4, { size: 7, color: C.muted, align: 'right' }, dir);
    await txt(doc, `${dateStr} · ${brandName}`, 14, ph - 4, { size: 7, color: C.muted, align: 'left' }, dir);
  } else {
    await txt(doc, `${brandName} · ${dateStr}`, 14, ph - 4, { size: 7, color: C.muted }, dir);
    await txt(doc, `${pageN} / ${totalN}`, W - 14, ph - 4, { size: 7, color: C.muted, align: 'right' }, dir);
  }
}

// ─── Logo loader ──────────────────────────────────────────────────────────────
async function loadLogo(url) {
  if (!url) return null;
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    return new Promise(res => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => res(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ─── i18n labels used internally in PDF ──────────────────────────────────────
function L(lang) {
  const fa = {
    executiveSummary: 'خلاصه اجرایی',
    branchPerf: 'عملکرد فروع',
    salesAnalysis: 'تحلیل فروشات',
    purchaseAnalysis: 'تحلیل خریدها',
    inventoryAnalysis: 'تحلیل انبار',
    creditAnalysis: 'تحلیل قرض و طلبات',
    expenseAnalysis: 'تحلیل مصارف',
    priceAnalysis: 'تحلیل اسعار',
    smartInsights: 'تحلیل هوشمند',
    managementGuidance: 'رهنمای مدیریتی',
    totalSales: 'فروش کل',
    purchaseCost: 'هزینه خرید',
    grossProfit: 'سود ناخالص',
    netProfit: 'سود خالص',
    totalExpenses: 'مجموع مصارف',
    margin: 'حاشیه سود',
    creditRate: 'نرخ اعتبار',
    risk: 'سطح ریسک',
    riskHigh: 'بالا',
    riskMed: 'متوسط',
    riskLow: 'پایین',
    cash: 'نقد',
    network: 'شبکه',
    credit: 'اعتبار',
    paymentMix: 'ترکیب پرداخت',
    branch: 'فروع',
    sales: 'فروش',
    profit: 'سود',
    expenses: 'مصارف',
    trend: 'روند',
    date: 'تاریخ',
    product: 'محصول',
    qty: 'مقدار',
    cost: 'هزینه',
    branchRanking: 'رتبه‌بندی فروع',
    branchDetails: 'جزئیات فروع',
    creditPct: 'نسبت اعتبار',
    lowStock: 'موجودی پایین',
    noData: 'داده کافی نیست',
    dailyTrend: 'روند روزانه',
    weeklyTrend: 'روند هفتگی',
    monthlyTrend: 'روند ماهانه',
    topProducts: 'محصولات برتر',
    supplierAnalysis: 'تحلیل تأمین‌کنندگان',
    outstanding: 'بدهی معوق',
    creditCollected: 'اعتبار دریافت شده',
    fixedExpenses: 'مصارف ثابت',
    rent: 'اجاره',
    salaries: 'حقوق',
    utilities: 'خدمات',
    other: 'سایر',
    growthActions: 'اقدامات رشد',
    profitActions: 'بهبود سودآوری',
    expenseActions: 'کاهش مصارف',
    inventoryActions: 'بهینه‌سازی موجودی',
    creditActions: 'کاهش ریسک اعتبار',
    generatedOn: 'تولید شده در',
    page: 'صفحه',
    of: 'از',
    supplier: 'تأمین‌کننده',
    invoice: 'فاکتور',
    amount: 'مبلغ',
    status: 'وضعیت',
    stockLevel: 'سطح موجودی',
    threshold: 'حد پایین',
    profitTrend: 'روند سود',
    productConsumption: 'تحلیل مصرف محصولات',
    todayUsage: 'مصرف امروز',
    monthlyUsage: 'مصرف ماهانه',
    topConsumed: 'پرمصرف‌ترین',
    highestCost: 'پرهزینه‌ترین',
    unit: 'واحد',
    weeklyQtyTrend: 'روند هفتگی مقدار',
  };

  const ar = {
    executiveSummary: 'الملخص التنفيذي',
    branchPerf: 'أداء الفروع',
    salesAnalysis: 'تحليل المبيعات',
    purchaseAnalysis: 'تحليل المشتريات',
    inventoryAnalysis: 'تحليل المخزون',
    creditAnalysis: 'تحليل الديون والمطالبات',
    expenseAnalysis: 'تحليل المصاريف',
    priceAnalysis: 'تحليل الأسعار',
    smartInsights: 'التحليل الذكي',
    managementGuidance: 'الإرشادات الإدارية',
    totalSales: 'إجمالي المبيعات',
    purchaseCost: 'تكلفة الشراء',
    grossProfit: 'إجمالي الربح',
    netProfit: 'صافي الربح',
    totalExpenses: 'إجمالي المصاريف',
    margin: 'هامش الربح',
    creditRate: 'نسبة الائتمان',
    risk: 'مستوى المخاطر',
    riskHigh: 'عالٍ', riskMed: 'متوسط', riskLow: 'منخفض',
    cash: 'نقداً', network: 'شبكة', credit: 'آجل',
    paymentMix: 'مزيج الدفع',
    branch: 'الفرع', sales: 'مبيعات', profit: 'ربح', expenses: 'مصاريف',
    trend: 'اتجاه', date: 'التاريخ', product: 'المنتج', qty: 'الكمية', cost: 'التكلفة',
    branchRanking: 'تصنيف الفروع', branchDetails: 'تفاصيل الفروع',
    creditPct: 'نسبة الائتمان', lowStock: 'نقص المخزون',
    noData: 'لا توجد بيانات كافية', dailyTrend: 'الاتجاه اليومي',
    weeklyTrend: 'الاتجاه الأسبوعي', monthlyTrend: 'الاتجاه الشهري',
    topProducts: 'أبرز المنتجات', supplierAnalysis: 'تحليل الموردين',
    outstanding: 'المبالغ المعلقة', creditCollected: 'الائتمان المحصل',
    fixedExpenses: 'المصاريف الثابتة', rent: 'إيجار', salaries: 'رواتب',
    utilities: 'مرافق', other: 'أخرى', growthActions: 'إجراءات النمو',
    profitActions: 'تحسين الربحية', expenseActions: 'خفض المصاريف',
    inventoryActions: 'تحسين المخزون', creditActions: 'تقليل مخاطر الائتمان',
    generatedOn: 'تم الإنشاء في', page: 'صفحة', of: 'من',
    supplier: 'المورد', invoice: 'فاتورة', amount: 'المبلغ', status: 'الحالة',
    stockLevel: 'مستوى المخزون', threshold: 'الحد الأدنى', profitTrend: 'اتجاه الربح',
    productConsumption: 'تحليل استهلاك المنتجات',
    todayUsage: 'الاستهلاك اليوم',
    monthlyUsage: 'الاستهلاك الشهري',
    topConsumed: 'الأكثر استهلاكاً',
    highestCost: 'الأعلى تكلفة',
    unit: 'الوحدة',
    weeklyQtyTrend: 'الاتجاه الأسبوعي للكميات',
  };

  const en = {
    executiveSummary: 'Executive Summary',
    branchPerf: 'Branch Performance',
    salesAnalysis: 'Sales Analysis',
    purchaseAnalysis: 'Purchase Analysis',
    inventoryAnalysis: 'Inventory Analysis',
    creditAnalysis: 'Credit & Receivables Analysis',
    expenseAnalysis: 'Expense Analysis',
    priceAnalysis: 'Price Analysis',
    smartInsights: 'Smart Insights',
    managementGuidance: 'Management Guidance',
    totalSales: 'Total Sales', purchaseCost: 'Purchase Cost',
    grossProfit: 'Gross Profit', netProfit: 'Net Profit',
    totalExpenses: 'Total Expenses', margin: 'Profit Margin',
    creditRate: 'Credit Rate', risk: 'Risk Level',
    riskHigh: 'High', riskMed: 'Medium', riskLow: 'Low',
    cash: 'Cash', network: 'Network', credit: 'Credit',
    paymentMix: 'Payment Mix',
    branch: 'Branch', sales: 'Sales', profit: 'Profit', expenses: 'Expenses',
    trend: 'Trend', date: 'Date', product: 'Product', qty: 'Qty', cost: 'Cost',
    branchRanking: 'Branch Rankings', branchDetails: 'Branch Details',
    creditPct: 'Credit %', lowStock: 'Low Stock',
    noData: 'Insufficient data', dailyTrend: 'Daily Trend',
    weeklyTrend: 'Weekly Trend', monthlyTrend: 'Monthly Trend',
    topProducts: 'Top Products', supplierAnalysis: 'Supplier Analysis',
    outstanding: 'Outstanding', creditCollected: 'Collected Credit',
    fixedExpenses: 'Fixed Expenses', rent: 'Rent', salaries: 'Salaries',
    utilities: 'Utilities', other: 'Other', growthActions: 'Growth Actions',
    profitActions: 'Profit Improvement', expenseActions: 'Expense Reduction',
    inventoryActions: 'Inventory Optimization', creditActions: 'Credit Risk Reduction',
    generatedOn: 'Generated on', page: 'Page', of: 'of',
    supplier: 'Supplier', invoice: 'Invoice', amount: 'Amount', status: 'Status',
    stockLevel: 'Stock Level', threshold: 'Threshold', profitTrend: 'Profit Trend',
    productConsumption: 'Product Consumption Analytics',
    todayUsage: "Today's Usage",
    monthlyUsage: 'Monthly Usage',
    topConsumed: 'Top Consumed',
    highestCost: 'Highest Cost',
    unit: 'Unit',
    weeklyQtyTrend: '7-Day Quantity Trend',
  };

  return lang === 'fa' ? fa : lang === 'ar' ? ar : en;
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateUltimatePDF({
  sales = [], purchases = [], expenses = [], rangeType, fromStr, toStr,
  t, lang, currency, branches = [], dir,
  brandSettings = null, inventory = [], supplierInvoices = [],
  walletTransactions = [], revenueSources = [], expenseCategories = [],
}) {
  const isRTL = dir === 'rtl';
  const l = L(lang);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', putOnlyUsedFonts: true });
  prepareLocalizedPdf(doc, { lang, dir });
  const W = 210;
  const ML = 14;
  const TW = W - ML * 2;
  const TOTAL_PAGES = 12;

  // Override primary color from brand settings
  const primaryHex = brandSettings?.primary_color;
  if (primaryHex && primaryHex.startsWith('#')) {
    const r = parseInt(primaryHex.slice(1, 3), 16);
    const g = parseInt(primaryHex.slice(3, 5), 16);
    const b2 = parseInt(primaryHex.slice(5, 7), 16);
    if (!isNaN(r)) C = { ...C, primary: [r, g, b2] };
  }

  const brandName = brandSettings?.brand_name || '';
  const logoUrl = await loadLogo(brandSettings?.logo_url);

  // Filter data by date range
  const fSales = sales.filter(s => s.date >= fromStr && s.date <= toStr);
  const fPurch = purchases.filter(p => p.date >= fromStr && p.date <= toStr);
  // Tag expenses with _is_fixed from categories for correct proration
  const taggedExpenses = tagExpensesWithCategories(
    expenses.filter(e => e.date >= fromStr && e.date <= toStr),
    expenseCategories
  );
  const fExp = taggedExpenses;

  // Compute metrics with safe values
  const metrics = computeDashboardMetrics(fSales, fPurch, fExp, rangeType, revenueSources);
  const trend = buildDailyProfitTrend(fSales, fPurch, revenueSources);

  // Branch metrics
  const branchMetrics = branches.map(b => {
    const bs = fSales.filter(s => s.branch === b.key);
    const bp = fPurch.filter(p => p.branch === b.key);
    const be = fExp.filter(e => e.branch_key === b.key || e.branch_key === 'all');
    const m = computeDashboardMetrics(bs, bp, be, rangeType, revenueSources);
    return { key: b.key, name: b.label, ...m };
  });

  // ── Draw page header ─────────────────────────────────────────────────────
  const drawHeader = async (pageTitle) => {
    fillRect(doc, 0, 0, W, 20, C.primary);
    if (logoUrl) {
      try { doc.addImage(logoUrl, 'PNG', isRTL ? W - 22 : ML, 2, 16, 16, undefined, 'FAST'); } catch {}
    }
    const titleX = isRTL ? W - ML - (logoUrl ? 22 : 0) : ML + (logoUrl ? 20 : 0);
    await txt(doc, pageTitle, titleX, 12, { size: 12, bold: true, color: C.white, align: isRTL ? 'right' : 'left' }, dir);
    // Range
    drawLocalizedPdfText(doc, `${fromStr}  →  ${toStr}`, isRTL ? ML : W - ML, 17, {
      rtl: false,
      size: 7.5,
      color: [200, 220, 255],
      align: isRTL ? 'left' : 'right',
    });
    return 24;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 1: Executive Summary
  // ─────────────────────────────────────────────────────────────────────────
  let y = await drawHeader(l.executiveSummary);

  // KPI row 1
  const expensePct = safePct(metrics.totalExpenses, metrics.totalSales);
  const kpi1 = [
    { label: l.totalSales, value: formatCurrency(safeNum(metrics.totalSales), currency), color: C.primary },
    { label: l.purchaseCost, value: formatCurrency(safeNum(metrics.totalPurchaseCost), currency), color: C.warning },
    { label: l.grossProfit, value: formatCurrency(safeNum(metrics.profit), currency), color: metrics.profit >= 0 ? C.success : C.danger },
    { label: l.totalExpenses, value: formatCurrency(safeNum(metrics.totalExpenses), currency), color: C.danger },
  ];
  y = await kpiRow(doc, kpi1, y, ML, TW, dir);

  // KPI row 2
  const kpi2 = [
    { label: l.netProfit, value: formatCurrency(safeNum(metrics.netProfit), currency), color: metrics.netProfit >= 0 ? C.success : C.danger },
    { label: l.margin, value: expensePct !== null ? `${safeNum(metrics.margin).toFixed(1)}%` : l.noData, color: C.primary },
    { label: l.creditRate, value: `${safeNum(metrics.creditPct).toFixed(1)}%`, color: metrics.creditPct > 30 ? C.danger : C.success },
    { label: l.risk, value: metrics.creditPct > 30 ? l.riskHigh : metrics.creditPct > 15 ? l.riskMed : l.riskLow, color: metrics.creditPct > 30 ? C.danger : metrics.creditPct > 15 ? C.warning : C.success },
  ];
  y = await kpiRow(doc, kpi2, y, ML, TW, dir);

  // Profit trend line chart
  y = await sectionHeader(doc, l.profitTrend, y, dir, W, ML);
  if (trend.length > 1) {
    y = chartLine(doc, trend.map(d => ({ ...d, value: d.profit })), ML, y, TW, 45);
  } else {
    await txt(doc, l.noData, ML + 5, y + 12, { size: 8, color: C.muted }, dir);
    y += 20;
  }

  // Sales trend line chart
  y = await sectionHeader(doc, l.sales, y, dir, W, ML);
  if (trend.length > 1) {
    y = chartLine(doc, trend.map(d => ({ ...d, value: d.sales })), ML, y, TW, 40);
  }

  // Payment mix
  y = await sectionHeader(doc, l.paymentMix, y, dir, W, ML);
  const payMix = [
    { name: l.cash, value: safeNum(metrics.totalCash) },
    { name: l.network, value: safeNum(metrics.totalNetwork) },
    { name: l.credit, value: safeNum(metrics.totalCredit) },
    { name: l.other || 'Other', value: safeNum(metrics.totalAdditionalSources) },
  ].filter(d => d.value > 0);
  y = await chartPie(doc, payMix, ML, y, TW, 10, dir);

  await addFooter(doc, brandName, 1, TOTAL_PAGES, fromStr, toStr, dir, lang, W);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 2: Branch Performance
  // ─────────────────────────────────────────────────────────────────────────
  doc.addPage();
  y = await drawHeader(l.branchPerf);

  // Branch ranking horizontal bars
  y = await sectionHeader(doc, l.branchRanking, y, dir, W, ML);
  const sortedBranches = [...branchMetrics].sort((a, b) => b.totalSales - a.totalSales);
  const rankData = sortedBranches.map((b, i) => ({
    name: b.name,
    value: safeNum(b.totalSales),
    label: formatCurrency(safeNum(b.totalSales), currency),
    color: i === 0 ? C.success : i === 1 ? C.primary : C.muted,
  }));
  y = await chartHorizBar(doc, rankData, ML, y, TW, dir);

  // Branch sales bar chart
  y = await sectionHeader(doc, `${l.sales} — ${l.branch}`, y + 4, dir, W, ML);
  const bSalesData = branchMetrics.map(b => ({ name: b.name.slice(0, 10), value: safeNum(b.totalSales), color: C.primary }));
  y = chartBar(doc, bSalesData, ML, y, TW, 48);

  // Branch profit bar chart
  y = await sectionHeader(doc, `${l.profit} — ${l.branch}`, y, dir, W, ML);
  const bProfitData = branchMetrics.map(b => ({ name: b.name.slice(0, 10), value: safeNum(b.profit), color: b.profit >= 0 ? C.success : C.danger }));
  y = chartBar(doc, bProfitData, ML, y, TW, 48);

  // Branch details table
  y = await sectionHeader(doc, l.branchDetails, y, dir, W, ML);
  const bHeaders = [l.branch, l.totalSales, l.grossProfit, l.totalExpenses, l.netProfit, l.creditPct];
  const bRows = branchMetrics.map(b => [
    b.name,
    formatCurrency(safeNum(b.totalSales), currency),
    formatCurrency(safeNum(b.profit), currency),
    formatCurrency(safeNum(b.totalExpenses), currency),
    formatCurrency(safeNum(b.netProfit), currency),
    `${safeNum(b.creditPct).toFixed(1)}%`,
  ]);
  y = await drawTable(doc, bHeaders, bRows, ML, y, [38, 28, 28, 28, 28, 22], dir, null);

  await addFooter(doc, brandName, 2, TOTAL_PAGES, fromStr, toStr, dir, lang, W);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 3: Sales Analysis
  // ─────────────────────────────────────────────────────────────────────────
  doc.addPage();
  y = await drawHeader(l.salesAnalysis);

  // Daily trend
  y = await sectionHeader(doc, l.dailyTrend, y, dir, W, ML);
  if (trend.length > 1) {
    y = chartLine(doc, trend.map(d => ({ ...d, value: d.sales })), ML, y, TW, 45);
  } else { await txt(doc, l.noData, ML + 5, y + 12, { size: 8, color: C.muted }, dir); y += 22; }

  // Weekly aggregation
  const weeklyMap = {};
  fSales.forEach(s => {
    const d = new Date(s.date);
    const wk = `${d.getFullYear()}-W${Math.ceil((d.getDate()) / 7)}`;
    if (!weeklyMap[wk]) weeklyMap[wk] = 0;
    const rev = calculateSalesRevenue(s, revenueSources);
    weeklyMap[wk] += (rev?.total || 0);
  });
  const weeklyData = Object.entries(weeklyMap).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ name: k.slice(5), value: v }));
  y = await sectionHeader(doc, l.weeklyTrend, y, dir, W, ML);
  y = chartBar(doc, weeklyData, ML, y, TW, 48);

  // Monthly aggregation
  const monthlyMap = {};
  fSales.forEach(s => {
    const mo = s.date?.slice(0, 7);
    if (!mo) return;
    if (!monthlyMap[mo]) monthlyMap[mo] = 0;
    const rev = calculateSalesRevenue(s, revenueSources);
    monthlyMap[mo] += (rev?.total || 0);
  });
  const monthlyData = Object.entries(monthlyMap).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ name: k.slice(5), value: v }));
  y = await sectionHeader(doc, l.monthlyTrend, y, dir, W, ML);
  y = chartBar(doc, monthlyData, ML, y, TW, 48);

  // Sales detail table
  y = await sectionHeader(doc, l.sales, y, dir, W, ML);
  const sHeaders = [l.date, l.branch, l.cash, l.network, l.credit, l.totalSales];
  const sRows = fSales.slice(0, 25).map(s => {
    const brLabel = branches.find(b => b.key === s.branch)?.label || s.branch;
    const rev = calculateSalesRevenue(s, revenueSources);
    return [s.date, brLabel, formatCurrency(rev.cash, currency), formatCurrency(rev.network, currency), formatCurrency(rev.credit, currency), formatCurrency(rev.total, currency)];
  });
  y = await drawTable(doc, sHeaders, sRows, ML, y, [24, 30, 22, 22, 22, 26], dir, null);

  await addFooter(doc, brandName, 3, TOTAL_PAGES, fromStr, toStr, dir, lang, W);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 4: Purchase Analysis
  // ─────────────────────────────────────────────────────────────────────────
  doc.addPage();
  y = await drawHeader(l.purchaseAnalysis);

  // Top purchased products
  const productCosts = {};
  fPurch.forEach(p => {
    const name = p.product_name || p.product_id || '?';
    if (!productCosts[name]) productCosts[name] = 0;
    productCosts[name] += (p.qty || 0) * (p.used_price || p.current_price || 0);
  });
  const topProducts = Object.entries(productCosts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topData = topProducts.map(([name, val]) => ({ name: name.slice(0, 10), value: safeNum(val) }));

  y = await sectionHeader(doc, l.topProducts, y, dir, W, ML);
  y = chartBar(doc, topData, ML, y, TW, 55);

  // Purchase cost trend
  const purchTrend = {};
  fPurch.forEach(p => {
    if (!purchTrend[p.date]) purchTrend[p.date] = 0;
    purchTrend[p.date] += (p.qty || 0) * (p.used_price || p.current_price || 0);
  });
  const purchTrendData = Object.entries(purchTrend).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ date: k, value: v }));

  y = await sectionHeader(doc, `${l.purchaseCost} — ${l.trend}`, y, dir, W, ML);
  if (purchTrendData.length > 1) {
    y = chartLine(doc, purchTrendData, ML, y, TW, 45);
  } else { await txt(doc, l.noData, ML + 5, y + 12, { size: 8, color: C.muted }, dir); y += 22; }

  // Purchase table
  y = await sectionHeader(doc, l.purchaseAnalysis, y, dir, W, ML);
  const pHeaders = [l.date, l.branch, l.product, l.qty, l.cost];
  const pRows = fPurch.slice(0, 25).map(p => {
    const price = safeNum(p.used_price || p.current_price);
    const brLabel = branches.find(b => b.key === p.branch)?.label || p.branch;
    return [p.date, brLabel, (p.product_name || p.product_id || '').slice(0, 18), String(p.qty || 0), formatCurrency((p.qty || 0) * price, currency)];
  });
  y = await drawTable(doc, pHeaders, pRows, ML, y, [25, 30, 46, 16, 29], dir, null);

  await addFooter(doc, brandName, 4, TOTAL_PAGES, fromStr, toStr, dir, lang, W);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 5: Inventory Analysis
  // ─────────────────────────────────────────────────────────────────────────
  doc.addPage();
  y = await drawHeader(l.inventoryAnalysis);

  // Stock level bars
  if (inventory.length > 0) {
    const stockData = inventory.slice(0, 12).map(i => ({
      name: (i.product_name || i.product_id || '?').slice(0, 10),
      value: safeNum(i.opening_stock),
      color: safeNum(i.opening_stock) <= safeNum(i.low_stock_threshold) ? C.danger : C.success,
    }));
    y = await sectionHeader(doc, l.stockLevel, y, dir, W, ML);
    y = chartBar(doc, stockData, ML, y, TW, 55);

    // Low stock table
    const lowItems = inventory.filter(i => safeNum(i.opening_stock) <= safeNum(i.low_stock_threshold));
    if (lowItems.length > 0) {
      y = await sectionHeader(doc, l.lowStock, y, dir, W, ML);
      const lsHeaders = [l.product, l.branch, l.stockLevel, l.threshold];
      const lsRows = lowItems.slice(0, 15).map(i => [
        (i.product_name || i.product_id || '').slice(0, 22),
        branches.find(b => b.key === i.branch)?.label || i.branch,
        String(safeNum(i.opening_stock)),
        String(safeNum(i.low_stock_threshold)),
      ]);
      y = await drawTable(doc, lsHeaders, lsRows, ML, y, [55, 40, 30, 30], dir, null);
    } else {
      await txt(doc, '✓', ML + 5, y + 10, { size: 9, color: C.success }, dir);
      await txt(doc, l.noData, ML + 12, y + 10, { size: 8, color: C.muted }, dir);
      y += 20;
    }
  } else {
    await txt(doc, l.noData, ML + 5, y + 15, { size: 9, color: C.muted }, dir);
    y += 30;
  }

  // Full inventory table
  y = await sectionHeader(doc, l.inventoryAnalysis, y, dir, W, ML);
  const invHeaders = [l.product, l.branch, l.stockLevel, l.threshold];
  const invRows = inventory.slice(0, 20).map(i => [
    (i.product_name || i.product_id || '').slice(0, 22),
    branches.find(b => b.key === i.branch)?.label || i.branch,
    String(safeNum(i.opening_stock)),
    String(safeNum(i.low_stock_threshold)),
  ]);
  if (invRows.length > 0) {
    y = await drawTable(doc, invHeaders, invRows, ML, y, [55, 40, 30, 30], dir, null);
  }

  await addFooter(doc, brandName, 5, TOTAL_PAGES, fromStr, toStr, dir, lang, W);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 6: Credit & Receivables Analysis
  // ─────────────────────────────────────────────────────────────────────────
  doc.addPage();
  y = await drawHeader(l.creditAnalysis);

  // Credit sales trend
  const creditTrend = {};
  fSales.forEach(s => {
    if (!creditTrend[s.date]) creditTrend[s.date] = 0;
    creditTrend[s.date] += safeNum(s.credit);
  });
  const creditTrendData = Object.entries(creditTrend).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ date: k, value: v }));

  y = await sectionHeader(doc, l.credit, y, dir, W, ML);
  if (creditTrendData.length > 1) {
    y = chartLine(doc, creditTrendData, ML, y, TW, 45);
  } else { await txt(doc, l.noData, ML + 5, y + 12, { size: 8, color: C.muted }, dir); y += 22; }

  // Outstanding invoices
  const unpaidInvoices = supplierInvoices.filter(i => i.status !== 'paid');
  const totalOutstanding = unpaidInvoices.reduce((s, i) => s + safeNum(i.amount - (i.paid_amount || 0)), 0);

  y = await sectionHeader(doc, l.outstanding, y, dir, W, ML);
  const kpiCredit = [
    { label: l.credit, value: formatCurrency(safeNum(metrics.totalCredit), currency), color: C.warning },
    { label: l.outstanding, value: formatCurrency(totalOutstanding, currency), color: C.danger },
    { label: l.creditRate, value: `${safeNum(metrics.creditPct).toFixed(1)}%`, color: metrics.creditPct > 30 ? C.danger : C.success },
    { label: l.risk, value: metrics.creditPct > 30 ? l.riskHigh : l.riskLow, color: metrics.creditPct > 30 ? C.danger : C.success },
  ];
  y = await kpiRow(doc, kpiCredit, y, ML, TW, dir);

  if (supplierInvoices.length > 0) {
    y = await sectionHeader(doc, l.supplierAnalysis, y, dir, W, ML);
    const siHeaders = [l.supplier, l.invoice, l.amount, l.status];
    const siRows = supplierInvoices.slice(0, 20).map(i => [
      (i.supplier_name || '').slice(0, 22),
      i.invoice_number || '-',
      formatCurrency(safeNum(i.amount - (i.paid_amount || 0)), currency),
      i.status || '-',
    ]);
    y = await drawTable(doc, siHeaders, siRows, ML, y, [50, 35, 40, 27], dir, null);
  }

  // Credit by branch
  y = await sectionHeader(doc, `${l.credit} — ${l.branch}`, y, dir, W, ML);
  const creditByBranch = branchMetrics.map(b => ({
    name: b.name,
    value: safeNum(b.totalCredit),
    label: formatCurrency(safeNum(b.totalCredit), currency),
    color: b.creditPct > 30 ? C.danger : C.primary,
  }));
  y = await chartHorizBar(doc, creditByBranch, ML, y, TW, dir);

  await addFooter(doc, brandName, 6, TOTAL_PAGES, fromStr, toStr, dir, lang, W);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 7: Expense Analysis
  // ─────────────────────────────────────────────────────────────────────────
  doc.addPage();
  y = await drawHeader(l.expenseAnalysis);

  // Expense by category
  const expByCat = {};
  fExp.forEach(e => {
    const catKey = e.category_id || e.category || 'other';
    if (!expByCat[catKey]) expByCat[catKey] = 0;
    expByCat[catKey] += safeNum(e.amount);
  });
  const catLabels = {
    rent: l.rent, salaries: l.salaries, utilities: l.utilities, other: l.other,
  };
  const expCatData = Object.entries(expByCat).map(([cat, val]) => ({
    name: (catLabels[cat] || cat).slice(0, 10),
    value: safeNum(val),
  }));

  y = await sectionHeader(doc, l.fixedExpenses, y, dir, W, ML);
  y = chartBar(doc, expCatData, ML, y, TW, 55);

  // Expense by branch
  const expByBranch = branchMetrics.map(b => ({
    name: b.name.slice(0, 10),
    value: safeNum(b.totalExpenses),
    color: C.warning,
  }));
  y = await sectionHeader(doc, `${l.expenses} — ${l.branch}`, y, dir, W, ML);
  y = chartBar(doc, expByBranch, ML, y, TW, 45);

  // Expense trend
  const expTrendMap = {};
  fExp.forEach(e => {
    if (!expTrendMap[e.date]) expTrendMap[e.date] = 0;
    expTrendMap[e.date] += safeNum(e.amount);
  });
  const expTrendData = Object.entries(expTrendMap).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ date: k, value: v }));
  y = await sectionHeader(doc, `${l.expenses} — ${l.trend}`, y, dir, W, ML);
  if (expTrendData.length > 1) {
    y = chartLine(doc, expTrendData, ML, y, TW, 40);
  } else { await txt(doc, l.noData, ML + 5, y + 12, { size: 8, color: C.muted }, dir); y += 22; }

  // Expense table
  y = await sectionHeader(doc, l.expenseAnalysis, y, dir, W, ML);
  const eHeaders = [l.date, l.branch, l.expenses, l.amount];
  const eRows = fExp.slice(0, 20).map(e => [
    e.date,
    e.branch_key === 'all' ? l.branch : (branches.find(b => b.key === e.branch_key)?.label || e.branch_key),
    (catLabels[e.category_id] || e.category_id || '').slice(0, 18),
    formatCurrency(safeNum(e.amount), currency),
  ]);
  y = await drawTable(doc, eHeaders, eRows, ML, y, [28, 40, 45, 33], dir, null);

  await addFooter(doc, brandName, 7, TOTAL_PAGES, fromStr, toStr, dir, lang, W);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 8: Price & Profitability Analysis
  // ─────────────────────────────────────────────────────────────────────────
  doc.addPage();
  y = await drawHeader(l.priceAnalysis);

  // Profitability by product (purchases)
  y = await sectionHeader(doc, `${l.purchaseCost} — ${l.topProducts}`, y, dir, W, ML);
  const top10Data = topProducts.slice(0, 10).map(([name, val]) => ({
    name: name.slice(0, 10),
    value: safeNum(val),
    color: C.warning,
  }));
  y = chartBar(doc, top10Data, ML, y, TW, 55);

  // Profitability summary table with validation
  y = await sectionHeader(doc, l.priceAnalysis, y, dir, W, ML);
  const profHeaders = [l.branch, l.totalSales, l.grossProfit, l.margin];
  const profRows = branchMetrics.map(b => {
    const marginPct = safePct(b.profit, b.totalSales);
    return [
      b.name,
      formatCurrency(safeNum(b.totalSales), currency),
      formatCurrency(safeNum(b.profit), currency),
      marginPct !== null ? `${marginPct.toFixed(1)}%` : l.noData,
    ];
  });
  y = await drawTable(doc, profHeaders, profRows, ML, y, [50, 40, 40, 32], dir, null);

  // Net profit summary box
  y += 4;
  const netGuidance = [
    `${l.totalSales}: ${formatCurrency(safeNum(metrics.totalSales), currency)}`,
    `${l.purchaseCost}: ${formatCurrency(safeNum(metrics.totalPurchaseCost), currency)}`,
    `${l.totalExpenses}: ${formatCurrency(safeNum(metrics.totalExpenses), currency)}`,
    `${l.netProfit}: ${formatCurrency(safeNum(metrics.netProfit), currency)}`,
  ];
  y = await guidanceBox(doc, netGuidance, ML, y, TW, dir);

  await addFooter(doc, brandName, 8, TOTAL_PAGES, fromStr, toStr, dir, lang, W);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 9: Branch–Owner Settlement
  // ─────────────────────────────────────────────────────────────────────────
  doc.addPage();
  const settlementTitle9 = lang === 'fa' ? 'تسویه فرع با اونر' : lang === 'ar' ? 'تسوية الفروع مع المالك' : 'Branch–Owner Settlement';
  y = await drawHeader(settlementTitle9);

  const settlements9 = computeBranchSettlements(walletTransactions, branches);
  const totalHeld9 = Object.values(settlements9).reduce((s, v) => s + v.remaining, 0);
  const settleBranches9 = branches.filter(b => settlements9[b.key]);

  // Summary KPI row
  const settleKpis = [
    { label: lang === 'fa' ? 'کل نزد اونر' : 'Total Held', value: formatCurrency(totalHeld9, currency), color: totalHeld9 >= 0 ? C.success : C.danger },
    { label: lang === 'fa' ? 'فروع فعال' : 'Active Branches', value: String(settleBranches9.length), color: C.primary },
    { label: lang === 'fa' ? 'کل ارسالی' : 'Total Sent', value: formatCurrency(Object.values(settlements9).reduce((s, v) => s + v.sentToOwner, 0), currency), color: C.primary },
    { label: lang === 'fa' ? 'کل مصارف اونر' : 'Owner Spent', value: formatCurrency(Object.values(settlements9).reduce((s, v) => s + v.ownerExpenseForBranch + v.returnedToBranch, 0), currency), color: C.warning },
  ];
  y = await kpiRow(doc, settleKpis, y, ML, TW, dir);

  // Per-branch settlement table
  y = await sectionHeader(doc, lang === 'fa' ? 'جدول تسویه شعب' : lang === 'ar' ? 'جدول تسوية الفروع' : 'Branch Settlement Ledger', y, dir, W, ML);

  const settleHeaders = lang === 'fa'
    ? ['شعبه', 'ارسال به اونر', 'مصارف اونر', 'مبلغ بازگشتی', 'باقی‌مانده']
    : ['Branch', 'Sent to Owner', 'Owner Expenses', 'Returned', 'Remaining Balance'];
  const settleRows = branches.map(b => {
    const s = settlements9[b.key] || { sentToOwner: 0, ownerExpenseForBranch: 0, returnedToBranch: 0, remaining: 0 };
    return [
      b.label,
      formatCurrency(s.sentToOwner, currency),
      formatCurrency(s.ownerExpenseForBranch, currency),
      formatCurrency(s.returnedToBranch, currency),
      formatCurrency(s.remaining, currency),
    ];
  });
  y = await drawTable(doc, settleHeaders, settleRows, ML, y, [38, 34, 34, 30, 30], dir, null);

  // Settlement bar chart (sent vs remaining per branch)
  const settleChartData = branches.map(b => {
    const s = settlements9[b.key] || { sentToOwner: 0, remaining: 0 };
    return { name: b.label.slice(0, 8), value: safeNum(s.remaining), color: s.remaining < 0 ? C.danger : C.success };
  }).filter(d => d.value !== 0);

  if (settleChartData.length > 0) {
    y += 2;
    y = await sectionHeader(doc, lang === 'fa' ? 'باقی‌مانده هر فرع نزد اونر' : 'Remaining Balance per Branch', y, dir, W, ML);
    y = chartBar(doc, settleChartData, ML, y, TW, 45);
  }

  // Accounting note box
  const settleNote = lang === 'fa'
    ? ['باقی‌مانده هر فرع نزد اونر به عنوان موجودی عملیاتی ثبت می‌شود، نه سود جدید.', 'هیچ‌گاه انتقالی بین فرع و اونر به عنوان فروش جدید محاسبه نمی‌شود.']
    : lang === 'ar'
      ? ['يُسجَّل رصيد كل فرع لدى المالك كسيولة تشغيلية وليس ربحاً جديداً.', 'لا يُحتسب أي تحويل بين الفرع والمالك مبيعات جديدة.']
      : ['Branch remaining balances held by owner are operational liquidity — not new profit.', 'Transfers between branch and owner are never counted as new sales revenue.'];
  y += 2;
  y = await guidanceBox(doc, settleNote, ML, y, TW, dir);

  // Negative balance warnings
  const negBranches = branches.filter(b => (settlements9[b.key]?.remaining || 0) < 0);
  if (negBranches.length > 0) {
    for (const b of negBranches) {
      y = checkBreak(doc, y, 14, null);
      fillRect(doc, ML, y, TW, 12, [254, 242, 242]);
      doc.setDrawColor(C.danger[0], C.danger[1], C.danger[2]);
      doc.setLineWidth(0.3);
      doc.rect(ML, y, TW, 12, 'D');
      const warnText = lang === 'fa'
        ? `⚠ ${b.label}: مصارف اونر بیشتر از مبلغ ارسالی است (${formatCurrency(settlements9[b.key].remaining, currency)})`
        : `⚠ ${b.label}: Owner spent more than received (${formatCurrency(settlements9[b.key].remaining, currency)})`;
      await txt(doc, warnText, isRTL ? W - ML - 2 : ML + 4, y + 7.5, { size: 8, bold: true, color: C.danger, align: isRTL ? 'right' : 'left' }, dir);
      y += 15;
    }
  }

  await addFooter(doc, brandName, 9, TOTAL_PAGES, fromStr, toStr, dir, lang, W);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 10: Smart Insights
  // ─────────────────────────────────────────────────────────────────────────
  doc.addPage();
  y = await drawHeader(l.smartInsights);

  // Auto-generated insights
  const insights = [];

  // Profit insights
  if (metrics.netProfit < 0) {
    insights.push({ sev: 'critical', title: lang === 'fa' ? 'زیان خالص شناسایی شد' : lang === 'ar' ? 'تم تحديد خسارة صافية' : 'Net Loss Detected', msg: formatCurrency(safeNum(metrics.netProfit), currency) });
  } else {
    insights.push({ sev: 'info', title: lang === 'fa' ? 'سود خالص مثبت' : lang === 'ar' ? 'ربح صافي إيجابي' : 'Positive Net Profit', msg: formatCurrency(safeNum(metrics.netProfit), currency) });
  }

  // Credit risk
  if (metrics.creditPct > 30) {
    insights.push({ sev: 'critical', title: lang === 'fa' ? 'نرخ اعتبار بالا' : lang === 'ar' ? 'معدل ائتمان مرتفع' : 'High Credit Rate', msg: `${safeNum(metrics.creditPct).toFixed(1)}%` });
  }

  // Expense ratio
  if (metrics.totalSales > 0) {
    const expRatio = safePct(metrics.totalExpenses, metrics.totalSales);
    if (expRatio !== null && expRatio > 40) {
      insights.push({ sev: 'warning', title: lang === 'fa' ? 'مصارف بالا' : lang === 'ar' ? 'مصاريف مرتفعة' : 'High Expense Ratio', msg: `${expRatio.toFixed(1)}%` });
    }
  }

  // Branch risks
  branchMetrics.forEach(b => {
    if (b.creditPct > 40) {
      insights.push({ sev: 'warning', title: `${b.name}: ${lang === 'fa' ? 'اعتبار بالا' : 'High Credit'}`, msg: `${safeNum(b.creditPct).toFixed(1)}%` });
    }
    if (b.profit < 0) {
      insights.push({ sev: 'critical', title: `${b.name}: ${lang === 'fa' ? 'زیان' : 'Loss'}`, msg: formatCurrency(safeNum(b.profit), currency) });
    }
  });

  // Low stock alerts
  const lowStockItems = inventory.filter(i => safeNum(i.opening_stock) <= safeNum(i.low_stock_threshold));
  if (lowStockItems.length > 0) {
    insights.push({ sev: 'warning', title: lang === 'fa' ? 'هشدار موجودی پایین' : 'Low Stock Warning', msg: `${lowStockItems.length} ${lang === 'fa' ? 'قلم' : 'items'}` });
  }

  // Outstanding
  if (totalOutstanding > 0) {
    insights.push({ sev: 'warning', title: lang === 'fa' ? 'فاکتورهای معوق' : 'Outstanding Invoices', msg: formatCurrency(totalOutstanding, currency) });
  }

  // Render insights
  const sevColors = { critical: C.danger, warning: C.warning, info: C.primary };
  for (const ins of insights) {
    y = checkBreak(doc, y, 20, null);
    const col = sevColors[ins.sev] || C.primary;
    fillRect(doc, ML, y, 4, 14, col);
    fillRect(doc, ML + 4, y, TW - 4, 14, [...col.map(c => Math.min(255, c + 200))]);
    const ix = isRTL ? W - ML - 2 : ML + 8;
    const ialign = isRTL ? 'right' : 'left';
    await txt(doc, ins.title, ix, y + 5.5, { size: 8, bold: true, color: col, align: ialign }, dir);
    await txt(doc, ins.msg || '', ix, y + 11, { size: 7.5, color: C.dark, align: ialign }, dir);
    y += 17;
  }

  if (insights.length === 0) {
    await txt(doc, lang === 'fa' ? 'هیچ مشکلی شناسایی نشد' : 'No issues detected', ML + 5, y + 15, { size: 9, color: C.success }, dir);
    y += 30;
  }

  await addFooter(doc, brandName, 10, TOTAL_PAGES, fromStr, toStr, dir, lang, W);

  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 11: Management Guidance
  // ─────────────────────────────────────────────────────────────────────────
  doc.addPage();
  y = await drawHeader(l.managementGuidance);

  const growthActions = lang === 'fa' ? [
    'تقویت کانال‌های بازاریابی دیجیتال برای افزایش آگاهی از برند',
    'راه‌اندازی برنامه وفاداری مشتریان برای افزایش خریدهای مکرر',
    'گسترش منوی محصولات پرفروش به‌عنوان آیتم‌های ویژه',
    'معرفی تبلیغات فصلی برای جذب مشتریان جدید',
    'آموزش کارکنان برای ارائه خدمات بهتر به مشتری',
    'تحلیل رقبا و تنظیم قیمت‌گذاری رقابتی',
    'بهبود حضور آنلاین از طریق رسانه‌های اجتماعی',
    'ایجاد مشارکت با کسب‌وکارهای محلی',
    'بهینه‌سازی ساعات کاری بر اساس ساعات اوج',
    'پیاده‌سازی سیستم مدیریت ارتباط با مشتری',
  ] : lang === 'ar' ? [
    'تعزيز قنوات التسويق الرقمي لزيادة الوعي بالعلامة التجارية',
    'إطلاق برنامج ولاء العملاء لزيادة عمليات الشراء المتكررة',
    'توسيع قائمة المنتجات الأكثر مبيعاً كعروض خاصة',
    'تقديم عروض موسمية لجذب عملاء جدد',
    'تدريب الموظفين لتقديم خدمة عملاء أفضل',
    'تحليل المنافسين وتحديد التسعير التنافسي',
    'تحسين الحضور الإلكتروني عبر وسائل التواصل الاجتماعي',
    'إنشاء شراكات مع الشركات المحلية',
    'تحسين ساعات العمل بناءً على ساعات الذروة',
    'تطبيق نظام إدارة علاقات العملاء',
  ] : [
    'Strengthen digital marketing channels to increase brand awareness',
    'Launch a customer loyalty program to increase repeat purchases',
    'Expand top-selling menu items as featured specials',
    'Introduce seasonal promotions to attract new customers',
    'Train staff to deliver better customer service',
    'Analyze competitors and set competitive pricing',
    'Improve online presence through social media',
    'Create partnerships with local businesses',
    'Optimize operating hours based on peak times',
    'Implement a customer relationship management system',
  ];

  const profitActions = lang === 'fa' ? [
    'کاهش هزینه‌های ثابت از طریق مذاکره با صاحبخانه',
    'بهینه‌سازی منوی غذایی برای حذف اقلام کم‌سود',
    'پیاده‌سازی مدیریت بهتر موجودی برای کاهش ضایعات',
    'بررسی قراردادهای تأمین‌کنندگان برای قیمت‌های بهتر',
    'استفاده از اتوماسیون برای کاهش هزینه‌های نیروی انسانی',
    'بررسی و بهینه‌سازی مصرف انرژی',
    'تنظیم قیمت‌های منوی غذایی بر اساس تحلیل هزینه-سود',
    'معرفی اقلام حاشیه سود بالا به منوی غذایی',
    'کاهش ضایعات با برنامه‌ریزی بهتر تولید',
    'بهینه‌سازی سیستم ارسال سفارشات',
  ] : lang === 'ar' ? [
    'تخفيض التكاليف الثابتة من خلال التفاوض مع الملاك',
    'تحسين قائمة الطعام لإزالة العناصر منخفضة الربحية',
    'تطبيق إدارة مخزون أفضل للحد من الهدر',
    'مراجعة عقود الموردين للحصول على أسعار أفضل',
    'استخدام الأتمتة لتقليل تكاليف العمالة',
    'مراجعة وتحسين استهلاك الطاقة',
    'تعديل أسعار القائمة بناءً على تحليل التكلفة والعائد',
    'إضافة عناصر ذات هامش ربح عالٍ للقائمة',
    'تقليل الهدر من خلال تخطيط الإنتاج بشكل أفضل',
    'تحسين نظام معالجة الطلبات',
  ] : [
    'Reduce fixed costs through landlord negotiation',
    'Optimize menu by removing low-margin items',
    'Implement better inventory management to reduce waste',
    'Review supplier contracts for better pricing',
    'Use automation to reduce labor costs',
    'Review and optimize energy consumption',
    'Adjust menu prices based on cost-benefit analysis',
    'Introduce high-margin items to the menu',
    'Reduce waste through better production planning',
    'Optimize the order processing system',
  ];

  const shortActions = lang === 'fa' ? {
    expense: ['کاهش مصارف اداری', 'استفاده از تأمین‌کنندگان محلی', 'کاهش مصرف برق', 'بررسی اجاره‌بها', 'حذف مصارف غیرضروری'],
    inventory: ['بهینه‌سازی سطح موجودی', 'سفارش به موقع', 'کاهش ضایعات', 'پیش‌بینی تقاضا', 'FIFO برای موجودی'],
    credit: ['پیگیری بدهی‌های معوق', 'محدودیت اعتبار', 'سیستم یادآوری پرداخت', 'تخفیف نقدی', 'ارزیابی ریسک مشتری'],
  } : lang === 'ar' ? {
    expense: ['تخفيض النفقات الإدارية', 'استخدام موردين محليين', 'تخفيض استهلاك الكهرباء', 'مراجعة الإيجار', 'إزالة النفقات غير الضرورية'],
    inventory: ['تحسين مستويات المخزون', 'الطلب في الوقت المناسب', 'تقليل الهدر', 'التنبؤ بالطلب', 'FIFO للمخزون'],
    credit: ['متابعة الديون المتأخرة', 'تحديد الائتمان', 'نظام تذكير بالدفع', 'خصم نقدي', 'تقييم مخاطر العميل'],
  } : {
    expense: ['Reduce administrative expenses', 'Use local suppliers', 'Reduce electricity consumption', 'Review rent', 'Eliminate unnecessary expenses'],
    inventory: ['Optimize inventory levels', 'Order on time', 'Reduce waste', 'Forecast demand', 'Use FIFO for inventory'],
    credit: ['Follow up overdue debts', 'Set credit limits', 'Payment reminder system', 'Cash discount offer', 'Customer risk assessment'],
  };

  y = await sectionHeader(doc, l.growthActions, y, dir, W, ML);
  y = await guidanceBox(doc, growthActions.slice(0, 5), ML, y, TW / 2 - 2, dir);

  // Right column: profit actions
  let y2 = 36 + 12; // after header
  y2 = await sectionHeader(doc, l.profitActions, y2 - 12, dir, W, W / 2 + 1);
  y2 = await guidanceBox(doc, profitActions.slice(0, 5), W / 2 + 1, y2, TW / 2 - 1, dir);

  y = Math.max(y, y2) + 4;

  // Second row
  y = await sectionHeader(doc, l.expenseActions, y, dir, W, ML);
  y = await guidanceBox(doc, shortActions.expense, ML, y, TW, dir);

  y = await sectionHeader(doc, l.inventoryActions, y, dir, W, ML);
  y = await guidanceBox(doc, shortActions.inventory, ML, y, TW, dir);

  y = await sectionHeader(doc, l.creditActions, y, dir, W, ML);
  y = await guidanceBox(doc, shortActions.credit, ML, y, TW, dir);

  await addFooter(doc, brandName, 11, TOTAL_PAGES, fromStr, toStr, dir, lang, W);

  // ─── Save ─────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  // PAGE 12: Product Consumption Analytics
  // ─────────────────────────────────────────────────────────────────────────
  doc.addPage();
  y = await drawHeader(l.productConsumption);

  // Compute product analytics from supplierInvoices items
  {
    const productMap12 = {};
    const todayMap12   = {};
    const reportEnd    = toStr;

    supplierInvoices.forEach(inv => {
      const invDate = inv.date || '';
      if (invDate < fromStr || invDate > toStr) return;
      const items = Array.isArray(inv.items) ? inv.items : [];
      items.forEach(item => {
        if (!item) return;
        const name = (item.product_name || '').trim() || 'Unknown';
        const pid  = item.product_id || name;
        const qty  = Number(item.quantity) || 0;
        const cost = Number(item.line_total) || (qty * (Number(item.unit_cost) || 0));
        const unit = (item.unit || '').trim() || 'unit';
        if (!productMap12[pid]) productMap12[pid] = { name, unit, qty: 0, cost: 0 };
        productMap12[pid].qty  += qty;
        productMap12[pid].cost += cost;
        if (unit && unit !== 'unit') productMap12[pid].unit = unit;
        if (invDate === reportEnd) {
          if (!todayMap12[pid]) todayMap12[pid] = { name, unit, qty: 0, cost: 0 };
          todayMap12[pid].qty  += qty;
          todayMap12[pid].cost += cost;
        }
      });
    });

    const monthlyList12 = Object.values(productMap12).sort((a, b) => b.qty - a.qty);
    const todayList12   = Object.values(todayMap12).sort((a, b) => b.qty - a.qty);
    const topConsumed12 = monthlyList12[0] || null;
    const highestCost12 = monthlyList12.length > 0 ? [...monthlyList12].sort((a, b) => b.cost - a.cost)[0] : null;

    // Highlight cards
    if (topConsumed12 || highestCost12) {
      const cardW12 = (TW - 4) / 2;
      if (topConsumed12) {
        doc.setFillColor(243, 232, 255);
        doc.roundedRect(ML, y, cardW12, 18, 2, 2, 'F');
        await txt(doc, l.topConsumed, ML + 3, y + 5, { size: 7, color: [109, 40, 217] }, dir);
        await txt(doc, topConsumed12.name.slice(0, 20), ML + 3, y + 10, { size: 8, bold: true, color: C.dark }, dir);
        await txt(doc, String(topConsumed12.qty % 1 === 0 ? topConsumed12.qty : topConsumed12.qty.toFixed(2)) + ' ' + topConsumed12.unit, ML + 3, y + 15, { size: 9, bold: true, color: [109, 40, 217] }, dir);
      }
      if (highestCost12) {
        const cx12 = ML + cardW12 + 4;
        doc.setFillColor(255, 237, 213);
        doc.roundedRect(cx12, y, cardW12, 18, 2, 2, 'F');
        await txt(doc, l.highestCost, cx12 + 3, y + 5, { size: 7, color: [194, 65, 12] }, dir);
        await txt(doc, highestCost12.name.slice(0, 20), cx12 + 3, y + 10, { size: 8, bold: true, color: C.dark }, dir);
        await txt(doc, formatCurrency(highestCost12.cost, currency), cx12 + 3, y + 15, { size: 9, bold: true, color: [194, 65, 12] }, dir);
      }
      y += 22;
    }

    // Monthly product table
    if (monthlyList12.length > 0) {
      y = await sectionHeader(doc, l.monthlyUsage, y, dir, W, ML);
      const mHeaders12 = ['#', l.product, l.qty, l.unit, l.cost];
      const mRows12 = monthlyList12.slice(0, 15).map((p, i) => [
        String(i + 1),
        p.name.slice(0, 22),
        String(p.qty % 1 === 0 ? p.qty : p.qty.toFixed(2)),
        p.unit,
        formatCurrency(p.cost, currency),
      ]);
      y = await drawTable(doc, mHeaders12, mRows12, ML, y, [10, 60, 20, 22, 30], dir, null);
    } else {
      await txt(doc, l.noData, ML + 5, y + 10, { size: 8, color: C.muted }, dir);
      y += 18;
    }

    // Today's usage table
    if (todayList12.length > 0) {
      y = await sectionHeader(doc, l.todayUsage, y, dir, W, ML);
      const tHeaders12 = [l.product, l.qty, l.unit, l.cost];
      const tRows12 = todayList12.slice(0, 10).map(p => [
        p.name.slice(0, 28),
        String(p.qty % 1 === 0 ? p.qty : p.qty.toFixed(2)),
        p.unit,
        formatCurrency(p.cost, currency),
      ]);
      y = await drawTable(doc, tHeaders12, tRows12, ML, y, [70, 25, 25, 32], dir, null);
    }
  }

  await addFooter(doc, brandName, 12, TOTAL_PAGES, fromStr, toStr, dir, lang, W);

  doc.save(safePdfFilename(`executive-report-${fromStr}-${toStr}`, lang));
  return doc;
}