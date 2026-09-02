import { supabase } from '@/api/supabaseClient';
import { PRODUCT_IMPORT_CHUNK_SIZE } from '@/lib/productSpreadsheet';

const EMPTY_COUNTS = Object.freeze({
  master_total: 0,
  active_total: 0,
  branch_assigned: 0,
  branch_unassigned: 0,
  low_stock: 0,
  out_of_stock: 0,
  inventory_value: 0,
});

function databaseMessage(error, fallback) {
  if (!error) return fallback;
  if (error.code === 'PGRST202' || /could not find the function/i.test(error.message || '')) {
    return 'The scalable Product Catalog database migration has not been installed yet.';
  }
  return error.message || fallback;
}

export async function searchMasterProducts({
  restaurantId,
  branchId = null,
  query = '',
  category = 'all',
  scope = 'all',
  status = 'all',
  sort = 'name_asc',
  page = 1,
  pageSize = 50,
}) {
  const { data, error } = await supabase.rpc('erp_search_master_products', {
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
    p_query: query || null,
    p_category: category || 'all',
    p_scope: scope,
    p_status: status,
    p_sort: sort,
    p_page: page,
    p_page_size: pageSize,
  });
  if (error) throw new Error(databaseMessage(error, 'Unable to load the master product catalog.'));
  const rows = Array.isArray(data) ? data : [];
  return {
    rows,
    total: Number(rows[0]?.total_count || 0),
    page,
    pageSize,
  };
}

export async function getProductCatalogCounts({ restaurantId, branchId = null }) {
  const { data, error } = await supabase.rpc('erp_product_catalog_counts', {
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
  });
  if (error) throw new Error(databaseMessage(error, 'Unable to load product catalog totals.'));
  return { ...EMPTY_COUNTS, ...(data || {}) };
}

export async function setBranchProductAssortment({ restaurantId, branchId, productIds, active = true }) {
  if (!branchId) throw new Error('Select a branch before changing its product assortment.');
  const ids = [...new Set((productIds || []).filter(Boolean))];
  if (!ids.length) return 0;
  const { data, error } = await supabase.rpc('erp_set_branch_product_assortment', {
    p_restaurant_id: restaurantId,
    p_branch_id: branchId,
    p_product_ids: ids,
    p_active: active,
  });
  if (error) throw new Error(databaseMessage(error, 'Unable to update the branch assortment.'));
  return Number(data || 0);
}

export async function createProductImportJob({ restaurantId, branchId = null, file }) {
  const extension = String(file?.name || '').split('.').pop()?.toLowerCase();
  const { data, error } = await supabase
    .from('product_import_jobs')
    .insert({
      restaurant_id: restaurantId,
      branch_id: branchId,
      file_name: file?.name || 'product-import.xlsx',
      file_type: extension === 'csv' ? 'csv' : 'xlsx',
      status: 'importing',
    })
    .select('id')
    .single();
  if (error) throw new Error(databaseMessage(error, 'Unable to create the import audit record.'));
  return data?.id || null;
}

export async function updateProductImportJob(id, changes) {
  if (!id) return;
  const { error } = await supabase.from('product_import_jobs').update(changes).eq('id', id);
  if (error) throw new Error(databaseMessage(error, 'Unable to update the import audit record.'));
}

export async function importMasterProducts({
  restaurantId,
  branchId = null,
  rows,
  onProgress,
}) {
  const totals = { processed: 0, created: 0, updated: 0, failed: 0, branch_added: 0, errors: [] };
  const chunks = [];
  for (let index = 0; index < rows.length; index += PRODUCT_IMPORT_CHUNK_SIZE) {
    chunks.push(rows.slice(index, index + PRODUCT_IMPORT_CHUNK_SIZE));
  }

  for (let index = 0; index < chunks.length; index += 1) {
    const payload = chunks[index].map(({ _rowNumber, ...row }) => row);
    const { data, error } = await supabase.rpc('erp_bulk_upsert_master_products', {
      p_restaurant_id: restaurantId,
      p_rows: payload,
      p_branch_id: branchId,
    });
    if (error) throw new Error(databaseMessage(error, `Import stopped at batch ${index + 1}.`));

    const result = data || {};
    totals.processed += Number(result.processed || payload.length);
    totals.created += Number(result.created || 0);
    totals.updated += Number(result.updated || 0);
    totals.failed += Number(result.failed || 0);
    totals.branch_added += Number(result.branch_added || 0);
    const serverErrors = Array.isArray(result.errors) ? result.errors : [];
    serverErrors.forEach((serverError) => {
      const sourceRow = chunks[index][Math.max(0, Number(serverError.row || 1) - 1)];
      totals.errors.push({
        row: sourceRow?._rowNumber || serverError.row,
        sku: serverError.sku || sourceRow?.sku || '',
        name: sourceRow?.name || '',
        field: 'server',
        message: serverError.message || 'Database validation failed.',
      });
    });
    onProgress?.({
      ...totals,
      percent: Math.round(((index + 1) / chunks.length) * 100),
      batch: index + 1,
      batches: chunks.length,
    });
  }

  return totals;
}

export { EMPTY_COUNTS };
