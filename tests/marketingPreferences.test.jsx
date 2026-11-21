// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-router-dom', () => ({ useLocation: () => ({ pathname: '/', search: '', hash: '' }) }));
vi.mock('@/lib/tiktokPixel', () => ({
  TIKTOK_MARKETING_CONSENT_KEY: 'bizctrl.marketing-consent.v1',
  createTikTokPixel: () => ({ enabled: true, update: vi.fn() }),
}));
import TikTokPixel, { MarketingPrivacyButton } from '../src/components/TikTokPixel';

const key = 'bizctrl.marketing-consent.v1';
let tree;
const mount = () => act(() => { tree = create(<><TikTokPixel /><MarketingPrivacyButton /></>); });
const banner = () => tree.root.findAllByProps({ 'aria-label': 'Marketing tracking preferences' });
const choose = (text) => act(() => tree.root.findAllByType('button').find(b => b.props.children === text).props.onClick());
beforeEach(() => localStorage.clear());
afterEach(() => act(() => tree?.unmount()));

describe('Remembered marketing choices', () => {
  it.each([['Allow marketing measurement', 'granted'], ['No, thanks', 'denied']])(
    'hides the banner after %s and keeps it hidden when mounted again', (label, value) => {
      mount();
      expect(banner()).toHaveLength(1);
      choose(label);
      expect(localStorage.getItem(key)).toBe(value);
      expect(banner()).toHaveLength(0);
      act(() => tree.unmount());
      mount();
      expect(banner()).toHaveLength(0);
      expect(tree.root.findAllByType('button')).toHaveLength(1);
      expect(tree.root.findByType('button').props.className).not.toContain('fixed');
    }
  );
  it('lets a returning visitor reopen preferences and withdraw consent through the footer', () => {
    localStorage.setItem(key, 'granted');
    mount();
    choose('Marketing privacy');
    expect(banner()).toHaveLength(1);
    choose('No, thanks');
    expect(localStorage.getItem(key)).toBe('denied');
    expect(banner()).toHaveLength(0);
  });
  it('dismisses an open banner when another tab saves a choice', () => {
    mount();
    act(() => {
      localStorage.setItem(key, 'denied');
      window.dispatchEvent(new StorageEvent('storage', { key, newValue: 'denied' }));
    });
    expect(banner()).toHaveLength(0);
  });
});
