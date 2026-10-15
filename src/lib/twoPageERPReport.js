import { drawLocalizedPdfText } from './pdfLocalization';
import { drawERPReportBrand } from './erpPdfBrand';

// All date buckets contribute to trend totals. Never silently sample away money.
export function aggregateReportTrend(rows = [], limit = 16) {
  if (!rows.length) return [];
  const bucket = Math.max(1, Math.ceil(rows.length / Math.max(1, limit)));
  const output = [];
  for (let i = 0; i < rows.length; i += bucket) {
    const part = rows.slice(i, i + bucket);
    const sum = key => part.reduce((n, r) => n + (Number(r[key]) || 0), 0);
    output.push({
      from: part[0].date, to: part.at(-1).date,
      sales: sum('sales'), purchases: sum('purchases'),
      expenses: sum('variable') + sum('fixed'),fixed:sum('fixed'),variable:sum('variable'),
      closings: sum('closings'),
    });
  }
  return output;
}
export function summarizeReportRows(rows, limit, otherLabel) {
  if (rows.length <= limit) return rows;
  const rest = rows.slice(limit - 1);
  return [...rows.slice(0, limit - 1), {
    name: otherLabel, value: rest.reduce((n, r) => n + (Number(r.value) || 0), 0),
  }];
}
export function aggregateConsumptionEvents(rows = [], limit = 16) {
  const valid = rows.filter(row => row?.date && Number.isFinite(Number(row.events)));
  const bucket = Math.max(1, Math.ceil(valid.length / Math.max(1, limit)));
  const result = [];
  for (let i = 0; i < valid.length; i += bucket) {
    const part = valid.slice(i, i + bucket);
    result.push({
      from: part[0].date, to: part.at(-1).date,
      events: part.reduce((total, r) => total + Number(r.events), 0),
    });
  }
  return result;
}

/**
 * Premium A4 management report: exactly 2 vector pages.
 * Data: finalized closings, approved purchases, allocated operating expenses,
 * recorded inventory movements. No guessed orders, COGS or profit guarantee.
 * Both /reports and /scheduled-reports call this same implementation.
 */
export function drawTwoPageERPReport(doc, {
  snapshot: s, previousSnapshot: previous = null, growth = null, report: r = null,
  range, branchLabel, businessName, currency = 'SAR', lang = 'en', iconData,
} = {}) {
  if (!s || !range?.from || !range?.to) throw new Error('Verified report data and dates required');
  const rtl = lang === 'fa' || lang === 'ar';
  const tr = (en, fa, ar) => lang === 'fa' ? fa : lang === 'ar' ? ar : en;
  const C = {
    ink: [17, 34, 63], muted: [91, 108, 133], faint: [220, 230, 244],
    blue: [34, 98, 232], teal: [0, 151, 130],
    purple: [118, 75, 218], amber: [220, 129, 35], red: [203, 66, 75],
    white: [255, 255, 255], background: [247, 250, 255],
  };
  const num = value => Number.isFinite(Number(value))
    ? Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
  const money = value => value == null ? '—' : num(value) + ' ' + currency;
  const pct = value => value == null || !Number.isFinite(Number(value))
    ? '—' : num(value) + '%';
  const percentOf = (value, total) => Number(total) > 0 ? 100 * (Number(value) || 0) / Number(total) : null;
  const text = (v, x, y, w, size = 9, color = C.ink, weight = true, alignment) => {
    // All regions are inside [7,203]mm and use embedded Arabic/Persian fonts.
    const align = alignment || (rtl ? 'right' : 'left');
    const anchor = align === 'right' ? x + w : align === 'center' ? x + w / 2 : x;
    drawLocalizedPdfText(doc, v == null ? '—' : String(v), anchor, y, {
      rtl, bold: weight, size, color, align, fit: true, maxWidth: w,
    });
  };
  const panel = (x, y, w, h, bg = C.white) => {
    doc.setFillColor(...bg); doc.setDrawColor(...C.faint);
    doc.setLineWidth(0.22); doc.roundedRect(x, y, w, h, 3.5, 3.5, 'FD');
  };
  const bar = (x, y, w, ratio, color, height = 2.1) => {
    doc.setFillColor(...C.faint); doc.roundedRect(x, y, w, height, 0.8, 0.8, 'F');
    const length = Math.max(0, Math.min(1, ratio || 0)) * w;
    if (length >= 0.35) {
      doc.setFillColor(...color); doc.roundedRect(x, y, length, height, 0.8, 0.8, 'F');
    }
  };
  const bullet = (x, y, color) => { doc.setFillColor(...color); doc.circle(x, y, 1.3, 'F'); };
  const section = (label, x, y, w) => {
    text(label, x, y, w, 9.6, C.ink);
    doc.setFillColor(...C.blue);
    doc.roundedRect(rtl ? x + w - 1.5 : x, y + 1.5, 1.4, 1.7, 0.6, 0.6, 'F');
  };
  const titleBand = (title, sub, page) => {
    doc.setFillColor(...C.background); doc.roundedRect(7, 27, 196, 18, 3, 3, 'F');
    text(title, 12, 34.6, 173, 14.7, C.ink);
    text(sub, 12, 41.2, 173, 7.8, C.muted);
    text('0' + page, 188, 35, 10, 9, C.blue, true, 'right');
  };
  const metric = (label, value, index, tone = C.blue, detail = '') => {
    const col = index % 3, row = Math.floor(index / 3);
    const x = 7 + (rtl ? 2 - col : col) * 66.4, y = 49 + row * 27;
    panel(x, y, 63, 24);
    doc.setFillColor(...tone); doc.roundedRect(rtl ? x + 57.7 : x + 4, y + 4, 1.6, 4.6, 0.6, 0.6, 'F');
    text(label, rtl ? x + 4 : x + 8, y + 8.9, 51, 8.2, C.muted);
    text(value, x + 4, y + 17.8, 55, 13.2, tone);
    if (detail) text(detail, x + 4, y + 22, 55, 6.8, C.muted);
  };

  const curve = ({ x, y, w, h, title, series, from, to }) => {
    panel(x, y, w, h);
    section(title, x + 5, y + 8.5, w - 10);
    const lx = x + 20, rx = x + w - 8, top = y + 17, bottom = y + h - 9;
    const values = series.flatMap(s => s.points.map(p => Number(p.value) || 0));
    const minimum = Math.min(0, ...values);
    const maximum = Math.max(1, ...values);
    const span = maximum - minimum;
    // Include zero and signed corrections; never draw negative values outside the panel.
    for (let step = 0; step <= 3; step++) {
      const yy = bottom - (bottom - top) * step / 3;
      doc.setDrawColor(...C.faint); doc.setLineWidth(0.18); doc.line(lx, yy, rx, yy);
      text(num(minimum + span * step / 3),x + 2,yy + 0.7,16,5.5,C.muted,false,'right');
    }
    for (const ser of series) {
      const pts = ser.points;
      if (!pts.length) continue;
      doc.setDrawColor(...ser.color); doc.setFillColor(...ser.color); doc.setLineWidth(0.70);
      const px = i => lx + (pts.length === 1 ? (rx - lx) / 2 : (rx - lx) * i / (pts.length - 1));
      const py = val => bottom - (bottom - top) * ((Number(val) || 0) - minimum) / span;
      pts.forEach((pt, index) => {
        if (index) doc.line(px(index - 1), py(pts[index - 1].value), px(index), py(pt.value));
        if (pts.length <= 16) doc.circle(px(index), py(pt.value), 0.42, 'F');
      });
    }
    if (!series.some(s => s.points.length)) text(tr('No confirmed data','دادهٔ تأییدشده موجود نیست','لا توجد بيانات معتمدة'),
      x + 8, y + h / 2 + 3, w - 16, 8, C.muted);
    if (from && to) {
      text(from, x + 8, y + h - 3.3, (w - 18) / 2, 6.8, C.muted, false, 'left');
      text(to, x + w / 2, y + h - 3.3, (w - 18) / 2, 6.8, C.muted, false, 'right');
    }
    let legendOffset = 5;
    series.forEach(ser => {
      bullet(x + legendOffset + 1, y + 11.4, ser.color);
      text(ser.name, x + legendOffset + 4, y + 12.4, series.length > 1 ? (w - 14) / series.length - 3 : w - 20,
        7.2, C.muted, true, 'left');
      legendOffset += (w - 10) / series.length;
    });
  };
  const horizontal = (x, y, w, h, title, rows, count = 4, color = C.blue) => {
    panel(x, y, w, h);
    section(title, x + 5, y + 8.4, w - 10);
    const sorted = [...rows].filter(a => Number.isFinite(Number(a.value)))
      .sort((a, b) => b.value - a.value);
    const grouped = summarizeReportRows(sorted, count,
      tr('Other / combined','سایر موارد / مجموع','أخرى / مجمعة'));
    if (!grouped.length) {
      text(tr('No recorded values','اطلاعات ثبت نشده','لا توجد قيم مسجلة'), x + 6, y + 23, w - 12, 8.8, C.muted);
      return;
    }
    const largest = Math.max(1, ...grouped.map(a => Math.abs(Number(a.value) || 0)));
    grouped.forEach((item, i) => {
      const yy = y + 16 + i * 9.1;
      text(item.name, x + 5, yy, w * 0.57 - 4, 8.0, C.ink);
      text(money(item.value), x + w * 0.61, yy, w * 0.34, 8.0, color);
      bar(x + 5, yy + 1.7, w - 10, Math.abs(Number(item.value) || 0) / largest, color, 1.3);
    });
  };
  const note = (message, y) => {
    text(message, 8, y, 194, 7.2, C.muted, false);
  };
  const snapshotSeries = aggregateReportTrend(s.breakdown || []);
  const earlierSeries = aggregateReportTrend(previous?.breakdown || []);
  const salesPoints = snapshotSeries.map(row => ({ value: row.sales }));
  const oldSalesPoints = earlierSeries.map(row => ({ value: row.sales }));
  const fixedPoints = snapshotSeries.map(row => ({ value: row.fixed }));
  const variablePoints = snapshotSeries.map(row => ({ value: row.variable }));
  const purchasePoints = snapshotSeries.map(row => ({ value: row.purchases }));
  const oldPurchasePoints = earlierSeries.map(row => ({ value: row.purchases }));
  const captionPeriod = range.from + '  /  ' + range.to;
  const current = tr('Current','فعلی','الحالي');
  const before = tr('Previous','قبلی','السابق');
  const paymentRows = [
    { label: tr('Cash','نقد','نقد'), value: s.cash, tone: C.blue },
    { label: tr('Network','شبکه','الشبكة'), value: s.network, tone: C.teal },
    { label: tr('Customer credit','نسیه','آجل'), value: s.credit, tone: C.purple },
    { label: tr('Other sources','سایر','أخرى'), value: s.other, tone: C.amber },
  ];
  const paymentPanel = () => {
    const x = 7, y = 168.5, w = 95.5;
    panel(x, y, w, 55.5);
    section(tr('Payment mix','ترکیب روش پرداخت','توزيع طرق الدفع'), x + 5, y + 8.5, w - 10);
    const total = paymentRows.reduce((n, item) => n + Math.max(0, Number(item.value) || 0), 0);
    const cx = x + 26, cy = y + 32.5, radius = 12;
    if (total > 0) {
      let angle = -Math.PI / 2;
      for (const item of paymentRows) {
        const value = Math.max(0, Number(item.value) || 0);
        const finish = angle + 2 * Math.PI * value / total;
        doc.setFillColor(...item.tone);
        const slices = Math.max(1, Math.ceil((finish - angle) / 0.10));
        for (let i = 0; i < slices; i++) {
          const start = angle + (finish - angle) * i / slices;
          const end = angle + (finish - angle) * (i + 1) / slices;
          doc.triangle(cx, cy, cx + radius * Math.cos(start), cy + radius * Math.sin(start),
            cx + radius * Math.cos(end), cy + radius * Math.sin(end), 'F');
        }
        angle = finish;
      }
      doc.setFillColor(...C.white); doc.circle(cx, cy, 6.8, 'F');
      text(pct(100), cx - 6.5, cy + 1, 13, 7.5, C.ink, true, 'center');
    } else text('—', cx - 6, cy + 2, 12, 14, C.muted, true, 'center');
    paymentRows.forEach((row, i) => {
      const yy = y + 19 + i * 8.4;
      bullet(x + 46.5, yy - 1.8, row.tone);
      text(row.label, x + 49, yy, 42, 7.4, C.muted);
      text(pct(percentOf(row.value, total)), x + 49, yy + 3.6, 42, 7.4, row.tone);
    });
  };
  const executive = () => {
    panel(7, 229, 196, 42);
    section(tr('Management signals','شاخص‌های مدیریتی','مؤشرات إدارية'), 12, 237, 186);
    const items = [
      [tr('Finalized closings','بستن‌های نهایی فروش','إقفالات المبيعات'), String(s.finalizedClosings ?? '—')],
      [tr('Sales change','تغییر فروشات','تغير المبيعات'), pct(growth)],
      [tr('Top branch','شعبه برتر','الفرع الأعلى'), r?.branches?.length
        ? [...r.branches].sort((a, b) => (Number(b.sales)||0)-(Number(a.sales)||0))[0]?.name
        : tr('Not available','موجود نیست','غير متاح')],
    ];
    items.forEach(([label, value], i) => {
      const x = 12 + (rtl ? 2 - i : i) * 63.4;
      text(label, x, 248.3, 59, 7.6, C.muted);
      text(value, x, 257.8, 59, 11, i === 1 && growth < 0 ? C.red : C.blue);
    });
    const closingCounts = snapshotSeries.map(d => d.closings);
    const max = Math.max(1, ...closingCounts);
    const x = 12, y = 267.2, w = 184;
    doc.setDrawColor(...C.faint); doc.line(x, y, x + w, y);
    if (closingCounts.length > 1) {
      doc.setDrawColor(...C.teal); doc.setLineWidth(.5);
      closingCounts.forEach((v, i) => {
        if (i) doc.line(x + w * (i - 1) / (closingCounts.length - 1),
          y - 4 * closingCounts[i - 1] / max,
          x + w * i / (closingCounts.length - 1), y - 4 * v / max);
      });
    }
  };

  // 01 / Sales
  titleBand(tr('Sales Analytics','تحلیل فروشات','تحليل المبيعات'),
    tr('Verified closings · trends · branches · payment channels','فروش نهایی · روندها · شعبه‌ها · روش‌های پرداخت','الإقفالات المعتمدة · الاتجاهات · الفروع · الدفع'), 1);
  metric(tr('Finalized sales','فروشات نهایی','المبيعات المعتمدة'), money(s.sales), 0, C.blue);
  metric(tr('Cash','نقد','نقد'), money(s.cash), 1, C.teal);
  metric(tr('Network','شبکه','الشبكة'), money(s.network), 2, C.blue);
  metric(tr('Credit','نسیه','آجل'), money(s.credit), 3, C.purple);
  metric(tr('Daily average','اوسط روزانه','المتوسط اليومي'), money(s.averageDailySales), 4, C.teal);
  metric(tr('Growth vs previous','رشد نسبت به قبل','النمو عن السابق'), pct(growth), 5,
    growth == null ? C.muted : growth >= 0 ? C.teal : C.red);
  curve({
    x: 7, y: 105, w: 196, h: 59,
    title: tr('Sales trend · current versus prior period','روند فروشات · مقایسه با دوره قبل','اتجاه المبيعات · الحالي مقابل السابق'),
    series: [
      { name: current, color: C.blue, points: salesPoints },
      ...(previous ? [{ name: before, color: C.teal, points: oldSalesPoints }] : []),
    ], from: range.from, to: range.to,
  });
  paymentPanel();
  horizontal(107.5, 168.5, 95.5, 55.5,
    tr('Sales by branch','فروشات به تفکیک شعبه','المبيعات حسب الفرع'),
    (r?.branches || []).map(branch => ({ name: branch.name, value: Number(branch.sales) || 0 })),
    4, C.blue);
  executive();
  note(tr('Cash, network and credit are parts of sales, not extra revenue. Orders cannot be inferred from daily closings.',
    'نقد، شبکه و نسیه بخشی از فروش‌اند. تعداد سفارش را نمی‌توان از بستن روزانه محاسبه کرد.',
    'النقد والشبكة والآجل ضمن المبيعات. لا يمكن استنتاج عدد الطلبات من الإقفالات اليومية.'), 279.2);
  drawERPReportBrand(doc, { lang, title: tr('Sales report','گزارش فروشات','تقرير المبيعات'),
    business: businessName, branch: branchLabel, period: captionPeriod, iconData, pageLabel: '1 / 2' });

  doc.addPage();
  // 02 / Purchases, expenses, inventory consumption
  titleBand(tr('Purchases · Expenses · Inventory','خریداری · مصارف · مصرف انبار','المشتريات · المصروفات · استهلاك المخزون'),
    tr('Approved procurement · allocated costs · recorded movements',
      'خرید تأییدشده · مصارف دوره · مصرف ثبت‌شده',
      'المشتريات المعتمدة · مصروفات الفترة · الحركات المسجلة'), 2);
  metric(tr('Approved purchases','خرید تأییدشده','المشتريات المعتمدة'), money(s.purchases), 0, C.blue);
  metric(tr('Period expenses','مصارف دوره','مصروفات الفترة'), money(s.totalExpenses), 1, C.amber, s.hasExpenseSource===false
    ? tr('No records in period','در این دوره ثبت نشده','لا سجلات في الفترة') : '');
  metric(tr('Sales less costs*','فروش منهای مصارف*','المبيعات ناقص التكاليف*'), money(s.netProfit), 2, s.netProfit < 0 ? C.red : C.teal);
  metric(tr('Fixed expenses','مصارف ثابت','المصروفات الثابتة'), money(s.fixedDeduction), 3, C.purple);
  metric(tr('Variable expenses','مصارف متغیر','المصروفات المتغيرة'), money(s.variableExpenses), 4, C.amber);
  metric(tr('Purchases / sales','نسبت خرید به فروش','المشتريات / المبيعات'),
    pct(percentOf(s.purchases, s.sales)), 5, C.blue,
    tr('Expenses / sales: ','مصارف / فروش: ','المصروفات / المبيعات: ') +
      pct(percentOf(s.totalExpenses, s.sales)));

  curve({ x: 7, y: 105, w: 95.5, h: 54,
    title: tr('Purchases trend','روند خریداری','اتجاه المشتريات'),
    series: [{ name: current, color: C.blue, points: purchasePoints },
      ...(previous ? [{ name: before, color: C.teal, points: oldPurchasePoints }] : [])],
    from: range.from, to: range.to });
  curve({ x: 107.5, y: 105, w: 95.5, h: 54,
    title: tr('Expenses trend','روند مصارف','اتجاه المصروفات'),
    series: [{ name: tr('Fixed','ثابت','ثابتة'), color: C.purple, points: fixedPoints },
      { name: tr('Variable','متغیر','متغيرة'), color: C.amber, points: variablePoints }],
    from: range.from, to: range.to });

  horizontal(7, 163, 95.5, 54,
    tr('Expense categories','دسته‌های مصارف','فئات المصروفات'),
    (r?.costGroups || []).map(item => ({ name: item.name, value: Number(item.value) || 0 })),
    4, C.amber);
  // Quantities remain separate by product AND unit. Kitchen use is not a retail sale.
  panel(107.5, 163, 95.5, 107);
  section(tr('Inventory: quantities used / sold','انبار: مقدار مصرف / فروش','المخزون: المستهلك / المباع'), 112.5, 171.4, 85.5);
  const unitLabel = unit => ({
    kg:tr('kg','کیلوگرام','كجم'),carton:tr('carton','کارتن','كرتون'),
    bag:tr('bag','کیسه','كيس'),unit:tr('unit','عدد','وحدة'),
    piece:tr('piece','عدد','قطعة'),litre:tr('litre','لیتر','لتر'),
  })[String(unit).toLowerCase()] || String(unit || '');
  const usageRows = r?.consumption || [];
  if (r?.hasConsumptionData) {
    usageRows.slice(0, 7).forEach((row, i) => {
      const yy = 180 + i * 10.2;
      text(row.name, 113, yy, 84, 8.2, C.ink);
      const used = row.usedQuantity ?? row.quantity;
      const sold = row.soldQuantity ?? 0;
      text(tr('Used: ','مصرف: ','استهلاك: ') + num(used) + ' ' + unitLabel(row.unit),
        113, yy + 4, 41, 7.2, C.blue);
      text(tr('Sold*: ','فروش*: ','مباع*: ') + num(sold) + ' ' + unitLabel(row.unit),
        156, yy + 4, 41, 7.2, C.teal);
      doc.setDrawColor(...C.faint);doc.setLineWidth(0.15);doc.line(113,yy+6,197,yy+6);
    });
    text(tr('Shown: ','نمایش: ','المعروض: ') + Math.min(7,usageRows.length) + ' / ' + usageRows.length,
      113, 253, 84, 7, C.muted);
  } else {
    text(tr('No consumption recorded in this period','مصرف در این دوره ثبت نشده','لا استهلاك مسجل في الفترة'),
      114, 190, 82, 9, C.muted);
    text(tr('Record stock-out or link POS recipes.','خروج انبار ثبت یا دستور غذا به فروش وصل شود.','سجّل الصرف أو اربط وصفات نقاط البيع.'),
      114, 203, 82, 8, C.muted);
    text(tr('Purchases alone do not prove consumption.','خریداری به‌تنهایی مقدار مصرف را نشان نمی‌دهد.','المشتريات وحدها لا تثبت الاستهلاك.'),
      114, 214, 82, 8, C.muted);
  }
  text(tr('*Net direct sales after returns; no guessed carton conversions.',
    '*فروش مستقیم پس از برگشت؛ تبدیل کارتن حدس زده نمی‌شود.',
    '*صافي البيع المباشر بعد المرتجعات؛ لا تحويل تقديري للكرتون.'),112.5,260,86,6.8,C.muted);
  text(r?.hasWasteData ? tr('Waste cost: ','هزینه ضایعات: ','تكلفة الهدر: ') +
    (r.wasteCostComplete ? money(r.wasteCost) : tr('unavailable','نامشخص','غير متاحة')) :
    tr('Mixed units are not totaled.','واحدهای متفاوت جمع نمی‌شوند.','لا تُجمع الوحدات المختلفة.'),112.5,266,86,7,C.muted);

  horizontal(7, 221, 95.5, 49,
    tr('Purchases by branch','خریداری به تفکیک شعبه','المشتريات حسب الفرع'),
    (r?.branches || []).map(branch => ({ name: branch.name, value: Number(branch.purchases) || 0 })),
    3, C.blue);
  note(tr('*Sales less approved purchases and allocated expenses is an operating proxy, not inventory-adjusted COGS or audited net profit.',
    '*فروش منهای خرید تأییدشده و مصارف دوره، برآورد عملیاتی است؛ نه بهای تمام‌شدهٔ واقعی یا سود حسابرسی‌شده.',
    '*الفرق بين المبيعات والمشتريات والمصروفات مؤشر تشغيلي، وليس تكلفة بضاعة مباعة أو صافي ربح مدققاً.'), 277.2);
  drawERPReportBrand(doc, { lang,
    title: tr('Purchases, expenses & stock','خریداری، مصارف و انبار','المشتريات والمصروفات والمخزون'),
    business: businessName, branch: branchLabel, period: captionPeriod, iconData, pageLabel: '2 / 2' });

  if (doc.getNumberOfPages() !== 2) throw new Error('ERP management PDF must be exactly two pages');
}
