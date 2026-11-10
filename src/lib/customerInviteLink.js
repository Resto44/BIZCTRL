// A customer invitation is a 32-byte, single-use token rendered as 64 hex chars.
// Never treat auth callback fragments, arbitrary hashes or malformed strings as an invitation.
export function customerInviteTokenFromHash(hash) {
 const fragment = String(hash || '').replace(/^#/, '');
 const token = new URLSearchParams(fragment).get('invite') || '';
 return /^[0-9a-f]{64}$/i.test(token) ? token : '';
}

export function resolveCustomerInviteToken(hash, saved) {
 const fromUrl = customerInviteTokenFromHash(hash);
 if (fromUrl) return fromUrl;
 return typeof saved === 'string' && /^[0-9a-f]{64}$/i.test(saved) ? saved : '';
}
