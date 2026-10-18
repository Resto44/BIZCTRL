// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ lang: 'en' }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ lang: state.lang }) }));
vi.mock('@/lib/RoleContext', () => ({ useRole: () => ({ role: 'owner' }) }));
vi.mock('@/lib/TenantContext', () => ({ useTenant: () => ({ activeRestaurantId: 'restaurant' }) }));
vi.mock('@/api/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/api/base44Client', () => ({ base44: {} }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: ({ queryKey }) => ({ isLoading: false, isError: false, data: queryKey[0] === 'sponsor-owner-bilateral'
    ? ['sponsor_advance_to_owner','owner_repay_sponsor','owner_advance_to_sponsor','sponsor_repay_owner'].map((kind,i) => ({ id:String(i),kind,amount:100+i,currency:'SAR',wallet_transaction:{payment_method:i%2?'network':'cash'},effective_date:'2026-10-18' }))
    : [{id:'account',currency:'SAR',account_name:'Owner account'}], refetch: vi.fn() }),
}));
import SponsorOwnerBilateralLedger from '@/components/settlement/SponsorOwnerBilateralLedger';
describe('populated sponsor treasury ledger', () => {
  it.each(['en','ar','fa'])('renders all four transaction directions in %s without crashing', lang => {
    state.lang = lang;
    const html = renderToStaticMarkup(<SponsorOwnerBilateralLedger />);
    expect(html.match(/lucide-arrow-down-left/g)).toHaveLength(2);
    expect(html.match(/lucide-arrow-up-right/g)).toHaveLength(2);
    expect(html).toContain('2026-10-18');
    expect(html).toContain('SAR');
    expect(html).toContain(lang==='ar'?'نقدي':lang==='fa'?'کاش / نقدی':'Cash');
    expect(html).toContain(lang==='ar'?'شبكة / بنك':lang==='fa'?'شبکه / بانک':'Network / bank');
  });
});
