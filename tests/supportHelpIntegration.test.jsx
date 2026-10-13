// @vitest-environment jsdom
import React from 'react';
import { act, create } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ options: null, error: false, retry: vi.fn() }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { email: 'test@example.test' } }) }));
vi.mock('@/lib/LanguageContext', () => ({ useLanguage: () => ({ lang: 'fa', dir: 'rtl' }) }));
vi.mock('@/api/base44Client', () => ({ base44: { entities: { SupportTicket: { filter: vi.fn() } } } }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: options => { mocks.options = options; return { data: [], isLoading: false, isError: mocks.error, refetch: mocks.retry }; },
}));
vi.mock('@/components/support/SupportTicketForm', () => ({ default: () => null }));
vi.mock('@/components/ui/dialog', () => ({ Dialog: () => null, DialogContent: () => null, DialogHeader: () => null, DialogTitle: () => null }));
import Support, { parseTicketAttachments } from '../src/pages/Support';
let tree;
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; mocks.error = false; mocks.retry.mockClear(); });
describe('help and support integration', () => {
  it('reads the app language and leaves ticket queries disabled while reading guides', () => {
    act(() => { tree = create(<MemoryRouter initialEntries={['/support']}><Support /></MemoryRouter>); });
    expect(mocks.options.enabled).toBe(false);
    expect(tree.root.findByType('h1').children).toEqual(['مرکز راهنما']);
    const ticketTab = tree.root.findAllByType('button').find(b => b.children.includes('تیکت‌های من'));
    act(() => ticketTab.props.onClick());
    expect(mocks.options.enabled).toBe(true);
    expect(tree.root.findAllByType('article')).toHaveLength(0);
  });
  it('shows retry rather than an empty ticket list when fetching fails', () => {
    mocks.error = true;
    act(() => { tree = create(<MemoryRouter initialEntries={['/support?tab=tickets']}><Support /></MemoryRouter>); });
    expect(tree.root.findByProps({ role: 'alert' })).toBeTruthy();
    act(() => tree.root.findAllByType('button').find(b => b.children.includes('تلاش دوباره')).props.onClick());
    expect(mocks.retry).toHaveBeenCalledOnce();
  });
  it('accepts serialized/native attachment arrays and rejects corrupt or unsafe data', () => {
    const attachments = [{ url: 'https://example.test/file.pdf', name: 'File' }];
    expect(parseTicketAttachments(attachments)).toEqual(attachments);
    expect(parseTicketAttachments(JSON.stringify(attachments))).toEqual(attachments);
    expect(parseTicketAttachments('{broken')).toEqual([]);
    expect(parseTicketAttachments([null, { url: 'javascript:alert(1)' }])).toEqual([]);
  });
});
