import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = () => readFile(resolve(process.cwd(), 'src/pages/CustomerManagement.jsx'), 'utf8');

describe('Customer Management responsive tabs', () => {
  it('uses a readable two-column mobile grid and returns to five columns on larger screens', async () => {
    const workspace = await source();

    expect(workspace).toContain('grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-5');
    expect(workspace).toContain('min-h-10 whitespace-normal px-2 py-2 text-center text-xs leading-tight sm:min-h-9 sm:whitespace-nowrap');
    expect(workspace).toContain('value="vip" className="col-span-2');
    expect(workspace).toContain('sm:col-span-1 sm:min-h-9 sm:whitespace-nowrap');
  });
});
