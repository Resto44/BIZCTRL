import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { withStartupDeadline } from '../src/lib/startupReadDeadline.js';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
afterEach(() => vi.useRealTimers());

describe('PWA loading cannot hang indefinitely', () => {
  it('allows successful owner session reads to complete unchanged', async () => {
    const value = { data: { session: { user: { id: 'same-user' } } } };
    await expect(withStartupDeadline(Promise.resolve(value), 9000)).resolves.toBe(value);
  });
  it('reports a stalled SDK lookup without signing out or changing any database record', async () => {
    vi.useFakeTimers();
    const read = withStartupDeadline(new Promise(() => {}), 100, 'ROOT_GET_SESSION_TIMEOUT');
    const result = expect(read).rejects.toThrow('ROOT_GET_SESSION_TIMEOUT');
    await vi.advanceTimersByTimeAsync(100);
    await result;
  });
  it('turns hung module loading into an actionable iOS recovery screen', () => {
    expect(app).toContain('setTimeout(() => setStalled(true), 12000)');
    expect(app).toContain('data-testid="erp-startup-stalled"');
    expect(app).toContain('onClick={() => window.location.reload()}');
    expect(app).toContain('href={`/erp-login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}');
    expect(app).toContain('بارگذاری برنامه متوقف شده');
    expect(app).toContain('توقف تحميل التطبيق');
  });
  it('bounds all root authorization steps but never bypasses signed-in verification', () => {
    expect(app).toContain("withStartupDeadline(supabase.auth.getSession(), 9000, 'ROOT_GET_SESSION_TIMEOUT')");
    expect(app).toContain("withStartupDeadline(supabase.auth.getUser(session.access_token), 9000, 'ROOT_VERIFY_USER_TIMEOUT')");
    expect(app).toContain("withStartupDeadline(supabase.rpc('platform_owner_session_snapshot'), 9000, 'ROOT_OWNER_AUTHORIZATION_TIMEOUT')");
    expect(app).toContain("navigate('/erp-login', { replace: true })");
    expect(app).toContain("setDecision('authorization-error')");
    expect(app).not.toContain("localStorage.clear()");
  });
});
