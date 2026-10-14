import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { isTechnicalBranchKey, resolveNotificationBranchName, presentNotificationBranches } from '../src/lib/notificationBranchDisplay';

const branches = [
  { id: '63a92c99-c4c8-4831-8e7f-33c8e0a6e653', key: 'main-9a50614652', name: 'فرع الريان', label: 'فرع الريان' },
  { id: '70f62ca1-a737-4b77-9adb-9d6da0298416', branch_key: 'main-aabbccddee', name: 'فرع المروج' },
];

describe('Notification branch label integrity', () => {
  it('renders existing sales notification with real branch name without changing the record', () => {
    const saved = {
      id: 'sale-1', type: 'sale_recorded', branch: 'main-9a50614652',
      title: '💰 فروش جديد — main-9a50614652', message: 'مبلغ: SAR 1,777',
      amount: 1777, restaurant_id: 'restaurant-A', is_read: false,
    };
    const displayed = presentNotificationBranches(saved, branches, 'شعبه');
    expect(displayed.title).toBe('💰 فروش جديد — فرع الريان');
    expect(displayed.branch).toBe('فرع الريان');
    expect(displayed.message).toBe('مبلغ: SAR 1,777');
    expect(displayed.amount).toBe(1777);
    expect(displayed.id).toBe(saved.id);
    expect(saved.branch).toBe('main-9a50614652');
    expect(saved.title).toContain('main-9a50614652');
  });

  it('updates the visible name when a branch is renamed, without rewriting financial history', () => {
    const saved = {
      branch: 'main-9a50614652',
      title: '💳 تمويل فرع — main-9a50614652',
      message: 'مرجع: main-9a50614652',
    };
    const updated = branches.map(b => b.key === saved.branch
      ? { ...b, name: 'فرع السلام', label: 'فرع السلام' } : b);
    const result = presentNotificationBranches(saved, updated, 'شعبه');
    expect(result.title).toContain('فرع السلام');
    expect(result.message).toContain('فرع السلام');
    expect(saved.branch).toBe('main-9a50614652');
  });

  it('replaces a second branch token in transfer messages without confusing branches', () => {
    const saved = { branch: 'main-9a50614652',
      title: '↔️ نقل مخزون — main-9a50614652 → main-aabbccddee',
      message: 'Transfer main-aabbccddee' };
    const result = presentNotificationBranches(saved, branches);
    expect(result.title).toContain('فرع الريان → فرع المروج');
    expect(result.message).toContain('فرع المروج');
  });

  it('never leaks generated IDs for unknown branches, nor shows names from another restaurant', () => {
    expect(isTechnicalBranchKey('main-9a50614652')).toBe(true);
    expect(resolveNotificationBranchName('main-9a50614652', [], 'شعبه')).toBe('شعبه');
    expect(presentNotificationBranches({ branch:'main-9a50614652',
      title:'فروش جديد — main-9a50614652'}, [], 'شعبه').title).toBe('فروش جديد — شعبه');
    expect(resolveNotificationBranchName('فرع الريان', branches)).toBe('فرع الريان');
    expect(resolveNotificationBranchName('main-9a50614652', branches)).toBe('فرع الريان');
  });

  it('uses formatting in bell, popup, list, history search and live feed; leaves keys for filtering', () => {
    const root = '../src/';
    for (const filename of [
      'components/notifications/NotificationBell.jsx',
      'components/notifications/NotificationList.jsx',
      'components/notifications/NotificationPopups.jsx',
      'components/notifications/LiveOperationsCenter.jsx',
      'pages/NotificationCenter.jsx',
    ]) {
      expect(readFileSync(new URL(root + filename, import.meta.url), 'utf8')).toContain('presentNotificationBranches');
    }
    const engine = readFileSync(new URL('../src/lib/notificationEngine.js', import.meta.url), 'utf8');
    expect(engine).toContain("eq('restaurant_id', restaurantId).eq('branch_key', branchName)");
    expect(engine).toContain('branch: branch || null');
    expect(engine).toContain('title: displayTitle');
  });
});
