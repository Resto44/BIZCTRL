// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClosingSaveError, normalizeClosingPayload } from '../src/lib/closing/ClosingRepository';

const source = (relativePath) => readFile(resolve(process.cwd(), relativePath), 'utf8');

describe('Sales Closing runtime persistence contract', () => {
  it('sends Sales Source snapshots to the RPC as an array while supporting valid legacy serialized values', () => {
    const snapshots = [{ source_id: 'delivery', today_amount: 350, previous_amount: 250, total_amount: 600 }];

    expect(normalizeClosingPayload({ sales_sources_json: snapshots }, 'request-1').sales_sources_json).toEqual(snapshots);
    expect(normalizeClosingPayload({ sales_sources_json: JSON.stringify(snapshots) }, 'request-2').sales_sources_json).toEqual(snapshots);
  });

  it('preserves malformed legacy source data for the server to reject with a typed payload error', () => {
    expect(normalizeClosingPayload({ sales_sources_json: '{invalid' }, 'request-3').sales_sources_json).toBe('{invalid');
  });

  it('keeps backend code, detail, and request ID available for logging and diagnostic mode', () => {
    const error = createClosingSaveError({
      code: 'P0001',
      message: 'SALES_CLOSING_PAYLOAD_INVALID',
      details: 'sales_sources_json must be an array',
    }, 'request-4');

    expect(error.code).toBe('SALES_CLOSING_PAYLOAD_INVALID');
    expect(error.details).toBe('sales_sources_json must be an array');
    expect(error.request_id).toBe('request-4');
    expect(error.userMessage).toContain('Closing details');
  });

  it('uses explicit server operations for draft and finalization and exposes diagnostic references in the workspace', async () => {
    const [repository, workspace, salesPage, migration] = await Promise.all([
      source('src/lib/closing/ClosingRepository.js'),
      source('src/components/sales/UnifiedSalesClosing.jsx'),
      source('src/pages/Sales.jsx'),
      source('src/supabase/20260826_sales_closing_explicit_operations.sql'),
    ]);

    expect(repository).toContain("'erp_save_sales_closing_draft'");
    expect(repository).toContain("'erp_finalize_sales_closing'");
    expect(workspace).toContain('sales_sources_json: buildSalesSourceClosingSnapshots');
    expect(workspace).toContain('closing-runtime-error-reference');
    expect(salesPage).toContain('const invalidateSalesQueries = useCallback');
    expect(salesPage).toContain("['sales']");
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.erp_save_sales_closing_draft');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.erp_finalize_sales_closing');
  });
});
