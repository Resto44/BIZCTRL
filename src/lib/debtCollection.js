// Keep collection history aligned with the deployed database contract.
// Read errors must never be presented as an empty financial history.
export async function readDebtHistory(client, debt) {
  if (!debt?.id || !debt.restaurant_id) throw new Error('DEBT_SCOPE_REQUIRED');
  const results = await Promise.all([
    client.from('debt_payments').select('*').eq('restaurant_id', debt.restaurant_id).eq('debt_id', debt.id).order('date', { ascending: false }).limit(20),
    client.from('collection_actions').select('*').eq('restaurant_id', debt.restaurant_id).eq('debt_id', debt.id).order('created_date', { ascending: false }).limit(20),
  ]);
  for (const result of results) if (result.error) throw result.error;
  return results.map(result => result.data || []);
}

export function collectionActionPayload(debt, form, email, promiseNote = '') {
  if (!debt?.id || !debt.restaurant_id) throw new Error('DEBT_SCOPE_REQUIRED');
  return {
    restaurant_id: debt.restaurant_id,
    branch_id: debt.branch_id || null,
    branch: debt.branch || null,
    debt_id: debt.id,
    customer_name: debt.party_name || '',
    action_type: form.action_type,
    notes: [form.outcome, promiseNote].filter(Boolean).join('\n'),
    next_action_date: form.next_follow_up || null,
    created_by: email || '',
  };
}
