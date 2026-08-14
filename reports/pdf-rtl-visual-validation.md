# Multilingual PDF Visual Validation

The multilingual document pipeline was checked with browser-generated PDFs rendered back to images. Both paths use the embedded **Noto Naskh Arabic** font; PDF font metadata confirmed the font is included in the document rather than being referenced from the operating system or web.

| Scenario | Result |
|---|---|
| Arabic executive report, 12 pages | Generated successfully in RTL with Arabic headings, right-aligned report regions, and embedded Unicode font. Empty sample data produced the expected zero totals. |
| Persian sales invoice | Generated successfully in RTL with connected Persian labels, a stable LTR invoice identifier and date, and unmodified numeric/currency values. |
| Arabic sales invoice | Generated successfully in RTL with connected Arabic labels and status text, right-aligned sections, and stable LTR `SAR` amounts, date, and invoice identifier. |
| Mixed-direction behavior | Arabic/Persian labels use the Unicode font while `INV-...`, dates, numbers, and currency values stay in readable LTR order. |

The final implementation deliberately leaves jsPDF's document-level RTL flag disabled for text output because the library already applies Arabic contextual shaping. The report layout itself remains RTL through right alignment and mirrored table-column placement, preventing the double-reversal defect observed during validation.
