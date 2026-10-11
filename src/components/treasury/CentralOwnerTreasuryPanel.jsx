import React,{useMemo,useRef,useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {supabase} from '@/api/supabaseClient';
import {buildTreasuryAccountBalances} from '@/lib/treasuryAccounts';
import {Card} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {ArrowDownToLine,ArrowLeftRight,WalletCards,AlertTriangle} from 'lucide-react';
import {getSaleNetwork} from '@/lib/helpers';
import {normalizeTreasuryCurrency,isUnverifiedTreasuryCurrency} from '@/lib/treasuryCurrency';

const T={
 en:{heading:'Central Owner Treasury',hint:'All branch network sales accrue centrally. Provider settlement is not verified automatically.',
   recognized:'Finalized branch network sales',posted:'Linked Treasury network postings',unlinked:'Closings without matching Treasury posting',
   funding:'Fund a Branch from Owner',source:'Owner source account',branch:'Destination branch',dest:'Receiving branch cash account',
   amount:'Transfer amount',method:'Transfer method',cash:'Cash',network:'Network / bank',
   settlement:'I confirm the provider has actually settled these funds to my account.',
   received:'I confirm the branch has actually received this funding.',
   note:'Notes / receipt reference',save:'Post Funding',saving:'Posting...',notBank:'Network revenue ≠ verified bank balance. Never fund an unsettled provider receipt.',
   noBranch:'Choose branch',noData:'Not recorded',complete:'Funding transferred between Treasury accounts.',account:'Source ledger'},
 ar:{heading:'خزينة المالك المركزية',hint:'تُجمع مبيعات الشبكة من جميع الفروع مركزياً. لا يتم إثبات إيداع البنك تلقائياً.',
   recognized:'مبيعات الشبكة المعتمدة',posted:'القيود المرتبطة بالخزينة',unlinked:'إقفالات بدون قيد خزينة',
   funding:'تمويل فرع من حساب المالك',source:'حساب المالك المصدر',branch:'الفرع المستفيد',dest:'حساب النقد المستلم في الفرع',
   amount:'مبلغ التمويل',method:'طريقة التحويل',cash:'نقد',network:'شبكة / بنك',
   settlement:'أؤكد وصول المبلغ فعلياً إلى حساب المالك من مزود الشبكة.',
   received:'أؤكد استلام الفرع لمبلغ التمويل بالفعل.',
   note:'ملاحظات / مرجع التحويل',save:'تسجيل التمويل',saving:'جارٍ التسجيل...',notBank:'مبيعات الشبكة ليست رصيداً بنكياً مؤكداً. لا تمول من مبالغ غير مسوّاة.',
   noBranch:'اختر الفرع',noData:'غير مسجل',complete:'تم قيد طرفَي التمويل بنجاح.',account:'رصيد دفتر الحساب'},
 fa:{heading:'خزانه مرکزی مالک',hint:'فروشات شبکه تمام شعبه‌ها یکجا ثبت می‌شود؛ واریز بانک خودکار تأیید نمی‌شود.',
   recognized:'فروشات نهایی شبکه',posted:'ثبت‌های مرتبط در خزانه',unlinked:'بستن‌های بدون ثبت خزانه',
   funding:'تمویل شعبه از حساب مالک',source:'حساب پرداخت مالک',branch:'شعبه دریافت‌کننده',dest:'حساب نقد دریافتی شعبه',
   amount:'مبلغ تمویل',method:'روش انتقال',cash:'نقد',network:'شبکه / بانک',
   settlement:'تأیید می‌کنم مبلغ شبکه واقعاً به حساب مالک واریز شده است.',
   received:'تأیید می‌کنم شعبه واقعاً مبلغ تمویل را دریافت کرده است.',
   note:'یادداشت / شماره رسید',save:'ثبت تمویل',saving:'در حال ثبت...',notBank:'فروش شبکه معادل موجودی تأییدشده بانک نیست. از پول تسویه‌نشده تمویل نکن.',
   noBranch:'انتخاب شعبه',noData:'ثبت نشده',complete:'تمویل از حساب مالک کم و به حساب شعبه اضافه شد.',account:'مانده ثبت‌شده'}
};
export function summarizeOwnerNetworkClosings(sales=[],transactions=[]){
 const byReference=new Map();
 for(const tx of transactions){
   if(!['network_sales_auto','network_sales_auto_v2'].includes(tx.transaction_type)
      ||tx.direction!=='in'||!tx.reference_id)continue;
   const id=String(tx.reference_id);
   byReference.set(id,[...(byReference.get(id)||[]),tx]);
 }
 const finalized=sales.filter(s=>['finalized','locked'].includes(s.closing_state)&&
   Number(getSaleNetwork(s))>0);
 const closingIds=new Set(finalized.map(s=>String(s.id)));
 let linked=0,missing=0;
 for(const closing of finalized){
   const transactionsForClosing=byReference.get(String(closing.id))||[];
   const expected=Number(getSaleNetwork(closing));
   if(transactionsForClosing.length!==1 ||
      Math.abs((Number(transactionsForClosing[0].amount)||0)-expected)>0.009){
      missing+=1;
   }else linked+=expected;
 }
 return {
   sales:finalized.reduce((n,s)=>n+Number(getSaleNetwork(s)),0),
   linked,missing,
   unlinkedHistorical:transactions.filter(t=>['network_sales_auto','network_sales_auto_v2']
     .includes(t.transaction_type)&&!closingIds.has(String(t.reference_id))).length,
 };
}
export default function CentralOwnerTreasuryPanel({restaurantId,accounts=[],branches=[],
  transactions=[],sales=[],loading=false,error=false,lang='en',currency='SAR',onComplete}){
 const tr=T[lang]||T.en;
 const qc=useQueryClient();
 const requestId=useRef(null);
 const [sourceId,setSourceId]=useState('');
 const [branchId,setBranchId]=useState('');
 const [targetId,setTargetId]=useState('');
 const [amount,setAmount]=useState('');
 const [method,setMethod]=useState('network');
 const [settlementConfirmed,setSettlementConfirmed]=useState(false);
 const [receiptConfirmed,setReceiptConfirmed]=useState(false);
 const [note,setNote]=useState('');
 const [saveError,setSaveError]=useState('');
 const change=(setter,value)=>{setter(value);setSaveError('');requestId.current=null;};
 const totals=useMemo(()=>summarizeOwnerNetworkClosings(sales,transactions),[sales,transactions]);
 const balances=useMemo(()=>buildTreasuryAccountBalances(accounts,transactions),[accounts,transactions]);
 const ownerAccounts=accounts.filter(a=>a.is_active!==false&&!a.branch_id&&!a.branch_key&&
   ['bank','cash','network_pos','digital_wallet','clearing'].includes(a.account_type));
 const branchAccounts=accounts.filter(a=>a.is_active!==false&&(a.branch_id===branchId||
   (!a.branch_id&&a.branch_key&&branches.find(b=>b.id===branchId)?.branch_key===a.branch_key))&&
   ['cash','petty_cash'].includes(a.account_type));
 const chosenSource=ownerAccounts.find(a=>a.id===sourceId);
 const chosenDestination=branchAccounts.find(a=>a.id===targetId);
 // Only identical verified ISO denominations are transferable.
 const sourceCode=chosenSource?normalizeTreasuryCurrency(chosenSource.currency,currency):null;
 const destinationCode=chosenDestination?normalizeTreasuryCurrency(chosenDestination.currency,currency):null;
 const currencyMismatch=Boolean(chosenSource&&chosenDestination&&(
   isUnverifiedTreasuryCurrency(chosenSource.currency)||
   isUnverifiedTreasuryCurrency(chosenDestination.currency)||
   sourceCode!==destinationCode));
 const insufficientFunds=Number(amount)>Number(balances[sourceId]||0);
 const currencyError=lang==='ar'
   ?'تعذّر التمويل: عملة الحسابين مختلفة أو غير محددة. صحّح عملة الحساب قبل التحويل.'
   :lang==='fa'
   ?'تمویل ممکن نیست: ارز حساب مالک و شعبه متفاوت یا نامشخص است. ارز حساب را اصلاح کنید.'
   :'Funding blocked: account currencies differ or are unverified. Correct the denomination before transfer.';
 const needsSettled=chosenSource&&['network_pos','clearing'].includes(chosenSource.account_type);
 const selectedAmount=Number(amount);
 const ready=Boolean(restaurantId&&sourceId&&branchId&&targetId&&selectedAmount>0&&
   Number.isFinite(selectedAmount)&&Math.abs(selectedAmount*100-Math.round(selectedAmount*100))<.000001&&
   !currencyMismatch&&!insufficientFunds&&receiptConfirmed&&(!needsSettled||settlementConfirmed)&&!loading&&!error);
 const {mutateAsync,isPending}=useMutation({mutationFn:async payload=>{
   const {data,error:rpcError}=await supabase.rpc('erp_owner_fund_branch',payload);
   if(rpcError)throw rpcError;
   if(!['posted','already_posted'].includes(data?.status))throw new Error('Server did not confirm both sides of the funding transfer');
   return data;
 }});
 const submit=async()=>{
  if(!ready||isPending)return;
  try{
   requestId.current ||= crypto.randomUUID();
   await mutateAsync({
    p_restaurant_id:restaurantId,p_branch_id:branchId,p_source_account_id:sourceId,
    p_destination_account_id:targetId,p_amount:Math.round(selectedAmount*100)/100,
    p_payment_method:method,p_request_id:requestId.current,p_note:note,
    p_network_settlement_confirmed:Boolean(settlementConfirmed),
    p_branch_receipt_confirmed:Boolean(receiptConfirmed),
   });
   qc.invalidateQueries({queryKey:['wallet_transactions']});
   qc.invalidateQueries({queryKey:['treasury_accounts']});
   await onComplete?.();
   toast.success(tr.complete);
   setAmount('');setNote('');setReceiptConfirmed(false);setSettlementConfirmed(false);
   requestId.current=null;
  }catch(e){
   const rawMessage=String(e?.message||'Transfer was not confirmed');
    const message=rawMessage.includes('OWNER_FUNDING_CURRENCY_MISMATCH')
      ?currencyError:rawMessage.includes('OWNER_FUNDING_INSUFFICIENT_BALANCE')
      ?(lang==='fa'?'مانده حساب مالک کافی نیست.':lang==='ar'?'رصيد حساب المالك غير كافٍ.':'Insufficient owner balance.')
      :rawMessage.slice(0,350);
   setSaveError(message);toast.error(message);
  }
 };
 const money=(n,code=currency)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n||0)
   +' '+normalizeTreasuryCurrency(code,currency);
 return <Card className="space-y-4 border-blue-200 p-4" data-testid="owner-central-treasury">
  <div className="flex items-center gap-3">
   <span className="rounded-xl bg-blue-100 p-2.5 text-blue-700"><WalletCards className="h-5 w-5"/></span>
   <div><h3 className="text-base font-bold">{tr.heading}</h3>
    <p className="text-xs text-muted-foreground">{tr.hint}</p></div>
  </div>
  {error?<div role="alert" className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{tr.noData}</div>:
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
    {[[tr.recognized,money(totals.sales)],[tr.posted,money(totals.linked)],
      [tr.unlinked,String(totals.missing)]].map(([label,value])=>
      <div key={label} className="min-w-0 rounded-xl border bg-slate-50 p-3">
       <p className="text-[11px] leading-4 text-slate-600">{label}</p>
       <p dir="ltr" className="mt-1 break-words text-sm font-black text-slate-900">{loading?'…':value}</p>
      </div>)}
   </div>}
  <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
   <AlertTriangle className="me-1 inline h-4 w-4"/>{tr.notBank}
   {totals.unlinkedHistorical>0?<span className="ms-2 font-semibold">({totals.unlinkedHistorical} historical unmatched ledger entries)</span>:null}
  </p>
  <div className="space-y-3 border-t pt-3">
   <h4 className="flex items-center gap-2 text-sm font-bold"><ArrowLeftRight className="h-4 w-4"/>{tr.funding}</h4>
   <div><Label>{tr.source} *</Label>
    <Select value={sourceId} onValueChange={id=>change(setSourceId,id)}>
      <SelectTrigger><SelectValue placeholder={tr.source}/></SelectTrigger>
      <SelectContent>{ownerAccounts.map(a=><SelectItem key={a.id} value={a.id}>{a.account_name} · {money(balances[a.id],a.currency||currency)}{isUnverifiedTreasuryCurrency(a.currency)?' · Currency not verified':''}</SelectItem>)}</SelectContent>
    </Select>
   </div>
   <div className="grid gap-3 sm:grid-cols-2">
    <div><Label>{tr.branch} *</Label>
      <Select value={branchId} onValueChange={v=>{change(setBranchId,v);setTargetId('');}}>
       <SelectTrigger><SelectValue placeholder={tr.noBranch}/></SelectTrigger>
       <SelectContent>{branches.filter(b=>b.is_active!==false).map(b=><SelectItem value={b.id} key={b.id}>{b.name||b.label||b.branch_key}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <div><Label>{tr.dest} *</Label>
      <Select value={targetId} onValueChange={v=>change(setTargetId,v)}>
       <SelectTrigger><SelectValue placeholder={tr.dest}/></SelectTrigger>
       <SelectContent>{branchAccounts.map(a=><SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    <div><Label>{tr.amount} *</Label><Input value={amount} type="number" min="0.01" step="0.01"
      inputMode="decimal" onChange={e=>change(setAmount,e.target.value)}/></div>
    <div><Label>{tr.method} *</Label>
     <Select value={method} onValueChange={v=>change(setMethod,v)}>
      <SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
       <SelectItem value="network">{tr.network}</SelectItem><SelectItem value="cash">{tr.cash}</SelectItem>
      </SelectContent></Select>
    </div>
   </div>
   <div><Label>{tr.note}</Label><Input value={note} maxLength={200}
     onChange={e=>change(setNote,e.target.value)}/></div>
   {chosenSource&&<p className="text-xs text-muted-foreground">
     {tr.account}: <strong>{money(balances[sourceId],chosenSource.currency||currency)}</strong>
     {selectedAmount>0&&insufficientFunds}
     ?<span className="ms-2 font-bold text-rose-600">Insufficient balance</span>:null}
   </p>}
   {needsSettled&&<label className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
     <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" checked={settlementConfirmed} onChange={e=>change(setSettlementConfirmed,e.target.checked)}/>
     <span>{tr.settlement}</span></label>}
   <label className="flex items-start gap-2 rounded-lg border p-2 text-xs">
     <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600" checked={receiptConfirmed} onChange={e=>change(setReceiptConfirmed,e.target.checked)}/>
     <span>{tr.received}</span></label>
   {currencyMismatch&&<p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
      {currencyError} ({String(chosenSource?.currency)} → {String(chosenDestination?.currency)})
    </p>}
    {saveError&&<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{saveError}</p>}
   <Button onClick={submit} disabled={!ready||isPending} className="w-full gap-2">
     <ArrowDownToLine className="h-4 w-4"/>{isPending?tr.saving:tr.save}
   </Button>
  </div>
 </Card>;
}
