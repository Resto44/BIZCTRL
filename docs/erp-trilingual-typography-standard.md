# BizCTRL ERP – typography standard (English / Arabic / Persian)

This design contract applies to the web app, owner/manager/staff portals, POS, navigation, dialogs and browser forms. Language selection changes font glyph coverage and direction, **not** the semantic size of a UI element. Printed PDF layouts are a separate renderer and are not affected by browser CSS.

| Role | Utility | Pixels at standard 16px root | Guidance |
|---|---|---:|---|
| Micro/secondary metadata | `text-xs` | 12 | Lower legibility limit for human-readable UI |
| Field labels, buttons, body-secondary | `text-sm` | 14 | Consistent input labels and menu controls |
| Body, input on phones | `text-base` | 16 | Includes iOS inputs to prevent focus-zoom |
| Section heading | `text-xl` | 20 | Allow wrap on narrow phones |
| Page heading | `text-2xl` | 24 | One meaning regardless of selected language |
| KPI emphasis | `text-4xl` | 32 | Numeric amounts may have dedicated larger values |

- **Native Apple styling (updated from the supplied telecom app screenshot):** On iPhone/iPad, `-apple-system` / `BlinkMacSystemFont` are **first** in both English and RTL font stacks. Native iOS selects Arabic/Persian glyph fallbacks. On Android/Windows, Vazirmatn / Noto Sans Arabic remain RTL fallbacks. Do not add or redistribute Apple's proprietary font files; we aim for a similar presentation, not a guarantee of exact glyphs from the pictured app.
- **RTL reading rhythm:** Persian/Arabic have 1.6 normal body leading, 1.38 heading leading; navigation and section labels use semibold 600, headings bold 700. Shared card title, page title, and form-label components allow enough line height for diacritics. The 12/14/16/20/24/32 px typography scale stays shared across all languages.
- **Mobile footer:** Bottom navigation uses readable 12 px semibold labels, bold only for the active item, and line breaks within a 64 px dock. At small widths validate 5 tabs and 2-line Persian labels without clipping or hiding the bottom controls.
- **Semantic bold weights:** 700 for heading, 600 for navigation/action/label, 500 for normal body and form controls. An explicit `font-normal` or specialist numeric/KPI weight in a module may override the defaults.
- Same iOS-like appearance is not pixel-identical on Android/Windows; CSS font fallback is deterministic but available fonts and OS shaping differ. Do not equate different glyph shapes to a need for different CSS font sizes.
- Use `font-sans`/`var(--font-ui)`, not hard-coded font families. The document `lang` and `dir` are set by `LanguageContext`.
- The previous RTL-only overrides of `h1`, `h2`, `button`, tables, and `text-xs` through `text-3xl` have been removed. Never reintroduce size rules tied solely to `[dir=rtl]`; RTL should control logical alignment and direction.
- Existing `text-[8px]` through `text-[11px]` micro-labels use a common **12px floor** except explicit `data-erp-type-optout` specialist elements. Replace tiny ad hoc font sizes with semantic utilities as modules are touched.
- Do not apply `truncate` to critical labels, headings, field names or report links. Prefer `min-w-0`, `whitespace-normal`, `break-words` and enough row height. Numeric values can use `tabular-nums` and an explicit LTR isolation when required.
- Avoid forcing 14px or smaller into an editable input on mobile Safari (minimum 16px). Form labels can remain 14px.
- Verify 320px, 375px, 390px and desktop screens across `en`, `ar`, `fa`, especially POS fixed-viewport, header, tab bars and owner report cards. CSS tests and build alone do **not** substitute for real-device interaction.
- Typography and style-only changes must not alter money calculations, staff attendance, tenant scope, tables or data records.

Run `pnpm exec vitest run tests/trilingualTypographyScale.test.js` and the full CI suite before merging.
