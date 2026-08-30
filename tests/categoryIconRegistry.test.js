import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { ENTERPRISE_ICONS } from '../src/components/categories/IconCatalog';
import { ENTERPRISE_ICON_COMPONENTS, iconComponentFor } from '../src/components/categories/EnterpriseIconRegistry';

describe('enterprise category icon registry', () => {
  it('provides a renderable component for every selectable category icon', () => {
    for (const icon of ENTERPRISE_ICONS) {
      expect(ENTERPRISE_ICON_COMPONENTS[icon.name], icon.name).toBeTypeOf('object');
      expect(iconComponentFor(icon.name)).toBe(ENTERPRISE_ICON_COMPONENTS[icon.name]);
    }
  });

  it('does not import the complete Lucide namespace into runtime category components', async () => {
    const [picker, categoryIcon] = await Promise.all([
      readFile(new URL('../src/components/categories/NewIconPicker.jsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/components/shared/CategoryIcon.jsx', import.meta.url), 'utf8'),
    ]);

    expect(picker).not.toContain("import * as LucideIcons from 'lucide-react'");
    expect(categoryIcon).not.toContain("import * as LucideIcons from 'lucide-react'");
    expect(picker).toContain('iconComponentFor(icon.name)');
    expect(categoryIcon).toContain('iconComponentFor(icon)');
  });
});
