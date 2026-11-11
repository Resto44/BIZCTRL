// Pure cent-level validation shared by Sales Closing UI and regression tests.
// Does not access browser, Supabase or mutable financial records.
export const isItemizedCustomerCreditValid = (items, amount) => {
 if (!Array.isArray(items) || !items.length) return true; // Legacy amount-only closing: disclosed summary line.
 if (items.length > 30) return false;
 let totalCents=0;
 for (const line of items) {
  const qty=Number(line.quantity),unit=Number(line.unit_price);
  if (!String(line.name||'').trim()||String(line.name).length>160||!Number.isFinite(qty)||
      !Number.isFinite(unit)||qty<=0||qty>1000||unit<0||unit>1000000||
      Math.abs(Math.round(unit*100)-unit*100)>1e-6) return false;
  const cents=Math.round(qty*unit*100);
  if (!Number.isSafeInteger(cents)||cents<0) return false;
  totalCents+=cents;
 }
 return totalCents===Math.round(Number(amount)*100);
};
