// A fresh GPS acquisition every 30s (watchPosition alone need not report a stationary device).
// Never reuse a previous fix as a heartbeat. No persistent permission/token on the client.
export function startShiftLocationSharing({ sessionId, rpc, geolocation, visibility = document, onState }) {
  let stopped = false, token = null, timer = null;
  const revoke = async () => {
    if (token) {
      try { await rpc('erp_attendance_location_stop', { p_session: sessionId, p_token: token }); } catch { /* Server hides a disconnected point after 120 seconds. */ }
    }
  };
  const stop = () => {
    stopped = true; clearTimeout(timer);
    visibility.removeEventListener('visibilitychange', hidden);
    void revoke();
  };
  const hidden = () => { if (visibility.visibilityState !== 'visible') { stop(); onState('stopped'); } };
  const fail = () => { stop(); onState('error'); };
  const sample = () => {
    if (stopped || visibility.visibilityState !== 'visible') return;
    geolocation.getCurrentPosition(async ({ coords, timestamp }) => {
      if (stopped || visibility.visibilityState !== 'visible') return;
      if (!Number.isFinite(timestamp) || Date.now() - timestamp > 15000 || timestamp > Date.now() + 5000) { fail(); return; }
      try {
        const { error } = await rpc('erp_attendance_location_update', {
          p_session: sessionId, p_token: token, p_latitude: coords.latitude,
          p_longitude: coords.longitude, p_accuracy_m: coords.accuracy,
        });
        if (stopped) return;
        if (error) { fail(); return; }
        onState('sharing'); timer = setTimeout(sample, 30000);
      } catch { if (!stopped) fail(); }
    }, () => { if (!stopped) fail(); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  };
  visibility.addEventListener('visibilitychange', hidden);
  onState('starting');
  (async () => {
    try {
      if (!geolocation || visibility.visibilityState !== 'visible') { fail(); return; }
      const { data, error } = await rpc('erp_attendance_location_start', { p_session: sessionId, p_consent_version: 'shift-location-v1' });
      if (error) throw error;
      token = data;
      if (stopped) { void revoke(); return; }
      sample();
    } catch { if (!stopped) fail(); }
  })();
  return stop;
}
