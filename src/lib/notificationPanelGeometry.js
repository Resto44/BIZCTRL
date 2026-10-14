/**
 * Viewport-clamped popover placement for both LTR and RTL app headers.
 * The bell may be on either side after language changes.
 */
const margin = 12;
export function notificationPanelGeometry(rect, width, height, rtl = false) {
  const viewportWidth = Math.max(0, Number(width) || 0);
  const viewportHeight = Math.max(0, Number(height) || 0);
  const panelWidth = Math.max(0, Math.min(360, viewportWidth - margin * 2));
  const preferredLeft = rtl ? rect.left : rect.right - panelWidth;
  const left = Math.max(margin, Math.min(preferredLeft, viewportWidth - panelWidth - margin));
  const below = rect.bottom + 8;
  const top = Math.max(margin, Math.min(below, viewportHeight - 120));
  const maxHeight = Math.max(0, viewportHeight - top - margin);
  return { left, top, width: panelWidth, maxHeight };
}
