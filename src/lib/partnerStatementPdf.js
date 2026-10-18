import {jsPDF} from 'jspdf';
import {prepareLocalizedPdf,drawLocalizedPdfText,safePdfFilename} from './pdfLocalization';
import {partnerDirection} from './partnerAnalytics';
export function createPartnerStatement({partner,t,lang,rows,balance,currency,summary,periodLabel,filters}) {
 const doc=new jsPDF({unit:'mm',format:'a4',putOnlyUsedFonts:true});
 const {rtl}=prepareLocalizedPdf(doc,{lang});let y=20;
 const money=n=>`${Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}`;
 const header=()=>{doc.setFillColor(239,246,255);doc.rect(0,0,210,16,'F');drawLocalizedPdfText(doc,'BizCTRL',14,10,{bold:true,size:14,color:[29,78,216]});y=24;};
 const space=h=>{if(y+h>278){doc.addPage();header();}};
 const text=(value,{size=10,bold=false,color=[30,41,59]}={})=>{
  doc.setFont('Vazirmatn',bold?'bold':'normal');doc.setFontSize(size);
  const lines=doc.splitTextToSize(String(value??''),180);
  for(const line of lines){space(7);drawLocalizedPdfText(doc,line,rtl?196:14,y,{rtl,size,bold,color});y+=7;}
 };
 header();text(t.portal,{size:19,bold:true});text(`${partner.business} · ${partner.name}`,{size:12,bold:true});text(periodLabel,{size:9});text(filters,{size:8});
 text(t.balanceNote,{size:8,color:[100,116,139]});
 const tile=(label,value,x,color)=>{doc.setFillColor(245,248,253);doc.roundedRect(x,y,87,23,3,3,'F');drawLocalizedPdfText(doc,label,rtl?x+82:x+5,y+7,{rtl,size:8,color:[100,116,139]});drawLocalizedPdfText(doc,value,x+43.5,y+17,{align:'center',size:13,bold:true,color});};
 space(60);if(balance){tile(t.ownerOwes,money(balance.owner_owes),14,[4,120,87]);tile(t.partnerOwes,money(balance.partner_owes),109,[180,83,9]);y+=28;}
 text(t.selectedPeriod,{bold:true,size:13});space(32);tile(t.incoming,money(summary.incoming),14,[4,120,87]);tile(t.outgoing,money(summary.outgoing),109,[29,78,216]);y+=30;text(`${t.awaiting}: ${summary.pending}`);
 text(t.trend,{bold:true,size:13});
 for(const month of summary.months){space(22);text(month.month,{bold:true,size:9});text(`${t.incoming}: ${money(month.incoming)} | ${t.outgoing}: ${money(month.outgoing)}`,{size:9});}
 text(t.pdfNote,{size:8,color:[100,116,139]});
 y+=7;space(30);text(`${t.records} (${rows.length})`,{bold:true,size:16});
 if(!rows.length)text(t.noRecords);
 for(const row of rows){space(40);doc.setDrawColor(219,234,254);doc.line(14,y-3,196,y-3);
  text(`${row.effective_date} · ${t[row.kind]}`,{bold:true});
  text(`${t[partnerDirection(row)]}: ${money(row.amount)} · ${t[row.payment_method]||t.other}`,{bold:true,color:partnerDirection(row)==='incoming'?[4,120,87]:[29,78,216]});
  text(`${t.reference}: ${row.external_reference||row.id}`,{size:9});
  if(row.notes)text(`${t.notes}: ${row.notes}`,{size:9});
  text(row.confirmed_at?`${t.confirmed} · ${row.confirmed_at.slice(0,10)}`:t.awaiting,{size:8,color:[100,116,139]});y+=4;
 }
 const count=doc.getNumberOfPages();for(let i=1;i<=count;i++){doc.setPage(i);drawLocalizedPdfText(doc,`${i} / ${count}`,105,289,{align:'center',size:8,color:[100,116,139]});}
 return doc;
}
export function downloadPartnerStatement(options){createPartnerStatement(options).save(safePdfFilename('BizCTRL-Partner-Statement',options.lang));}
