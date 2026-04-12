// src/mcp/tools.ts
// MCP tool definitions and handlers.
// Each tool is a thin wrapper around engine layer functions.
// The McpServer interface is a minimal stub — wire to the real SDK when deploying.

import { z } from 'zod';
import Decimal from 'decimal.js';
import { db } from '../db/connection';
import { postTransaction } from '../engine/post';
import type { CommittedResult, StagedResult, TransactionType } from '../engine/types';

// ---------------------------------------------------------------------------
// Minimal McpServer interface (replace with @modelcontextprotocol/sdk when available)
// ---------------------------------------------------------------------------

export interface McpTool {
  name: string;
  description: string;
  schema: Record<string, z.ZodTypeAny>;
  handler: (args: Record<string, unknown>) => Promise<ToolResult>;
}

export interface McpServer {
  tool(
    name: string,
    description: string,
    schema: Record<string, z.ZodTypeAny>,
    handler: (args: Record<string, unknown>) => Promise<ToolResult>,
  ): void;
}

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function errResult(code: string, message: string): ToolResult {
  return {
    content: [
      { type: 'text', text: JSON.stringify({ status: 'ERROR', error_code: code, message }, null, 2) },
    ],
    isError: true,
  };
}

function wrapError(e: unknown): ToolResult {
  const err = e as Error & { code?: string };
  return errResult(
    err.code ?? err.constructor?.name ?? 'INTERNAL_ERROR',
    err.message ?? 'Unknown error',
  );
}

// ---------------------------------------------------------------------------
// gl_post_transaction
// ---------------------------------------------------------------------------

export const postTransactionSchema = {
  transaction_type: z
    .enum([
      'MANUAL_JOURNAL',
      'CUSTOMER_INVOICE',
      'CUSTOMER_CREDIT_NOTE',
      'SUPPLIER_INVOICE',
      'SUPPLIER_CREDIT_NOTE',
      'CUSTOMER_PAYMENT',
      'SUPPLIER_PAYMENT',
      'BAD_DEBT_WRITE_OFF',
      'BANK_RECEIPT',
      'BANK_PAYMENT',
      'BANK_TRANSFER',
      'PERIOD_END_ACCRUAL',
      'DEPRECIATION',
      'YEAR_END_CLOSE',
      'PRIOR_PERIOD_ADJUSTMENT',
      'FX_REVALUATION',
    ])
    .describe('The type of transaction'),
  date: z.string().describe('Accounting date (YYYY-MM-DD)'),
  period_id: z.string().describe('Accounting period (YYYY-MM)'),
  reference: z.string().optional().describe('Reference for this transaction'),
  description: z.string().optional().describe('Human-readable description'),
  amount: z.number().optional().describe('Gross amount for amount-based transaction types'),
  account_code: z
    .string()
    .optional()
    .describe(
      'Override the default expense/revenue account code. ' +
      'For SUPPLIER_INVOICE: overrides expense account (default 5000). ' +
      'For CUSTOMER_INVOICE: overrides revenue account (default 4000). ' +
      'Also works for credit note types. Ignored for payments and other types.',
    ),
  tax_code: z
    .enum([
      'STANDARD_VAT_20',
      'REDUCED_VAT_5',
      'ZERO_RATED',
      'EXEMPT',
      'OUTSIDE_SCOPE',
      'REVERSE_CHARGE',
      'POSTPONED_VAT',
    ])
    .optional()
    .describe(
      'Override the default VAT treatment. Controls the rate used during expansion ' +
      'and whether a VAT line is generated. OUTSIDE_SCOPE/EXEMPT/ZERO_RATED produce no VAT line. ' +
      'Defaults to STANDARD_VAT_20 when omitted. Only applies to invoice and credit note types.',
    ),
  lines: z
    .array(
      z.object({
        account_code: z.string(),
        description: z.string().optional(),
        debit: z.number(),
        credit: z.number(),
        cost_centre: z.string().optional(),
      }),
    )
    .optional()
    .describe('Explicit lines for MANUAL_JOURNAL / PRIOR_PERIOD_ADJUSTMENT'),
  counterparty: z
    .object({
      trading_account_id: z.string().optional(),
      contact_id: z.string().optional(),
    })
    .optional(),
  idempotency_key: z.string().optional(),
  submitted_by: z.string().optional(),
  soft_close_override: z.boolean().optional(),
  source_document_id: z.string().optional().describe('UUID of an inbox_documents record to link to this transaction after posting'),
};

export async function handlePostTransaction(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const result = await postTransaction({
      transaction_type: args['transaction_type'] as string as import('../engine/types').TransactionType,
      date: args['date'] as string,
      period_id: args['period_id'] as string,
      reference: args['reference'] as string | undefined,
      description: args['description'] as string | undefined,
      amount: args['amount'] as number | undefined,
      lines: args['lines'] as import('../engine/types').JournalLine[] | undefined,
      counterparty: args['counterparty'] as import('../engine/types').Counterparty | undefined,
      idempotency_key: args['idempotency_key'] as string | undefined,
      submitted_by: args['submitted_by'] as string | undefined,
      soft_close_override: args['soft_close_override'] as boolean | undefined,
      account_code: args['account_code'] as string | undefined,
      tax_code: args['tax_code'] as import('../engine/types').TaxCode | undefined,
    });
    if (args['source_document_id'] && result.status === 'COMMITTED') {
      const { completeProcessing } = await import('../engine/document-inbox');
      await completeProcessing({
        document_id: args['source_document_id'] as string,
        document_type: args['transaction_type'] as string,
        transaction_id: (result as CommittedResult).transaction_id,
        processing_notes: 'Auto-linked during gl_post_transaction posting',
      });
    }
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_query_journal
// ---------------------------------------------------------------------------

export const queryJournalSchema = {
  period_id: z.string().optional().describe('Accounting period (e.g. 2026-03)'),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  transaction_type: z.string().optional(),
  account_code: z.string().optional(),
  limit: z.number().default(50),
};

export async function handleQueryJournal(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    let q = db('transactions').orderBy('date', 'desc').orderBy('transaction_id', 'desc');
    if (args['period_id']) q = q.where('period_id', args['period_id']);
    if (args['date_from']) q = q.where('date', '>=', args['date_from']);
    if (args['date_to']) q = q.where('date', '<=', args['date_to']);
    if (args['transaction_type']) q = q.where('transaction_type', args['transaction_type']);
    q = q.limit((args['limit'] as number) ?? 50);
    const rows = await q;
    return ok(rows);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_get_trial_balance
// ---------------------------------------------------------------------------

export const getTrialBalanceSchema = {
  period_id: z.string().describe('Accounting period (e.g. 2026-03)'),
};

export async function handleGetTrialBalance(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const periodId = args['period_id'] as string;
    const rows = await db('transaction_lines')
      .join('accounts', 'transaction_lines.account_code', 'accounts.code')
      .where('transaction_lines.period_id', periodId)
      .select(
        'accounts.code',
        'accounts.name',
        'accounts.type',
        'accounts.category',
        db.raw('COALESCE(SUM(transaction_lines.debit), 0) as total_debits'),
        db.raw('COALESCE(SUM(transaction_lines.credit), 0) as total_credits'),
      )
      .groupBy('accounts.code', 'accounts.name', 'accounts.type', 'accounts.category')
      .orderBy('accounts.code');
    const totalDebits = rows.reduce((s: Decimal, r: { total_debits: string }) => s.plus(r.total_debits), new Decimal(0));
    const totalCredits = rows.reduce((s: Decimal, r: { total_credits: string }) => s.plus(r.total_credits), new Decimal(0));
    return ok({ period_id: periodId, lines: rows, total_debits: totalDebits.toFixed(2), total_credits: totalCredits.toFixed(2), balanced: totalDebits.equals(totalCredits) });
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_get_account_balance
// ---------------------------------------------------------------------------

export const getAccountBalanceSchema = {
  account_code: z.string().describe('Account code (e.g. 1100)'),
  as_at_date: z.string().optional().describe('Balance as at this date (YYYY-MM-DD)'),
};

export async function handleGetAccountBalance(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const accountCode = args['account_code'] as string;
    const account = await db('accounts').where('code', accountCode).first<{ code: string; name: string; type: string; category: string | null } | undefined>();
    if (!account) return errResult('ACCOUNT_NOT_FOUND', `Account ${accountCode} not found`);
    let q = db('transaction_lines').where('account_code', accountCode);
    if (args['as_at_date']) {
      q = q.join('transactions', 'transaction_lines.transaction_id', 'transactions.transaction_id').where('transactions.date', '<=', args['as_at_date'] as string);
    }
    const bal = await q.select(db.raw('COALESCE(SUM(debit), 0) as total_debits'), db.raw('COALESCE(SUM(credit), 0) as total_credits')).first<{ total_debits: string; total_credits: string }>();
    const d = new Decimal(bal?.total_debits ?? 0);
    const c = new Decimal(bal?.total_credits ?? 0);
    return ok({ account_code: accountCode, account_name: account.name, type: account.type, debit: d.toFixed(2), credit: c.toFixed(2), net: d.minus(c).toFixed(2) });
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_list_accounts
// ---------------------------------------------------------------------------

export const listAccountsSchema = {
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']).optional(),
  active_only: z.boolean().default(true),
};

export async function handleListAccounts(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    let q = db('accounts').orderBy('code');
    if (args['type']) q = q.where('type', args['type']);
    if (args['active_only'] !== false) q = q.where('active', true);
    return ok(await q);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_get_period_status
// ---------------------------------------------------------------------------

export const getPeriodStatusSchema = {
  period_id: z.string().optional().describe('Period to check (e.g. 2026-03). Omit for current.'),
};

export async function handleGetPeriodStatus(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    let row;
    if (args['period_id']) {
      row = await db('periods').where('period_id', args['period_id']).first();
      if (!row) return errResult('PERIOD_NOT_FOUND', `Period ${args['period_id']} not found`);
    } else {
      row = await db('periods').where('status', 'OPEN').orderBy('period_id', 'desc').first();
      if (!row) return errResult('PERIOD_NOT_FOUND', 'No open period found');
    }
    return ok(row);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_approve_transaction
// ---------------------------------------------------------------------------

export const approveTransactionSchema = {
  staging_id: z.string().describe('The staging ID of the pending transaction'),
};

export async function handleApproveTransaction(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const stagingId = args['staging_id'] as string;
    const row = await db('staging').where('staging_id', stagingId).first<{ status: string } | undefined>();
    if (!row) return errResult('NOT_FOUND', `Staging entry ${stagingId} not found`);
    if (row.status !== 'PENDING') return errResult('INVALID_STATE', `Entry is ${row.status}, not PENDING`);
    await db('staging').where('staging_id', stagingId).update({ status: 'APPROVED', reviewed_at: new Date().toISOString() });
    return ok({ staging_id: stagingId, status: 'APPROVED' });
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_reject_transaction
// ---------------------------------------------------------------------------

export const rejectTransactionSchema = {
  staging_id: z.string().describe('The staging ID of the pending transaction'),
  reason: z.string().describe('Reason for rejection'),
};

export async function handleRejectTransaction(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const stagingId = args['staging_id'] as string;
    const row = await db('staging').where('staging_id', stagingId).first<{ status: string } | undefined>();
    if (!row) return errResult('NOT_FOUND', `Staging entry ${stagingId} not found`);
    if (row.status !== 'PENDING') return errResult('INVALID_STATE', `Entry is ${row.status}, not PENDING`);
    await db('staging').where('staging_id', stagingId).update({ status: 'REJECTED', reviewed_at: new Date().toISOString(), rejection_reason: args['reason'] });
    return ok({ staging_id: stagingId, status: 'REJECTED', rejection_reason: args['reason'] });
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_verify_chain
// ---------------------------------------------------------------------------

export const verifyChainSchema = {
  period_id: z.string().describe('Period to verify (e.g. 2026-03)'),
};

export async function handleVerifyChain(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { ChainReader } = await import('../chain/reader');
    const { config } = await import('../config');
    const reader = new ChainReader(config.chainDir);
    const result = await reader.verifyChain(args['period_id'] as string);
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_get_profit_and_loss
// ---------------------------------------------------------------------------

export const getProfitAndLossSchema = {
  period_id: z.string().describe('Accounting period (YYYY-MM)'),
  from_date: z.string().optional().describe('Optional start date (YYYY-MM-DD)'),
  to_date: z.string().optional().describe('Optional end date (YYYY-MM-DD)'),
};

export async function handleGetProfitAndLoss(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { getProfitAndLoss } = await import('../engine/reports');
    const result = await getProfitAndLoss({
      period_id: args['period_id'] as string,
      from_date: args['from_date'] as string | undefined,
      to_date: args['to_date'] as string | undefined,
    });
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_get_balance_sheet
// ---------------------------------------------------------------------------

export const getBalanceSheetSchema = {
  period_id: z.string().optional().describe('Accounting period (YYYY-MM)'),
  as_at_date: z.string().optional().describe('Balance as at date (YYYY-MM-DD)'),
};

export async function handleGetBalanceSheet(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { getBalanceSheet } = await import('../engine/reports');
    const result = await getBalanceSheet({
      period_id: args['period_id'] as string | undefined,
      as_at_date: args['as_at_date'] as string | undefined,
    });
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_get_aged_debtors
// ---------------------------------------------------------------------------

export const getAgedDebtorsSchema = {
  as_at_date: z.string().optional().describe('Report date (YYYY-MM-DD), defaults to today'),
};

export async function handleGetAgedDebtors(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { getAgedDebtors } = await import('../engine/reports');
    const result = await getAgedDebtors({ as_at_date: args['as_at_date'] as string | undefined });
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_get_aged_creditors
// ---------------------------------------------------------------------------

export const getAgedCreditorsSchema = {
  as_at_date: z.string().optional().describe('Report date (YYYY-MM-DD), defaults to today'),
};

export async function handleGetAgedCreditors(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { getAgedCreditors } = await import('../engine/reports');
    const result = await getAgedCreditors({ as_at_date: args['as_at_date'] as string | undefined });
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_get_vat_return
// ---------------------------------------------------------------------------

export const getVatReturnSchema = {
  quarter_end: z.string().describe('Quarter end period (YYYY-MM), e.g. 2026-03 for Jan-Mar 2026'),
};

export async function handleGetVatReturn(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { getVatReturn } = await import('../engine/reports');
    const result = await getVatReturn({ quarter_end: args['quarter_end'] as string });
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_year_end_close
// ---------------------------------------------------------------------------

export const yearEndCloseSchema = {
  financial_year_end: z.string().describe('Last period of the financial year (YYYY-MM)'),
  new_year_first_period: z.string().describe('First period of the new financial year (YYYY-MM)'),
};

export async function handleYearEndClose(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { executeYearEndClose } = await import('../engine/year-end');
    const result = await executeYearEndClose(
      args['financial_year_end'] as string,
      args['new_year_first_period'] as string,
    );
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_verify_chain_sequence
// ---------------------------------------------------------------------------

export const verifyChainSequenceSchema = {
  period_ids: z
    .array(z.string())
    .optional()
    .describe(
      'Periods to verify in sequence (e.g. ["2026-03","2026-04"]). If omitted, verifies all periods.',
    ),
};

export async function handleVerifyChainSequence(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { ChainReader } = await import('../chain/reader');
    const { config } = await import('../config');
    const reader = new ChainReader(config.chainDir);
    const periodIds = args['period_ids'] as string[] | undefined;
    const result = await reader.verifyChainSequence(periodIds);
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_get_merkle_proof
// ---------------------------------------------------------------------------

export const getMerkleProofSchema = {
  period_id: z.string().describe('The period containing the transaction (e.g. 2026-03)'),
  transaction_sequence: z
    .number()
    .describe('The chain sequence number of the TRANSACTION entry'),
};

export async function handleGetMerkleProof(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { ChainReader } = await import('../chain/reader');
    const { config } = await import('../config');
    const reader = new ChainReader(config.chainDir);
    const result = await reader.getMerkleProof(
      args['period_id'] as string,
      args['transaction_sequence'] as number,
    );
    if (!result) {
      return errResult('NOT_FOUND', `Transaction at sequence ${String(args['transaction_sequence'])} not found in period ${String(args['period_id'])}`);
    }
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_fx_revaluation
// ---------------------------------------------------------------------------

export const fxRevaluationSchema = {
  period_id: z.string().describe('The accounting period to revalue (e.g. 2026-03)'),
  closing_rates: z
    .record(z.string())
    .describe('Map of foreign currency to closing GBP rate, e.g. { "USD": "0.79", "EUR": "0.855" }'),
  post: z
    .boolean()
    .optional()
    .describe('If true, post the revaluation journals immediately. If false (default), return a preview.'),
};

export async function handleFxRevaluation(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { generateFxRevaluations } = await import('../engine/currency');
    const { postTransaction } = await import('../engine/post');
    const { ChainWriter } = await import('../chain/writer');
    const { config } = await import('../config');

    const periodId = args['period_id'] as string;
    const closingRates = args['closing_rates'] as Record<string, string>;
    const doPost = (args['post'] as boolean | undefined) ?? false;

    const { entries, submissions } = await generateFxRevaluations(periodId, closingRates);

    if (!doPost) {
      return ok({ preview: true, period_id: periodId, entries, submissions });
    }

    const writer = new ChainWriter({
      chainDir: config.chainDir,
      getPeriodStatus: async (pid: string) => {
        const { db } = await import('../db/connection');
        const row = await db('periods')
          .where('period_id', pid)
          .select('status')
          .first<{ status: string } | undefined>();
        return (row?.status as 'OPEN' | 'SOFT_CLOSE' | 'HARD_CLOSE' | null) ?? null;
      },
    });

    const results = [];
    for (const sub of submissions) {
      const result = await postTransaction(
        {
          transaction_type: 'FX_REVALUATION' as import('../engine/types').TransactionType,
          date: sub.date,
          period_id: sub.period_id,
          description: sub.description,
          currency: sub.currency,
          exchange_rate: sub.exchange_rate,
          lines: sub.lines as import('../engine/types').JournalLine[],
          idempotency_key: sub.idempotency_key,
          source: sub.source,
        },
        writer,
      );
      results.push(result);
    }

    return ok({ preview: false, period_id: periodId, entries, posted: results.length, results });
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_recover_missing_transactions
// ---------------------------------------------------------------------------

export const recoverMissingTransactionsSchema = {};

export async function handleRecoverMissingTransactions(
  _args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const { recoverMissingTransactions } = await import('../engine/recovery');
    const { config } = await import('../config');
    const result = await recoverMissingTransactions(config.chainDir);
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_add_exchange_rate
// ---------------------------------------------------------------------------

export const addExchangeRateSchema = {
  from_currency: z.string().describe('Source currency code (e.g. USD)'),
  to_currency: z.string().describe('Target currency code (e.g. GBP)'),
  rate: z.string().describe('Exchange rate as a decimal string (e.g. "0.79")'),
  effective_date: z.string().describe('Date from which this rate is effective (YYYY-MM-DD)'),
  source: z.string().optional().describe('Source of the rate (e.g. "ECB", "manual")'),
};

export async function handleAddExchangeRate(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { setRate } = await import('../db/queries/exchange_rates');
    const row = await setRate(
      args['from_currency'] as string,
      args['to_currency'] as string,
      args['rate'] as string,
      args['effective_date'] as string,
      args['source'] as string | undefined,
    );
    return ok(row);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_get_exchange_rate
// ---------------------------------------------------------------------------

export const getExchangeRateSchema = {
  from_currency: z.string().describe('Source currency code (e.g. USD)'),
  to_currency: z.string().describe('Target currency code (e.g. GBP)'),
  date: z.string().describe('Look up the rate effective on or before this date (YYYY-MM-DD)'),
};

export async function handleGetExchangeRate(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { getRate } = await import('../db/queries/exchange_rates');
    const row = await getRate(
      args['from_currency'] as string,
      args['to_currency'] as string,
      args['date'] as string,
    );
    if (!row) {
      return errResult(
        'RATE_NOT_FOUND',
        `No exchange rate found for ${String(args['from_currency'])}/${String(args['to_currency'])} on or before ${String(args['date'])}`,
      );
    }
    return ok(row);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_get_transaction
// ---------------------------------------------------------------------------

export const getTransactionSchema = {
  transaction_id: z.string().describe("The transaction ID (e.g. 'TXN-2026-03-00001')"),
};

export async function handleGetTransaction(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const transaction_id = args['transaction_id'] as string;
    const transaction = await db('transactions').where('transaction_id', transaction_id).first();
    if (!transaction) {
      return errResult('TRANSACTION_NOT_FOUND', `Transaction '${transaction_id}' not found`);
    }
    const lines = await db('transaction_lines')
      .where('transaction_id', transaction_id)
      .orderBy('line_number', 'asc')
      .catch(() => db('transaction_lines').where('transaction_id', transaction_id));
    return ok({ ...transaction, lines });
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_get_account_ledger
// ---------------------------------------------------------------------------

export const getAccountLedgerSchema = {
  account_code: z.string().describe("Account code (e.g. '1100' for Trade Debtors)"),
  period_id: z.string().optional().describe("Filter to a specific period"),
  date_from: z.string().optional().describe("Start date (YYYY-MM-DD)"),
  date_to: z.string().optional().describe("End date (YYYY-MM-DD)"),
};

export async function handleGetAccountLedger(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { getAccountLedger } = await import('../engine/reports');
    const result = await getAccountLedger({
      account_code: args['account_code'] as string,
      period_id: args['period_id'] as string | undefined,
      date_from: args['date_from'] as string | undefined,
      date_to: args['date_to'] as string | undefined,
    });
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_get_dashboard_summary
// ---------------------------------------------------------------------------

export const getDashboardSummarySchema = {
  period_id: z.string().optional().describe("Period to summarise. Defaults to current open period."),
};

export async function handleGetDashboardSummary(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { getDashboardSummary } = await import('../engine/reports');
    const result = await getDashboardSummary({ period_id: args['period_id'] as string | undefined });
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_soft_close_period
// ---------------------------------------------------------------------------

export const softClosePeriodSchema = {
  period_id: z.string().describe("The period to soft-close (e.g. '2026-03'). Must be currently OPEN."),
};

export async function handleSoftClosePeriod(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const period_id = args['period_id'] as string;
    const { softClosePeriod } = await import('../engine/periods');
    const result = await softClosePeriod(period_id);
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_hard_close_period
// ---------------------------------------------------------------------------

export const hardClosePeriodSchema = {
  period_id: z.string().describe("The period to hard-close (e.g. '2026-03'). Must be currently SOFT_CLOSE."),
  closed_by: z.string().default('luca-agent').describe('Who is closing this period'),
};

export async function handleHardClosePeriod(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const period_id = args['period_id'] as string;
    const closed_by = (args['closed_by'] as string | undefined) ?? 'luca-agent';
    const { hardClosePeriod } = await import('../engine/periods');
    const { ChainWriter } = await import('../chain/writer');
    const { config } = await import('../config');
    const { db } = await import('../db/connection');
    const chainWriter = new ChainWriter({
      chainDir: config.chainDir,
      getPeriodStatus: async (pid: string) => {
        const row = await db('periods').where('period_id', pid).select('status').first<{ status: string }>();
        return (row?.status as 'OPEN' | 'SOFT_CLOSE' | 'HARD_CLOSE' | null) ?? null;
      },
    });
    const result = await hardClosePeriod(period_id, { closedBy: closed_by, chainWriter });
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_open_period
// ---------------------------------------------------------------------------

export const openPeriodSchema = {
  period_id: z.string().describe("The period to open (e.g. '2026-04'). Must be YYYY-MM format."),
};

export async function handleOpenPeriod(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const period_id = args['period_id'] as string;
    const { openPeriod } = await import('../engine/periods');
    const { ChainWriter } = await import('../chain/writer');
    const { config } = await import('../config');
    const { db } = await import('../db/connection');
    const chainWriter = new ChainWriter({
      chainDir: config.chainDir,
      getPeriodStatus: async (pid: string) => {
        const row = await db('periods').where('period_id', pid).select('status').first<{ status: string }>();
        return (row?.status as 'OPEN' | 'SOFT_CLOSE' | 'HARD_CLOSE' | null) ?? null;
      },
    });
    const result = await openPeriod(period_id, { chainWriter });
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_create_account
// ---------------------------------------------------------------------------

export const createAccountSchema = {
  code: z.string().describe("Account code (e.g. '1050'). Must be unique."),
  name: z.string().describe("Account name (e.g. 'Petty Cash')"),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']).describe("The account type"),
  category: z.string().optional().describe("Sub-category (e.g. CURRENT_ASSET, FIXED_ASSET, CURRENT_LIABILITY, DIRECT_COSTS, OVERHEADS, FINANCE_COSTS). If omitted, a default is used based on type."),
};

export async function handleCreateAccount(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const code = args['code'] as string;
    const name = args['name'] as string;
    const type = args['type'] as string;
    let category = args['category'] as string | undefined;

    // Default category based on type
    if (!category) {
      const defaults: Record<string, string> = {
        ASSET: 'CURRENT_ASSET',
        LIABILITY: 'CURRENT_LIABILITY',
        EQUITY: 'EQUITY',
        REVENUE: 'REVENUE',
        EXPENSE: 'OVERHEADS',
      };
      category = defaults[type] ?? 'CURRENT_ASSET';
    }

    // Check for duplicate
    const existing = await db('accounts').where('code', code).first();
    if (existing) {
      return errResult('DUPLICATE_ACCOUNT', `Account with code '${code}' already exists`);
    }

    await db('accounts').insert({ code, name, type, category, active: true });
    const row = await db('accounts').where('code', code).first();
    return ok(row);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_update_account
// ---------------------------------------------------------------------------

export const updateAccountSchema = {
  code: z.string().describe("The account code to update"),
  name: z.string().optional().describe("New account name"),
  category: z.string().optional().describe("New sub-category"),
  active: z.boolean().optional().describe("Set active/inactive."),
};

export async function handleUpdateAccount(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const code = args['code'] as string;

    const existing = await db('accounts').where('code', code).first();
    if (!existing) {
      return errResult('ACCOUNT_NOT_FOUND', `Account '${code}' not found`);
    }

    const updates: Record<string, unknown> = {};
    if (args['name'] !== undefined) updates['name'] = args['name'];
    if (args['category'] !== undefined) updates['category'] = args['category'];
    if (args['active'] !== undefined) updates['active'] = args['active'];

    if (Object.keys(updates).length === 0) {
      return errResult('VALIDATION_ERROR', 'No fields to update');
    }

    await db('accounts').where('code', code).update(updates);
    const row = await db('accounts').where('code', code).first();
    return ok(row);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_bulk_post_transactions
// ---------------------------------------------------------------------------

export const bulkPostTransactionsSchema = {
  transactions: z.array(z.union([z.object({
    transaction_type: z.string().describe('Transaction type'),
    reference: z.string().optional().describe('Reference'),
    date: z.string().describe('Accounting date (YYYY-MM-DD)'),
    description: z.string().optional().describe('Description'),
    amount: z.number().optional().describe('Gross amount for amount-based types'),
    period_id: z.string().describe('Period ID'),
    lines: z.array(z.object({
      account_code: z.string(),
      description: z.string(),
      debit: z.number().optional().default(0),
      credit: z.number().optional().default(0),
    })).optional().describe('Explicit posting lines for MANUAL_JOURNAL and similar types'),
    counterparty: z.object({
      trading_account_id: z.string().optional(),
      contact_id: z.string().optional(),
    }).optional(),
    idempotency_key: z.string().optional().describe('Unique key per transaction'),
  }), z.string()])).describe('Array of transactions to post'),
  stop_on_error: z.boolean().default(false).describe('If true, stop processing at the first error. If false, continue and report all errors at the end.'),
};

export async function handleBulkPostTransactions(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const transactions = args['transactions'] as Array<Record<string, unknown>>;
    const stopOnError = (args['stop_on_error'] as boolean | undefined) ?? false;

    let posted = 0;
    let staged = 0;
    let errors = 0;
    const results: Array<Record<string, unknown>> = [];

    for (let i = 0; i < transactions.length; i++) {
      let txn = transactions[i]!;

      // MCP JSON-RPC may deliver array elements as serialised JSON strings
      if (typeof txn === 'string') {
        try {
          txn = JSON.parse(txn) as Record<string, unknown>;
        } catch {
          errors++;
          results.push({ index: i, status: 'ERROR', error: 'Invalid JSON in transaction element' });
          if (stopOnError) break;
          continue;
        }
      }

      try {
        const submission = {
          transaction_type: txn['transaction_type'] as TransactionType,
          date: txn['date'] as string,
          period_id: txn['period_id'] as string,
          reference: txn['reference'] as string | undefined,
          description: txn['description'] as string | undefined,
          amount: txn['amount'] as number | undefined,
          idempotency_key: txn['idempotency_key'] as string | undefined,
          counterparty: txn['counterparty'] as { trading_account_id?: string; contact_id?: string } | undefined,
          lines: txn['lines'] as Array<{ account_code: string; description: string; debit: number; credit: number }> | undefined,
        };
        const result = await postTransaction(submission);
        if (result.status === 'COMMITTED') {
          posted++;
          results.push({ index: i, status: 'COMMITTED', transaction_id: (result as CommittedResult).transaction_id });
        } else {
          staged++;
          results.push({ index: i, status: 'STAGED', staging_id: (result as StagedResult).staging_id });
        }
      } catch (err) {
        errors++;
        const message = err instanceof Error ? err.message : String(err);
        results.push({ index: i, status: 'ERROR', error: message });
        if (stopOnError) break;
      }
    }

    return ok({
      total: transactions.length,
      posted,
      staged,
      errors,
      results,
    });
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_register_bank_account
// ---------------------------------------------------------------------------

export const registerBankAccountSchema = {
  id: z.string().describe("Unique ID for this bank account (e.g. 'HSBC-CURRENT')"),
  account_code: z.string().describe("GL account code this bank account maps to (e.g. '1000')"),
  bank_name: z.string().describe("Bank name (e.g. 'HSBC')"),
  account_name: z.string().describe("Account name (e.g. 'Business Current Account')"),
  sort_code: z.string().optional().describe("UK sort code (e.g. '40-47-84')"),
  account_number: z.string().optional().describe("Account number"),
  iban: z.string().optional(),
  currency: z.string().default('GBP'),
};

export async function handleRegisterBankAccount(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { registerBankAccount } = await import('../engine/bank-import');
    const result = await registerBankAccount({
      id: args['id'] as string,
      account_code: args['account_code'] as string,
      bank_name: args['bank_name'] as string,
      account_name: args['account_name'] as string,
      sort_code: args['sort_code'] as string | undefined,
      account_number: args['account_number'] as string | undefined,
      iban: args['iban'] as string | undefined,
      currency: args['currency'] as string | undefined,
    });
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_import_bank_statement
// ---------------------------------------------------------------------------

export const importBankStatementSchema = {
  bank_account_id: z.string().describe("The bank account ID to import into"),
  format: z.enum(['CSV', 'JSON']).describe("Format of the data"),
  csv_content: z.string().optional().describe("Raw CSV content (required if format is CSV)"),
  column_mapping: z.object({
    date: z.string(),
    description: z.string(),
    amount: z.string().optional(),
    credit: z.string().optional(),
    debit: z.string().optional(),
    balance: z.string().optional(),
    reference: z.string().optional(),
    type: z.string().optional(),
  }).optional().describe("Column mapping for CSV (required if format is CSV)"),
  date_format: z.string().optional().describe("Date format in CSV (default: DD/MM/YYYY)"),
  lines: z.array(z.object({
    date: z.string(),
    description: z.string(),
    amount: z.number(),
    balance: z.number().optional(),
    reference: z.string().optional(),
    transaction_type: z.string().optional(),
    counterparty_name: z.string().optional(),
  })).optional().describe("Structured line data (required if format is JSON)"),
};

export async function handleImportBankStatement(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { importBankStatementCSV, importBankStatementJSON } = await import('../engine/bank-import');
    const format = args['format'] as string;
    const bank_account_id = args['bank_account_id'] as string;

    if (format === 'CSV') {
      const csv_content = args['csv_content'] as string | undefined;
      if (!csv_content) return errResult('VALIDATION_ERROR', 'csv_content is required for CSV format');
      const column_mapping = args['column_mapping'] as Record<string, string> | undefined;
      if (!column_mapping) return errResult('VALIDATION_ERROR', 'column_mapping is required for CSV format');
      const result = await importBankStatementCSV({
        bank_account_id,
        csv_content,
        column_mapping: {
          date: column_mapping['date']!,
          description: column_mapping['description']!,
          amount: column_mapping['amount'],
          credit: column_mapping['credit'],
          debit: column_mapping['debit'],
          balance: column_mapping['balance'],
          reference: column_mapping['reference'],
        },
        date_format: args['date_format'] as string | undefined,
        imported_by: 'luca-agent',
      });
      return ok(result);
    } else {
      const lines = args['lines'] as Array<{ date: string; description: string; amount: number }> | undefined;
      if (!lines) return errResult('VALIDATION_ERROR', 'lines is required for JSON format');
      const result = await importBankStatementJSON({ bank_account_id, lines, imported_by: 'luca-agent' });
      return ok(result);
    }
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// Bank reconciliation tools
// ---------------------------------------------------------------------------

export const reconcileBankAccountSchema = {
  bank_account_id: z.string().describe('The bank account ID to reconcile'),
  date_from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  date_to: z.string().optional().describe('End date (YYYY-MM-DD)'),
  auto_confirm_high_confidence: z.boolean().default(true).describe('Automatically confirm HIGH confidence matches'),
};

export async function handleReconcileBankAccount(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { runAutoMatch } = await import('../engine/bank-reconciliation');
    const result = await runAutoMatch({
      bank_account_id: args['bank_account_id'] as string,
      date_from: args['date_from'] as string | undefined,
      date_to: args['date_to'] as string | undefined,
      auto_confirm_high_confidence: (args['auto_confirm_high_confidence'] as boolean | undefined) ?? true,
    });
    return ok(result);
  } catch (e) { return wrapError(e); }
}

export const confirmBankMatchSchema = {
  statement_line_id: z.string().describe('The bank statement line ID'),
  transaction_id: z.string().describe('The GL transaction ID to match it to'),
  notes: z.string().optional().describe('Notes about why this match is correct'),
};

export async function handleConfirmBankMatch(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { confirmMatch } = await import('../engine/bank-reconciliation');
    await confirmMatch({
      statement_line_id: args['statement_line_id'] as string,
      transaction_id: args['transaction_id'] as string,
      confirmed_by: 'luca-agent',
      notes: args['notes'] as string | undefined,
    });
    return ok({ success: true });
  } catch (e) { return wrapError(e); }
}

export const postAndMatchBankLineSchema = {
  statement_line_id: z.string().describe('The unmatched bank statement line'),
  transaction_type: z.enum(['BANK_RECEIPT', 'BANK_PAYMENT']).describe('Type of transaction to create'),
  description: z.string().describe('Description for the new GL transaction'),
  account_code: z.string().optional().describe('Override the default income/expense account'),
  counterparty: z.object({
    trading_account_id: z.string().optional(),
    contact_id: z.string().optional(),
  }).optional(),
};

export async function handlePostAndMatchBankLine(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { postAndMatch } = await import('../engine/bank-reconciliation');
    const result = await postAndMatch({
      statement_line_id: args['statement_line_id'] as string,
      transaction_type: args['transaction_type'] as string,
      description: args['description'] as string,
      account_code: args['account_code'] as string | undefined,
      counterparty: args['counterparty'] as { trading_account_id?: string; contact_id?: string } | undefined,
      confirmed_by: 'luca-agent',
    });
    return ok(result);
  } catch (e) { return wrapError(e); }
}

export const excludeBankLineSchema = {
  statement_line_id: z.string().describe('The bank statement line to exclude'),
  reason: z.string().describe('Reason for excluding this line from reconciliation'),
};

export async function handleExcludeBankLine(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { excludeLine } = await import('../engine/bank-reconciliation');
    await excludeLine({
      statement_line_id: args['statement_line_id'] as string,
      reason: args['reason'] as string,
      excluded_by: 'luca-agent',
    });
    return ok({ success: true });
  } catch (e) { return wrapError(e); }
}

export const getReconciliationStatusSchema = {
  bank_account_id: z.string().describe('The bank account to check'),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
};

export async function handleGetReconciliationStatus(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { getReconciliationStatus } = await import('../engine/bank-reconciliation');
    const result = await getReconciliationStatus({
      bank_account_id: args['bank_account_id'] as string,
      date_from: args['date_from'] as string | undefined,
      date_to: args['date_to'] as string | undefined,
    });
    return ok(result);
  } catch (e) { return wrapError(e); }
}

// ---------------------------------------------------------------------------
// gl_configure_inbox / gl_scan_inbox / gl_get_pending_documents /
// gl_complete_document_processing / gl_fail_document_processing /
// gl_get_inbox_status
// ---------------------------------------------------------------------------

export const configureInboxSchema = {
  watch_directory: z.string().describe("Absolute path to the inbox folder Luca should watch"),
  archive_directory: z.string().optional().describe("Where to move processed files"),
  allowed_extensions: z.array(z.string()).optional().describe("Allowed file extensions"),
  max_file_size_mb: z.number().optional().describe("Maximum file size in MB"),
};

export async function handleConfigureInbox(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { configureInbox } = await import('../engine/document-inbox');
    await configureInbox({
      watch_directory: args['watch_directory'] as string,
      archive_directory: args['archive_directory'] as string | undefined,
      allowed_extensions: args['allowed_extensions'] as string[] | undefined,
      max_file_size_mb: args['max_file_size_mb'] as number | undefined,
    });
    return ok({ success: true, watch_directory: args['watch_directory'] });
  } catch (e) { return wrapError(e); }
}

export const scanInboxSchema = {};

export async function handleScanInbox(_args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { scanInbox } = await import('../engine/document-inbox');
    const result = await scanInbox();
    return ok(result);
  } catch (e) { return wrapError(e); }
}

export const getPendingDocumentsSchema = {
  limit: z.number().default(20).describe("Maximum number of documents to return"),
};

export async function handleGetPendingDocuments(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { getPendingDocuments } = await import('../engine/document-inbox');
    const result = await getPendingDocuments(args['limit'] as number | undefined);
    return ok(result);
  } catch (e) { return wrapError(e); }
}

export const completeDocumentProcessingSchema = {
  document_id: z.string().describe("The inbox document ID"),
  document_type: z.enum(['SUPPLIER_INVOICE', 'CUSTOMER_INVOICE', 'RECEIPT', 'BANK_STATEMENT', 'UNKNOWN']),
  transaction_id: z.string().optional().describe("GL transaction ID if posted"),
  staging_id: z.string().optional().describe("Staging ID if queued for approval"),
  extracted_data: z.record(z.unknown()).optional().describe("Structured data extracted from document"),
  processing_notes: z.string().describe("Notes about what was done with this document"),
};

export async function handleCompleteDocumentProcessing(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { completeProcessing } = await import('../engine/document-inbox');
    await completeProcessing({
      document_id: args['document_id'] as string,
      document_type: args['document_type'] as string,
      transaction_id: args['transaction_id'] as string | undefined,
      staging_id: args['staging_id'] as string | undefined,
      extracted_data: args['extracted_data'] as Record<string, unknown> | undefined,
      processing_notes: args['processing_notes'] as string,
    });
    return ok({ success: true });
  } catch (e) { return wrapError(e); }
}

export const failDocumentProcessingSchema = {
  document_id: z.string().describe("The inbox document ID"),
  error_message: z.string().describe("What went wrong"),
};

export async function handleFailDocumentProcessing(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { failProcessing } = await import('../engine/document-inbox');
    await failProcessing({
      document_id: args['document_id'] as string,
      error_message: args['error_message'] as string,
    });
    return ok({ success: true });
  } catch (e) { return wrapError(e); }
}

export const getInboxStatusSchema = {};

export async function handleGetInboxStatus(_args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { getInboxStatus } = await import('../engine/document-inbox');
    const result = await getInboxStatus();
    return ok(result);
  } catch (e) { return wrapError(e); }
}

// ---------------------------------------------------------------------------
// gl_get_setup_status
// ---------------------------------------------------------------------------

export const getSetupStatusSchema = {};

export async function handleGetSetupStatus(_args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { getSetupStatus } = await import('../engine/setup');
    const result = await getSetupStatus();
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_import_chart_of_accounts
// ---------------------------------------------------------------------------

export const importChartOfAccountsSchema = {
  csv_content: z.string().describe('Raw CSV content of the chart of accounts'),
  source_system: z
    .enum(['XERO', 'SAGE', 'QUICKBOOKS', 'GENERIC'])
    .describe('The accounting system this CSV was exported from'),
  replace_existing: z
    .boolean()
    .optional()
    .describe(
      'If true, deactivate accounts in the GL not present in the import (except system accounts)',
    ),
};

export async function handleImportChartOfAccounts(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const { importChartOfAccounts } = await import('../engine/setup');
    const result = await importChartOfAccounts({
      csv_content: args['csv_content'] as string,
      source_system: args['source_system'] as 'XERO' | 'SAGE' | 'QUICKBOOKS' | 'GENERIC',
      replace_existing: args['replace_existing'] as boolean | undefined,
    });
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_post_opening_balances
// ---------------------------------------------------------------------------

export const postOpeningBalancesSchema = {
  balances: z
    .array(
      z.object({
        account_code: z.string().describe('GL account code'),
        debit: z.number().describe('Opening debit balance'),
        credit: z.number().describe('Opening credit balance'),
      }),
    )
    .describe('Array of account opening balances. Must balance (total debits = total credits).'),
  effective_date: z
    .string()
    .describe('The date these opening balances are effective from (YYYY-MM-DD)'),
  description: z.string().optional().describe('Description for the opening balances journal'),
};

export async function handlePostOpeningBalances(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const { postOpeningBalances } = await import('../engine/setup');
    const result = await postOpeningBalances({
      balances: args['balances'] as Array<{ account_code: string; debit: number; credit: number }>,
      effective_date: args['effective_date'] as string,
      description: args['description'] as string | undefined,
    });
    return ok(result);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_save_business_profile
// ---------------------------------------------------------------------------

export const saveBusinessProfileSchema = {
  company_name: z.string().describe('Legal company name'),
  company_number: z.string().optional().describe('Company registration number'),
  vat_registered: z.boolean().optional().describe('Whether the company is VAT registered'),
  vat_number: z.string().optional().describe('VAT registration number'),
  vat_scheme: z
    .string()
    .optional()
    .describe('VAT scheme (e.g. STANDARD, FLAT_RATE, CASH_ACCOUNTING)'),
  financial_year_end_month: z
    .string()
    .optional()
    .describe('Month number (01-12) when the financial year ends'),
  base_currency: z.string().optional().describe('Base currency code (e.g. GBP)'),
  territory: z.string().optional().describe('Territory/country (e.g. UK, US)'),
  industry: z.string().optional().describe('Industry sector'),
  registered_address: z.string().optional().describe('Registered company address'),
};

export async function handleSaveBusinessProfile(
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const { saveBusinessProfile } = await import('../engine/setup');
    await saveBusinessProfile({
      company_name: args['company_name'] as string,
      company_number: args['company_number'] as string | undefined,
      vat_registered: args['vat_registered'] as boolean | undefined,
      vat_number: args['vat_number'] as string | undefined,
      vat_scheme: args['vat_scheme'] as string | undefined,
      financial_year_end_month: args['financial_year_end_month'] as string | undefined,
      base_currency: args['base_currency'] as string | undefined,
      territory: args['territory'] as string | undefined,
      industry: args['industry'] as string | undefined,
      registered_address: args['registered_address'] as string | undefined,
    });
    return ok({ success: true, company_name: args['company_name'] });
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_start_batch_run / gl_record_batch_task / gl_complete_batch_run /
// gl_get_latest_batch_run
// ---------------------------------------------------------------------------

export const startBatchRunSchema = {
  run_type: z.enum(['SCHEDULED', 'MANUAL']).default('MANUAL').describe('Type of batch run'),
};

export const recordBatchTaskSchema = {
  batch_id: z.string().describe('The batch run ID'),
  task: z.string().describe("Name of the task (e.g. 'scan_inbox', 'process_documents', 'bank_reconciliation')"),
  status: z.enum(['SUCCESS', 'FAILED', 'SKIPPED']),
  details: z.string().describe('What happened during this task'),
};

export const completeBatchRunSchema = {
  batch_id: z.string().describe('The batch run ID'),
  summary: z.string().describe('Human-readable summary of the entire batch run for the morning briefing'),
  status: z.enum(['COMPLETED', 'FAILED', 'PARTIAL']).default('COMPLETED'),
};

export const getLatestBatchRunSchema = {};

export async function handleStartBatchRun(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { startBatchRun } = await import('../engine/batch');
    const run_type = (args['run_type'] as string ?? 'MANUAL') as 'SCHEDULED' | 'MANUAL';
    const id = await startBatchRun(run_type);
    return ok({ batch_id: id, status: 'RUNNING' });
  } catch (e) {
    return wrapError(e);
  }
}

export async function handleRecordBatchTask(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { recordBatchTask } = await import('../engine/batch');
    await recordBatchTask({
      batch_id: args['batch_id'] as string,
      task: args['task'] as string,
      status: args['status'] as 'SUCCESS' | 'FAILED' | 'SKIPPED',
      details: args['details'] as string,
    });
    return ok({ recorded: true });
  } catch (e) {
    return wrapError(e);
  }
}

export async function handleCompleteBatchRun(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { completeBatchRun } = await import('../engine/batch');
    await completeBatchRun({
      batch_id: args['batch_id'] as string,
      summary: args['summary'] as string,
      status: (args['status'] as 'COMPLETED' | 'FAILED' | 'PARTIAL' | undefined) ?? 'COMPLETED',
    });
    return ok({ completed: true });
  } catch (e) {
    return wrapError(e);
  }
}

export async function handleGetLatestBatchRun(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { getLatestBatchRun } = await import('../engine/batch');
    const run = await getLatestBatchRun();
    if (!run) return errResult('NOT_FOUND', 'No batch runs found');
    return ok(run);
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// gl_upload_document
// ---------------------------------------------------------------------------

export const uploadDocumentSchema = {
  filename: z.string().describe('Original filename including extension, e.g. "invoice-INV-001.pdf"'),
  mime_type: z.string().describe('MIME type of the file, e.g. "application/pdf", "image/jpeg"'),
  file_data: z.string().describe('Base64-encoded file content'),
  transaction_id: z.string().optional().describe('Transaction ID to link this document to, e.g. "TXN-2026-03-00004"'),
  staging_id: z.string().optional().describe('Staging entry ID to link this document to'),
};

export async function handleUploadDocument(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { uploadDocument } = await import('../engine/document-inbox');
    const doc = await uploadDocument({
      filename: args['filename'] as string,
      mime_type: args['mime_type'] as string,
      file_data: args['file_data'] as string,
      transaction_id: args['transaction_id'] as string | undefined,
      staging_id: args['staging_id'] as string | undefined,
    });
    return ok({
      id: doc.id,
      filename: doc.filename,
      file_size: doc.file_size,
      mime_type: doc.mime_type,
      assigned_transaction_id: doc.assigned_transaction_id,
      assigned_staging_id: doc.assigned_staging_id,
      status: doc.status,
    });
  } catch (e) {
    return wrapError(e);
  }
}

// ---------------------------------------------------------------------------
// registerTools — wire all tools into the MCP server
// ---------------------------------------------------------------------------

export function registerTools(server: McpServer): void {
  server.tool(
    'gl_post_transaction',
    'Submit a financial transaction to the General Ledger for posting.',
    postTransactionSchema,
    handlePostTransaction,
  );
  server.tool(
    'gl_query_journal',
    'Search committed transactions in the General Ledger.',
    queryJournalSchema,
    handleQueryJournal,
  );
  server.tool(
    'gl_get_trial_balance',
    'Get the trial balance for a specific accounting period.',
    getTrialBalanceSchema,
    handleGetTrialBalance,
  );
  server.tool(
    'gl_get_account_balance',
    'Get the current balance of a specific general ledger account.',
    getAccountBalanceSchema,
    handleGetAccountBalance,
  );
  server.tool(
    'gl_list_accounts',
    'List or search the chart of accounts.',
    listAccountsSchema,
    handleListAccounts,
  );
  server.tool(
    'gl_get_period_status',
    'Check the status of an accounting period.',
    getPeriodStatusSchema,
    handleGetPeriodStatus,
  );
  server.tool(
    'gl_approve_transaction',
    'Approve a transaction pending in the approval queue.',
    approveTransactionSchema,
    handleApproveTransaction,
  );
  server.tool(
    'gl_reject_transaction',
    'Reject a transaction pending in the approval queue.',
    rejectTransactionSchema,
    handleRejectTransaction,
  );
  server.tool(
    'gl_verify_chain',
    'Verify the integrity of the hash chain for a specific accounting period.',
    verifyChainSchema,
    handleVerifyChain,
  );
  server.tool(
    'gl_get_profit_and_loss',
    'Get the Profit and Loss report for an accounting period.',
    getProfitAndLossSchema,
    handleGetProfitAndLoss,
  );
  server.tool(
    'gl_get_balance_sheet',
    'Get the Balance Sheet as at a specific period or date.',
    getBalanceSheetSchema,
    handleGetBalanceSheet,
  );
  server.tool(
    'gl_get_aged_debtors',
    'Get the aged debtors report showing outstanding customer balances by age.',
    getAgedDebtorsSchema,
    handleGetAgedDebtors,
  );
  server.tool(
    'gl_get_aged_creditors',
    'Get the aged creditors report showing outstanding supplier balances by age.',
    getAgedCreditorsSchema,
    handleGetAgedCreditors,
  );
  server.tool(
    'gl_get_vat_return',
    'Get the VAT return figures for a quarterly period.',
    getVatReturnSchema,
    handleGetVatReturn,
  );
  server.tool(
    'gl_year_end_close',
    'Execute year-end closing entries to transfer P&L balances to Retained Earnings.',
    yearEndCloseSchema,
    handleYearEndClose,
  );
  server.tool(
    'gl_verify_chain_sequence',
    'Verify the hash chain integrity across multiple consecutive accounting periods, including cross-period links.',
    verifyChainSequenceSchema,
    handleVerifyChainSequence,
  );
  server.tool(
    'gl_get_merkle_proof',
    'Get the Merkle inclusion proof for a specific transaction in the chain, proving it is included in the period Merkle tree.',
    getMerkleProofSchema,
    handleGetMerkleProof,
  );
  server.tool(
    'gl_recover_missing_transactions',
    'Detect chain entries that are missing from the database mirror and replay them. Run after a crash or unexpected shutdown.',
    recoverMissingTransactionsSchema,
    handleRecoverMissingTransactions,
  );
  server.tool(
    'gl_fx_revaluation',
    'Compute (and optionally post) FX revaluation journal entries for a period using period-end closing rates.',
    fxRevaluationSchema,
    handleFxRevaluation,
  );
  server.tool(
    'gl_add_exchange_rate',
    'Add or update an exchange rate for a currency pair and effective date.',
    addExchangeRateSchema,
    handleAddExchangeRate,
  );
  server.tool(
    'gl_get_exchange_rate',
    'Look up the exchange rate for a currency pair on or before a given date.',
    getExchangeRateSchema,
    handleGetExchangeRate,
  );
  server.tool(
    'gl_soft_close_period',
    "Transition an accounting period from OPEN to SOFT_CLOSE. After soft-close, all new transactions for this period will go to AWAITING_APPROVAL status for review. The period's end date must have passed.",
    softClosePeriodSchema,
    handleSoftClosePeriod,
  );
  server.tool(
    'gl_hard_close_period',
    'Permanently seal an accounting period. This writes a PERIOD_CLOSE entry to the hash chain, seals the chain file, verifies the Merkle root, and opens the next period. The period must be SOFT_CLOSE with no pending approvals and a balanced trial balance.',
    hardClosePeriodSchema,
    handleHardClosePeriod,
  );
  server.tool(
    'gl_create_account',
    'Create a new account in the chart of accounts. Use standard numbering: 1xxx for assets, 2xxx for liabilities, 3xxx for equity, 4xxx for revenue, 5xxx-6xxx for expenses.',
    createAccountSchema,
    handleCreateAccount,
  );
  server.tool(
    'gl_update_account',
    'Update an existing account in the chart of accounts. Can change the name, category, or active status. Cannot change the account code or type.',
    updateAccountSchema,
    handleUpdateAccount,
  );
  server.tool(
    'gl_get_transaction',
    'Retrieve a single transaction by ID with all its posting lines.',
    getTransactionSchema,
    handleGetTransaction,
  );
  server.tool(
    'gl_get_account_ledger',
    'Get all transactions hitting a specific account with a running balance. This is the detailed account ledger view.',
    getAccountLedgerSchema,
    handleGetAccountLedger,
  );
  server.tool(
    'gl_get_dashboard_summary',
    'Get key metrics for the morning briefing: current period, pending approvals, recent transactions, trial balance summary.',
    getDashboardSummarySchema,
    handleGetDashboardSummary,
  );
  server.tool(
    'gl_bulk_post_transactions',
    'Post multiple transactions in a single call. Useful for migration, month-end batch processing, and importing data from other systems.',
    bulkPostTransactionsSchema,
    handleBulkPostTransactions,
  );
  server.tool(
    'gl_register_bank_account',
    'Register a bank account and link it to a GL account code. This enables bank statement import and reconciliation for that account.',
    registerBankAccountSchema,
    handleRegisterBankAccount,
  );
  server.tool(
    'gl_import_bank_statement',
    'Import a bank statement into the system. Supports CSV (with configurable column mapping) and JSON formats. Automatically detects and skips duplicate lines.',
    importBankStatementSchema,
    handleImportBankStatement,
  );
  server.tool('gl_reconcile_bank_account', 'Run automatic matching for all unmatched bank statement lines against GL transactions. Uses reference, amount, and date strategies.', reconcileBankAccountSchema, handleReconcileBankAccount);
  server.tool('gl_confirm_bank_match', 'Confirm a suggested bank statement match. Marks the statement line as CONFIRMED.', confirmBankMatchSchema, handleConfirmBankMatch);
  server.tool('gl_post_and_match_bank_line', 'Create a new GL transaction from an unmatched bank line and mark it as reconciled.', postAndMatchBankLineSchema, handlePostAndMatchBankLine);
  server.tool('gl_exclude_bank_line', 'Exclude a bank statement line from reconciliation (e.g. internal transfer already recorded).', excludeBankLineSchema, handleExcludeBankLine);
  server.tool('gl_get_reconciliation_status', 'Get the reconciliation status summary for a bank account: matched, confirmed, excluded, unmatched counts and GL vs statement balance.', getReconciliationStatusSchema, handleGetReconciliationStatus);
  server.tool('gl_configure_inbox', 'Configure the document inbox watch directory and settings.', configureInboxSchema, handleConfigureInbox);
  server.tool('gl_scan_inbox', 'Scan the inbox directory for new documents and add them to the processing queue.', scanInboxSchema, handleScanInbox);
  server.tool('gl_get_pending_documents', 'Get a list of pending documents waiting to be processed.', getPendingDocumentsSchema, handleGetPendingDocuments);
  server.tool('gl_complete_document_processing', 'Mark a document as successfully processed and record what was done with it.', completeDocumentProcessingSchema, handleCompleteDocumentProcessing);
  server.tool('gl_fail_document_processing', 'Mark a document as failed to process, recording the error message.', failDocumentProcessingSchema, handleFailDocumentProcessing);
  server.tool('gl_get_inbox_status', 'Get a summary of the inbox status: counts by status, watch directory, and active state.', getInboxStatusSchema, handleGetInboxStatus);
  server.tool('gl_upload_document', 'Upload a base64-encoded document and attach it to a transaction or staging entry. Creates an inbox_documents record with status PROCESSED.', uploadDocumentSchema, handleUploadDocument);
  server.tool(
    'gl_get_setup_status',
    'Check whether the General Ledger has been configured: business profile, chart of accounts, opening balances, and current period.',
    getSetupStatusSchema,
    handleGetSetupStatus,
  );
  server.tool(
    'gl_import_chart_of_accounts',
    'Import a chart of accounts from a CSV export of Xero, Sage, QuickBooks, or a generic format. Creates new accounts and updates existing ones.',
    importChartOfAccountsSchema,
    handleImportChartOfAccounts,
  );
  server.tool(
    'gl_post_opening_balances',
    'Post opening balances as a manual journal to initialise the General Ledger. Debits must equal credits.',
    postOpeningBalancesSchema,
    handlePostOpeningBalances,
  );
  server.tool(
    'gl_save_business_profile',
    'Save or update the business profile (company name, VAT registration, financial year end, territory, etc.).',
    saveBusinessProfileSchema,
    handleSaveBusinessProfile,
  );
  server.tool('gl_start_batch_run', 'Start a new batch run. Call this at the beginning of each scheduled or manual batch session. Returns the batch_id to use for subsequent task recording.', startBatchRunSchema, (args) => handleStartBatchRun(args));
  server.tool('gl_record_batch_task', 'Record the completion of a task within a batch run. Call this after each major step (scan_inbox, process_documents, bank_reconciliation, etc.).', recordBatchTaskSchema, (args) => handleRecordBatchTask(args));
  server.tool('gl_complete_batch_run', 'Mark a batch run as complete with a summary. Call this at the end of every batch session, even if some tasks failed.', completeBatchRunSchema, (args) => handleCompleteBatchRun(args));
  server.tool('gl_get_latest_batch_run', 'Get the most recent batch run and its results. Use this at the start of a session to see what happened during the last overnight run.', getLatestBatchRunSchema, (args) => handleGetLatestBatchRun(args));
}
