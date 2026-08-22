export const DASHBOARD_CONFIGURATION_SCHEMA_VERSION = 1;

// Dashboard data and component identity are intentionally stable. Only the
// display metadata in this registry is customizable by a restaurant owner.
export const DASHBOARD_WIDGET_IDS = Object.freeze({
  DRIVER_ANALYTICS: 'driver-analytics',
  FINANCIAL_CENTER: 'financial-center',
  SIX_MONTH_TREND: 'six-month-trend',
  EXECUTIVE_SUMMARY: 'executive-summary',
  OPERATING_RESULT: 'operating-result',
  CASH_RECONCILIATION: 'cash-reconciliation',
  SALES_ANALYTICS: 'sales-analytics',
  ADDITIONAL_SALES_SOURCES: 'additional-sales-sources',
  PURCHASE_ANALYTICS: 'purchase-analytics',
  PRODUCT_CONSUMPTION: 'product-consumption',
  INVENTORY_ANALYTICS: 'inventory-analytics',
  VARIABLE_EXPENSES: 'variable-expenses',
  CASH_FLOW: 'cash-flow',
  PRICE_INTELLIGENCE: 'price-intelligence',
  ACTIVE_ALERTS: 'active-alerts',
  PRICE_CHANGES: 'price-changes',
  LIVE_ACTIVITY: 'live-activity',
  MODE_INSIGHTS: 'mode-insights',
});

const COPY = {
  en: {
    driverDescription: 'Branch and driver sales performance',
    financialCenter: 'Enterprise Financial Center',
    financialCenterDescription: 'Quick access to enterprise reports',
    sixMonthTrend: '6-Month Trend Analytics',
    sixMonthTrendDescription: ({ selectedBranchLabel }) => `${selectedBranchLabel} — Last 6 calendar months`,
    variableExpenses: 'Variable Expenses',
    variableExpensesDescription: 'Variable costs only — fixed expenses excluded',
    priceChanges: 'Price Changes',
    priceChangesDescription: 'Recent supplier and product price activity',
    liveActivity: 'Live Activity Feed',
    liveActivityDescription: 'Real-time branch events',
    customizeDashboard: 'Customize Dashboard',
    customizeDescription: 'Rename optional dashboard sections, edit descriptions, or control which optional sections are visible.',
    widgetTitle: 'Widget title',
    widgetDescription: 'Widget description',
    visible: 'Visible',
    reset: 'Reset',
    resetWidget: 'Reset widget',
    saveChanges: 'Save changes',
    cancel: 'Cancel',
    saving: 'Saving…',
    optional: 'Optional',
    required: 'Required',
    resetHelp: 'Reset restores this widget’s localized default title, description, and visibility.',
    permissionDenied: 'You do not have permission to customize this dashboard.',
    saved: 'Dashboard customization saved.',
    saveFailed: 'Unable to save dashboard customization.',
  },
  ar: {
    driverDescription: 'أداء مبيعات الفروع والسائقين',
    financialCenter: 'المركز المالي المؤسسي',
    financialCenterDescription: 'وصول سريع إلى تقارير المؤسسة',
    sixMonthTrend: 'تحليلات الاتجاه لستة أشهر',
    sixMonthTrendDescription: ({ selectedBranchLabel }) => `${selectedBranchLabel} — آخر 6 أشهر تقويمية`,
    variableExpenses: 'المصروفات المتغيرة',
    variableExpensesDescription: 'التكاليف المتغيرة فقط — لا تشمل المصروفات الثابتة',
    priceChanges: 'تغييرات الأسعار',
    priceChangesDescription: 'نشاط أسعار الموردين والمنتجات الأخير',
    liveActivity: 'سجل النشاط المباشر',
    liveActivityDescription: 'أحداث الفروع في الوقت الفعلي',
    customizeDashboard: 'تخصيص لوحة المعلومات',
    customizeDescription: 'غيّر أسماء الأقسام الاختيارية وأوصافها، وتحكّم في الأقسام الاختيارية الظاهرة.',
    widgetTitle: 'عنوان الأداة',
    widgetDescription: 'وصف الأداة',
    visible: 'ظاهر',
    reset: 'إعادة تعيين',
    resetWidget: 'إعادة تعيين الأداة',
    saveChanges: 'حفظ التغييرات',
    cancel: 'إلغاء',
    saving: 'جارٍ الحفظ…',
    optional: 'اختياري',
    required: 'مطلوب',
    resetHelp: 'تستعيد إعادة التعيين العنوان والوصف والحالة الافتراضية المترجمة لهذه الأداة.',
    permissionDenied: 'ليس لديك صلاحية تخصيص لوحة المعلومات هذه.',
    saved: 'تم حفظ تخصيص لوحة المعلومات.',
    saveFailed: 'تعذر حفظ تخصيص لوحة المعلومات.',
  },
  fa: {
    driverDescription: 'عملکرد فروش شعبه و راننده',
    financialCenter: 'مرکز مالی سازمانی',
    financialCenterDescription: 'دسترسی سریع به گزارش‌های سازمانی',
    sixMonthTrend: 'تحلیل روند شش‌ماهه',
    sixMonthTrendDescription: ({ selectedBranchLabel }) => `${selectedBranchLabel} — ۶ ماه تقویمی گذشته`,
    variableExpenses: 'هزینه‌های متغیر',
    variableExpensesDescription: 'فقط هزینه‌های متغیر — هزینه‌های ثابت مستثنا هستند',
    priceChanges: 'تغییرات قیمت',
    priceChangesDescription: 'فعالیت اخیر قیمت تأمین‌کنندگان و محصولات',
    liveActivity: 'جریان فعالیت زنده',
    liveActivityDescription: 'رویدادهای شعبه در زمان واقعی',
    customizeDashboard: 'شخصی‌سازی داشبورد',
    customizeDescription: 'نام و توضیح بخش‌های اختیاری را تغییر دهید یا نمایش بخش‌های اختیاری را کنترل کنید.',
    widgetTitle: 'عنوان ویجت',
    widgetDescription: 'توضیح ویجت',
    visible: 'نمایش',
    reset: 'بازنشانی',
    resetWidget: 'بازنشانی ویجت',
    saveChanges: 'ذخیره تغییرات',
    cancel: 'لغو',
    saving: 'در حال ذخیره…',
    optional: 'اختیاری',
    required: 'ضروری',
    resetHelp: 'بازنشانی، عنوان، توضیح و وضعیت نمایش پیش‌فرضِ محلی‌سازی‌شدهٔ این ویجت را بازمی‌گرداند.',
    permissionDenied: 'اجازهٔ شخصی‌سازی این داشبورد را ندارید.',
    saved: 'شخصی‌سازی داشبورد ذخیره شد.',
    saveFailed: 'ذخیرهٔ شخصی‌سازی داشبورد ممکن نشد.',
  },
};

export function getDashboardCustomizationCopy(lang = 'en') {
  return COPY[lang] || COPY.en;
}

const isString = (value) => typeof value === 'string';

/**
 * Builds the owner dashboard’s defaults for the current language and runtime
 * context. The public widget ID never changes when a title is renamed.
 */
export function getDashboardWidgetDefaults({ lang = 'en', t, selectedBranch, selectedBranchLabel, activeAlertCount = 0 }) {
  const copy = getDashboardCustomizationCopy(lang);
  const branchSuffix = selectedBranch === 'all' ? t('all_branches') : selectedBranchLabel;
  const activeAlertsDescription = `${activeAlertCount} ${activeAlertCount === 1 ? t('active_alert') : t('active_alerts')}`;

  return [
    { id: DASHBOARD_WIDGET_IDS.DRIVER_ANALYTICS, title: t('driver_analytics'), description: copy.driverDescription, isOptional: true },
    { id: DASHBOARD_WIDGET_IDS.FINANCIAL_CENTER, title: copy.financialCenter, description: copy.financialCenterDescription, isOptional: true },
    { id: DASHBOARD_WIDGET_IDS.SIX_MONTH_TREND, title: copy.sixMonthTrend, description: copy.sixMonthTrendDescription({ selectedBranchLabel: branchSuffix }), isOptional: true },
    { id: DASHBOARD_WIDGET_IDS.EXECUTIVE_SUMMARY, title: t('executive_summary'), description: t('todays_kpi'), isOptional: false },
    { id: DASHBOARD_WIDGET_IDS.OPERATING_RESULT, title: t('operating_result'), description: t('sales_revenue_minus_purchases'), isOptional: false },
    { id: DASHBOARD_WIDGET_IDS.CASH_RECONCILIATION, title: t('cash_reconciliation'), description: t('todays_cash_position'), isOptional: false },
    { id: DASHBOARD_WIDGET_IDS.SALES_ANALYTICS, title: t('sales_analytics'), description: t('multi_period_sales'), isOptional: false },
    { id: DASHBOARD_WIDGET_IDS.ADDITIONAL_SALES_SOURCES, title: t('additional_sales_sources'), description: t('delivery_catering_subtitle'), isOptional: true },
    { id: DASHBOARD_WIDGET_IDS.PURCHASE_ANALYTICS, title: t('purchase_analytics'), description: t('approved_invoices_branch'), isOptional: false },
    { id: DASHBOARD_WIDGET_IDS.PRODUCT_CONSUMPTION, title: t('product_consumption_analytics'), description: `${t('purchase_items_branch')} · ${branchSuffix}`, isOptional: true },
    { id: DASHBOARD_WIDGET_IDS.INVENTORY_ANALYTICS, title: t('inventory_analytics'), description: t('stock_health_overview'), isOptional: true },
    { id: DASHBOARD_WIDGET_IDS.VARIABLE_EXPENSES, title: copy.variableExpenses, description: copy.variableExpensesDescription, isOptional: true },
    { id: DASHBOARD_WIDGET_IDS.CASH_FLOW, title: t('cash_flow'), description: t('todays_money_movement'), isOptional: false },
    { id: DASHBOARD_WIDGET_IDS.PRICE_INTELLIGENCE, title: t('price_intelligence'), description: t('price_changes_subtitle'), isOptional: true },
    { id: DASHBOARD_WIDGET_IDS.ACTIVE_ALERTS, title: t('alerts_label'), description: activeAlertsDescription, isOptional: false },
    { id: DASHBOARD_WIDGET_IDS.PRICE_CHANGES, title: t('price_changes_title'), description: copy.priceChangesDescription, isOptional: true },
    { id: DASHBOARD_WIDGET_IDS.LIVE_ACTIVITY, title: copy.liveActivity, description: copy.liveActivityDescription, isOptional: true },
    { id: DASHBOARD_WIDGET_IDS.MODE_INSIGHTS, title: t('mode_specific_insights'), description: t('mode_specific_subtitle'), isOptional: true },
  ];
}

export function normalizeDashboardWidgetConfiguration(defaults = [], overrides = {}) {
  const safeOverrides = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
  return defaults.map((widget, index) => {
    const override = safeOverrides[widget.id] && typeof safeOverrides[widget.id] === 'object'
      ? safeOverrides[widget.id]
      : {};
    return {
      ...widget,
      defaultTitle: widget.title,
      defaultDescription: widget.description,
      defaultOrder: index,
      order: Number.isInteger(override.order) && override.order >= 0 ? override.order : index,
      // Do not trim custom text. Exact owner input, including Arabic/Persian
      // characters and deliberate whitespace, is preserved in persistence.
      title: isString(override.title) && override.title.length > 0 ? override.title : widget.title,
      description: isString(override.description) ? override.description : widget.description,
      isVisible: widget.isOptional ? override.is_visible !== false : true,
      isCustomized: isString(override.title) || isString(override.description) || (widget.isOptional && typeof override.is_visible === 'boolean') || Number.isInteger(override.order),
    };
  });
}

export function toDashboardWidgetOverrides(widgets = []) {
  return widgets.reduce((overrides, widget) => {
    overrides[widget.id] = {
      title: widget.title,
      description: widget.description,
      ...(widget.isOptional ? { is_visible: widget.isVisible } : {}),
      order: Number.isInteger(widget.order) ? widget.order : 0,
    };
    return overrides;
  }, {});
}

export function resetDashboardWidgetOverride(overrides = {}, widgetId) {
  const next = { ...(overrides || {}) };
  delete next[widgetId];
  return next;
}
