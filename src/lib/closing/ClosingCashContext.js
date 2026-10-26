// Match the save RPC's canonical session before excluding prior closing cash.
// A new form can target an existing session after its date/shift is changed.
export async function loadClosingCashContext(client, scope) {
  let closingId = scope.p_closing_id || null;
  let closingRecord = null;
  if (!closingId) {
    const { data, error } = await client.from('daily_sales')
      .select('*')
      .eq('restaurant_id', scope.p_restaurant_id)
      .eq('branch_id', scope.p_branch_id)
      .eq('date', scope.p_date)
      .in('closing_state', ['draft', 'ready'])
      .eq('cashier_id', scope.p_cashier_id);
    if (error) throw error;
    const normalize = value => String(value || '').trim().toLowerCase();
    const matches = (data || []).filter(row => normalize(row.shift) === normalize(scope.p_shift));
    if (matches.length > 1) throw new Error('Multiple closings match this session. Open the intended closing from History.');
    closingRecord = matches[0] || null;
    closingId = closingRecord?.id || null;
  }
  const { data, error } = await client.rpc('erp_sales_closing_cash_context', {
    ...scope, p_closing_id: closingId,
  });
  if (error) throw error;
  return { ...(data || {}), resolved_closing_id: closingId, resolved_closing_record: closingRecord };
}
