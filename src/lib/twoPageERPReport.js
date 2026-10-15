import { drawLocalizedPdfText } from './pdfLocalization';
import { drawERPReportBrand } from './erpPdfBrand';
import { buildPdfConsumptionCostControl } from './reportConsumptionCostControl';

/**
 * Vector A4 executive report based on the approved BizCTRL two-page design:
 * sales and payment analytics on page 1; approved purchases, allocated expenses,
 * stock and VERIFIED consumption on page 2. No fictitious orders/suppliers/COGS.
 *
 * Uses only tenant/branch-scoped snapshots already supplied by Reports and
 * ScheduledReports. Charts plot period values and aligned previous-period points,
 * never extrapolated demo data. PDF is always exactly two pages.
 */
export function aggregateReportTrend(rows = [], limit = 14) {
  if (!rows.length) return [];
  const bucketSize = Math.max(1, Math.ceil(rows.length / limit));
  const grouped = [];
  for (let i = 0; i < rows.length; i += bucketSize) {
    const part = rows.slice(i, i + bucketSize);
    grouped.push({
      from: part[0].date, to: part[part.length - 1].date,
      sales: part.reduce((a, row) => a + (Number(row.sales) || 0), 0),
      purchases: part.reduce((a, row) => a + (Number(row.purchases) || 0), 0),
      expenses: part.reduce((a, row) => a + (Number(row.variable) || 0) + (Number(row.fixed) || 0), 0),
      closings: part.reduce((a, row) => a + (Number(row.closings) || 0), 0),
    });
  }
  return grouped;
}
export function summarizeReportRows(rows, limit, otherLabel) {
  if (rows.length <= limit) return rows;
  return [...rows.slice(0, limit - 1), {
    name: otherLabel,
    value: rows.slice(limit - 1).reduce((a, row) => a + (Number(row.value) || 0), 0),
  }];
}

const NAVY = [18, 35, 64];
const MUTED = [91, 108, 137];
const BLUE = [29, 104, 241];
const SKY = [121, 177, 247];
const VIOLET = [139, 92, 246];
const GREEN = [10, 163, 114];
const AMBER = [233, 153, 35];
const ROSE = [221, 80, 105];
const BORDER = [221, 231, 244];
const PAPER = [246, 249, 254];

const DICT = {
  sales: ['Sales analytics', 'تحلیل فروشات', 'تحليل المبيعات'],
  costs: ['Purchases, expenses & inventory', 'خریداری، مصارف و انبار', 'المشتريات والمصروفات والمخزون'],
  salesHeading: ['SALES PERFORMANCE', 'عملکرد فروشات', 'أداء المبيعات'],
  costHeading: ['COST & INVENTORY CONTROL', 'کنترل مصارف و انبار', 'رقابة التكاليف والمخزون'],
  period: ['Reporting period', 'دوره گزارش', 'فترة التقرير'],
  branch: ['Branch', 'شعبه', 'الفرع'],
  currency: ['Currency', 'واحد پول', 'العملة'],
  verified: ['Verified ERP records', 'داده‌های تأییدشده ERP', 'سجلات ERP المعتمدة'],
  current: ['Selected period', 'دوره انتخاب‌شده', 'الفترة المحددة'],
  previous: ['Previous comparable period', 'دوره قبلی', 'الفترة السابقة المماثلة'],
  salesTotal: ['Finalized sales', 'مجموع فروشات نهایی', 'إجمالي المبيعات المعتمدة'],
  cash: ['Cash sales', 'فروشات نقدی', 'المبيعات النقدية'],
  network: ['Card / network', 'فروشات شبکه', 'مبيعات الشبكة'],
  credit: ['Customer credit', 'فروشات نسیه', 'المبيعات الآجلة'],
  closings: ['Finalized closings', 'تعداد بستن فروش', 'عدد الإقفالات المعتمدة'],
  average: ['Average sales / day', 'میانگین روزانه', 'متوسط المبيعات اليومي'],
  salesTrend: ['Sales trend and prior comparison', 'روند فروشات و مقایسه دوره قبل', 'اتجاه المبيعات ومقارنة الفترة السابقة'],
  payment: ['Sales by payment channel', 'ترکیب روش‌های پرداخت', 'المبيعات حسب طريقة الدفع'],
  branchSales: ['Branch performance', 'عملکرد فروشات شعب', 'أداء مبيعات الفروع'],
  performance: ['Executive insights', 'خلاصه مدیریتی', 'ملخص تنفيذي'],
  purchases: ['Approved purchases', 'خریداری تأییدشده', 'المشتريات المعتمدة'],
  expenses: ['Period expenses', 'مصارف دوره', 'مصروفات الفترة'],
  variable: ['Variable expenses', 'مصارف متغیر', 'المصروفات المتغيرة'],
  fixed: ['Allocated fixed cost', 'سهم مصارف ثابت', 'التكاليف الثابتة الموزعة'],
  balance: ['Sales minus purchases & expenses', 'فروش منهای خرید و مصارف', 'المبيعات ناقص المشتريات والمصروفات'],
  waste: ['Recorded waste', 'ضایعات ثبت‌شده', 'الهدر المسجل'],
  purchaseTrend: ['Purchase trend', 'روند خریداری', 'اتجاه المشتريات'],
  expenseTrend: ['Expense trend', 'روند مصارف', 'اتجاه المصروفات'],
  categories: ['Expense categories', 'دسته‌های مصارف', 'فئات المصروفات'],
  consumption: ['Inventory consumption (recorded)', 'مصرف ثبت‌شده انبار', 'استهلاك المخزون المسجل'],
  stock: ['Inventory & stock alerts', 'موجودی و هشدارهای انبار', 'المخزون وتنبيهات الكميات'],
  branchCost: ['Purchases vs expenses by branch', 'خرید و مصارف به تفکیک شعبه', 'المشتريات والمصروفات حسب الفرع'],
  available: ['Records available', 'رکورد موجود', 'سجلات متاحة'],
  unavailable: ['Not recorded', 'ثبت نشده', 'غير مسجل'],
  costMissing: ['Unit cost unavailable', 'نرخ واحد موجود نیست', 'تكلفة الوحدة غير متاحة'],
  lowStock: ['Low-stock items', 'اقلام کم‌موجود', 'أصناف منخفضة المخزون'],
  noStock: ['Out-of-stock items', 'اقلام تمام‌شده', 'أصناف نفدت'],
  tracked: ['Tracked inventory items', 'اقلام ثبت‌شده', 'الأصناف المسجلة'],
  other: ['Other / remaining', 'سایر موارد / باقیمانده', 'أخرى / المتبقي'],
  note1: ['Finalized sales only. Cash, card and credit are components of sales, not extra revenue.',
    'فقط فروشات نهایی؛ نقد، شبکه و نسیه بخشی از فروشات اند، نه درآمد اضافی.',
    'المبيعات المعتمدة فقط؛ النقد والشبكة والآجل أجزاء من المبيعات وليست إيراداً إضافياً.'],
  note2: ['Purchases are NOT stock-adjusted COGS. Inventory is a current snapshot; usage is recorded movements only.',
    'خریداری بهای تمام‌شدهٔ تعدیل‌شده نیست؛ موجودی لحظه‌ای و مصرف صرفاً از حرکات ثبت‌شده است.',
    'المشتريات ليست تكلفة مبيعات معدلة بالمخزون؛ الأرصدة لحظية والاستهلاك من الحركات المسجلة فقط.'],
};
const textFor = (lang, key) => DICT[key]?.[lang === 'fa' ? 1 : lang === 'ar' ? 2 : 0] || key;
const num = value => value === null || value === undefined || !Number.isFinite(Number(value))
  ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
const delta = (now, prior) => Number(prior) > 0 ? 100 * ((Number(now) || 0) - Number(prior)) / Number(prior) : null;
const compact = value => {
  const v = Number(value) || 0;
  if (Math.abs(v) >= 1000000) return num(v / 1000000) + 'm';
  if (Math.abs(v) >= 1000) return num(v / 1000) + 'k';
  return num(v);
};

export function drawTwoPageERPReport(doc, {
  snapshot: s, previousSnapshot: p = null, growth = null, report: ops = null,
  range, branchLabel, businessName, currency = 'SAR', lang = 'en', iconData,
}) {
  if (!s || !range?.from || !range?.to) throw new Error('Verified ERP report scope is required');
  const rtl = lang !== 'en';
  const T = key => textFor(lang, key);
  const line = (x1, y1, x2, y2, color = BORDER, width = .25) => {
    doc.setLineWidth(width); doc.setDrawColor(...color); doc.line(x1, y1, x2, y2);
  };
  const box = (x, y, w, h, fill = [255, 255, 255], stroke = BORDER, rad = 3) => {
    doc.setLineWidth(.23); doc.setFillColor(...fill); doc.setDrawColor(...stroke);
    doc.roundedRect(x, y, w, h, rad, rad, 'FD');
  };
  const txt = (value, x, y, w, size = 9, color = NAVY, bold = true, align) => {
    const where = align || (rtl ? 'right' : 'left');
    drawLocalizedPdfText(doc, String(value ?? '—'), where === 'right' ? x + w : where === 'center' ? x + w / 2 : x,
      y, { rtl, bold, size, color, fit: true, maxWidth: w - 1, align: where });
  };
  const marker = (x, y, color) => {
    doc.setFillColor(...color); doc.circle(x, y, 1.15, 'F');
  };
  const heading = (label, x, y, w, note = '') => {
    txt(label, x + 4, y + 7, w - 9, 10, NAVY, true);
    if (note) txt(note, x + 4, y + 12.5, w - 9, 6.9, MUTED, false);
  };
  const chartBase = (x, y, w, h, title, subtitle) => {
    box(x, y, w, h);
    heading(title, x, y, w, subtitle);
  };
  const money = value => value === null || value === undefined ? '—' : num(value) + ' ' + currency;
  const percent = value => value === null || value === undefined ? '—' : (value >= 0 ? '+' : '') + num(value) + '%';
  const seriesNow = aggregateReportTrend(s.breakdown || []);
  const seriesPrevious = aggregateReportTrend(p?.breakdown || []);
  const spark = (rows, key, x, y, w, h, color) => {
    const points = rows.slice(-14).map(row => Number(row[key]) || 0);
    if (!points.length) return;
    const max = Math.max(1, ...points);
    const xy = i => [x + (points.length === 1 ? w / 2 : i * w / (points.length - 1)),
      y + h - points[i] * h / max];
    doc.setDrawColor(...color); doc.setLineWidth(.45);
    points.forEach((_, i) => { if (i) { const a = xy(i - 1), b = xy(i); doc.line(a[0], a[1], b[0], b[1]); } });
  };
  const metric = (idx, label, value, tone, trendKey, compare) => {
    const col = idx % 3, row = Math.floor(idx / 3);
    const x = 7 + (rtl ? 2 - col : col) * 67;
    const y = 50 + row * 25.5;
    const tint = tone === 'green' ? [243, 252, 249] : tone === 'violet' ? [249, 246, 255] :
      tone === 'amber' ? [255, 251, 244] : [244, 249, 255];
    const accent = tone === 'green' ? GREEN : tone === 'violet' ? VIOLET : tone === 'amber' ? AMBER : BLUE;
    box(x, y, 62, 23, tint, BORDER, 3.6);
    doc.setFillColor(...accent); doc.roundedRect(x + 3, y + 3.6, 1.6, 5, .8, .8, 'F');
    txt(label, x + 7, y + 8, 50, 8.1, MUTED, true);
    txt(value, x + 5, y + 16, 52, 13, NAVY, true);
    const change = compare === null || compare === undefined ? null : compare;
    if (change !== null) txt(percent(change), x + 5, y + 21, 22, 6.2, change < 0 ? ROSE : GREEN);
    spark(seriesNow, trendKey, x + 38, y + 17.5, 18, 4.4, accent);
  };
  const framePage = (title, subtitle, page) => {
    doc.setFillColor(...PAPER); doc.rect(0, 23, 210, 261, 'F');
    drawERPReportBrand(doc, { lang, title, business: businessName, branch: branchLabel,
      period: range.from + ' / ' + range.to, iconData, pageLabel: page });
    box(7, 27.5, 196, 18, [255, 255, 255], BORDER, 3.2);
    const data = [
      [T('period'), range.from + ' – ' + range.to],
      [T('branch'), branchLabel],
      [T('currency'), currency],
    ];
    data.forEach(([label, value], i) => {
      const x = 11 + (rtl ? 2 - i : i) * 63.2;
      if (i) line(x - 2.2, 31, x - 2.2, 42, BORDER);
      txt(label, x, 33.1, 57, 7, MUTED, false);
      txt(value, x, 41.2, 57, 8.5, NAVY);
    });
    txt(subtitle, 9, 282.2, 192, 7, MUTED, false);
  };
  const trendPanel = (x, y, w, h, title, key, theme) => {
    chartBase(x, y, w, h, title, T('previous'));
    const cur = seriesNow, prior = seriesPrevious;
    const plotX = x + 11, plotY = y + 24, plotW = w - 17, plotH = h - 33;
    const max = Math.max(1, ...cur.map(r => Number(r[key]) || 0), ...prior.map(r => Number(r[key]) || 0));
    for (let i = 0; i <= 3; i++) {
      const py = plotY + plotH - i * plotH / 3;
      line(plotX, py, plotX + plotW, py, BORDER, .15);
      txt(compact(max * i / 3), x + 1.7, py + 1.6, 8.3, 6.2, MUTED, false, 'right');
    }
    const drawTrend = (rows, color, dotted = false) => {
      if (!rows.length) return;
      doc.setDrawColor(...color); doc.setFillColor(...color); doc.setLineWidth(.55);
      const points = rows.map((r, i) => ({
        x: plotX + (rows.length === 1 ? plotW / 2 : plotW * i / (rows.length - 1)),
        y: plotY + plotH - (Number(r[key]) || 0) * plotH / max,
      }));
      points.forEach((v, i) => {
        if (i && (!dotted || i % 2 === 0)) doc.line(points[i - 1].x, points[i - 1].y, v.x, v.y);
        if (!dotted) doc.circle(v.x, v.y, .7, 'F');
      });
    };
    drawTrend(prior, SKY, true);
    drawTrend(cur, theme);
    marker(x + 6, y + 17, theme); txt(T('current'), x + 9, y + 18.6, (w - 17) / 2 - 7, 6.8, MUTED, false);
    marker(x + w / 2 + 2, y + 17, SKY);
    txt(T('previous'), x + w / 2 + 5, y + 18.6, w / 2 - 11, 6.8, MUTED, false);
    if (cur.length) {
      txt(cur[0].from, plotX, y + h - 2.8, plotW / 2, 6.2, MUTED, false, 'left');
      txt(cur[cur.length - 1].to, plotX + plotW / 2, y + h - 2.8, plotW / 2, 6.2, MUTED, false, 'right');
    } else txt(T('unavailable'), x + 10, y + h / 2, w - 20, 8.5, MUTED, false, 'center');
  };
  const donut = (cx, cy, radius, values, colors) => {
    const total = values.reduce((a, b) => a + Math.max(0, Number(b) || 0), 0);
    if (total <= 0) {
      doc.setDrawColor(...BORDER); doc.setLineWidth(2.2); doc.circle(cx, cy, radius - 2, 'S');
      txt('—', cx - 12, cy + 2, 24, 12, MUTED, true, 'center');
      return;
    }
    let position = -Math.PI / 2;
    values.forEach((value, i) => {
      const angle = Math.PI * 2 * Math.max(0, Number(value) || 0) / total;
      const steps = Math.max(1, Math.ceil(angle / .09));
      doc.setFillColor(...colors[i % colors.length]);
      for (let n = 0; n < steps; n++) {
        const a = position + angle * n / steps, b = position + angle * (n + 1) / steps;
        doc.triangle(cx, cy, cx + radius * Math.cos(a), cy + radius * Math.sin(a),
          cx + radius * Math.cos(b), cy + radius * Math.sin(b), 'F');
      }
      position += angle;
    });
    doc.setFillColor(255, 255, 255); doc.circle(cx, cy, radius * .56, 'F');
    txt(compact(total), cx - radius * .5, cy + 1.5, radius, 10.7, NAVY, true, 'center');
    txt(currency, cx - radius * .5, cy + 6.5, radius, 6.3, MUTED, false, 'center');
  };
  const barRows = (x, startY, width, rows, maxRows, tone, rowHeight = 9.2, showCurrency = true) => {
    const normalized = summarizeReportRows([...rows].filter(r => Number.isFinite(Number(r.value)))
      .sort((a, b) => b.value - a.value), maxRows, T('other'));
    if (!normalized.length) { txt(T('unavailable'), x, startY + 8, width, 8.6, MUTED, false); return; }
    const peak = Math.max(1, ...normalized.map(r => Math.abs(r.value)));
    normalized.forEach((r, i) => {
      const yy = startY + i * rowHeight;
      txt(r.name, x + 1, yy, width * .61, 7.3, NAVY);
      txt(showCurrency ? num(r.value) : r.display || num(r.value),
        x + width * .65, yy, width * .34, 7.3, MUTED, true, rtl ? 'left' : 'right');
      // Bar is on its own baseline, never under a Persian label or amount.
      const by = yy + 1.8, bw = width * .44;
      doc.setFillColor(230, 237, 247); doc.roundedRect(x + 1, by, bw, 1.25, .5, .5, 'F');
      const rw = bw * Math.abs(r.value) / peak;
      if (rw > 1) {
        doc.setFillColor(...tone); doc.roundedRect(x + 1, by, rw, 1.25, .5, .5, 'F');
      }
    });
  };
  // ─────────────────────── Page 1: Sales ───────────────────────
  framePage(T('sales'), T('note1'), '1 / 2');
  metric(0, T('salesTotal'), money(s.sales), 'blue', 'sales', growth);
  metric(1, T('cash'), money(s.cash), 'green', 'sales', delta(s.cash, p?.cash));
  metric(2, T('network'), money(s.network), 'violet', 'sales', delta(s.network, p?.network));
  metric(3, T('credit'), money(s.credit), 'amber', 'sales', delta(s.credit, p?.credit));
  metric(4, T('closings'), num(s.finalizedClosings), 'violet', 'sales', null);
  metric(5, T('average'), money(s.averageDailySales), 'blue', 'sales', delta(s.averageDailySales, p?.averageDailySales));
  trendPanel(7, 103, 122, 69, T('salesTrend'), 'sales', BLUE);
  chartBase(134, 103, 69, 69, T('payment'));
  const payment = [
    [T('cash'), s.cash, GREEN], [T('network'), s.network, BLUE],
    [T('credit'), s.credit, VIOLET], [T('other'), s.other, AMBER],
  ];
  donut(155, 139, 14, payment.map(r => r[1]), payment.map(r => r[2]));
  payment.forEach(([name, value, color], i) => {
    marker(174, 125 + i * 10.5, color);
    txt(name, 176.5, 127 + i * 10.5, 23, 6.3, MUTED, false);
    txt(num(value), 176.5, 131 + i * 10.5, 23, 7.4, NAVY);
  });
  chartBase(7, 176, 98, 52, T('branchSales'));
  barRows(12, 191, 89, (ops?.branches || []).map(r => ({
    name: r.name, value: Number(r.sales) || 0,
  })), 4, BLUE, 8);
  chartBase(110, 176, 93, 52, T('performance'));
  const bestBranch = (ops?.branches || []).slice().sort((a, b) => (b.sales || 0) - (a.sales || 0))[0];
  const insights = [
    [T('salesTotal'), money(s.sales)],
    [T('current') + ' / ' + T('previous'), percent(growth)],
    [T('branchSales'), bestBranch ? bestBranch.name : T('unavailable')],
  ];
  insights.forEach(([label, value], i) => {
    const yy = 190 + i * 11.6;
    txt(label, 115, yy, 83, 7.3, MUTED, false);
    txt(value, 115, yy + 4.9, 83, 9.1, NAVY);
    if (i < 2) line(115, yy + 7, 198, yy + 7, BORDER, .13);
  });
  box(7, 233, 196, 44, [247, 252, 250], [213, 239, 229]);
  heading(T('performance'), 7, 233, 196);
  const salesShare = Number(s.sales) > 0 ? 100 * Number(s.network || 0) / Number(s.sales) : null;
  const insights2 = [
    [T('network'), salesShare === null ? '—' : num(salesShare) + '%'],
    [T('closings'), num(s.finalizedClosings)],
    [T('average'), money(s.averageDailySales)],
  ];
  insights2.forEach(([label, value], i) => {
    const x = 13 + (rtl ? 2 - i : i) * 63;
    if (i > 0) line(x - 2, 247, x - 2, 270, BORDER, .23);
    txt(label, x, 254, 56, 7.4, MUTED, false);
    txt(value, x, 265, 56, 12, i === 0 ? GREEN : NAVY);
  });

  // ─────────────────────── Page 2: Purchases / Expenses / Inventory ───────────────────────
  doc.addPage();
  framePage(T('costs'), T('note2'), '2 / 2');
  const control = buildPdfConsumptionCostControl({
    snapshot: s, previousSnapshot: p, operationsReport: ops,
  });
  metric(0, T('purchases'), money(s.purchases), 'blue', 'purchases', delta(s.purchases, p?.purchases));
  metric(1, T('expenses'), money(s.totalExpenses), 'violet', 'expenses', delta(s.totalExpenses, p?.totalExpenses));
  metric(2, T('variable'), money(s.variableExpenses), 'amber', 'expenses', delta(s.variableExpenses, p?.variableExpenses));
  metric(3, T('fixed'), money(s.fixedDeduction), 'blue', 'expenses', delta(s.fixedDeduction, p?.fixedDeduction));
  metric(4, T('balance'), money(s.netProfit), 'green', 'sales', delta(s.netProfit, p?.netProfit));
  metric(5, T('waste'), control.hasWasteData ? num(ops?.wasteQuantity) : '—',
    'amber', 'expenses', null);
  trendPanel(7, 103, 96, 67, T('purchaseTrend'), 'purchases', BLUE);
  trendPanel(107, 103, 96, 67, T('expenseTrend'), 'expenses', VIOLET);
  chartBase(7, 174, 96, 56, T('categories'));
  const groups = (ops?.costGroups || []).map(group => ({ name: group.name, value: Number(group.value) || 0 }))
    .filter(row => row.value > 0).sort((a, b) => b.value - a.value);
  const combinedGroups = summarizeReportRows(groups, 4, T('other'));
  donut(28, 203, 15, combinedGroups.map(row => row.value), [GREEN, BLUE, VIOLET, AMBER]);
  combinedGroups.forEach((row, i) => {
    marker(48.5, 194 + i * 8.4, [GREEN, BLUE, VIOLET, AMBER][i]);
    txt(row.name, 52, 195.5 + i * 8.4, 31, 7.0, MUTED, false);
    txt(num(row.value), 82, 195.5 + i * 8.4, 17, 7.2, NAVY);
  });
  if (!combinedGroups.length) txt(T('unavailable'), 49, 205, 48, 8, MUTED, false);
  chartBase(107, 174, 96, 56, T('consumption'));
  const consumption = (ops?.hasConsumptionData ? ops.consumption || [] : [])
    .filter(row => (Number(row.quantity) || 0) > 0).slice(0, 3);
  if (!consumption.length) txt(T('unavailable'), 112, 207, 86, 8, MUTED, false);
  consumption.forEach((row, i) => {
    const yy = 191 + i * 12;
    txt(row.name, 111, yy, 89, 7.5, NAVY);
    const costLabel = row.costAvailable && Number.isFinite(Number(row.estimatedCost))
      ? num(row.estimatedCost) + ' ' + currency : T('costMissing');
    txt(num(row.quantity) + ' ' + (row.unit || '') + '   ·   ' + costLabel,
      111, yy + 5, 89, 6.8, MUTED, false);
    if (i < 2) line(112, yy + 7, 199, yy + 7, BORDER, .15);
  });
  chartBase(7, 234, 115, 44, T('branchCost'));
  const costBranches = (ops?.branches || []).slice()
    .sort((a, b) => (Number(b.purchases) || 0) - (Number(a.purchases) || 0)).slice(0, 3);
  if (!costBranches.length) txt(T('unavailable'), 12, 256, 102, 8, MUTED, false);
  costBranches.forEach((row, i) => {
    const yy = 249 + i * 9.2;
    txt(row.name, 12, yy, 43, 7, NAVY);
    const pv = Number(row.purchases) || 0, ev = Number(row.expenses) || 0;
    const full = Math.max(1, ...costBranches.flatMap(b => [Number(b.purchases) || 0, Number(b.expenses) || 0]));
    doc.setFillColor(224, 234, 248); doc.roundedRect(58, yy - 2.5, 42, 2.2, .5, .5, 'F');
    if (pv > 0) {
      doc.setFillColor(...BLUE); doc.roundedRect(58, yy - 2.5, 42 * pv / full, 2.2, .5, .5, 'F');
    }
    if (ev > 0) {
      doc.setFillColor(...VIOLET); doc.roundedRect(58, yy + .2, 42 * ev / full, 2, .5, .5, 'F');
    }
    txt(compact(pv) + ' / ' + compact(ev), 101, yy, 17, 6.7, MUTED, true);
  });
  chartBase(127, 234, 76, 44, T('stock'));
  const alertRows = [
    [T('tracked'), ops?.hasInventoryData ? num(ops.stockCount) : '—'],
    [T('lowStock'), ops?.hasInventoryData ? num((ops.lowStock || []).length) : '—'],
    [T('noStock'), ops?.hasInventoryData ? num(ops.noStock) : '—'],
  ];
  alertRows.forEach(([label, value], i) => {
    const yy = 251 + 9 * i;
    txt(label, 131, yy, 48, 7.1, MUTED, false);
    txt(value, 180, yy, 19, 9.2, i ? AMBER : BLUE);
  });
  if (doc.getNumberOfPages() !== 2) throw new Error('ERP report must contain exactly two A4 pages');
}
