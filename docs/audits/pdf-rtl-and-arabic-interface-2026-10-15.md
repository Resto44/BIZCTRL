# PDF text layout and Arabic interface repair

## PDF changes

- Fix RTL labels that were right-aligned at their cell's left edge, placing text outside payment, profitability and branch cards.
- Mirror branch columns and reserve separate, measured cells for labels, quantities and financial values.
- Fit compact single-line cells by shaped-glyph width, preserving financial digits; dates use independent Latin runs so ISO order stays intact.
- Embed Noto Sans Arabic regular (400) and real bold (700), including Latin glyphs. The prior Noto Naskh font lacked Latin letters in mixed text. English also uses the embedded family to avoid viewer font substitution.
- Translate report branding and retain one A4 page. Financial calculations, tenant scoping and accounting records are unchanged.
- This is an open, embedded sans-serif font with a modern bold appearance, not Apple's proprietary system font.

Font source: Google Fonts `ofl/notosansarabic/NotoSansArabic[wdth,wght].ttf`, static instances at width 100 and weight 400/700 using fontTools. SIL Open Font License is included alongside the embedded data.

## Arabic interface follow-through

- Complete 2,143 additional Arabic phrases while preserving the newer ERP-specific catalog's translations.
- Resolve identity/English fallback strings through the centralized translator.
- Extend the static audit to visible JSX expressions and conditional labels, excluding non-text attributes and documented technical tokens.
- The current audit scans 343 JSX files and 4,179 candidates, with no unresolved Arabic phrases within that static scope. Dynamic server strings and user-entered names are not evidence of translation coverage and are not rewritten.

## Validation

- Full suite: 982 tests across 172 files passed.
- Production build passed; targeted ESLint: no errors (three existing unused-variable warnings).
- Real generated A4 PDFs rendered with Poppler in Persian, Arabic and English, plus a Persian stress fixture with long names, four branches, consumption rows and large/negative amounts.
- Regression checks verify glyph coverage for both font weights, financial/date preservation, one-page output, and text bounds within report cards.
- `pdffonts` confirms both regular and bold faces are embedded.
- Visual fixtures are synthetic QA data, not retrieved customer transactions. Actual iPhone hardware and authenticated production exports were not exercised in this environment.

Reproduce visual samples: `node scripts/render-sales-pdf-fixtures.mjs` (writes temporary PDFs under `tmp/pdfs`).
