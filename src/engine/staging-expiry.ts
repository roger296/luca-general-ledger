// src/engine/staging-expiry.ts
// Marks stale PENDING staging entries as EXPIRED so they stop blocking
// idempotency keys and surface clearly in the approval queue / status checks.

import { db } from '../db/connection';
import { publishEvent } from './webhooks';

// Default: 72 hours. Staged entries older than this are considered stale
// and will be moved to EXPIRED status.  Callers can override via parameter.
const DEFAULT_STALE_HOURS = 72;

export interface ExpireResult {
  expired_count: number;
  expired_entries: Array<{
    staging_id: string;
    period_id: string;
    transaction_type: string;
    reference: string | null;
    submitted_at: string;
  }>;
}

/**
 * Mark all PENDING staging entries older than `staleHours` as EXPIRED.
 *
 * This does NOT delete the rows — they remain in the table for audit
 * purposes, but their idempotency keys are released (the partial unique
 * index only covers PENDING entries), and they no longer appear in the
 * default approval queue listing.
 */
export async function expireStaleStagingEntries(
  staleHours: number = DEFAULT_STALE_HOURS,
): Promise<ExpireResult> {
  const cutoff = new Date(Date.now() - staleHours * 60 * 60 * 1000).toISOString();

  // Find candidates first (for reporting).
  const candidates = await db('staging')
    .where('status', 'PENDING')
    .where('submitted_at', '<', cutoff)
    .select<
      Array<{
        staging_id: string;
        period_id: string;
        transaction_type: string;
        reference: string | null;
        submitted_at: string;
      }>
    >('staging_id', 'period_id', 'transaction_type', 'reference', 'submitted_at');

  if (candidates.length === 0) {
    return { expired_count: 0, expired_entries: [] };
  }

  const ids = candidates.map((c) => c.staging_id);
  const updated = await db('staging')
    .whereIn('staging_id', ids)
    .where('status', 'PENDING')           // re-check to avoid races
    .update({ status: 'EXPIRED', reviewed_at: new Date().toISOString() });

  // Publish a single summary event (not per-entry).
  if (updated > 0) {
    publishEvent('TRANSACTION_REJECTED', {
      reason: `Bulk expiry: ${updated} PENDING staging entries exceeded ${staleHours}h TTL`,
      staging_ids: ids,
    });
  }

  return { expired_count: updated, expired_entries: candidates };
}
