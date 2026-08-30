import React from 'react';
import { Layers } from 'lucide-react';
import { iconComponentFor } from '@/components/categories/EnterpriseIconRegistry';

/**
 * Shared component to render category icons.
 * Supports both legacy emojis and new Lucide icon names.
 */
export function CategoryIcon({ icon, color, className = "w-4 h-4" }) {
  if (!icon) return <Layers className={className} />;
  
  // Check if it's an emoji (legacy support)
  if (icon.length <= 2) {
    return <span className={`leading-none shrink-0 ${className.includes('w-') ? '' : 'text-base'}`}>{icon}</span>;
  }

  const IconComponent = iconComponentFor(icon);
  return <IconComponent className={className} style={{ color: color || 'inherit' }} />;
}

export default CategoryIcon;
