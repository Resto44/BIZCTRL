import {
  NOTO_NASKH_ARABIC_BOLD_BASE64,
  NOTO_NASKH_ARABIC_REGULAR_BASE64,
} from './fonts/notoNaskhArabicBase64';

const RTL_LANGUAGES = new Set(['ar', 'fa']);
const FONT_FAMILY = 'NotoNaskhArabic';
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

export function isPdfRTL(language, direction) {
  return direction === 'rtl' || RTL_LANGUAGES.has(language);
}

/**
 * Embeds Noto Naskh Arabic into a jsPDF document.  The font covers Arabic and
 * Persian code points and travels inside the exported PDF, so reports remain
 * readable offline on mobile, tablet, and Windows viewers.
 */
export function prepareLocalizedPdf(doc, { lang = 'en', dir = 'ltr' } = {}) {
  const rtl = isPdfRTL(lang, dir);
  doc.__erpPdfRTL = rtl;
  if (rtl) {
    doc.addFileToVFS('NotoNaskhArabic-Regular.ttf', NOTO_NASKH_ARABIC_REGULAR_BASE64);
    doc.addFont('NotoNaskhArabic-Regular.ttf', FONT_FAMILY, 'normal');
    doc.addFileToVFS('NotoNaskhArabic-Bold.ttf', NOTO_NASKH_ARABIC_BOLD_BASE64);
    doc.addFont('NotoNaskhArabic-Bold.ttf', FONT_FAMILY, 'bold');
  }
  // The renderer changes text direction per string. This prevents IDs, dates,
  // Latin currency symbols, and numeric values from being reversed in RTL PDFs.
  doc.setR2L(false);
  return { rtl, fontFamily: rtl ? FONT_FAMILY : 'helvetica' };
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
} = {}) {
  const text = String(value ?? '');
  const arabicScriptText = rtl && ARABIC_SCRIPT.test(text);
  // jsPDF's built-in Arabic preprocessor already shapes contextual glyphs.
  // Keeping the document RTL flag off avoids reversing those shaped words;
  // right alignment provides the correct report layout for Arabic/Persian.
  doc.setR2L(false);
  doc.setFont(arabicScriptText ? FONT_FAMILY : 'helvetica', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  if (color) doc.setTextColor(...color);
  const options = {
    align: align || (rtl ? 'right' : 'left'),
    ...(maxWidth ? { maxWidth } : {}),
  };
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
