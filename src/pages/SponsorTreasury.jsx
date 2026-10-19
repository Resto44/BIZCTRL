import React from 'react';
import {useRole} from '@/lib/RoleContext';
import {useLanguage} from '@/lib/LanguageContext';
import WalletBankingOwnerPortal from '@/components/wallet-banking/WalletBankingOwnerPortal';
import ManagerSubmitPanel from '@/components/settlement/ManagerSubmitPanel';

// Historical sponsor/custody/loan tables remain read-only for accounting
// reconciliation. The old Sponsor Treasury and Accounts & Wallet UI no longer
// mounts on this route. Manager branch settlements retain their existing submit
// workflow, which is separate from individual wallet banking.
export default function SponsorTreasury(){
 const {role}=useRole(),{lang}=useLanguage();
 if(role==='owner')return <WalletBankingOwnerPortal/>;
 if(role==='manager')return <section className="min-w-0 space-y-3 p-3 sm:p-5">
  <h1 className="text-xl font-black">{lang==='fa'?'تسویه حساب شعبه':lang==='ar'?'تسوية الفرع':'Branch Settlement'}</h1>
  <ManagerSubmitPanel/>
 </section>;
 return <p role="alert" className="p-5 text-sm">Access restricted.</p>;
}
