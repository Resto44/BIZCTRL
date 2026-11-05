import { describe, expect, it } from 'vitest';
import NetworkManagement from '../src/pages/NetworkManagement.jsx';
import { riyadhBusinessDate } from '../src/lib/networkAnalytics.js';

describe('Network Management import-time runtime smoke checks', () => {
  it('evaluates the complete page module including transfer and reconciliation form defaults', () => {
    // The page is imported above, forcing EMPTY_TRANSFER and EMPTY_RECON evaluation.
    // A missing module-scoped today() previously crashed the entire route on iOS.
    expect(typeof NetworkManagement).toBe('function');
  });

  it('uses the Asia/Riyadh business date, even near the UTC date boundary', () => {
    expect(riyadhBusinessDate(new Date('2026-11-05T22:10:00Z'))).toBe('2026-11-06');
    expect(riyadhBusinessDate(new Date('2026-11-05T20:10:00Z'))).toBe('2026-11-05');
  });
});
