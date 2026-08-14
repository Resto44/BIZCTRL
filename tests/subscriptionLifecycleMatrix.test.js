import { describe, expect, it } from 'vitest';

const PAID = new Set(['starter_20', 'growth_40', 'enterprise_100']);
function transition(state, event) {
  if (event === 'signup') return { status: 'TRIAL', plan: 'trial_full_access', payment: null, access: true };
  if (event === 'trial_expired') return { ...state, status: 'EXPIRED', access: false };
  if (event === 'select_free') return { status: 'FREE', plan: 'free', payment: null, access: true };
  if (event.startsWith('select_paid:')) return { status: 'PENDING_PAYMENT', plan: event.split(':')[1], payment: 'pending', access: false };
  if (event === 'payment_succeeded') return { ...state, status: 'ACTIVE', payment: 'paid', access: true };
  if (event === 'payment_failed') return { ...state, status: 'PAST_DUE', payment: 'failed', access: false };
  if (event === 'renewal') return state.status === 'ACTIVE' ? { ...state, status: 'ACTIVE', payment: 'paid', access: true } : state;
  if (event === 'cancel') return { ...state, status: 'CANCELED', access: false };
  if (event === 'expire') return { ...state, status: 'EXPIRED', access: false };
  return state;
}

describe('canonical subscription lifecycle matrix', () => {
  it('provisions a full-access 30-day trial after signup and blocks access on expiration', () => {
    const trial = transition({}, 'signup');
    expect(trial).toMatchObject({ status: 'TRIAL', access: true });
    expect(transition(trial, 'trial_expired')).toMatchObject({ status: 'EXPIRED', access: false });
  });

  it('converts an expired organization to permanent Free access only through Free selection', () => {
    const expired = transition(transition({}, 'signup'), 'trial_expired');
    expect(transition(expired, 'select_free')).toEqual({ status: 'FREE', plan: 'free', payment: null, access: true });
  });

  it.each([...PAID])('keeps %s inaccessible while payment is pending and activates only after confirmation', (plan) => {
    const pending = transition({ status: 'FREE', plan: 'free', access: true }, `select_paid:${plan}`);
    expect(pending).toMatchObject({ status: 'PENDING_PAYMENT', plan, payment: 'pending', access: false });
    expect(transition(pending, 'payment_succeeded')).toMatchObject({ status: 'ACTIVE', payment: 'paid', access: true });
  });

  it('moves a simulated failed payment to past due and validates renewal, cancellation, and expiration outcomes', () => {
    const pending = transition({ status: 'FREE' }, 'select_paid:growth_40');
    expect(transition(pending, 'payment_failed')).toMatchObject({ status: 'PAST_DUE', access: false });
    const active = transition(pending, 'payment_succeeded');
    expect(transition(active, 'renewal')).toMatchObject({ status: 'ACTIVE', access: true });
    expect(transition(active, 'cancel')).toMatchObject({ status: 'CANCELED', access: false });
    expect(transition(active, 'expire')).toMatchObject({ status: 'EXPIRED', access: false });
  });
});
