import { addDays, format, parseISO, isValid } from 'date-fns';

export function getWeekDates(weekStart) {
  const start = parseISO(weekStart || '');
  if (!isValid(start)) return [];
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    return { day: format(date, 'EEEE').toLowerCase(), date: format(date, 'MMM d') };
  });
}
export function rosterShifts(value) {
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
export function calcTotal(value) {
  return rosterShifts(value).reduce((sum, shift) => {
    if (!/^\d{2}:\d{2}$/.test(shift.start) || !/^\d{2}:\d{2}$/.test(shift.end)) return sum;
    const minutes = time => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
    return sum + ((minutes(shift.end) - minutes(shift.start) + 1440) % 1440) / 60;
  }, 0);
}
export function rosterPayload(data, restaurantId, branches) {
  const branch = (branches || []).find(b => b.key === data.branch && b.id);
  if (!restaurantId || !branch || (branch.restaurant_id && branch.restaurant_id !== restaurantId)) throw new Error('Select an active branch before saving the roster.');
  return { restaurant_id: restaurantId, branch_id: branch.id, branch: branch.key,
    week_starting: data.week_start, staff_name: data.staff_name.trim(),
    email: data.staff_email.trim(), whatsapp: data.staff_phone.trim(), notes: data.notes,
    shifts: rosterShifts(data.shifts) };
}
