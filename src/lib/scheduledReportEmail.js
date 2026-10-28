export function reportRecipients(value) {
  const addresses = [...new Set(String(value || '').split(/[,;،]/).map(s => s.trim().toLowerCase()).filter(Boolean))];
  if (!addresses.length || addresses.length > 5 || addresses.some(s => !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s)))
    throw new Error('INVALID_RECIPIENTS');
  return addresses;
}
export function reportSchedulePayload(form, restaurantId, branchId) {
  if (!restaurantId) throw new Error('MISSING_RESTAURANT');
  if (!form.name?.trim()) throw new Error('MISSING_NAME');
  if (!['daily', 'weekly', 'monthly'].includes(form.frequency)) throw new Error('INVALID_FREQUENCY');
  return { name: form.name.trim(), recipients: reportRecipients(form.email_to), frequency: form.frequency,
    restaurant_id: restaurantId, branch_id: branchId || null, report_type: 'sales', is_active: true };
}
export async function listReportSchedules(db, restaurantId) {
  const {data,error} = await db.from('scheduled_reports').select('*').eq('restaurant_id',restaurantId).order('created_date',{ascending:false});
  if(error) throw error;
  return data || [];
}
export async function invokeReportEmail(db, body) {
  const {data,error} = await db.functions.invoke('scheduled-report-email',{body});
  if(error) {
    let details;
    try { details = await error.context?.json(); } catch { /* Non-JSON gateway error. */ }
    throw new Error(details?.error || 'EMAIL_UNAVAILABLE');
  }
  if(!data?.ok) throw new Error(data?.error || 'EMAIL_UNAVAILABLE');
  return data;
}
