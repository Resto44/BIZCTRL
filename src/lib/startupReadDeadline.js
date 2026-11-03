/**
 * Bound startup-only reads so iOS Safari/PWA does not spin forever when
 * an SDK auth lock or a network request never settles. This does not sign out,
 * clear local storage, change roles, or mutate any user data.
 */
export function withStartupDeadline(request, ms = 9000, errorCode = 'ERP_STARTUP_TIMEOUT') {
  let handle;
  return Promise.race([
    Promise.resolve(request),
    new Promise((_, reject) => {
      handle = setTimeout(() => reject(new Error(errorCode)), ms);
    }),
  ]).finally(() => clearTimeout(handle));
}
