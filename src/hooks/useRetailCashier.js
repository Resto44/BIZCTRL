import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { cashierRpc, isDefiniteRejection } from '@/lib/retailCashier';
import { subscribeCashierBroadcast } from '@/lib/cashierBroadcast';

export function useRetailCashier(deviceId, scope, active = true) {
  const storageKey = `cashier-pending:${scope}:${deviceId}`;
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(0);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(() => {
    try { const p = JSON.parse(sessionStorage.getItem(storageKey)); return p?.id && p?.command && p?.payload ? p : null; } catch { return null; }
  });
  const current = useRef(null);
  const mounted = useRef(true);
  const activeRef = useRef(active); activeRef.current = active;
  const inFlight = useRef(0);
  const uncertain = useRef(pending);
  const queue = useRef(Promise.resolve());
  const fetching = useRef(false);
  const generation = useRef(0);
  const apply = useCallback(data => {
    if (data?.device?.id === deviceId && mounted.current) { current.current = data; setSnapshot(data); }
  }, [deviceId]);
  const savePending = useCallback(p => {
    uncertain.current = p;
    if (mounted.current) setPending(p);
    try { if (p) sessionStorage.setItem(storageKey, JSON.stringify(p)); else sessionStorage.removeItem(storageKey); } catch { /* Server cart idempotency still protects checkout. */ }
  }, [storageKey]);
  const refresh = useCallback(async () => {
    if (!activeRef.current || fetching.current || inFlight.current) return;
    fetching.current = true;
    const version = generation.current;
    try {
      const data = await cashierRpc('cashier_snapshot', { p_device_id: deviceId });
      if (version === generation.current && !inFlight.current) apply(data);
      if (mounted.current) setConnected(true);
    } catch (e) {
      if (mounted.current) { setConnected(false); setError(e.message); if (e.code === '42501') { current.current = null; setSnapshot(null); } }
    } finally { fetching.current = false; }
  }, [apply, deviceId]);
  const execute = useCallback(async request => {
    savePending(request);
    try {
      const data = await cashierRpc('cashier_command', { p_device_id: deviceId, p_command: request.command, p_payload: request.payload, p_request_id: request.id });
      savePending(null); apply(data);
      if (mounted.current) { setError(null); setConnected(true); }
      return data;
    } catch (e) {
      if (isDefiniteRejection(e)) savePending(null);
      if (mounted.current) { setError(e.message || 'Connection interrupted'); if (!isDefiniteRejection(e)) setConnected(false); }
      throw e;
    }
  }, [apply, deviceId, savePending]);
  const command = useCallback((name, payload = {}) => {
    inFlight.current++; generation.current++;
    if (mounted.current) setBusy(inFlight.current);
    const job = queue.current.then(async () => {
      if (!mounted.current || !activeRef.current) throw new Error('Cashier page is inactive');
      if (uncertain.current) throw new Error('Check or retry the previous action first.');
      if (navigator.onLine === false) throw new Error('Offline: reconnect before changing or paying a sale.');
      const cart = current.current?.cart;
      const values = typeof payload === 'function' ? payload(cart) : payload;
      return execute({ id: crypto.randomUUID(), command: name, payload: { ...(cart ? { cart_id: cart.id, revision: cart.revision } : {}), ...values } });
    });
    const result = job.finally(() => {
      inFlight.current--;
      if (mounted.current) setBusy(inFlight.current);
      if (!inFlight.current) void refresh();
    });
    queue.current = result.catch(() => {});
    return result;
  }, [execute, refresh]);
  const retry = useCallback(async () => {
    if (!uncertain.current || inFlight.current) return null;
    inFlight.current++; generation.current++; setBusy(1);
    try { return await execute(uncertain.current); }
    finally { inFlight.current--; if (mounted.current) setBusy(0); void refresh(); }
  }, [execute, refresh]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!active) return undefined;
    let invalidation;
    const update = () => { clearTimeout(invalidation); invalidation = setTimeout(refresh, 150); };
    const unsubscribe = subscribeCashierBroadcast(supabase, `cashier:${deviceId}`, status => { if (status === 'changed' || status === 'SUBSCRIBED') update(); });
    void refresh();
    const timer = setInterval(refresh, 5000);
    const heartbeat = setInterval(() => {
      if (document.visibilityState !== 'visible' || inFlight.current || !activeRef.current || uncertain.current) return;
      // Heartbeats use the same queue so a stale response cannot overwrite scans.
      void command('heartbeat').catch(() => {});
    }, 30000);
    const offline = () => setConnected(false);
    window.addEventListener('online', update); window.addEventListener('offline', offline);
    return () => { unsubscribe(); clearInterval(timer); clearInterval(heartbeat); clearTimeout(invalidation); window.removeEventListener('online', update); window.removeEventListener('offline', offline); };
  }, [active, command, deviceId, refresh]);
  // An in-flight request is persisted for recovery, but only an unresolved
  // response blocks new scans. Rapid HID scans remain queued while online.
  return { snapshot, busy, connected, pending: busy ? null : pending, error, command, retry, refresh };
}
