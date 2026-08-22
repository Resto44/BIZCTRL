import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const source = (path) => readFile(new URL(path, import.meta.url), 'utf8');

describe('production startup resilience', () => {
  it('imports the Driver Management icon used by the eagerly evaluated sidebar registry', async () => {
    const sidebar = await source('../src/components/layout/ERPSidebar.jsx');

    expect(sidebar).toContain('SlidersHorizontal, Truck, X');
    expect(sidebar).toContain("label: 'Driver Management',icon: Truck");
  });

  it('does not initialize the optional Base44 SDK when no application identifier is configured', async () => {
    const client = await source('../src/api/supabaseClient.js');

    expect(client).toContain('if (appParams.appId)');
    expect(client).toContain('optional functions and integrations use safe fallbacks');
  });

  it('keeps a visible top-level recovery path with reload and support contact', async () => {
    const entry = await source('../src/main.jsx');

    expect(entry).toContain('Something went wrong');
    expect(entry).toContain('Reload App');
    expect(entry).toContain('mailto:support@mybizctrl.site');
  });
});
