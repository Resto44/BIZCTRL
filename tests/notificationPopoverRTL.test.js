import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { notificationPanelGeometry } from '../src/lib/notificationPanelGeometry';
import { presentNotificationBranches, localizeNotificationContent } from '../src/lib/notificationBranchDisplay';

const src = path => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Persian RTL notification popover', () => {
  it.each([
    [{ left: 36, right: 68, top: 130, bottom: 164 }, 375, 812, true],
    [{ left: 24, right: 56, top: 144, bottom: 180 }, 390, 844, true],
    [{ left: 310, right: 342, top: 60, bottom: 94 }, 375, 667, false],
    [{ left: 850, right: 882, top: 60, bottom: 94 }, 1024, 768, true],
    [{ left: 150, right: 182, top: 60, bottom: 94 }, 320, 568, false],
    [{ left: 8, right: 40, top: 30, bottom: 64 }, 280, 440, true],
  ])('keeps bell popup entirely inside a %ipx viewport', (rect, width, height, rtl) => {
    const popover = notificationPanelGeometry(rect, width, height, rtl);
    expect(popover.left).toBeGreaterThanOrEqual(12);
    expect(popover.left + popover.width).toBeLessThanOrEqual(width - 12);
    expect(popover.top).toBeGreaterThanOrEqual(12);
    expect(popover.top + popover.maxHeight).toBeLessThanOrEqual(height - 12);
    expect(popover.width).toBeGreaterThan(0);
    expect(popover.maxHeight).toBeGreaterThan(0);
  });

  it('portal bypasses the ERP overflow-hidden shell, scrolls long items and handles language direction', () => {
    const bell = src('../src/components/notifications/NotificationBell.jsx');
    expect(bell).toContain("import { createPortal } from 'react-dom'");
    expect(bell).toContain('document.body');
    expect(bell).toContain("dir={rtl ? 'rtl' : 'ltr'}");
    expect(bell).toContain('notificationPanelGeometry(rect, width, height, rtl)');
    expect(bell).toContain('overflow-y-auto overscroll-contain');
    expect(bell).toContain('overflow-wrap:anywhere');
    expect(bell).not.toContain('absolute right-0 mt-2 w-80');
    expect(bell).not.toContain('line-clamp-2');
    expect(bell).toContain("event.key === 'Escape'");
  });

  it('shows existing sale and treasury notifications in Persian while retaining amount and branch', () => {
    const branches = [{key:'main-9a50614652',label:'فرع الريان'}];
    const saved = { type:'sale_recorded',title:'💰 فروش جديد — main-9a50614652',
      branch:'main-9a50614652',message:'مبلغ: SAR 1,777',amount:1777 };
    const result = localizeNotificationContent(presentNotificationBranches(saved, branches), 'fa');
    expect(result.title).toBe('💰 فروش جدید — فرع الريان');
    expect(result.message).toBe('مبلغ: SAR 1,777');
    expect(result.amount).toBe(1777);
    expect(saved.branch).toBe('main-9a50614652');
    const treasury = localizeNotificationContent(presentNotificationBranches({
      type:'owner_to_branch', title:'💳 تمويل فرع — main-9a50614652',
      branch:'main-9a50614652', message:'مبلغ: SAR 150'
    }, branches), 'fa');
    expect(treasury.title).toBe('💳 تمویل شعبه — فرع الريان');
  });

  it('switches known titles to Arabic or English without rewriting custom notification text', () => {
    const saved = { type:'sale_recorded', title:'💰 فروش جديد — فرع الريان', message:'مبلغ: SAR 1,777' };
    expect(localizeNotificationContent(saved, 'ar').title).toBe('💰 بيع جديد — فرع الريان');
    expect(localizeNotificationContent(saved, 'en').title).toBe('💰 New sale — فرع الريان');
    expect(localizeNotificationContent(saved, 'en').message).toBe('Amount: SAR 1,777');
    const custom = { type:'info', title:'Customer note — #A44', message:'Custom free text' };
    expect(localizeNotificationContent(custom, 'fa')).toEqual(custom);
  });

  it('uses localized display consistently in bell, history, popup and live notifications', () => {
    for (const path of [
      '../src/components/notifications/NotificationBell.jsx',
      '../src/components/notifications/NotificationList.jsx',
      '../src/components/notifications/NotificationPopups.jsx',
      '../src/components/notifications/LiveOperationsCenter.jsx',
      '../src/pages/NotificationCenter.jsx'
    ]) expect(src(path)).toContain('localizeNotificationContent');
  });
});
