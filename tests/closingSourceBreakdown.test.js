import { describe, expect, it } from 'vitest';
import { closingSourceBreakdown } from '../src/lib/closingSourceBreakdown';

describe('closing source drilldown', () => {
  it('does not match unrelated sources through absent keys', () => {
    expect(closingSourceBreakdown([{ sales_sources_json: [{ source_id: 'delivery', amount: 80 }] }], [{ id: 'cash', is_system: true }, { id: 'delivery' }])).toEqual({ delivery: 80 });
  });
  it('aggregates valid amounts without adding system tenders or non-revenue entries', () => {
    const sources = [{ id: 'cash', is_system: true }, { id: 'delivery', system_key: 'delivery' }];
    const entries = [{ source_id: 'cash', amount: 100 }, { source_key: 'delivery', today_amount: '20' }, { source_id: 'delivery', amount: 30 }, { source_id: 'loan', amount: 40, included_in_revenue: false }, { source_id: 'invalid', amount: 'NaN' }];
    expect(closingSourceBreakdown([{ sales_sources_json: JSON.stringify(entries) }], sources)).toEqual({ delivery: 50 });
  });
  it('preserves posted revenue when source configuration changes later', () => {
    const sources = [{ id: 'delivery', included_in_revenue: false }];
    const sales_sources_json = [{ source_id: 'delivery', amount: 80 }];
    expect(closingSourceBreakdown([{ closing_state: 'finalized', sales_sources_json }], sources)).toEqual({ delivery: 80 });
    expect(closingSourceBreakdown([{ closing_state: 'draft', sales_sources_json }], sources)).toEqual({});
  });
  it('tolerates absent, malformed and non-array legacy details', () => {
    expect(closingSourceBreakdown([{}, { sales_sources_json: '{' }, { sales_sources_json: '{}' }, { sales_sources_json: [null] }])).toEqual({});
  });
});
