import Decimal from 'decimal.js';
import type { JournalLine, PostingLine, TransactionSubmission } from './types';
import { ValidationError } from './types';

// ---------------------------------------------------------------------------
// validate.ts — double-entry validation helpers
// ---------------------------------------------------------------------------

/** Types that require the caller to supply explicit debit/credit lines. */
const EXPLICIT_LINE_TYPES = new Set<string>([
  'MANUAL_JOURNAL',
  'PRIOR_PERIOD_ADJUSTMENT',
  'YEAR_END_CLOSE',
  'FX_REVALUATION',
]);

/** Types that are expanded from account mappings + a single `amount`. */
const AMOUNT_BASED_TYPES = new Set<string>([
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
]);

/** Valid tax codes for the tax_code override field. */
const VALID_TAX_CODES = new Set<string>([
  'STANDARD_VAT_20', 'REDUCED_VAT_5', 'ZERO_RATED',
  'EXEMPT', 'OUTSIDE_SCOPE', 'REVERSE_CHARGE', 'POSTPONED_VAT',
]);

/** Amount-based types that support account_code override (P&L account redirection). */
const OVERRIDE_SUPPORTED_TYPES = new Set<string>([
  'CUSTOMER_INVOICE', 'SUPPLIER_INVOICE',
  'CUSTOMER_CREDIT_NOTE', 'SUPPLIER_CREDIT_NOTE',
  'BANK_RECEIPT', 'BANK_PAYMENT',
]);

/** Amount-based types that support tax_code override (VAT treatment control). */
const TAX_CODE_OVERRIDE_SUPPORTED_TYPES = new Set<string>([
  'CUSTOMER_INVOICE', 'SUPPLIER_INVOICE',
  'CUSTOMER_CREDIT_NOTE', 'SUPPLIER_CREDIT_NOTE',
  'BANK_PAYMENT', 'BANK_RECEIPT',
]);

/**
 * Top-level submission validator.
 *
 * Checks structural requirements before any DB or chain interaction.
 * Throws ValidationError for any violation.
 */
export function validateSubmission(submission: TransactionSubmission): void {
  const { transaction_type, date, period_id, amount, lines } = submission;

  // ── Date format ──────────────────────────────────────────────────────────
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ValidationError(`date must be in YYYY-MM-DD format, got: ${date}`);
  }

  // ── Period ID format ─────────────────────────────────────────────────────
  if (!/^\d{4}-\d{2}$/.test(period_id)) {
    throw new ValidationError(`period_id must be in YYYY-MM format, got: ${period_id}`);
  }

  // ── Type-specific field requirements ────────────────────────────────────
  if (EXPLICIT_LINE_TYPES.has(transaction_type)) {
    if (!lines || lines.length === 0) {
      throw new ValidationError(
        `${transaction_type} requires explicit lines but none were provided`,
      );
    }
    if (amount !== undefined) {
      throw new ValidationError(
        `${transaction_type} uses explicit lines; the amount field must not be set`,
      );
    }
    if (transaction_type === 'PRIOR_PERIOD_ADJUSTMENT' && !submission.adjustment_context) {
      throw new ValidationError(
        `PRIOR_PERIOD_ADJUSTMENT requires adjustment_context`,
      );
    }
  } else if (AMOUNT_BASED_TYPES.has(transaction_type)) {
    if (amount === undefined || amount === null) {
      throw new ValidationError(`${transaction_type} requires an amount`);
    }
    if (amount <= 0) {
      throw new ValidationError(`amount must be greater than zero, got: ${amount}`);
    }
    if (lines !== undefined && lines.length > 0) {
      throw new ValidationError(
        `${transaction_type} is expanded automatically; do not supply explicit lines`,
      );
    }

    // Validate optional account_code override
    if (submission.account_code !== undefined) {
      const code = submission.account_code.trim();
      if (code === '') {
        throw new ValidationError('account_code must not be empty when provided');
      }
      if (!OVERRIDE_SUPPORTED_TYPES.has(transaction_type)) {
        throw new ValidationError(
          `account_code override is not supported for ${transaction_type}`,
        );
      }
    }

    // Validate optional tax_code override
    if (submission.tax_code !== undefined) {
      if (!VALID_TAX_CODES.has(submission.tax_code)) {
        throw new ValidationError(
          `invalid tax_code: ${submission.tax_code}. Valid values: ${[...VALID_TAX_CODES].join(', ')}`,
        );
      }
      if (!TAX_CODE_OVERRIDE_SUPPORTED_TYPES.has(transaction_type)) {
        throw new ValidationError(
          `tax_code override is not supported for ${transaction_type}`,
        );
      }
    }
  } else {
    throw new ValidationError(`unknown transaction_type: ${transaction_type}`);
  }
}

/**
 * Validates that posting lines balance (total debits === total credits).
 *
 * Uses Decimal.js to avoid floating-point rounding errors.
 * Throws ValidationError if they do not balance.
 */
export function validateBalance(lines: PostingLine[]): void {
  if (lines.length === 0) {
    throw new ValidationError('transaction must have at least one posting line');
  }

  let totalDebits = new Decimal(0);
  let totalCredits = new Decimal(0);

  for (const line of lines) {
    const debit = new Decimal(line.debit);
    const credit = new Decimal(line.credit);

    if (debit.isNegative() || credit.isNegative()) {
      throw new ValidationError(
        `debit and credit values must be non-negative on account ${line.account_code}`,
      );
    }
    if (!debit.isZero() && !credit.isZero()) {
      throw new ValidationError(
        `a line must have either a debit or a credit, not both (account ${line.account_code})`,
      );
    }
    if (debit.isZero() && credit.isZero()) {
      throw new ValidationError(
        `a line must have a non-zero debit or credit (account ${line.account_code})`,
      );
    }

    totalDebits = totalDebits.plus(debit);
    totalCredits = totalCredits.plus(credit);
  }

  if (!totalDebits.equals(totalCredits)) {
    throw new ValidationError(
      `transaction does not balance: total debits ${totalDebits.toFixed(2)} ` +
        `≠ total credits ${totalCredits.toFixed(2)} ` +
        `(difference: ${totalDebits.minus(totalCredits).abs().toFixed(2)})`,
    );
  }
}

/**
 * Converts caller-supplied JournalLines into PostingLines.
 * Also validates each line individually.
 */
export function journalLinesToPostingLines(lines: JournalLine[]): PostingLine[] {
  return lines.map((line) => {
    if (!line.account_code || line.account_code.trim() === '') {
      throw new ValidationError('each journal line must specify an account_code');
    }
    return {
      account_code: line.account_code.trim(),
      description: line.description ?? '',
      debit: line.debit,
      credit: line.credit,
      cost_centre: line.cost_centre,
    };
  });
}
