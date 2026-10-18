import {expect,it} from 'vitest';
import fs from 'node:fs';
import {createPartnerStatement} from '../src/lib/partnerStatementPdf';
import {partnerText} from '../src/lib/partnerTreasury';
import {summarizePartnerRecords} from '../src/lib/partnerAnalytics';
it.each(['en','ar','fa'])('exports complete localized statement in %s',lang=>{
 const rows=Array.from({length:9},(_,i)=>({id:`transaction-${i}`,effective_date:'2026-10-18',kind:i%2?'sponsor_advance_to_owner':'owner_repay_sponsor',amount:123.45,currency:'SAR',payment_method:i%2?'cash':'network',external_reference:`REF-${i}`,notes:'رسید حساب شریک - بررسی انتقال بانکی',confirmed_at:i%2?'2026-10-18':null}));
 const doc=createPartnerStatement({partner:{name:'عبدالمجيد',business:'مطاعم شمعة الريان'},t:partnerText(lang),lang,rows,balance:{owner_owes:1500,partner_owes:200},currency:'SAR',summary:summarizePartnerRecords(rows),periodLabel:'2026-10-01 - 2026-10-18',filters:partnerText(lang).all});
 expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
 const buffer=Buffer.from(doc.output('arraybuffer'));expect(buffer.length).toBeGreaterThan(10000);
 fs.mkdirSync('tmp/partner-pdf',{recursive:true});fs.writeFileSync(`tmp/partner-pdf/statement-${lang}.pdf`,buffer);
});
