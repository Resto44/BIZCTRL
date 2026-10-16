import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { treasuryBranchDisplayName, isTechnicalTreasuryBranch } from '../src/lib/treasuryBranchDisplay.js';
import { expenseCategorySuffix, resolveExpenseNotificationTitle,
  presentNotificationBranches, localizeNotificationContent } from '../src/lib/notificationBranchDisplay.js';

const restaurantBranches = [
  { id:'63a92c99-c4c8-4831-8e7f-33c8e0a6e653', key:'main-9a50614652',
    branch_key:'main-9a50614652', name:'فرع الريان', label:'فرع الريان' },
  { id:'70f62ca1-a737-4b77-9adb-9d6da0298416',
    branch_key:'main-aabbccddee', name:'فرع المروج',label:'فرع المروج' },
];
const categories = [
  { id:'fd22829d-814b-436d-add9-27ce1e877a82', name:'Utilities', name_ar:'المرافق', name_fa:'خدمات' },
];

describe('ERP branch names in Treasury and notifications', () => {
  it('renders real tenant-scoped branch name for canonical key and UUID', () => {
    const row = { branch:'main-9a50614652',branch_id:restaurantBranches[0].id,amount:1512 };
    expect(treasuryBranchDisplayName(row,restaurantBranches,'fa')).toBe('فرع الريان');
    expect(treasuryBranchDisplayName('main-9a50614652',restaurantBranches,'fa')).toBe('فرع الريان');
    expect(treasuryBranchDisplayName({branch_id:restaurantBranches[0].id},restaurantBranches,'ar')).toBe('فرع الريان');
    expect(treasuryBranchDisplayName({branch:'فرع الريان'},restaurantBranches,'ar')).toBe('فرع الريان');
    expect(row.branch).toBe('main-9a50614652');
    expect(row.amount).toBe(1512);
  });

  it('never displays a generated key or another restaurant branch as name', () => {
    expect(isTechnicalTreasuryBranch('main-9a50614652')).toBe(true);
    expect(treasuryBranchDisplayName('main-9a50614652',[], 'fa')).toBe('فرع نامشخص');
    expect(treasuryBranchDisplayName({branch_id:restaurantBranches[0].id},[], 'ar')).toBe('فرع غير محدد');
    expect(treasuryBranchDisplayName('all',restaurantBranches,'en')).toBe('All branches');
    expect(treasuryBranchDisplayName({branch:'main-aabbccddee'},restaurantBranches,'fa')).toBe('فرع المروج');
  });

  it('shows named category in old expense alerts instead of UUID in any language', () => {
    const saved = {
      type:'expense_recorded', branch:'main-9a50614652',
      title:'💸 New expense — main-9a50614652 (fd22829d-814b-436d-add9-27ce1e877a82)',
      message:'Amount: SAR 45', amount:45, id:'old-exp-1',
    };
    for (const [lang,expected] of [['fa','خدمات'],['ar','المرافق'],['en','Utilities']]) {
      const rendered = localizeNotificationContent(presentNotificationBranches(saved,restaurantBranches,'Branch',{expenseCategories:categories,lang}),lang);
      expect(rendered.title).toContain('فرع الريان (' + expected + ')');
      expect(rendered.title).not.toContain('fd22829d-');
      expect(rendered.amount).toBe(45);
      expect(rendered.id).toBe('old-exp-1');
    }
    expect(saved.title).toContain('fd22829d-');
  });

  it('omits missing categories rather than leaking an opaque UUID', () => {
    const old = '💸 New expense — فرع الريان (fd22829d-814b-436d-add9-27ce1e877a82)';
    expect(resolveExpenseNotificationTitle(old,'expense_recorded',[],'fa')).toBe('💸 New expense — فرع الريان');
    expect(expenseCategorySuffix('fd22829d-814b-436d-add9-27ce1e877a82')).toBe('');
    expect(expenseCategorySuffix('المرافق')).toBe(' (المرافق)');
    // Customer-entered content and invoices must never be stripped.
    expect(resolveExpenseNotificationTitle(old,'info',[],'fa')).toBe(old);
  });

  it('routes all notification surfaces via locale labels but keeps their persisted filter keys', () => {
    const src = path => readFileSync(new URL(path,import.meta.url),'utf8');
    const treasury = src('../src/pages/Treasury.jsx');
    expect(treasury).toContain('treasuryBranchDisplayName(tx,branches,lang)');
    expect(treasury).not.toContain('>{tx.branch}</Badge>');
    const expenses = src('../src/pages/Expenses.jsx');
    expect(expenses).toContain('getCatDisplayName(d.category_id)');
    const engine = src('../src/lib/notificationEngine.js');
    expect(engine).toContain('expenseCategorySuffix(category)');
    for(const path of [
      '../src/components/notifications/NotificationBell.jsx',
      '../src/components/notifications/NotificationList.jsx',
      '../src/components/notifications/NotificationPopups.jsx',
      '../src/components/notifications/LiveOperationsCenter.jsx',
      '../src/pages/NotificationCenter.jsx',
    ]) expect(src(path)).toContain('{ expenseCategories, lang }');
    const context = src('../src/lib/NotificationContext.jsx');
    expect(context).toContain(".eq('restaurant_id', activeRestaurantId)");
  });
});
