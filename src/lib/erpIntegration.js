/**
 * ERP Integration Module
 * Handles linking Sales → Cash Register → Profit & Loss
 */

import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';

/**
 * Link Add Sale to Cash Register automatically
 * Creates/updates cash register entry when sale is created
 */
export async function linkSaleToCashRegister(saleData, saleId) {
  try {
    const today = format(new Date(), 'yyyy-MM-dd');
    
    // Ensure sale has restaurant_id and organization_id
    if (!saleData.restaurant_id || !saleData.created_by) {
      throw new Error('Sale must have restaurant_id and organization_id');
    }

    // Get latest cash register entry for today
    const todaysSales = await base44.entities.DailySales.filter({
      date: today,
      branch: saleData.branch,
      restaurant_id: saleData.restaurant_id,
      organization_id: saleData.created_by,
    }, '-created_date', 100);

    const latestSale = todaysSales?.[0];
    
    // Calculate cash movement
    const openingCash = Number(latestSale?.closing_cash || 0);
    const closingCash = Number(saleData.restaurant_cash || 0) + openingCash;
    const cashMovement = closingCash - openingCash;

    // Determine cash status
    let cashStatus = 'Balanced';
    if (cashMovement < 0) cashStatus = 'Shortage';
    if (cashMovement > 0) cashStatus = 'Overage';

    // Update sale record with cash register data
    await base44.entities.DailySales.update(saleId, {
      opening_cash: openingCash,
      closing_cash: closingCash,
      cash_movement: cashMovement,
      cash_status: cashStatus,
      cash_difference: cashMovement,
    });

    return {
      openingCash,
      closingCash,
      cashMovement,
      cashStatus,
    };
  } catch (err) {
    console.error('[ERP] linkSaleToCashRegister error:', err);
    throw err;
  }
}

/**
 * Sync Opening/Closing Cash from latest sale record
 * Ensures cash register is always in sync with sales
 */
export async function syncCashFromLatestSale(restaurantId, branch, date) {
  try {
    const sales = await base44.entities.DailySales.filter({
      restaurant_id: restaurantId,
      branch,
      date,
    }, '-created_date', 100);

    if (!sales || sales.length === 0) {
      return {
        openingCash: 0,
        closingCash: 0,
        cashMovement: 0,
      };
    }

    const latestSale = sales[0];
    const openingCash = Number(latestSale.opening_cash || 0);
    const closingCash = Number(latestSale.closing_cash || 0);
    const cashMovement = closingCash - openingCash;

    return {
      openingCash,
      closingCash,
      cashMovement,
      source: 'latest_sale_record',
    };
  } catch (err) {
    console.error('[ERP] syncCashFromLatestSale error:', err);
    throw err;
  }
}

/**
 * Calculate Profit using formula:
 * Profit = Net Sales - Purchases - Variable Expenses
 * 
 * Fixed expenses are accumulated monthly and NOT deducted from daily sales
 */
export function calculateProfit(sales, purchases, variableExpenses) {
  const netSales = sales.reduce((sum, s) => sum + (s.total_amount || 0), 0);
  const totalPurchases = purchases.reduce((sum, p) => sum + (p.total_amount || 0), 0);
  const totalVarExp = variableExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  const profit = netSales - totalPurchases - totalVarExp;

  return {
    netSales,
    totalPurchases,
    totalVarExp,
    profit,
    profitMargin: netSales > 0 ? (profit / netSales * 100).toFixed(2) : 0,
  };
}

/**
 * Calculate Monthly Fixed Expenses
 * Accumulates fixed expenses for the month
 * Fixed expenses include: Rent, Salaries, Electricity, Internet, Other recurring
 */
export function calculateMonthlyFixedExpenses(expenses, expenseCategories) {
  const categoryMap = {};
  expenseCategories.forEach(cat => {
    categoryMap[cat.id] = {
      name: cat.name,
      isFixed: cat.is_fixed,
    };
  });

  const fixedExpenses = expenses.filter(exp => {
    const cat = categoryMap[exp.category_id];
    return cat && cat.isFixed;
  });

  const totalFixed = fixedExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);

  return {
    totalFixed,
    fixedExpenses,
    breakdown: fixedExpenses.reduce((acc, exp) => {
      const cat = categoryMap[exp.category_id];
      acc[cat.name] = (acc[cat.name] || 0) + (exp.amount || 0);
      return acc;
    }, {}),
  };
}

/**
 * Calculate Net Profit (after fixed expenses)
 * Net Profit = Profit - Monthly Fixed Expenses (only at month end)
 */
export function calculateNetProfit(dailyProfit, monthlyFixedExpenses, isMonthEnd = false) {
  if (!isMonthEnd) {
    // During month, don't deduct fixed expenses
    return dailyProfit;
  }
  
  // At month end, deduct fixed expenses
  return dailyProfit - monthlyFixedExpenses;
}

/**
 * Verify ERP data consistency
 */
export async function verifyERPConsistency(saleId, restaurantId) {
  try {
    const sale = await base44.entities.DailySales.filter({ id: saleId });
    
    if (!sale || !sale[0]) {
      throw new Error('Sale not found');
    }

    const saleData = sale[0];

    // Verify required fields
    const checks = {
      hasRestaurantId: !!saleData.restaurant_id,
      hasOrganizationId: !!saleData.created_by,
      hasCashData: saleData.opening_cash !== null && saleData.closing_cash !== null,
      hasCashMovement: saleData.cash_movement !== null,
      hasCashStatus: !!saleData.cash_status,
    };

    const isConsistent = Object.values(checks).every(v => v);

    return {
      isConsistent,
      checks,
      saleData: {
        id: saleData.id,
        restaurantId: saleData.restaurant_id,
        organizationId: saleData.created_by,
        cashMovement: saleData.cash_movement,
        cashStatus: saleData.cash_status,
      },
    };
  } catch (err) {
    console.error('[ERP] verifyERPConsistency error:', err);
    throw err;
  }
}

export default {
  linkSaleToCashRegister,
  syncCashFromLatestSale,
  calculateProfit,
  calculateMonthlyFixedExpenses,
  calculateNetProfit,
  verifyERPConsistency,
};
