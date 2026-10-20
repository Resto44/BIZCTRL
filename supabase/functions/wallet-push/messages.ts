export const walletLanguage=(value:unknown)=>value==='ar'||value==='fa'?value:'en';
const words={
 en:{pending:'Wallet transfer needs approval',posted:'Wallet transfer approved',rejected:'Wallet transfer rejected',fund:'Payment to beneficiary',return:'Return to owner',open:'Open to review the transfer',test:'Wallet notifications are connected',testBody:'This device can receive wallet approval and transaction updates.'},
 ar:{pending:'تحويل محفظة ينتظر الموافقة',posted:'تم اعتماد تحويل المحفظة',rejected:'تم رفض تحويل المحفظة',fund:'دفع للمستفيد',return:'إرجاع إلى المالك',open:'افتح لمراجعة التحويل',test:'إشعارات المحفظة متصلة',testBody:'يمكن لهذا الجهاز استقبال طلبات الموافقة ونتائج معاملات المحفظة.'},
 fa:{pending:'معاملۀ والت منتظر تأیید است',posted:'معاملۀ والت تأیید شد',rejected:'معاملۀ والت رد شد',fund:'پرداخت به مستفید',return:'برگشت به اونر',open:'برای بررسی معامله باز کنید',test:'اعلان‌های والت متصل است',testBody:'این دستگاه اعلان درخواست تأیید و نتیجۀ معاملات والت را دریافت می‌کند.'}
};
export const isWalletId=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function walletMessage(event:any,request:any,person:any,business:any,language:unknown){
 const lang=walletLanguage(language),t=words[lang];
 if(!isWalletId(request.id)||!['pending','posted','rejected'].includes(event.status))throw Error('Invalid wallet event');
 const amount=new Intl.NumberFormat(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(request.amount));
 const title=t[event.status as 'pending'|'posted'|'rejected'];
 // Notes, emails, internal IDs and business-wide balances never appear on a lock screen.
 const body=[String(business.name||'BizCTRL').slice(0,70),String(person.name||'').slice(0,60),request.kind==='fund_wallet'?t.fund:t.return,`${amount} ${request.currency}`,event.status==='pending'?t.open:''].filter(Boolean).join(' · ');
 return {title,body,tag:`wallet:${request.id}`,url:`${event.recipient_role==='owner'?'/sponsor-treasury':'/wallet-portal'}?wallet_request=${request.id}`};
}
export function walletTestMessage(language:unknown,owner:boolean){const t=words[walletLanguage(language)];return {title:t.test,body:t.testBody,tag:'wallet-test',url:owner?'/sponsor-treasury':'/wallet-portal'};}
export function walletDeliveryAllowed(device:any,event:any,request:any,person:any,business:any,isOwner:boolean){
 return !!device?.enabled&&!!event&&!!request&&!!person?.is_active&&business?.is_active!==false&&!!business&&
 device.user_id===event.recipient_id&&device.restaurant_id===event.restaurant_id&&request.restaurant_id===event.restaurant_id&&
 request.id===event.request_id&&person.id===request.person_id&&person.restaurant_id===request.restaurant_id&&request.status===event.status&&
 (event.recipient_role==='owner'?isOwner:person.user_id===event.recipient_id);
}
