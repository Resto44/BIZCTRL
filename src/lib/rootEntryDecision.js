/**
 * Root "/" route is only a destination resolver, NEVER a permission grant.
 * Only a canonical server-validated ERP session context may select an ERP home.
 * Role/tenant/branch permissions are independently rechecked by route guards.
 */
export function verifiedERPRootHome(context, roleHomes) {
  if (!context || typeof context !== 'object') return null;
  const role = typeof context.role === 'string' ? context.role : '';
  if (!Object.prototype.hasOwnProperty.call(roleHomes || {}, role)) return null;
  const path = roleHomes[role];
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && path !== '/' ? path : null;
}
