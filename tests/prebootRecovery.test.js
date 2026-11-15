import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const html = readFileSync('index.html', 'utf8');
const code = html.match(/<script id="bizctrl-preboot-watchdog">([\s\S]*?)<\/script>/)[1];
afterEach(() => vi.useRealTimers());
function boot() {
  vi.useFakeTimers();
  const scene = { isConnected: true }, recovery = { hidden: true };
  const reload = vi.fn(); let retry;
  const nodes = { 'bizctrl-preboot': scene, 'bizctrl-preboot-recovery': recovery,
    'bizctrl-preboot-retry': { addEventListener: (_, action) => { retry = action; } } };
  runInNewContext(code, { document: { getElementById: id => nodes[id] }, window: { location: { reload } }, setTimeout });
  return { scene, recovery, reload, retry: () => retry() };
}
describe('preboot recovery when the entry module cannot load', () => {
  it('offers a manual retry after a bounded wait without automatic reload loops', () => {
    const b = boot();
    vi.advanceTimersByTime(11999); expect(b.recovery.hidden).toBe(true);
    vi.advanceTimersByTime(1); expect(b.recovery.hidden).toBe(false);
    expect(b.reload).not.toHaveBeenCalled(); b.retry(); expect(b.reload).toHaveBeenCalledTimes(1);
  });
  it('does not change the UI after React has replaced the preboot scene', () => {
    const b = boot(); b.scene.isConnected = false;
    vi.advanceTimersByTime(12000);
    expect(b.recovery.hidden).toBe(true); expect(b.reload).not.toHaveBeenCalled();
  });
});
