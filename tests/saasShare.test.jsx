import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { SAAS_SHARE_URL, SAAS_SHARE_COPY, whatsappShareHref } from '../src/lib/saasShare';
import ShareBizCTRL from '../src/components/dashboard/ShareBizCTRL';
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }) => <div>{children}</div>, DialogTrigger: ({ children }) => <div>{children}</div>,
  DialogContent: ({ children }) => <div>{children}</div>, DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>, DialogDescription: ({ children }) => <p>{children}</p>,
}));
describe('Public SaaS sharing', () => {
  it.each(['en', 'fa', 'ar'])('encodes %s messages with only the public product URL', (lang) => {
    const url = new URL(whatsappShareHref(SAAS_SHARE_COPY[lang].message));
    expect(url.origin).toBe('https://wa.me');
    expect(url.searchParams.get('text')).toBe(`${SAAS_SHARE_COPY[lang].message}\n\n${SAAS_SHARE_URL}`);
    expect(url.searchParams.get('text')).not.toMatch(/restaurant_id|access_token|owner-command-center/);
  });
  it('uses the edited message and preserves special characters', () => {
    let tree;
    act(() => { tree = create(<ShareBizCTRL lang="fa" />); });
    act(() => { tree.root.findByType('textarea').props.onChange({ target: { value: 'سلام & ERP + 100%' } }); });
    expect(new URL(tree.root.findByType('a').props.href).searchParams.get('text')).toBe(`سلام & ERP + 100%\n\n${SAAS_SHARE_URL}`);
    tree.unmount();
  });
  it('offers manual copy when clipboard permission is denied', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    let tree;
    act(() => { tree = create(<ShareBizCTRL />); });
    await act(async () => { await tree.root.findAllByType('button')[1].props.onClick(); });
    expect(tree.root.findByProps({ role: 'status' }).children.join('')).toBe(SAAS_SHARE_COPY.en.failed);
    expect(tree.root.findByType('input').props.value).toBe(SAAS_SHARE_URL);
    tree.unmount(); vi.unstubAllGlobals();
  });
});
