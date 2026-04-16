import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import type { Knex } from 'knex';
import { ChainWriter } from '../chain/writer';
import { db } from '../db/connection';
import { computeTotalAmount, evaluateApprovalRules } from './approve';
import { expandToPostingLines, fetchMappings } from './expand';
import type {
  CommittedResult,
  PostingLine,
  PostingResult,
  StagedResult,
  TransactionSubmission,
} from './types';
import { journalLinesToPostingLines, validateBalance, validateSubmission } from './validate';
import { publishEvent } from './webhooks';
import { PeriodClosedError, PeriodSoftClosedError } from '../chain/types';
import {
  getBaseCurrency,
  getExchangeRate,
  requireExchangeRate,
  validateExchangeRate,
  convertToBase,
} from './currency';

// ---------------------------------------------------------------------------
// post.ts — core posting engine
// ---------------------------------------------------------------------------

const CHAIN_DIR = process.env['CHAIN_DIR'] ?? 'chains/default';

/** Generate a unique transaction ID: TXN-YYYY-MM-NNNNN */
async function generateTransactionId(trx: Knex.Transaction, periodId: string): Promise<string> {
  // Count existing transactions in this period and increment.
  const result = await trx('transactions')
    .where('period_id', periodId)
    .count<[{ count: string }]>('transaction_id as count')
    .first();
  const count = parseInt(result?.count ?? '0', 10) + 1;
  const seq = String(count).padStart(5, '0');
  return `TXN-${periodId}-${seq}`;
}

/** Generate a unique staging ID. */
function generateStagingId(): string {
  return `STG-${crypto.randomUUID()}`;
}

/**
 * The core posting engine.
 *
 * Steps:
 *   1. Structural validation (validateSubmission).
 *   2. Expand or validate lines.
 *   3. Double-entry balance check.
 *   4. Evaluate approval rules.
 *   5a. AUTO_APPROVED → write chain entry + DB mirror → return CommittedResult.
 *   5b. PENDING_REVIEW → write to staging table → return StagedResult.
 *
 * The chain write happens FIRST (step 5a), then the DB write.
 * If the DB write fails after the chain write, the chain entry stands —
 * the DB mirror can be rebuilt from the chain file.
 */
export async function postTransaction(
  submission: TransactionSubmission,
  chainWriterOverride?: ChainWriter,
): Promise<PostingResult> {
  // ── 1. Structural validation ─────────────────────────────────────────────
  validateSubmission(submission);

  // ── 2. Expand or convert lines ───────────────────────────────────────────
  // We need the DB for mappings and approval rules; wrap in a transaction.
  return db.transaction(async (trx) => {
    // ── 1b. Period status check — reject hard-closed periods early ──────────
    // This check runs BEFORE approval evaluation so that even staged transactions
    // cannot be submitted to closed periods.
    let periodRow = await trx('periods')
      .where('period_id', submission.period_id)
      .select('status')
      .first<{ status: string } | undefined>();

    if (!periodRow) {
      // Period doesn't exist — auto-create it on the fly.
      const { openPeriod } = await import('./periods');
      const autoChainWriter = chainWriterOverride ?? new ChainWriter({
        chainDir: CHAIN_DIR,
        getPeriodStatus: async (pid: string) => {
          const row = await trx('periods').where('period_id', pid).select('status').first<{ status: string }>();
          return (row?.status as 'OPEN' | 'SOFT_CLOSE' | 'HARD_CLOSE' | null) ?? null;
        },
      });
      await openPeriod(submission.period_id, { chainWriter: autoChainWriter });
      periodRow = { status: 'OPEN' };
    }

    if (periodRow.status === 'HARD_CLOSE') {
      throw new PeriodClosedError(submission.period_id);
    }
    if (periodRow.status === 'SOFT_CLOSE' && !submission.soft_close_override) {
      throw new PeriodSoftClosedError(submission.period_id);
    }
    let lines: PostingLine[];

    if (submission.lines && submission.lines.length > 0) {
      // MANUAL_JOURNAL / PRIOR_PERIOD_ADJUSTMENT — caller supplies lines.
      lines = journalLinesToPostingLines(submission.lines);
    } else {
      // Amount-based types — expand from account mappings.
      const mappings = await fetchMappings(trx, submission.transaction_type);
      lines = expandToPostingLines(submission, mappings);
    }

    // ── 3. Balance check ─────────────────────────────────────────────────
    validateBalance(lines);

    // ── 3b. FX — resolve exchange rate and compute base amounts ──────────
    const currency = (submission.currency ?? 'GBP').toUpperCase();
    const baseCurrency = await getBaseCurrency();

    let resolvedRate: string;
    if (currency === baseCurrency) {
      // Same currency: validate any explicitly-provided rate is 1.
      validateExchangeRate(currency, baseCurrency, submission.exchange_rate);
      resolvedRate = '1';
    } else if (submission.exchange_rate && submission.exchange_rate.trim() !== '') {
      // Explicit rate provided: validate it is positive.
      validateExchangeRate(currency, baseCurrency, submission.exchange_rate);
      resolvedRate = submission.exchange_rate;
    } else {
      // No explicit rate: auto-lookup from exchange_rates table.
      const lookedUp = await getExchangeRate(currency, baseCurrency, submission.date);
      resolvedRate = requireExchangeRate(currency, baseCurrency, lookedUp ?? undefined);
    }

    const exchangeRateDecimal = new Decimal(resolvedRate);

    // Annotate each line with base amounts.
    for (const line of lines) {
      line.base_debit = convertToBase(new Decimal(line.debit), exchangeRateDecimal).toNumber();
      line.base_credit = convertToBase(new Decimal(line.credit), exchangeRateDecimal).toNumber();
    }

    // ── 4. Approval rule evaluation ──────────────────────────────────────
    const totalAmount = computeTotalAmount(
      submission.amount,
      lines.filter((l) => l.debit > 0),
    );
    const decision = await evaluateApprovalRules(trx, submission.transaction_type, totalAmount);

    const chainPayload = buildChainPayload(submission, lines);

    if (decision.outcome === 'PENDING_REVIEW') {
      // ── 5b. Stage for review ────────────────────────────────────────────
      const stagingId = generateStagingId();

      // Default staging TTL: 72 hours. After this time the entry is eligible
      // for automatic expiry (moved to EXPIRED status, idempotency key released).
      const STAGING_TTL_HOURS = 72;
      const staleAfter = new Date(Date.now() + STAGING_TTL_HOURS * 60 * 60 * 1000).toISOString();

      await trx('staging').insert({
        staging_id: stagingId,
        period_id: submission.period_id,
        transaction_type: submission.transaction_type,
        reference: submission.reference ?? null,
        date: submission.date,
        currency: submission.currency ?? 'GBP',
        description: submission.description ?? null,
        payload: JSON.stringify(chainPayload),
        status: 'PENDING',
        total_amount: totalAmount.toFixed(2),
        idempotency_key: submission.idempotency_key ?? null,
        submitted_by: submission.submitted_by ?? null,
        approval_rule_id: decision.rule_id,
        stale_after: staleAfter,
      });

      const result: StagedResult = {
        status: 'STAGED',
        staging_id: stagingId,
        period_id: submission.period_id,
        rule_name: decision.rule_name,
        stale_after: staleAfter,
      };

      publishEvent('TRANSACTION_STAGED', {
        staging_id: stagingId,
        period_id: submission.period_id,
        transaction_type: submission.transaction_type,
        reference: submission.reference ?? null,
      });

      return result;
    }

    // ── 5a. Auto-approved — commit ────────────────────────────────────────
    const writer =
      chainWriterOverride ??
      new ChainWriter({
        chainDir: CHAIN_DIR,
        getPeriodStatus: async (periodId: string) => {
          const row = await trx('periods')
            .where('period_id', periodId)
            .select('status')
            .first<{ status: string } | undefined>();
          return (row?.status as 'OPEN' | 'SOFT_CLOSE' | 'HARD_CLOSE' | null) ?? null;
        },
      });

    // Chain write FIRST.
    const chainEntry = await writer.appendEntry(
      submission.period_id,
      'TRANSACTION',
      chainPayload,
      { softCloseOverride: submission.soft_close_override },
    );

    // Then DB write.
    const transactionId = await generateTransactionId(trx, submission.period_id);

    await trx('transactions').insert({
      transaction_id: transactionId,
      period_id: submission.period_id,
      transaction_type: submission.transaction_type,
      reference: submission.reference ?? null,
      date: submission.date,
      currency: currency,
      description: submission.description ?? null,
      counterparty_trading_account_id: submission.counterparty?.trading_account_id ?? null,
      counterparty_contact_id: submission.counterparty?.contact_id ?? null,
      source_module_id: submission.source?.module_id ?? null,
      source_module_reference: submission.source?.module_reference ?? null,
      idempotency_key: submission.idempotency_key ?? null,
      status: 'COMMITTED',
      data_flag: 'PROVISIONAL',
      chain_sequence: chainEntry.sequence,
      chain_period_id: submission.period_id,
      chain_verified: false,
      exchange_rate: resolvedRate,
      base_currency: baseCurrency,
    });

    const lineInserts = lines.map((line) => ({
      transaction_id: transactionId,
      period_id: submission.period_id,
      account_code: line.account_code,
      description: line.description,
      debit: new Decimal(line.debit).toFixed(2),
      credit: new Decimal(line.credit).toFixed(2),
      base_debit: new Decimal(line.base_debit ?? line.debit).toFixed(4),
      base_credit: new Decimal(line.base_credit ?? line.credit).toFixed(4),
      cost_centre: line.cost_centre ?? null,
      data_flag: 'PROVISIONAL',
      chain_verified: false,
    }));

    await trx('transaction_lines').insert(lineInserts);

    const result: CommittedResult = {
      status: 'COMMITTED',
      transaction_id: transactionId,
      chain_sequence: chainEntry.sequence,
      period_id: submission.period_id,
    };

    publishEvent('TRANSACTION_POSTED', {
      transaction_id: transactionId,
      period_id: submission.period_id,
      transaction_type: submission.transaction_type,
      reference: submission.reference ?? null,
    });

    return result;
  });
}

// ---------------------------------------------------------------------------
// commitStagedTransaction — approve and commit a PENDING staging entry
// ---------------------------------------------------------------------------

/**
 * Commits a staged transaction that has been manually approved.
 *
 * Reads the stored chain payload from the staging table (which already
 * contains the fully-expanded lines), writes it to the chain file, mirrors
 * it to the DB, and marks the staging entry APPROVED.
 */
export async function commitStagedTransaction(
  stagingId: string,
  approvedBy: string,
  chainWriterOverride?: ChainWriter,
): Promise<CommittedResult> {
  return db.transaction(async (trx) => {
    // ── 1. Load the staging entry ─────────────────────────────────────────
    const stagingRow = await trx('staging')
      .where('staging_id', stagingId)
      .first<{
        staging_id: string;
        period_id: string;
        transaction_type: string;
        reference: string | null;
        date: string;
        currency: string;
        description: string | null;
        payload: unknown;
        status: string;
      }>();

    if (!stagingRow) {
      throw Object.assign(
        new Error(`Staging entry ${stagingId} not found`),
        { code: 'NOT_FOUND' },
      );
    }
    if (stagingRow.status === 'EXPIRED') {
      throw Object.assign(
        new Error(
          `Staging entry ${stagingId} has expired. Submit a new transaction ` +
          `(the idempotency key has been released and can be reused).`,
        ),
        { code: 'STAGING_EXPIRED' },
      );
    }
    if (stagingRow.status !== 'PENDING') {
      throw Object.assign(
        new Error(`Staging entry ${stagingId} is ${stagingRow.status}, not PENDING`),
        { code: 'INVALID_STATE' },
      );
    }

    const chainPayload =
      typeof stagingRow.payload === 'string'
        ? (JSON.parse(stagingRow.payload) as Record<string, unknown>)
        : (stagingRow.payload as Record<string, unknown>);

    // ── 2. Chain write FIRST ──────────────────────────────────────────────
    const writer =
      chainWriterOverride ??
      new ChainWriter({
        chainDir: CHAIN_DIR,
        getPeriodStatus: async (periodId: string) => {
          const row = await trx('periods')
            .where('period_id', periodId)
            .select('status')
            .first<{ status: string } | undefined>();
          return (row?.status as 'OPEN' | 'SOFT_CLOSE' | 'HARD_CLOSE' | null) ?? null;
        },
      });

    const chainEntry = await writer.appendEntry(
      stagingRow.period_id,
      'TRANSACTION',
      chainPayload,
      { softCloseOverride: true }, // manual approval implies override authority
    );

    // ── 3. DB mirror write ────────────────────────────────────────────────
    const transactionId = await generateTransactionId(trx, stagingRow.period_id);

    // Resolve exchange rate for committed staged transaction.
    const stagedCurrency = (stagingRow.currency ?? 'GBP').toUpperCase();
    const stagedBaseCurrency = await getBaseCurrency();
    let stagedRate = '1';
    if (stagedCurrency !== stagedBaseCurrency) {
      const lookedUp = await getExchangeRate(stagedCurrency, stagedBaseCurrency, stagingRow.date);
      stagedRate = requireExchangeRate(stagedCurrency, stagedBaseCurrency, lookedUp ?? undefined);
    }
    const stagedRateDecimal = new Decimal(stagedRate);

    await trx('transactions').insert({
      transaction_id: transactionId,
      period_id: stagingRow.period_id,
      transaction_type: stagingRow.transaction_type,
      reference: stagingRow.reference,
      date: stagingRow.date,
      currency: stagedCurrency,
      description: stagingRow.description,
      status: 'COMMITTED',
      data_flag: 'PROVISIONAL',
      chain_sequence: chainEntry.sequence,
      chain_period_id: stagingRow.period_id,
      chain_verified: false,
      exchange_rate: stagedRate,
      base_currency: stagedBaseCurrency,
    });

    const rawLines = chainPayload['lines'] as Array<{
      account_code: string;
      description: string;
      debit: number;
      credit: number;
      cost_centre?: string;
    }>;

    await trx('transaction_lines').insert(
      rawLines.map((line) => ({
        transaction_id: transactionId,
        period_id: stagingRow.period_id,
        account_code: line.account_code,
        description: line.description,
        debit: new Decimal(line.debit).toFixed(2),
        credit: new Decimal(line.credit).toFixed(2),
        base_debit: convertToBase(new Decimal(line.debit), stagedRateDecimal).toFixed(4),
        base_credit: convertToBase(new Decimal(line.credit), stagedRateDecimal).toFixed(4),
        cost_centre: line.cost_centre ?? null,
        data_flag: 'PROVISIONAL',
        chain_verified: false,
      })),
    );

    // ── 4. Mark staging APPROVED ──────────────────────────────────────────
    // Persist the committed_transaction_id so we can (a) detect orphaned
    // approvals (APPROVED rows with null committed_transaction_id indicate
    // the old broken MCP handler ran against them) and (b) maintain
    // cross-reference integrity from other tables.
    await trx('staging')
      .where('staging_id', stagingId)
      .update({
        status: 'APPROVED',
        reviewed_at: new Date().toISOString(),
        reviewed_by: approvedBy,
        committed_transaction_id: transactionId,
      });

    // ── 5. Fix up cross-references from other tables ─────────────────────
    // When postTransaction returns a StagedResult, callers (e.g. bank
    // reconciliation) store the STG- staging_id as their link. Once the
    // staging entry is committed, rewrite those links to the real TXN- id
    // so reports and drill-downs point at the committed transaction.
    await trx('bank_statement_lines')
      .where('matched_transaction_id', stagingId)
      .update({ matched_transaction_id: transactionId });

    // inbox_documents uses assigned_staging_id, which by design refers to
    // the staging row (not the committed transaction), so it does NOT need
    // to be rewritten here. The UI joins inbox_documents → staging →
    // committed_transaction_id when a document needs to be linked to the
    // final posting.

    return {
      status: 'COMMITTED',
      transaction_id: transactionId,
      chain_sequence: chainEntry.sequence,
      period_id: stagingRow.period_id,
    };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds the payload object that is written to the chain file. */
function buildChainPayload(
  submission: TransactionSubmission,
  lines: PostingLine[],
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    transaction_type: submission.transaction_type,
    reference: submission.reference ?? null,
    date: submission.date,
    currency: submission.currency ?? 'GBP',
    description: submission.description ?? null,
    lines: lines.map((l) => ({
      account_code: l.account_code,
      description: l.description,
      debit: new Decimal(l.debit).toNumber(),
      credit: new Decimal(l.credit).toNumber(),
      ...(l.cost_centre ? { cost_centre: l.cost_centre } : {}),
    })),
  };

  if (submission.counterparty) {
    payload['counterparty'] = submission.counterparty;
  }
  if (submission.source) {
    payload['source'] = submission.source;
  }
  if (submission.idempotency_key) {
    payload['idempotency_key'] = submission.idempotency_key;
  }
  if (submission.adjustment_context) {
    payload['adjustment_context'] = submission.adjustment_context;
  }
  if (submission.account_code) {
    payload['account_code'] = submission.account_code;
  }
  if (submission.tax_code) {
    payload['tax_code'] = submission.tax_code;
  }

  return payload;
}
