/**
 * BusinessTypeSelector — Business Type Selection at Tenant/Branch Creation
 *
 * This component is shown during onboarding and branch creation.
 * The owner MUST select a Business Type before proceeding.
 * Once selected, the Business Mode determines all module availability.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { UtensilsCrossed, ShoppingBag, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const BUSINESS_TYPES = [
  {
    value: 'restaurant',
    label: 'Restaurant',
    description: 'Full-service dining, takeaway, delivery, recipe costing, and ingredient inventory.',
    icon: UtensilsCrossed,
    color: 'orange',
    features: [
      'Menu & Recipe Management',
      'Table Service & Dine-In',
      'Takeaway & Delivery',
      'Ingredient Inventory (BOM)',
      'Food Cost Analytics',
      'Production Orders',
      'Waste Management',
    ],
    gradient: 'from-orange-500 to-amber-500',
    bgLight: 'bg-orange-50 dark:bg-orange-950/20',
    border: 'border-orange-200 dark:border-orange-800',
    selectedBorder: 'border-orange-500',
    iconBg: 'bg-orange-100 dark:bg-orange-900/40',
    iconColor: 'text-orange-600',
    badgeColor: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  },
  {
    value: 'retail',
    label: 'Retail',
    description: 'Retail store management with barcode scanning, SKU tracking, product variants, batch/lot, expiry, and serial numbers.',
    icon: ShoppingBag,
    color: 'blue',
    features: [
      'Barcode & SKU Management',
      'Product Variants',
      'Batch / Lot Tracking',
      'Expiry Date Tracking',
      'Serial Number Tracking',
      'Direct Product Inventory',
      'Stock Level Alerts',
      'Reorder Management',
    ],
    gradient: 'from-blue-500 to-indigo-500',
    bgLight: 'bg-blue-50 dark:bg-blue-950/20',
    border: 'border-blue-200 dark:border-blue-800',
    selectedBorder: 'border-blue-500',
    iconBg: 'bg-blue-100 dark:bg-blue-900/40',
    iconColor: 'text-blue-600',
    badgeColor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  },
];

export default function BusinessTypeSelector({ value, onChange, disabled = false, showFeatures = true }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">Business Type</h3>
        <p className="text-xs text-muted-foreground">
          Select the type of business. This determines which modules and features are available.
          This setting cannot be changed after creation.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {BUSINESS_TYPES.map((type) => {
          const Icon = type.icon;
          const isSelected = value === type.value;

          return (
            <motion.button
              key={type.value}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onChange(type.value)}
              whileHover={{ scale: disabled ? 1 : 1.01 }}
              whileTap={{ scale: disabled ? 1 : 0.99 }}
              className={cn(
                'relative w-full text-left rounded-xl border-2 p-4 transition-all duration-200',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                isSelected
                  ? `${type.selectedBorder} ${type.bgLight} shadow-md`
                  : `${type.border} bg-card hover:${type.bgLight}`,
                disabled && 'opacity-60 cursor-not-allowed'
              )}
            >
              {/* Selected indicator */}
              {isSelected && (
                <div className={cn(
                  'absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center',
                  `bg-gradient-to-br ${type.gradient}`
                )}>
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}

              {/* Icon */}
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center mb-3', type.iconBg)}>
                <Icon className={cn('w-5 h-5', type.iconColor)} />
              </div>

              {/* Title */}
              <h4 className="text-sm font-bold text-foreground mb-1">{type.label}</h4>

              {/* Description */}
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                {type.description}
              </p>

              {/* Features list */}
              {showFeatures && (
                <div className="space-y-1">
                  {type.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-1.5">
                      <div className={cn('w-1.5 h-1.5 rounded-full', `bg-gradient-to-br ${type.gradient}`)} />
                      <span className="text-xs text-muted-foreground">{feature}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Mode badge */}
              <div className="mt-3">
                <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', type.badgeColor)}>
                  {type.label} Mode
                </span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {value && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2"
        >
          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>
            <strong>{BUSINESS_TYPES.find(t => t.value === value)?.label} Mode</strong> selected.
            All {value === 'restaurant' ? 'restaurant' : 'retail'}-specific modules will be activated.
          </span>
        </motion.div>
      )}
    </div>
  );
}

export { BUSINESS_TYPES };
