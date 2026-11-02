// The canonical Sales Report period snapshot already includes every finalized
// payment source. Do NOT add the separate source breakdown to this total.
// Approved purchases are a purchase-based proxy for COGS, not inventory usage.
const finite = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
  ? Number(v) : null;
const sum = (a,b) => a===null || b===null ? null : Math.round((a+b)*100)/100;
export function buildPdfFinancialExecutiveSummary(snapshot) {
 if(!snapshot) throw new Error('Verified period financial snapshot required');
 const sales=finite(snapshot.sales),purchases=finite(snapshot.purchases);
 const fixed=finite(snapshot.fixedDeduction),variable=finite(snapshot.variableExpenses);
 const operatingExpenses=sum(fixed,variable);
 return {
  sales,purchases,fixed,variable,
  operatingExpenses, // ONLY fixed + variable (does not include purchase cost)
  totalCostIncludingPurchases:sum(purchases,operatingExpenses),
  grossPurchaseProxy:finite(snapshot.grossProfit), // sales - purchases (NOT actual stock COGS)
  netOperatingProxy:finite(snapshot.netProfit),  // gross proxy - operating expenses
  purchaseBasis:true,
  fixedCostIsAllocated:true,
  sourcesAreIncluded:true,
  currency: snapshot.currency || null,
 };
}
// Readable large-number display on an A4 4-column executive KPI grid.
// Show the *exact* amount underneath; compact values never replace precise totals.
export function compactPdfMoney(value){
 const n=finite(value);
 if(n===null)return '—';
 const a=Math.abs(n),sign=n<0?'−':'';
 if(a>=1e9)return sign+(a/1e9).toFixed(1)+'B';
 if(a>=1e6)return sign+(a/1e6).toFixed(1)+'M';
 if(a>=1000)return sign+(a/1000).toFixed(1)+'K';
 return sign+a.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:2});
}
export function exactPdfMoney(value,currency='SAR'){
 const n=finite(value);
 if(n===null)return '—';
 const sign=n<0?'−':'';
 return sign+Math.abs(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+currency;
}
