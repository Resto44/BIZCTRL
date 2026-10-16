/**
 * Sponsor Balance Tracker shares the single authoritative, approved-only
 * settlement model with Sponsor Ledger. No second copy of monetary formulas.
 */
import React from 'react';
import SponsorLedger from './SponsorLedger';

export default function BranchBalanceTracker() {
  return <SponsorLedger view="balances" />;
}
