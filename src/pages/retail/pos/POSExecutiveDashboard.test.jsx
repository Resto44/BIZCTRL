// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import POSExecutiveDashboard from './POSExecutiveDashboard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const snapshot = {
  period: { from: '2026-09-07T00:00:00+03:00', to: '2026-09-08T00:00:00+03:00' },
  summary: {
    branch_count: 2,
    device_count: 10,
    online_device_count: 0,
    transaction_count: 0,
    net_sales: 0,
    cash_total: 0,
    mada_total: 0,
    apple_pay_total: 0,
    credit_total: 0,
    refunds: 0,
    voids: 0,
    purchase_total: 0,
    expense_total: 0,
    pending_approvals: 0,
    critical_alerts: 0,
  },
  branches: [
    { id: 'branch-1', name: 'Main', device_count: 10, online_device_count: 0, transaction_count: 0, net_sales: 0, refunds: 0 },
    { id: 'branch-2', name: 'Second', device_count: 0, online_device_count: 0, transaction_count: 0, net_sales: 0, refunds: 0 },
  ],
  devices: Array.from({ length: 10 }, (_, index) => ({
    id: `device-${index + 1}`,
    branch_id: 'branch-1',
    code: `POS-${String(index + 1).padStart(2, '0')}`,
    status: 'offline',
    last_seen_at: null,
  })),
  transactions: [],
  events: [],
  approvals: [],
  salesSeries: [],
};

vi.mock('@/hooks/useRetailPOSControl', () => ({
  useRetailPOSControl: () => ({
    snapshot,
    isLoading: false,
    isFetching: false,
    error: null,
    realtimeStatus: 'SUBSCRIBED',
    refetch: vi.fn(),
  }),
}));

vi.mock('@/lib/LanguageContext', () => ({
  useLanguage: () => ({
    lang: 'fa',
    translateLiteral: (value) => value,
    formatMoney: (value) => `SAR ${Number(value || 0)}`,
    formatNumber: (value) => String(Number(value || 0)),
    formatDate: (value) => String(value || ''),
  }),
}));

describe('POSExecutiveDashboard', () => {
  it('renders the seeded ten-device snapshot without crashing', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(
      <MemoryRouter>
        <POSExecutiveDashboard />
      </MemoryRouter>,
    ));
    await act(async () => new Promise((resolve) => globalThis.setTimeout(resolve, 0)));

    expect(container.textContent).toContain('Supermarket Live Control');
    expect(container.textContent).toContain('10');

    await act(async () => root.unmount());
    container.remove();
  });
});
