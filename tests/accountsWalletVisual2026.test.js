import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {readCashCustodyAndPending} from '../src/lib/walletPersonPresentation.js';
const read=p=>readFileSync(p,'utf8');
const page=read('src/components/settlement/PartnerTreasuryCenter.jsx');
const ledger=read('src/components/settlement/SponsorOwnerBilateralLedger.jsx');
const status=read('src/components/settlement/WalletPersonCustodyCards.jsx');
const landing=read('src/pages/LandingPage.jsx');
const login=read('src/pages/ERPLogin.jsx');
const app=read('src/App.jsx');
const source=read('src/lib/sponsorOwnerBilateral.js');
describe('Accounts & Wallet image-aligned ERP design',()=>{
  it('preserves the source-of-truth loan ledger and separate opposing obligations',()=>{
    expect(ledger).toContain('sponsorOwnerSummary(records,currentCurrency)');
    expect(ledger).toContain('readSponsorOwnerRows(supabase,activeRestaurantId)');
    expect(ledger).toContain('summary[x.key]');
    expect(ledger).toContain("key:'ownerOwes'");
    expect(ledger).toContain("key:'sponsorOwes'");
    expect(ledger).toContain("key:'sponsorLent'");
    expect(ledger).toContain("key:'ownerRepaid'");
    expect(ledger).toContain("key:'ownerLent'");
    expect(ledger).toContain("key:'sponsorRepaid'");
    expect(source).toContain("result.ownerOwes=(cents.sponsorLent-cents.ownerRepaid)/100");
    expect(source).toContain("result.sponsorOwes=(cents.ownerLent-cents.sponsorRepaid)/100");
  });
  it('reads approved cash custody only from custody source, never finance/loan columns',()=>{
    const sample={balances:[
      {currency:'SAR',payment_method:'cash',held:70,pending:2},
      {currency:'SAR',payment_method:'network',held:130,pending:1},
      {currency:'USD',payment_method:'cash',held:100,pending:5},
    ]};
    expect(readCashCustodyAndPending(sample,'SAR')).toEqual({cash:70,pending:3});
    expect(readCashCustodyAndPending(sample,'USD')).toEqual({cash:100,pending:5});
    expect(readCashCustodyAndPending(sample,'EUR')).toEqual({cash:0,pending:0});
    expect(readCashCustodyAndPending(null,'SAR')).toBe(null);
    expect(status).toContain("erp_person_custody");
    expect(read('src/lib/walletPersonPresentation.js')).toContain("payment_method==='cash'");
    expect(status).toContain("q.isPending?'…':q.isError?'—'");
    expect(status).toContain("Pending custody approvals");
    expect(status).not.toContain("supabase.from('wallet_transactions').insert");
  });
  it('shows personalized balances first, then legacy operator workflows without losing approvals',()=>{
    const ledgerIndex=page.indexOf('<SponsorOwnerBilateralLedger');
    expect(ledgerIndex).toBeGreaterThan(0);
    expect(ledgerIndex).toBeLessThan(page.indexOf('<PeopleMemberships'));
    expect(ledgerIndex).toBeLessThan(page.indexOf('<PartnerTransactionRequests'));
    expect(page).toContain('<PeopleCustodySummary');
    expect(page).toContain('erp_save_person_account');
    expect(page).toContain("activeRestaurantId");
    expect(page).toContain("key={\u0060\u0024{activeRestaurantId}:\u0024{partner.id}\u0060}");
  });
  it('uses responsive compact cards with no hardcoded balances',()=>{
    expect(ledger).toContain("grid grid-cols-2 gap-2.5");
    expect(ledger).toContain("bg-amber-50/90");
    expect(ledger).toContain("bg-blue-50/90");
    expect(status).toContain("bg-emerald-50/90");
    expect(status).toContain("bg-violet-50/90");
    expect(ledger).toContain('overflow-y-auto overscroll-contain');
    expect(ledger).toContain("r.partner_confirmation?.confirmed_at");
    expect(ledger).toContain('r.effective_date');
    expect(ledger).toContain('r.wallet_transaction?.payment_method');
    expect(ledger).toContain('dir="auto"');
    expect(ledger).toContain('rtl');
    expect(ledger).toContain("currentCurrency?fmt(summary[x.key]):'—'");
    expect(ledger).not.toContain("20.00 SAR");
    expect(ledger).not.toContain("35.00 SAR");
  });
  it('renames landing and ERP sign-in while retaining old invitation URL',()=>{
    expect(landing).toContain('Accounts & Wallet Login');
    expect(landing).toContain("path:'/wallet-portal'");
    expect(landing).toContain("path:'/erp-login'");
    expect(landing).toContain("path:'/platform-owner/login'");
    expect(landing).toContain('Wallet');
    expect(landing).toContain('Supplier invoices, customer credit and payroll remain in their dedicated ERP ledgers.');
    expect(login).toContain("import {peopleText} from '@/lib/peopleAccounts'");
    expect(login).toContain('partnerLabels.title} Login');
    expect(login).toContain("navigate('/wallet-portal')");
    expect(app).toContain('<Route path="/wallet-portal"');
    expect(app).toContain('<Route path="/partner-portal"');
  });
});
