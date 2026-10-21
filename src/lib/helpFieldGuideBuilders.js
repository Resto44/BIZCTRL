// The field reference is editorial content reviewed against live ERP form components.
// All data is static documentation: this module never reads financial records.
export const HELP_LANGUAGES = ['en', 'ar', 'fa'];
const byLanguage = (values, toValue) => Object.fromEntries(
  HELP_LANGUAGES.map((lang, index) => [lang, toValue(values?.[index] ?? values?.[0] ?? '')]),
);
export function guideField(key, status, names, descriptions, examples = ['', '', '']) {
  if (!['required', 'optional', 'conditional', 'system'].includes(status)) {
    throw new Error('Invalid documentation field status: ' + key);
  }
  return {
    key, status,
    content: Object.fromEntries(HELP_LANGUAGES.map((lang, idx) => [lang, {
      label: names[idx],
      description: descriptions[idx],
      example: examples[idx] || '',
    }])),
  };
}
export function fieldGuide({ id, category, roles, route, source, title, steps, note, fields = [], keywords = [] }) {
  if (steps?.length !== 3 || steps.some(languageSteps => languageSteps?.length !== 3)) {
    throw new Error('Help guide must have exactly three instructions per language: ' + id);
  }
  return {
    id, category, roles, route, source, keywords,
    content: Object.fromEntries(HELP_LANGUAGES.map((lang, idx) => [lang, {
      title: title[idx],
      steps: steps[idx],
      note: note[idx],
    }])),
    fields,
  };
}
