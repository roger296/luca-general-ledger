import type { Knex } from 'knex';

/**
 * Bug 8 + 9 — Staging expiry and idempotency key lifecycle.
 *
 * 1. Adds EXPIRED to the staging_status enum so we can mark stale entries
 *    rather than silently deleting them.
 * 2. Narrows the idempotency_key unique constraint to PENDING entries only
 *    (partial unique index). Expired, rejected, and approved entries no
 *    longer block re-submission with the same key.
 * 3. Adds a stale_after timestamp so callers and UIs can see when a staged
 *    entry will be considered expired.
 */
export async function up(knex: Knex): Promise<void> {
  // 1. Extend the native enum with the EXPIRED value.
  await knex.raw("ALTER TYPE staging_status ADD VALUE IF NOT EXISTS 'EXPIRED'");

  // 2. Add a stale_after column (nullable — NULL means "no auto-expiry").
  await knex.schema.alterTable('staging', (table) => {
    table.timestamp('stale_after', { useTz: true }).nullable();
  });

  // 3. Drop the old global unique constraint and replace with a partial index
  //    scoped to PENDING entries only. This ensures:
  //    - A PENDING entry still can't be duplicated (idempotency works).
  //    - Once an entry is EXPIRED, REJECTED, or APPROVED, its key is released
  //      and the same idempotency_key can be used in a new submission.
  //
  //    The original constraint was named staging_idempotency_key_unique by knex.
  await knex.raw(`
    ALTER TABLE staging
      DROP CONSTRAINT IF EXISTS staging_idempotency_key_unique
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX staging_idempotency_key_pending
      ON staging (idempotency_key)
      WHERE status = 'PENDING' AND idempotency_key IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Revert partial index → global unique constraint.
  await knex.raw('DROP INDEX IF EXISTS staging_idempotency_key_pending');
  await knex.raw(`
    ALTER TABLE staging
      ADD CONSTRAINT staging_idempotency_key_unique UNIQUE (idempotency_key)
  `);

  // Remove the stale_after column.
  await knex.schema.alterTable('staging', (table) => {
    table.dropColumn('stale_after');
  });

  // Note: Cannot remove an enum value in PostgreSQL (no DROP VALUE).
  // EXPIRED will remain in the enum after rollback, which is harmless.
}
