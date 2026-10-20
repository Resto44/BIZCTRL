// @vitest-environment jsdom
import React from 'react';
import {describe,it,expect,vi} from 'vitest';
import {create} from 'react-test-renderer';
import {transferNote,periodRange,validRange} from '../src/components/wallet-banking/walletPresentation';
vi.mock('@/api/supabaseClient',()=>({supabase:{rpc:vi.fn()}}));
vi.mock('../src/components/wallet-banking/WalletInsights',()=>({WalletTrend:()=>null,WalletPersonalCategories:()=>null}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({isPending:false,isError:true,data:undefined}),useQueryClient:()=>({invalidateQueries:vi.fn()}),useMutation:()=>({isPending:false,mutate:vi.fn()})}));
import WalletBankingCenter from '../src/components/wallet-banking/WalletBankingCenter';
describe('Wallet navy financial presentation',()=>{
 it('renders unknown balances as dashes when records cannot be read',()=>{const component=create(<WalletBankingCenter person={{id:'person',name:'Test'}}/>);const rendered=JSON.stringify(component.toJSON());expect(rendered).toContain('—');expect(rendered).toContain('Unable to load verified wallet records');expect(rendered).not.toContain('0.00');component.unmount();});
 it('generates localized reasons without changing the transaction amount',()=>{expect(transferNote('salary','','fa','fund_wallet')).toBe('معاش');expect(transferNote('return','مرجع ١','ar','return_to_owner')).toBe('إرجاع رصيد: مرجع ١');});
 it('requires details for Other',()=>{expect(()=>transferNote('other','  ','en','fund_wallet')).toThrow();expect(transferNote('other','Family request','en','fund_wallet')).toBe('Other: Family request');});
 it('rejects unknown reasons and reasons for the wrong direction',()=>{expect(()=>transferNote('salary','','en','return_to_owner')).toThrow();expect(()=>transferNote('unknown','','en','fund_wallet')).toThrow();});
 it('enforces backend note length before submitting',()=>{expect(()=>transferNote('other','x'.repeat(501),'en','fund_wallet')).toThrow();});
 it('handles date ranges crossing a year boundary',()=>{expect(periodRange('week',new Date(2026,0,3))).toEqual({from:'2025-12-28',to:'2026-01-03'});});
 it('allows a year but rejects inverted, empty and overlong periods',()=>{expect(validRange('2026-01-01','2026-12-31')).toBe(true);expect(validRange('2026-03-02','2026-03-01')).toBe(false);expect(validRange('','')).toBe(false);expect(validRange('2025-01-01','2026-12-31')).toBe(false);});
});
