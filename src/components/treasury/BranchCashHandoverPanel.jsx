import React,{useMemo,useRef,useState} from 'react';
import {toast} from 'sonner';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {supabase} from '@/api/supabaseClient';
import {buildTreasuryAccountBalances} from '@/lib/treasuryAccounts';
import {Card} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {ArrowLeftRight,Landmark} from 'lucide-react';

const labels={
 en:{title:'Branch → Owner cash handover',subtitle:'Two linked postings: branch cash decreases, Owner cash increases.',branch:'Source branch',
 source:'Cash account in branch',destination:'Owner cash account',amount:'Amount received',note:'Receipt number / notes',
 received:'I confirm that the Owner physically received this cash.',save:'Record cash handover',saving:'Saving...',
 success:'Cash handover recorded in both Treasury accounts.',no:'Choose account',balance:'Branch account available'},
 ar:{title:'تسليم النقد من الفرع إلى المالك',subtitle:'قيدان مترابطان: ينخفض نقد الفرع ويزداد نقد المالك.',
 branch:'الفرع المصدر',source:'حساب النقد بالفرع',destination:'حساب نقد المالك',amount:'المبلغ المستلم',
 note:'رقم الإيصال / ملاحظات',received:'أؤكد استلام المالك الفعلي لهذا النقد.',
 save:'تسجيل التسليم',saving:'جارٍ التسجيل...',success:'تم تسجيل طرفَي تسليم النقد.',no:'اختر حساباً',balance:'المتاح بحساب الفرع'},
 fa:{title:'تحویل نقد از شعبه به مالک',subtitle:'دو ثبت پیوسته: نقد شعبه کم و نقد مالک زیاد می‌شود.',
 branch:'شعبه پرداخت‌کننده',source:'حساب نقد شعبه',destination:'حساب نقد مالک',amount:'مبلغ دریافت‌شده',
 note:'شماره رسید / یادداشت',received:'تأیید می‌کنم مالک این پول نقد را واقعاً دریافت کرده است.',
 save:'ثبت تحویل نقد',saving:'در حال ثبت...',success:'تحویل نقد در هر دو حساب خزانه ثبت شد.',no:'انتخاب حساب',balance:'مانده حساب شعبه'},
};
export default function BranchCashHandoverPanel({restaurantId,accounts=[],branches=[],
 transactions=[],currency='SAR',lang='en',loading=false,error=false,onComplete}){
 const t=labels[lang]||labels.en;
 const qc=useQueryClient();
 const requestId=useRef(null);
 const [branchId,setBranchId]=useState('');
 const [sourceId,setSourceId]=useState('');
 const [ownerId,setOwnerId]=useState('');
 const [amount,setAmount]=useState('');
 const [note,setNote]=useState('');
 const [receipt,setReceipt]=useState(false);
 const [saveError,setSaveError]=useState('');
 const change=(setter,value)=>{setter(value);requestId.current=null;setSaveError('');};
 const ownerAccounts=accounts.filter(a=>a.is_active!==false&&!a.branch_id&&!a.branch_key&&a.account_type==='cash');
 const branch=branches.find(b=>b.id===branchId);
 const branchAccounts=accounts.filter(a=>a.is_active!==false&&
  (a.branch_id===branchId||(!a.branch_id&&a.branch_key===branch?.branch_key))&&
  ['cash','petty_cash'].includes(a.account_type));
 const balances=useMemo(()=>buildTreasuryAccountBalances(accounts,transactions),[accounts,transactions]);
 const source=branchAccounts.find(a=>a.id===sourceId);
 const destination=ownerAccounts.find(a=>a.id===ownerId);
 const value=Number(amount),balance=Number(balances[sourceId]||0);
 const money=(n,unit)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n)+' '+(unit||currency);
 const ready=Boolean(!loading&&!error&&restaurantId&&source&&destination&&receipt&&value>0&&
   Number.isFinite(value)&&Math.abs(value*100-Math.round(value*100))<0.000001&&
   value<=balance&&source.currency===destination.currency);
 const {mutateAsync,isPending}=useMutation({mutationFn:async payload=>{
  const {data,error:rpcError}=await supabase.rpc('erp_owner_receive_branch_cash',payload);
  if(rpcError)throw rpcError;
  if(!['posted','already_posted'].includes(data?.status))throw new Error('Both sides of handover were not confirmed');
  return data;
 }});
 const submit=async()=>{
  if(!ready||isPending)return;
  try{
   requestId.current ||= crypto.randomUUID();
   await mutateAsync({p_restaurant_id:restaurantId,p_branch_id:branchId,
    p_branch_account_id:sourceId,p_owner_account_id:ownerId,
    p_amount:Math.round(value*100)/100,p_request_id:requestId.current,
    p_note:note,p_owner_receipt_confirmed:true});
   qc.invalidateQueries({queryKey:['treasury_owner_central_transactions']});
   qc.invalidateQueries({queryKey:['wallet_transactions']});
   qc.invalidateQueries({queryKey:['treasury_accounts']});
   await onComplete?.();
   toast.success(t.success);
   change(setAmount,'');setNote('');setReceipt(false);
  }catch(e){
   const msg=String(e?.message||'Transaction not confirmed').slice(0,300);
   setSaveError(msg);toast.error(msg);
  }
 };
 return <Card className="border-blue-100 p-4" data-testid="treasury-owner-cash-handover">
  <details className="group">
   <summary className="flex cursor-pointer list-none items-center gap-3">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Landmark className="h-5 w-5"/></span>
    <span className="min-w-0 flex-1"><strong className="block text-sm">{t.title}</strong>
      <span className="block text-xs text-muted-foreground">{t.subtitle}</span></span>
    <ArrowLeftRight className="h-4 w-4 shrink-0 text-slate-500"/>
   </summary>
   <div className="mt-4 space-y-3 border-t pt-4">
    <div><Label>{t.branch} *</Label>
     <Select value={branchId} onValueChange={id=>{change(setBranchId,id);setSourceId('');}}>
      <SelectTrigger><SelectValue placeholder={t.branch}/></SelectTrigger>
      <SelectContent>{branches.filter(b=>b.is_active!==false).map(b=><SelectItem value={b.id} key={b.id}>{b.name||b.label||b.branch_key}</SelectItem>)}</SelectContent>
     </Select>
    </div>
    <div><Label>{t.source} *</Label>
     <Select value={sourceId} onValueChange={v=>change(setSourceId,v)}>
      <SelectTrigger><SelectValue placeholder={t.no}/></SelectTrigger>
      <SelectContent>{branchAccounts.map(a=><SelectItem value={a.id} key={a.id}>{a.account_name} · {money(Number(balances[a.id]||0),a.currency)}</SelectItem>)}</SelectContent>
     </Select>
    </div>
    <div><Label>{t.destination} *</Label>
     <Select value={ownerId} onValueChange={v=>change(setOwnerId,v)}>
      <SelectTrigger><SelectValue placeholder={t.no}/></SelectTrigger>
      <SelectContent>{ownerAccounts.map(a=><SelectItem value={a.id} key={a.id}>{a.account_name} · {a.currency||currency}</SelectItem>)}</SelectContent>
     </Select>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
     <div><Label>{t.amount} *</Label><Input value={amount} type="number" inputMode="decimal"
      step="0.01" min="0.01" onChange={e=>change(setAmount,e.target.value)}/></div>
     <div><Label>{t.note}</Label><Input value={note} maxLength={200}
      onChange={e=>change(setNote,e.target.value)}/></div>
    </div>
    {source&&<p className="text-xs text-muted-foreground">{t.balance}: {money(balance,source.currency)}</p>}
    <label className="flex items-start gap-2 rounded-lg border bg-emerald-50/50 p-3 text-xs">
     <input type="checkbox" checked={receipt} onChange={e=>change(setReceipt,e.target.checked)}
      className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"/>
     <span>{t.received}</span>
    </label>
    {saveError&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{saveError}</p>}
    <Button className="w-full" disabled={!ready||isPending} onClick={submit}>
     {isPending?t.saving:t.save}
    </Button>
   </div>
  </details>
 </Card>;
}
