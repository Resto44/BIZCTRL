// Acquire a fresh fix for each heartbeat. Never relabel a cached fix as current.
export function startShiftLocationSharing({ sessionId, rpc, geolocation, visibility = document, onState }) {
  let stopped = false, token = null, timer = null, failures = 0;
  const revoke = async () => {
    if (token) {
      try { await rpc('erp_attendance_location_stop', { p_session: sessionId, p_token: token }); } catch { /* Server hides disconnected points after 120 seconds. */ }
    }
  };
  const stop = () => {
    stopped = true; clearTimeout(timer);
    visibility.removeEventListener('visibilitychange', hidden);
    void revoke();
  };
  const hidden = () => { if (visibility.visibilityState !== 'visible') { stop(); onState('paused'); } };
  const fail = reason => { stop(); onState(reason); };
  const serverReason = error => /ACTIVE_OWN_SHIFT_REQUIRED|LOCATION_CONSENT_EXPIRED/.test(error?.message || '')
    ? 'session-error' : 'connection-error';
  const retry = reason => {
    if (stopped) return;
    if (++failures >= 3) { fail(reason); return; }
    onState('retrying'); timer = setTimeout(sample, 3000);
  };
  const sample = () => {
    if (stopped || visibility.visibilityState !== 'visible') return;
    try {
      geolocation.getCurrentPosition(async ({ coords, timestamp }) => {
        if (stopped || visibility.visibilityState !== 'visible') return;
        if (!Number.isFinite(timestamp) || Date.now() - timestamp > 15000 || timestamp > Date.now() + 5000) {
          retry('stale-location'); return;
        }
        try {
          const { error } = await rpc('erp_attendance_location_update', {
            p_session: sessionId, p_token: token, p_latitude: coords.latitude,
            p_longitude: coords.longitude, p_accuracy_m: coords.accuracy,
          });
          if (stopped) return;
          if (error) { fail(serverReason(error)); return; }
          failures = 0; onState('sharing'); timer = setTimeout(sample, 30000);
        } catch { if (!stopped) retry('connection-error'); }
      }, error => {
        if (stopped) return;
        if (error?.code === 1) fail('permission-denied');
        else retry(error?.code === 3 ? 'gps-timeout' : 'gps-unavailable');
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    } catch { if (!stopped) fail('gps-unavailable'); }
  };
  visibility.addEventListener('visibilitychange', hidden);
  onState('starting');
  (async () => {
    try {
      if (!geolocation) { fail('gps-unavailable'); return; }
      if (visibility.visibilityState !== 'visible') { hidden(); return; }
      const { data, error } = await rpc('erp_attendance_location_start', { p_session: sessionId, p_consent_version: 'shift-location-v1' });
      if (error) { fail(serverReason(error)); return; }
      token = data;
      if (stopped) { void revoke(); return; }
      sample();
    } catch { if (!stopped) fail('connection-error'); }
  })();
  return stop;
}
