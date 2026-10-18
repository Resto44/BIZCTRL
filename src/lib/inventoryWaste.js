/** Public inventory_waste columns are quantity/cost, not UI-only qty/unit_cost/total_loss.
 * Keep this mapping free of React so save validation can be tested independently.
 * The database trigger owns the atomic stock movement; never change stock from here.
 */
export function buildWastePayload({ form, restaurantId, branch, product }) {
  if (!restaurantId) throw new Error('Select a restaurant before saving waste.');
  if (!branch?.id || !branch?.key) throw new Error('Select a valid branch.');
  if (!product) throw new Error('Select a valid product.');
  const productId = product.product_id || product.id;
  if (!productId) throw new Error('Selected product has no ID.');
  const quantity = Number(form.qty);
  const unitCost = Number(form.unit_cost);
  if (form.qty === '' || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Quantity must be greater than zero.');
  }
  if (form.unit_cost === '' || !Number.isFinite(unitCost) || unitCost < 0) {
    throw new Error('Unit cost must be zero or greater.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date || '') || Number.isNaN(new Date(form.date).getTime())) {
    throw new Error('Select a valid date.');
  }
  if (!['expired', 'spoiled', 'damaged', 'theft', 'other'].includes(form.reason)) {
    throw new Error('Select a valid waste reason.');
  }
  return {
    restaurant_id: restaurantId,
    branch_id: branch.id,
    branch: branch.key,
    product_id: String(productId),
    product_name: product.name || product.name_ar || form.product_name || String(productId),
    quantity,
    unit: product.unit || form.unit || null,
    cost: Math.round((quantity * unitCost + Number.EPSILON) * 100) / 100,
    reason: form.reason,
    date: form.date,
    notes: String(form.notes || '').trim(),
  };
}

export function normalizeWasteRecord(row) {
  const quantity = Number(row?.quantity ?? row?.qty ?? 0);
  const cost = Number(row?.cost ?? row?.total_loss ?? 0);
  return { ...row, qty: quantity, total_loss: cost };
}

export function describeWasteError(error, lang = 'en') {
  const detail = String(error?.message || error || '');
  const messages = {
    no_stock: {
      en: 'No inventory stock record exists for this product and branch. Add its opening stock first.',
      ar: 'لا يوجد سجل مخزون لهذا المنتج في الفرع. أضف المخزون الافتتاحي أولاً.',
      fa: 'برای این محصول در این شعبه سابقه موجودی ثبت نشده است. نخست موجودی اولیه را ثبت کنید.',
    },
    insufficient: {
      en: 'Not enough available stock for this quantity. Check and reconcile the branch inventory.',
      ar: 'المخزون المتاح لا يكفي لهذه الكمية. راجع رصيد المخزون لهذا الفرع.',
      fa: 'موجودی قابل استفاده برای این مقدار کافی نیست. موجودی این شعبه را بررسی و اصلاح کنید.',
    },
    access: {
      en: 'You are not authorized to record waste for this branch. Check your assigned permissions.',
      ar: 'ليست لديك صلاحية تسجيل الهدر لهذا الفرع.',
      fa: 'شما اجازه ثبت ضایعات برای این شعبه را ندارید.',
    },
    generic: {
      en: 'Could not save inventory waste. Please retry or contact the administrator.',
      ar: 'تعذّر حفظ الهدر. أعد المحاولة أو تواصل مع المسؤول.',
      fa: 'ثبت ضایعات انجام نشد. دوباره تلاش کنید یا با مدیر سیستم تماس بگیرید.',
    },
  };
  const kind = /No stock record/i.test(detail) ? 'no_stock'
    : /Insufficient stock/i.test(detail) ? 'insufficient'
    : /denied|permission|policy|row-level|not authorized/i.test(detail) || error?.code === '42501' ? 'access'
    : 'generic';
  return messages[kind][lang] || messages[kind].en;
}
