// Acquire a fresh fix for each heartbeat. Never relabel a cached fix as current.
export function startShiftLocationSharing({ sessionId, rpc, geolocation, visibility = document, onState, resumeOnVisible = false }) {
  let stopped = false, token = null, timer = null, failures = 0, generation = 0;
  const revoke = async (value = token) => {
    if (value) {
      try { await rpc('erp_attendance_location_stop', { p_session: sessionId, p_token: value }); } catch { /* Server hides disconnected points after 120 seconds. */ }
    }
  };
  const stop = () => {
    stopped = true; generation++; clearTimeout(timer);
    visibility.removeEventListener('visibilitychange', hidden);
    void revoke();
  };
  const hidden = () => {
    if (visibility.visibilityState !== 'visible') {
      if (resumeOnVisible) { generation++; clearTimeout(timer); onState('paused'); }
      else { stop(); onState('paused'); }
    } else if (resumeOnVisible && !stopped) { void begin(); }
  };
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
    const current = generation;
    try {
      geolocation.getCurrentPosition(async ({ coords, timestamp }) => {
        if (stopped || current !== generation || visibility.visibilityState !== 'visible') return;
        if (!Number.isFinite(timestamp) || Date.now() - timestamp > 15000 || timestamp > Date.now() + 5000) {
          retry('stale-location'); return;
        }
        try {
          const { error } = await rpc('erp_attendance_location_update', {
            p_session: sessionId, p_token: token, p_latitude: coords.latitude,
            p_longitude: coords.longitude, p_accuracy_m: coords.accuracy,
          });
          if (stopped || current !== generation) return;
          if (error) { fail(serverReason(error)); return; }
          failures = 0; onState('sharing'); timer = setTimeout(sample, 30000);
        } catch { if (!stopped && current === generation) retry('connection-error'); }
      }, error => {
        if (stopped || current !== generation) return;
        if (error?.code === 1) fail('permission-denied');
        else retry(error?.code === 3 ? 'gps-timeout' : 'gps-unavailable');
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    } catch { if (!stopped) fail('gps-unavailable'); }
  };
  const begin = async () => {
    const current = ++generation;
    failures = 0; onState('starting');
    try {
      if (!geolocation) { fail('gps-unavailable'); return; }
      if (visibility.visibilityState !== 'visible') { hidden(); return; }
      const { data, error } = await rpc('erp_attendance_location_start', { p_session: sessionId, p_consent_version: resumeOnVisible ? 'shift-history-v2' : 'shift-location-v1' });
      if (stopped || current !== generation) { if (data) void revoke(data); return; }
      if (error) { fail(serverReason(error)); return; }
      token = data;
      sample();
    } catch { if (!stopped && current === generation) fail('connection-error'); }
  };
  visibility.addEventListener('visibilitychange', hidden);
  void begin();
  return stop;
}
