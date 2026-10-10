/**
 * Verified cost ratios and period consumption for the one-page Sales Analytics PDF.
 * Purchases are NOT food COGS; no "food cost %" without recipe/stock valuation.
 */
export function buildPdfConsumptionCostControl({snapshot,previousSnapshot=null,operationsReport=null}={}){
  if(!snapshot)throw new Error('A verified sales report snapshot is required');
  const pct=(amount,sales)=>{
    const revenue=Number(sales);
    return Number.isFinite(revenue)&&revenue>0&&Number.isFinite(Number(amount))
      ? Number(amount)/revenue*100:null;
  };
  const purchaseRatio=pct(snapshot.purchases,snapshot.sales);
  const expenseRatio=pct(snapshot.totalExpenses,snapshot.sales);
  const prevPurchaseRatio=previousSnapshot?pct(previousSnapshot.purchases,previousSnapshot.sales):null;
  const prevExpenseRatio=previousSnapshot?pct(previousSnapshot.totalExpenses,previousSnapshot.sales):null;
  const productRows=operationsReport?.hasConsumptionData && Array.isArray(operationsReport.consumption)
    ? operationsReport.consumption
      .filter(r=>Number.isFinite(Number(r.quantity))&&Number(r.quantity)>0)
      .slice(0,2).map(row=>({
        name:String(row.name||'').trim()||'—',quantity:Number(row.quantity),
        unit:String(row.unit||'unit'),
        estimatedCost:row.costAvailable&&Number.isFinite(Number(row.estimatedCost))
          ?Number(row.estimatedCost):null,
      })):[];
  const topCategory=Array.isArray(operationsReport?.costGroups)&&operationsReport.costGroups.length
    ?operationsReport.costGroups[0]:null;
  const wasteCost=operationsReport?.hasWasteData && operationsReport.wasteCostComplete
    ?Number(operationsReport.wasteCost):null;
  return {
    purchaseRatio,expenseRatio,prevPurchaseRatio,prevExpenseRatio,
    purchaseDelta:purchaseRatio!==null&&prevPurchaseRatio!==null
      ?purchaseRatio-prevPurchaseRatio:null,
    expenseDelta:expenseRatio!==null&&prevExpenseRatio!==null
      ?expenseRatio-prevExpenseRatio:null,
    productRows,
    hasConsumptionData:Boolean(operationsReport?.hasConsumptionData),
    topExpenseCategory:topCategory&&Number.isFinite(Number(topCategory.value))
      ?{name:String(topCategory.name||'Other'),value:Number(topCategory.value)}:null,
    wasteCost,
    hasWasteData:Boolean(operationsReport?.hasWasteData),
  };
}
