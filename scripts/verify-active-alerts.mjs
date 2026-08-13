import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const ownerDashboard = read('src/pages/OwnerDashboard.jsx');
const alertCenter = read('src/pages/SmartAlertCenter.jsx');
const alertHook = read('src/hooks/useActiveAlerts.js');
const alertEngine = read('src/lib/activeAlertsEngine.js');
const realtimeHook = read('src/hooks/useOwnerDashboardRealtime.js');
const app = read('src/App.jsx');
const migration = read('supabase/migrations/20260813_canonical_active_alerts.sql');

assert(!ownerDashboard.includes('const totalAlerts = useMemo'), 'Owner Dashboard still derives a fake totalAlerts count.');
assert(ownerDashboard.includes('useActiveAlerts()'), 'Owner Dashboard must query canonical Active Alerts.');
assert(ownerDashboard.includes('activeAlertCount'), 'Owner Dashboard must render the persisted active count.');
assert(ownerDashboard.includes('0 Active Alerts'), 'Owner Dashboard must show an explicit zero-alert state.');
assert(ownerDashboard.includes('grid-cols-2') && ownerDashboard.includes('sm:grid-cols-5'), 'Owner Dashboard alert summary must retain responsive mobile-to-desktop record details.');
assert(ownerDashboard.includes("navigate('/alerts')"), 'Owner Dashboard Active Alerts controls must route to the canonical list.');
assert(alertCenter.includes('useActiveAlerts()'), 'Active Alerts list must use the canonical hook.');
assert(alertCenter.includes('resolveAlert') && alertCenter.includes('Resolve alert'), 'Active Alerts list must support immediate resolve.');
assert(alertCenter.includes('Type') && alertCenter.includes('Branch') && alertCenter.includes('Date / time') && alertCenter.includes('Severity') && alertCenter.includes('Status'), 'Active Alerts list must show complete required fields.');
assert(alertCenter.includes('grid-cols-2') && alertCenter.includes('sm:grid-cols-5') && alertCenter.includes('flex-col gap-3 sm:flex-row'), 'Active Alerts list must retain explicit mobile, tablet, and desktop responsive layouts.');
assert(alertCenter.includes('break-words') && alertCenter.includes('min-w-0'), 'Active Alerts records must prevent mobile text overflow.');
assert(alertHook.includes(".from('active_alerts')"), 'Canonical alert hook must query the persisted active_alerts table.');
assert(alertHook.includes(".eq('status', ACTIVE_STATUS)"), 'Canonical alert hook must query unresolved active records only.');
assert(alertHook.includes("status: 'resolved'"), 'Resolve action must persist status=resolved.');
assert(alertHook.includes("table: 'active_alerts'"), 'Canonical alert hook must subscribe to active-alert realtime changes.');
assert(alertEngine.includes('status: \'cleared\''), 'Alert engine must clear conditions that no longer exist.');
assert(alertEngine.includes("current.status === 'resolved'"), 'Alert engine must preserve manually resolved records.');
assert(realtimeHook.includes("active_alerts:          ['active-alerts']"), 'Owner realtime map must invalidate Active Alerts.');
assert(app.includes('path="/alerts" element={<RoleGuard permission="viewAlerts"><SmartAlertCenter /></RoleGuard>}'), 'Canonical /alerts route must render the Active Alerts list.');
assert(app.includes('path="/smart-alerts" element={<Navigate to="/alerts" replace />}'), 'Legacy Smart Alerts URL must redirect to canonical /alerts.');
assert(!app.includes('if (noUser) { navigateToLogin(); return null; }'), 'Authentication redirects must not run during render.');
assert(migration.includes('CREATE TABLE IF NOT EXISTS public.active_alerts'), 'Migration must create canonical Active Alerts table.');
assert(migration.includes('active_alerts_select_scope') && migration.includes('erp_can_access_scope_text'), 'Migration must enforce scoped alert visibility.');
assert(migration.includes('status TEXT NOT NULL DEFAULT \'active\''), 'Migration must persist alert status.');

console.log('Active Alerts regression checks passed.');
