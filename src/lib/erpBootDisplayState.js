// Only document bootstrap and first ERP authorization may show the branded splash.
// This is ephemeral presentation state, never an auth/session or tenant permission source.
let workspaceMounted = false;

export function markERPWorkspaceMounted() {
  workspaceMounted = true;
}

export function hasERPWorkspaceMounted() {
  return workspaceMounted;
}
