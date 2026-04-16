import type { Knex } from 'knex';

// ---------------------------------------------------------------------------
// Domain types for the posting engine
// ---------------------------------------------------------------------------

export type TransactionType =
  | 'MANUAL_JOURNAL'
  | 'CUSTOMER_INVOICE'
  | 'CUSTOMER_CREDIT_NOTE'
  | 'SUPPLIER_INVOICE'
  | 'SUPPLIER_CREDIT_NOTE'
  | 'CUSTOMER_PAYMENT'
  | 'SUPPLIER_PAYMENT'
  | 'BAD_DEBT_WRITE_OFF'
  | 'BANK_RECEIPT'
  | 'BANK_PAYMENT'
  | 'BANK_TRANSFER'
  | 'PERIOD_END_ACCRUAL'
  | 'DEPRECIATION'
  | 'YEAR_END_CLOSE'
  | 'PRIOR_PERIOD_ADJUSTMENT'
  | 'FX_REVALUATION';

/** A single debit/credit line provided by the caller (MANUAL_JOURNAL / PRIOR_PERIOD_ADJUSTMENT). */
export interface JournalLine {
  account_code: string;
  description?: string;
  debit: number;
  credit: number;
  cost_centre?: string;
}

/** Counterparty reference (customer/supplier). */
export interface Counterparty {
  trading_account_id?: string;
  contact_id?: string;
}

/** Source module metadata. */
export interface SourceModule {
  module_id: string;
  module_reference?: string;
}

/** For PRIOR_PERIOD_ADJUSTMENT, context about what is being corrected. */
export interface AdjustmentContext {
  original_period: string;
  original_transaction_id?: string;
  reason: string;
  authorised_by: string;
}

/**
 * Recognised tax codes.
 * Used by the expansion engine to determine the VAT rate and treatment.
 */
export type TaxCode =
  | 'STANDARD_VAT_20'
  | 'REDUCED_VAT_5'
  | 'ZERO_RATED'
  | 'EXEMPT'
  | 'OUTSIDE_SCOPE'
  | 'REVERSE_CHARGE'
  | 'POSTPONED_VAT';

// ---------------------------------------------------------------------------
// Transaction submission — the input to the posting engine
// ---------------------------------------------------------------------------

/**
 * A transaction submission from an API caller.
 *
 * For MANUAL_JOURNAL and PRIOR_PERIOD_ADJUSTMENT, `lines` must be provided
 * by the caller.  For all other types, `lines` must be omitted — the engine
 * expands them from the account mappings.
 *
 * `gross_amount` is used for VAT-bearing types (CUSTOMER_INVOICE,
 * SUPPLIER_INVOICE).  For payment types, `amount` is used.
 */
export interface TransactionSubmission {
  transaction_type: TransactionType;
  /** Accounting date (YYYY-MM-DD). */
  date: string;
  /** The GL period this transaction belongs to (YYYY-MM). */
  period_id: string;
  reference?: string;
  description?: string;
  currency?: string;
  /**
   * Gross amount (inc. VAT) for CUSTOMER_INVOICE / SUPPLIER_INVOICE.
   * Payment amount for CUSTOMER_PAYMENT / SUPPLIER_PAYMENT.
   * Unused for MANUAL_JOURNAL / PRIOR_PERIOD_ADJUSTMENT.
   */
  amount?: number;
  /**
   * Override the default expense/revenue account code for amount-based types.
   * For SUPPLIER_INVOICE / SUPPLIER_CREDIT_NOTE: overrides the EXPENSE line (default 5000).
   * For CUSTOMER_INVOICE / CUSTOMER_CREDIT_NOTE: overrides the REVENUE line (default 4000).
   * Ignored for MANUAL_JOURNAL, PRIOR_PERIOD_ADJUSTMENT, payment types, and non-invoice types.
   * When omitted, the engine uses the account from transaction_type_mappings.
   */
  account_code?: string;

  /**
   * Override the default tax treatment for VAT-bearing amount-based types.
   * Controls the VAT rate applied during expansion and whether a VAT line is generated.
   * When omitted, defaults to STANDARD_VAT_20 (20% UK VAT) for invoice/credit note types.
   * Ignored for payment types, bank types, and explicit-line types.
   */
  tax_code?: TaxCode;
  /** For manual / prior-period entries — explicit debit/credit lines. */
  lines?: JournalLine[];
  counterparty?: Counterparty;
  source?: SourceModule;
  idempotency_key?: string;
  submitted_by?: string;
  /** Required for PRIOR_PERIOD_ADJUSTMENT. */
  adjustment_context?: AdjustmentContext;
  /** Allow posting to a soft-closed period (accountants only). */
  soft_close_override?: boolean;
  /**
   * Exchange rate from transaction currency to base currency (GBP).
   * Required for foreign-currency transactions; must be omitted or '1' for GBP.
   */
  exchange_rate?: string;
}

// ---------------------------------------------------------------------------
// An expanded, validated posting line (internal representation)
// ---------------------------------------------------------------------------

export interface PostingLine {
  account_code: string;
  description: string;
  debit: number;
  credit: number;
  cost_centre?: string;
  /** Base currency (GBP) debit amount — populated by posting engine after FX conversion. */
  base_debit?: number;
  /** Base currency (GBP) credit amount — populated by posting engine after FX conversion. */
  base_credit?: number;
}

// ---------------------------------------------------------------------------
// Approval decision
// ---------------------------------------------------------------------------

export type ApprovalOutcome = 'AUTO_APPROVED' | 'PENDING_REVIEW';

export interface ApprovalDecision {
  outcome: ApprovalOutcome;
  rule_id: number | null;
  rule_name: string | null;
}

// ---------------------------------------------------------------------------
// Posting result
// ---------------------------------------------------------------------------

/** Returned when the transaction is auto-approved and committed. */
export interface CommittedResult {
  status: 'COMMITTED';
  transaction_id: string;
  chain_sequence: number;
  period_id: string;
}

/** Returned when the transaction is queued for manual review. */
export interface StagedResult {
  status: 'STAGED';
  staging_id: string;
  period_id: string;
  rule_name: string | null;
  /** UTC timestamp after which this staging entry is eligible for auto-expiry. */
  stale_after: string;
}

export type PostingResult = CommittedResult | StagedResult;

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class PostingEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PostingEngineError';
  }
}

// ---------------------------------------------------------------------------
// DB row types (returned by Knex queries)
// ---------------------------------------------------------------------------

export interface ApprovalRuleRow {
  id: number;
  rule_name: string;
  transaction_type: string | null;
  max_auto_approve_amount: string | null; // Knex returns DECIMAL as string
  require_manual_review: boolean;
  priority: number;
}

export interface MappingRow {
  transaction_type: string;
  line_role: string;
  account_code: string;
  direction: 'DEBIT' | 'CREDIT';
  description: string | null;
}

// ---------------------------------------------------------------------------
// Knex transaction type alias (for passing db transactions around)
// ---------------------------------------------------------------------------

export type KnexTrx = Knex.Transaction;
