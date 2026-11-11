import React from 'react';
import { Building2, CheckCircle2, MapPin, UserRound } from 'lucide-react';
import { customerPortalText } from '@/lib/customerPortal';

// The accounts RPC already verifies current user and exposes only this customer's
// name and merchant. Do not display internal branch codes or unverified profile data.
export default function CustomerIdentityCard({account,lang='en'}) {
 const t=customerPortalText[lang]||customerPortalText.en;
 const customerName=typeof account?.name==='string'&&account.name.trim()?account.name.trim():t.unknownCustomer;
 const business=typeof account?.business==='string'&&account.business.trim()?account.business.trim():'—';
 const branch=typeof account?.branch_name==='string'&&account.branch_name.trim()?account.branch_name.trim():null;
 return <section aria-label={t.customerProfile} className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 via-white to-white p-3 shadow-sm sm:p-5">
  <div className="flex min-w-0 flex-wrap items-start gap-3">
   <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-teal-700 text-white"><UserRound aria-hidden="true" className="size-6"/></div>
   <div className="min-w-0 flex-1">
    <p className="text-xs font-semibold text-slate-500">{t.customerName}</p>
    <h2 className="mt-0.5 break-words text-xl font-black leading-snug text-slate-950" data-testid="customer-display-name">{customerName}</h2>
    <div className="mt-2 inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
     <CheckCircle2 aria-hidden="true" className="size-3.5 shrink-0"/>{t.activeCustomerAccess}
    </div>
   </div>
  </div>
  <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 border-t border-teal-100 pt-3 sm:grid-cols-2">
   <div className="flex min-w-0 items-start gap-2 text-sm">
    <Building2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-teal-700"/>
    <div className="min-w-0"><p className="text-xs text-slate-500">{t.restaurantName}</p><p className="break-words font-semibold text-slate-800">{business}</p></div>
   </div>
   {branch&&<div className="flex min-w-0 items-start gap-2 text-sm">
    <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-teal-700"/>
    <div className="min-w-0"><p className="text-xs text-slate-500">{t.branchName}</p><p className="break-words font-semibold text-slate-800">{branch}</p></div>
   </div>}
  </div>
 </section>;
}
