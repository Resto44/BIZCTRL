import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file) => readFile(resolve(process.cwd(), file), 'utf8');

describe('viewport and dashboard layout stability', () => {
  it('locks the application viewport against browser auto-zoom', async () => {
    const html = await source('index.html');
    expect(html).toContain('maximum-scale=1.0');
    expect(html).toContain('user-scalable=no');
  });

  it('prevents mobile form-focus zoom and text autosizing without disabling vertical scrolling', async () => {
    const css = await source('src/index.css');
    expect(css).toContain('-webkit-text-size-adjust: 100%');
    expect(css).toContain('input, select, textarea, button {\n    font-size: 16px;');
    expect(css).toContain('overflow-x: clip');
    expect(css).toContain('overscroll-behavior-x: none');
    expect(css).toContain('scrollbar-gutter: stable');
  });

  it('gives Owner Dashboard a stable width-constrained shell', async () => {
    const dashboard = await source('src/pages/OwnerDashboard.jsx');
    const css = await source('src/index.css');
    expect(dashboard).toContain('owner-dashboard-shell');
    expect(css).toContain('.owner-dashboard-shell');
    expect(css).toContain('contain: inline-size');
  });
});

