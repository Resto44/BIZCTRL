export const walletLanguage=(value:unknown)=>typeof value==='string'&&/^ar(?:[-_]|$)/i.test(value)?'ar':typeof value==='string'&&/^(fa|prs)(?:[-_]|$)/i.test(value)?'fa':'en';
const words={
 en:{pending:'Approval required',posted:'Transfer approved',rejected:'Transfer rejected',from:'From',to:'To',open:'Tap to approve or reject',done:'Tap to view receipt',declined:'No funds moved · Tap for details',test:'Wallet alerts active',testBody:'Approval requests and results will arrive in English.'},
 ar:{pending:'طلب موافقة على تحويل',posted:'تم اعتماد التحويل',rejected:'تم رفض التحويل',from:'من',to:'إلى',open:'اضغط للموافقة أو الرفض',done:'اضغط لعرض الإيصال',declined:'لم يتحرك الرصيد · اضغط للتفاصيل',test:'إشعارات المحفظة مفعّلة',testBody:'ستصلك طلبات الموافقة ونتائج المعاملات بالعربية.'},
 fa:{pending:'درخواست تأیید انتقال',posted:'انتقال تأیید شد',rejected:'انتقال رد شد',from:'از',to:'به',open:'برای تأیید یا رد لمس کنید',done:'برای دیدن رسید لمس کنید',declined:'موجودی تغییر نکرد · دیدن جزئیات',test:'اعلان والت فعال است',testBody:'درخواست‌های تأیید و نتیجۀ معاملات به فارسی می‌رسد.'}
};
const cleanName=(value:unknown,fallback:string)=>String(value||fallback).replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim().slice(0,48);
export const isWalletId=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function walletMessage(event:any,request:any,person:any,business:any,language:unknown){
 const lang=walletLanguage(language),t=words[lang];
 if(!isWalletId(request.id)||!['pending','posted','rejected'].includes(event.status))throw Error('Invalid wallet event');
 const amount=new Intl.NumberFormat(lang==='fa'?'fa-AF':lang==='ar'?'ar-SA':'en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(request.amount));
 const title=t[event.status as 'pending'|'posted'|'rejected'];
 const company=cleanName(business.name,'BizCTRL'),beneficiary=cleanName(person.name,lang==='ar'?'المستفيد':lang==='fa'?'مستفید':'Beneficiary');
 const [from,to]=request.kind==='fund_wallet'?[company,beneficiary]:[beneficiary,company];
 // Separate labeled lines and isolate bidirectional names; omit notes, IDs and account balances.
 const isolate=(value:string)=>'\u2068'+value+'\u2069';
 const body=[isolate(`${amount} ${request.currency}`),`${t.from}: ${isolate(from)}`,`${t.to}: ${isolate(to)}`,event.status==='pending'?t.open:event.status==='posted'?t.done:t.declined].join('\n');
 return {title,body,lang,dir:lang==='en'?'ltr':'rtl',tag:`wallet:${request.id}:${event.status}`,url:`${event.recipient_role==='owner'?'/sponsor-treasury':'/wallet-portal'}?wallet_request=${request.id}`};
}
export function walletTestMessage(language:unknown,owner:boolean){const lang=walletLanguage(language),t=words[lang];return {lang,dir:lang==='en'?'ltr':'rtl',title:t.test,body:t.testBody,tag:'wallet-test',url:owner?'/sponsor-treasury':'/wallet-portal'};}
export function walletDeliveryAllowed(device:any,event:any,request:any,person:any,business:any,isOwner:boolean){
 return !!device?.enabled&&!!event&&!!request&&!!person?.is_active&&business?.is_active!==false&&!!business&&
 device.user_id===event.recipient_id&&device.restaurant_id===event.restaurant_id&&request.restaurant_id===event.restaurant_id&&
 request.id===event.request_id&&person.id===request.person_id&&person.restaurant_id===request.restaurant_id&&request.status===event.status&&
 (event.recipient_role==='owner'?isOwner:person.user_id===event.recipient_id);
}
