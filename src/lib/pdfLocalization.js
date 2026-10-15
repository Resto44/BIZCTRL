import {
  NOTO_SANS_ARABIC_BOLD_BASE64,
  NOTO_SANS_ARABIC_REGULAR_BASE64,
} from './fonts/notoSansArabicBase64';

const RTL_LANGUAGES = new Set(['ar', 'fa']);
const FONT_FAMILY = 'NotoSansArabic';
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

export function isPdfRTL(language, direction) {
  return direction === 'rtl' || RTL_LANGUAGES.has(language);
}

/**
 * Embeds Noto Sans Arabic into a jsPDF document.  The font covers Arabic and
 * Persian code points and travels inside the exported PDF, so reports remain
 * readable offline on mobile, tablet, and Windows viewers.
 */
export function prepareLocalizedPdf(doc, { lang = 'en', dir = 'ltr' } = {}) {
  const rtl = isPdfRTL(lang, dir);
  doc.__erpPdfRTL = rtl;
  // Dataset text can be Arabic/Persian even when the report UI is English.
  // Always register the script font; keep layout direction controlled by lang.
  // Otherwise jsPDF falls back to WinAnsi Helvetica and turns Arabic database
  // names into unreadable mojibake in English report exports.
  doc.addFileToVFS('NotoSansArabic-Regular.ttf', NOTO_SANS_ARABIC_REGULAR_BASE64);
  doc.addFont('NotoSansArabic-Regular.ttf', FONT_FAMILY, 'normal');
  doc.addFileToVFS('NotoSansArabic-Bold.ttf', NOTO_SANS_ARABIC_BOLD_BASE64);
  doc.addFont('NotoSansArabic-Bold.ttf', FONT_FAMILY, 'bold');
  // The renderer changes text direction per string. This prevents IDs, dates,
  // Latin currency symbols, and numeric values from being reversed in RTL PDFs.
  doc.setR2L(false);
  return { rtl, fontFamily: FONT_FAMILY };
}

export function shapePdfText(doc, value) {
  // jsPDF installs its own `preProcessText` Arabic processor. Returning the
  // source text here avoids a second transformation that reverses Persian and
  // Arabic strings before the embedded Noto font can render them.
  return String(value ?? '');
}

export function drawLocalizedPdfText(doc, value, x, y, {
  rtl = false,
  bold = false,
  size = 9,
  color,
  align,
  maxWidth,
  fit = false,
} = {}) {
  const text = String(value ?? '');
  // One embedded family covers Arabic, Persian, Latin and numbers, avoiding
  // missing glyphs in mixed labels and viewer-dependent Helvetica substitution.
  const arabicScriptText = ARABIC_SCRIPT.test(text);
  // jsPDF's built-in Arabic preprocessor already shapes contextual glyphs.
  // Keeping the document RTL flag off avoids reversing those shaped words;
  // right alignment provides the correct report layout for Arabic/Persian.
  doc.setR2L(false);
  doc.setFont(FONT_FAMILY, bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  if (color) doc.setTextColor(...color);
  const options = {
    align: align || (rtl ? 'right' : 'left'),
    ...(maxWidth ? { maxWidth } : {}),
  };
  // Compact report cells must stay on one line. Measure shaped glyphs, not
  // unjoined source letters; preserve every digit instead of truncating amounts.
  if (fit && maxWidth) {
    const measured = doc.getTextWidth(arabicScriptText ? doc.processArabic(text) : text);
    if (measured > maxWidth) doc.setFontSize(size * maxWidth / measured);
    delete options.maxWidth;
  }
  doc.text(shapePdfText(doc, text), x, y, options);
}

export function localizePdfColumns(values, rtl) {
  return rtl ? [...values].reverse() : values;
}

export function pdfColumnX({ index, columnWidth, marginLeft, rtl }) {
  return rtl ? marginLeft + (index + 1) * columnWidth - 2 : marginLeft + index * columnWidth + 2;
}

export function safePdfFilename(filename, language) {
  const normalized = String(filename || 'report.pdf').replace(/\.pdf$/i, '');
  const suffix = language === 'fa' ? '-fa' : language === 'ar' ? '-ar' : '-en';
  return `${normalized}${suffix}.pdf`;
}
