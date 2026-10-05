export async function deleteExpenseRecord(client, id) {
  if (!id) throw new Error('Cannot delete expense: missing id');
  const {data,error} = await client.from('expenses').delete().eq('id',id).select('id');
  if (error) throw error;
  if (!data?.some(row => row.id === id)) {
    throw new Error('Expense was not deleted. Check your branch access or refresh the list.');
  }
  return {success:true};
}
