import { describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ calls: [] }));
vi.mock('@/lib/app-params', () => ({ appParams: {} }));
vi.mock('@supabase/supabase-js', async importOriginal => {
  const sdk = await importOriginal();
  return { ...sdk, createClient(...args) {
    state.calls.push(args);
    if (state.calls.length === 1) throw new Error('Invalid deployment configuration');
    return sdk.createClient(...args);
  } };
});
describe('ERP client initialization failure', () => {
  it('keeps real SDK methods but cannot return fake empty data or contact production', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      const { supabase } = await import('../src/api/supabaseClient');
      expect(state.calls).toHaveLength(2);
      const options = state.calls[1][2];
      expect(options.auth).toMatchObject({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
      expect((await options.global.fetch('https://example.test')).status).toBe(400);
      const result = await supabase.from('customers').select('id').eq('restaurant_id', 'r').order('id').range(0, 9);
      expect(result.data).toBeNull();
      expect(result.error.code).toBe('ERP_CLIENT_INITIALIZATION_FAILED');
      const rpc = await supabase.rpc('read_only_probe');
      expect(rpc.error).toBeTruthy();
    } finally { log.mockRestore(); info.mockRestore(); }
  });
});
