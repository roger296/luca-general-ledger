# Luca's General Ledger — MCP API Reference

**Luca reads this file on every activation.**
This is the complete reference for every MCP tool and resource available to Luca, the `business-profile.json` structure, the immutability constraint, file intake paths, and error handling behaviour.

---

## The Immutability Constraint

> **This is the single most important architectural fact about Luca's General Ledger. Read it before every posting.**

Every transaction posted to the ledger is permanently sealed by a cryptographic digital signature and recorded to an append-only hash chain. This means:

- **Luca can never modify a posted transaction.** There is no edit function. There is no undo.
- **Luca can never delete a posted transaction.** There is no delete function.
- **All corrections are made by posting reversing entries.** If an invoice was posted incorrectly, Luca posts a matching reversal to zero it out, then posts the corrected entry. The original incorrect posting remains in the chain as part of the permanent audit trail — this is correct and expected.
- **This is a feature, not a limitation.** The immutable chain satisfies accounting software regulations across multiple jurisdictions and provides a tamper-evident audit trail that cannot be altered after the fact.

**If a user asks Luca to "fix", "delete", "undo", or "remove" a posting, Luca's response is always to offer to post a reversing entry. Never suggest that a direct modification is possible.**

Error correction workflow: see `references/workflows.md`, section "Error Correction".

---

## MCP Architecture

Luca's General Ledger exposes all ledger operations through an MCP (Model Context Protocol) server. Luca interacts with the ledger exclusively through this server — Luca never reads or writes chain files or database records directly.

```
Luca (Claude Cowork)
        │
        │ MCP / stdio / JSON-RPC
        ▼
┌─────────────────────┐
│   MCP Server        │
│   gl-ledger v1.0    │
│   src/mcp/          │
└──────────┬──────────┘
           │ direct function calls (no HTTP hop)
           ▼
┌─────────────────────┐
│   Engine Layer      │     ┌──────────────────┐
│   posting.ts        │────►│  Chain Files      │
│   approval.ts       │     │  (authority)      │
│   periods.ts        │     └──────────────────┘
│   reports.ts        │     ┌──────────────────┐
└─────────────────────┘────►│  PostgreSQL       │
                             │  (mirror DB)      │
                             └──────────────────┘
```

The MCP server is a transport layer only. It contains no business logic — all validation, approval workflows, and audit trail generation happen in the engine layer, identical to REST API calls from the web UI.

### Authentication

The MCP server authenticates via environment variables set at startup. Luca does not need to manage tokens or sessions. All transactions Luca submits are recorded in the audit trail with `source.module_id = 'mcp-agent'`, identifying them as AI-agent-originated.

Required environment variables (set by Luca's General Ledger at installation):
- `MCP_USER_ID` — the user identity for audit trail purposes
- `DATABASE_URL` — PostgreSQL connection string
- `CHAIN_FILE_PATH` — path to chain file storage

---

## MCP Tools

Luca has access to nine tools. Each is described with its purpose, required and optional parameters, expected responses, and error conditions.

---

### `gl_post_transaction`

**Purpose:** Submit a financial transaction to the ledger. This is the primary tool for all bookkeeping work — invoices, payments, journals, adjustments, and all other postings.

The transaction is validated by the engine, expanded into double-entry postings using the configured account mappings, and either:
- **Auto-posted** immediately to the immutable chain if the approval rules are satisfied, or
- **Staged for approval** and placed in the approval queue if the confidence score is below threshold or the amount exceeds the auto-approval limit.

**Required parameters:**

| Parameter | Type | Description |
|---|---|---|
| `transaction_type` | string (enum) | The type of transaction. See Transaction Types section below for full catalogue. |
| `reference` | string | The external reference — invoice number, payment reference, journal reference, etc. |
| `date` | string (ISO 8601 date) | The accounting date. Determines which period the transaction falls in. Use the document date, not today's date. |
| `description` | string | Human-readable description. Include counterparty name and document number. |
| `lines` | array | Line items. See line item structure below. |
| `idempotency_key` | string | A unique key to prevent duplicate postings on retry. Use format `[source]-[reference]`, e.g. `luca-INV-2026-00142`. Always generate this — it protects against double-posting if a call is retried. |

**Optional parameters:**

| Parameter | Type | Description |
|---|---|---|
| `currency` | string (ISO 4217) | Defaults to the business's base currency (usually GBP). Required for foreign currency transactions. |
| `exchange_rate` | string | Required when currency differs from base currency. Expressed as: 1 unit of transaction currency = X units of base currency. Example: if £1 = $1.27, then for a USD transaction, rate = 0.787 (1 USD = 0.787 GBP). |
| `counterparty` | object | The supplier or customer. Include `trading_account_id` and/or `contact_id` if known. Required for invoice and payment types. |
| `adjustment_context` | object | Required for `PRIOR_PERIOD_ADJUSTMENT` transactions. Includes `original_period`, `original_transaction_id`, `reason`, and `authorised_by`. |
| `approval_context.confidence_score` | number (0.0–1.0) | Luca's confidence in this posting. Transactions below the business's configured threshold are staged for human approval rather than auto-posted. Always include this for batch-mode postings. |

**Line item structure** (each item in the `lines` array):

| Field | Type | Required | Description |
|---|---|---|---|
| `description` | string | Yes | Description of this line item |
| `net_amount` | number | Yes | Net amount before tax. Positive for normal entries. |
| `tax_code` | string | Yes | Tax code. See Tax Codes section below. |
| `tax_amount` | number | Yes | Tax amount. Zero if exempt or zero-rated. |
| `account_override` | string | No | Override the default GL account for this line. Use `gl://accounts` resource to find valid codes. Required for MANUAL_JOURNAL lines. |
| `cost_centre` | string | No | Cost centre code for departmental analysis. |
| `department` | string | No | Department code. |

**Transaction Types** (valid values for `transaction_type`):

| Type | Use For |
|---|---|
| `CUSTOMER_INVOICE` | Recording a sale to a customer — debits Trade Debtors, credits Sales Revenue and VAT Output |
| `CUSTOMER_CREDIT_NOTE` | Reducing a customer's balance — reverses a customer invoice |
| `CUSTOMER_PAYMENT` | Recording receipt of payment from a customer — debits Bank, credits Trade Debtors |
| `BAD_DEBT_WRITE_OFF` | Writing off an irrecoverable customer debt |
| `SUPPLIER_INVOICE` | Recording a purchase invoice — debits expense account and VAT Input, credits Trade Creditors |
| `SUPPLIER_CREDIT_NOTE` | Reducing an amount owed to a supplier — reverses a supplier invoice |
| `SUPPLIER_PAYMENT` | Recording payment made to a supplier — debits Trade Creditors, credits Bank |
| `STOCK_RECEIPT` | Recording goods received into stock |
| `STOCK_DISPATCH` | Recording goods dispatched from stock |
| `STOCK_WRITE_OFF` | Writing off damaged or obsolete stock |
| `STOCK_TRANSFER` | Moving stock between locations |
| `STOCK_REVALUATION` | Adjusting stock to a new valuation |
| `BANK_RECEIPT` | Money received into bank that is not from a customer account — interest, refunds, ad hoc income |
| `BANK_PAYMENT` | Money paid from bank that is not to a supplier account — bank charges, direct debits, utility payments |
| `BANK_TRANSFER` | Moving money between the business's own bank accounts |
| `MANUAL_JOURNAL` | Manual double-entry journal — accruals, prepayments, depreciation, corrections. All lines must balance (sum to zero). |
| `PRIOR_PERIOD_ADJUSTMENT` | Correcting an entry in a prior period. Requires `adjustment_context`. |
| `PERIOD_END_ACCRUAL` | Month-end or year-end accrual entry |
| `PREPAYMENT_RECOGNITION` | Releasing a prepayment to the P&L |
| `DEPRECIATION` | Recording depreciation of fixed assets |
| `FX_REVALUATION` | Revaluing foreign currency balances at period end |

**Tax Codes** (valid values for `tax_code`):

| Code | Description |
|---|---|
| `STANDARD_VAT_20` | UK standard rate VAT at 20% |
| `REDUCED_VAT_5` | UK reduced rate VAT at 5% |
| `ZERO_RATED` | Zero-rated supply (VAT applicable but at 0%) |
| `EXEMPT` | Exempt supply (outside VAT scope) |
| `OUTSIDE_SCOPE` | Outside scope of VAT entirely |
| `REVERSE_CHARGE` | Reverse charge mechanism (B2B cross-border services) |
| `POSTPONED_VAT` | Postponed VAT Accounting for imports (UK) |

**Successful response:**

```json
{
  "status": "POSTED",
  "transaction_id": "TXN-2026-03-00142",
  "chain_hash": "a3f9e2...",
  "period": "2026-03",
  "posted_at": "2026-03-15T14:32:01Z",
  "postings": [
    { "account_code": "6400", "account_name": "Office Supplies", "debit": 100.00, "credit": 0 },
    { "account_code": "1200", "account_name": "VAT Input Recoverable", "debit": 20.00, "credit": 0 },
    { "account_code": "2000", "account_name": "Trade Creditors", "debit": 0, "credit": 120.00 }
  ]
}
```

**Staged for approval response:**

```json
{
  "status": "PENDING_APPROVAL",
  "staging_id": "STG-20260315-007",
  "reason": "confidence_below_threshold",
  "confidence_score": 0.71,
  "threshold": 0.85
}
```

When a transaction is staged, inform the user clearly. Do not proceed as if it has been posted.

---

### `gl_query_journal`

**Purpose:** Search committed transactions in the ledger. Use to retrieve specific invoices, payments, or to review recent activity. Results are from the committed chain — staged/pending transactions are not included.

**Parameters** (all optional — omit to retrieve recent transactions):

| Parameter | Type | Description |
|---|---|---|
| `period` | string | Filter to a specific accounting period, e.g. `2026-03` |
| `date_from` | string (ISO date) | Start of date range |
| `date_to` | string (ISO date) | End of date range |
| `transaction_type` | string | Filter by transaction type |
| `account_code` | string | Filter by account code — returns all transactions touching this account |
| `counterparty` | string | Trading account ID or contact ID |
| `reference` | string | Partial match search on the reference field |
| `amount_min` | string | Minimum transaction amount |
| `amount_max` | string | Maximum transaction amount |
| `page` | number | Page number (default: 1) |
| `page_size` | number | Results per page (default: 20) |

**Response:** An array of matching transactions, each with `transaction_id`, `transaction_type`, `date`, `reference`, `description`, `total_amount`, `currency`, and a `postings` array showing the full double-entry breakdown.

---

### `gl_get_trial_balance`

**Purpose:** Retrieve the trial balance for an accounting period. Every account with a non-zero balance is shown with its debit and credit totals. Total debits must equal total credits — if they do not, the ledger has a data integrity problem that must be flagged immediately.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `period` | string | Yes | Accounting period, e.g. `2026-03` |
| `include_comparatives` | boolean | No | Include prior period figures for comparison. Default: false. |

**Response:** An account-by-account breakdown with debit totals, credit totals, and net balance for the period. Also includes a `data_flag` field — `PROVISIONAL` means the period is still open and figures may change; `AUTHORITATIVE` means the period is hard-closed and the figures are final.

**Important:** Always check the `data_flag`. When reporting figures to the user, state clearly whether they are provisional or final.

---

### `gl_get_account_balance`

**Purpose:** Retrieve the current balance of a specific GL account. Use this for quick balance checks — e.g. checking the bank balance, the VAT liability, the trade debtors total.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `account_code` | string | Yes | Account code, e.g. `1100` for Trade Debtors |
| `as_at_date` | string (ISO date) | No | Balance as at this date. Defaults to today. |

**Response:** `debit_balance`, `credit_balance`, `net_balance`, `account_name`, `account_type`, and the date the balance is as at.

---

### `gl_list_accounts`

**Purpose:** List or search the chart of accounts. Use this to find the correct account code before posting a transaction, particularly for expense categories or when in doubt about account classification.

**Parameters** (all optional):

| Parameter | Type | Description |
|---|---|---|
| `category` | string (enum) | Filter by category: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE` |
| `search` | string | Search by account name or code (partial match) |
| `active_only` | boolean | Return only active accounts. Default: true. |

**Response:** Array of accounts, each with `account_code`, `account_name`, `category`, `sub_category`, `is_active`, and `current_period_balance`.

---

### `gl_get_period_status`

**Purpose:** Check the status and date range of an accounting period before posting. Always check this before posting to confirm the period is open. If no period is specified, returns the current open period.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `period` | string | No | Period to check, e.g. `2026-03`. Omit to get the current open period. |

**Period statuses:**

| Status | Meaning |
|---|---|
| `OPEN` | Accepting all transactions normally |
| `SOFT_CLOSE` | Period is being closed — only month-end adjustments permitted |
| `HARD_CLOSE` | Period is permanently sealed — no further transactions permitted |

**If the required period is `HARD_CLOSE`:** Do not post to it. Inform the user and ask whether they want to post to the current open period instead, or use a `PRIOR_PERIOD_ADJUSTMENT`.

---

### `gl_approve_transaction`

**Purpose:** Approve a transaction currently in the approval queue. The transaction is committed to the immutable chain and the database mirror. If multiple approvals are required, this adds one vote.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `staging_id` | string | Yes | The staging ID of the pending transaction, e.g. `STG-20260315-007` |
| `notes` | string | No | Optional notes to record with the approval |

**Response:** Confirmation that the approval was recorded, and either confirmation that the transaction is now `POSTED` (if all required approvals received) or that it remains `PENDING_APPROVAL` (if more approvals are needed).

**Note:** Luca should not approve transactions in fully automated batch mode without user oversight. Approval via MCP is appropriate when the user has reviewed the staged transaction and explicitly asks Luca to approve it.

---

### `gl_reject_transaction`

**Purpose:** Reject a transaction in the approval queue. The transaction will not be posted. A reason is required and is stored in the audit trail.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `staging_id` | string | Yes | The staging ID of the pending transaction |
| `reason` | string | Yes | Reason for rejection — stored in the audit trail |

**Response:** Confirmation that the transaction has been rejected and will not be posted.

---

### `gl_verify_chain`

**Purpose:** Verify the integrity of the hash chain for an accounting period. Checks that every entry's hash is correct and that the chain of hashes is unbroken from first to last entry. For hard-closed periods, also verifies the Merkle root against the stored period seal.

Use this after a batch run, after a large number of postings, or any time the user wants confirmation that the ledger is intact.

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `period` | string | Yes | Period to verify, e.g. `2026-03` |

**Response:** `VALID` or `INVALID`. If `INVALID`, includes the first entry where the hash check failed and a description of the discrepancy. An `INVALID` result is a serious data integrity problem — flag it to the user immediately and do not post further transactions until it is investigated.

---

## MCP Resources

Resources are read-only data Luca can request for context. They are prefetched before complex workflows to avoid repeated tool calls mid-process.

---

### `gl://accounts`

The complete chart of accounts with current-period balances. Read this at the start of any workflow that requires account selection — it is faster than calling `gl_list_accounts` repeatedly.

Returns a formatted table: account code, name, type, sub-category, and current balance (debit or credit).

---

### `gl://periods`

Current and recent period information — the last six periods with their date ranges, status (`OPEN`, `SOFT_CLOSE`, `HARD_CLOSE`), and data flag (`PROVISIONAL` or `AUTHORITATIVE`).

Read this at the start of any reporting workflow to confirm which periods are available and what their data quality is.

---

### `gl://transaction-types`

Full catalogue of transaction types with descriptions, required fields, and the default account mappings the engine uses when auto-generating the double-entry. Read this when unsure which transaction type to use for an unusual business event.

---

### `gl://approval-queue`

Transactions currently pending approval — count, total value, and a summary of each pending item (staging ID, type, amount, description, confidence score, how long it has been waiting).

Read this at the start of any session to check for items needing attention, and always in batch mode to include in the morning summary.

---

## Error Handling

All MCP tool calls may return errors. Luca must handle each error type gracefully and never silently skip a failed posting.

### Error Response Format

```json
{
  "status": "ERROR",
  "error_code": "PERIOD_CLOSED",
  "message": "Period 2026-01 is HARD_CLOSE. No further transactions can be posted to this period."
}
```

### Error Code Reference

| Error Code | Meaning | Luca's Action |
|---|---|---|
| `PERIOD_CLOSED` | The transaction date falls in a closed period | Inform the user. Ask if they want to post to the open period instead, or use a PRIOR_PERIOD_ADJUSTMENT. Do not post without instruction. |
| `PERIOD_SOFT_CLOSE` | Period is in soft-close — only adjustments permitted | Inform the user. Ask if this is a month-end adjustment or if a different date should be used. |
| `VALIDATION_ERROR` | The payload failed validation | Report the specific validation message. Common causes: debits ≠ credits on a journal, missing required field, invalid account code, invalid tax code. Fix the payload and retry. |
| `DUPLICATE_IDEMPOTENCY_KEY` | This idempotency key has already been used | The transaction was already posted. Retrieve the original transaction ID using `gl_query_journal` with the reference. Do not re-post. |
| `INVALID_ACCOUNT` | Account code does not exist or is inactive | Use `gl_list_accounts` to find the correct code. |
| `COUNTERPARTY_NOT_FOUND` | The trading account or contact ID was not found | Post without the counterparty reference and include the name in the description field. Inform the user that the counterparty record may need to be created. |
| `INSUFFICIENT_PERMISSIONS` | The MCP user does not have permission for this operation | Inform the user. This requires an administrator to adjust the MCP user's permissions. |
| `CHAIN_INTEGRITY_ERROR` | A hash chain verification failed | This is a serious data integrity issue. Stop all posting immediately. Inform the user and recommend contacting technical support. |
| `INTERNAL_ERROR` | Unexpected server error | Inform the user. If it persists, the Luca's General Ledger Docker instance may need to be restarted. |
| `TIMEOUT` | The MCP call did not respond within the expected time | Wait 30 seconds and retry once. If it fails again, inform the user that the ledger service may be unavailable. |

### On Retry Safety

The `idempotency_key` field on `gl_post_transaction` makes retries safe. If Luca retries a failed posting, it must use the same idempotency key as the original attempt. If the original posting succeeded but the response was not received (e.g. a timeout), the retry will return `DUPLICATE_IDEMPOTENCY_KEY` — which is the correct and safe outcome. Luca should then retrieve the original transaction to confirm it was posted.

### In Batch Mode

When a posting fails during a scheduled batch run, Luca must:
1. Record the failure with the document name, error code, and error message
2. Move the document to the `flagged/` sub-folder within the inbox (not the processed folder)
3. Continue processing remaining documents
4. Include all failures prominently in the morning summary report

Luca must never silently drop a document because of a posting error.

---

## Watched Inbox Folders and Processed Folder Convention

### Inbox Folders

Luca monitors these folders during scheduled batch runs. Users can also drop files here manually for Luca to pick up on the next run or when asked.

| Folder | Contents |
|---|---|
| `lucas-general-ledger-inbox/purchase-invoices/` | Supplier invoices, bills, purchase orders (for confirmation only) |
| `lucas-general-ledger-inbox/sales-invoices/` | Sales invoices issued by the business |
| `lucas-general-ledger-inbox/bank-statements/` | Bank statements in any format |
| `lucas-general-ledger-inbox/other/` | Expense receipts, credit notes, payroll summaries, anything else |

The actual paths are configured in `business-profile.json` (see below). The values above are the defaults.

### Processed Folder Convention

After successful processing, files are moved to:

```
lucas-general-ledger-processed/[type]/[YYYY-MM-DD]/[original-filename]
```

Examples:
- `lucas-general-ledger-processed/purchase-invoices/2026-03-15/acme-corp-INV-00441.pdf`
- `lucas-general-ledger-processed/bank-statements/2026-03-15/hsbc-march-2026.csv`

### Flagged Files

Files Luca cannot process (unreadable, ambiguous, posting failed) are moved to:

```
lucas-general-ledger-inbox/[type]/flagged/[original-filename]
```

These are included in the morning summary report with a description of the problem.

### File Format Handling

Luca accepts files in any format in the inbox. See `references/file-handling.md` for format-specific intake procedures. Once structured data is extracted, all downstream posting workflows are identical regardless of input format.

---

## `business-profile.json` Structure

Luca's General Ledger writes this file at setup time. Luca reads it on every activation to personalise behaviour to the specific business. It is stored in the root of the Luca's General Ledger installation.

```json
{
  // ─── Business Identity ───────────────────────────────────────────────────────
  "business_name": "Acme Trading Ltd",
  // Full legal name as registered

  "legal_structure": "limited_company",
  // One of: sole_trader | limited_company | partnership | llc | s_corp | c_corp | other

  "registration_number": "12345678",
  // Companies House number (UK), EIN (US), or equivalent

  "base_currency": "GBP",
  // ISO 4217 currency code — all ledger balances are reported in this currency

  // ─── Territory and Tax ───────────────────────────────────────────────────────
  "tax_territory": "uk",
  // One of: uk | us | eu_de | eu_fr | eu_es | eu_it | eu_nl | eu_other | other
  // Determines which tax reference file Luca loads on activation

  "tax_reference_file": "references/tax/uk.md",
  // Derived from tax_territory. Luca loads this file on every activation.

  "eu_member_state": null,
  // ISO 3166-1 alpha-2 country code if tax_territory is eu_*. e.g. "DE", "FR". Null otherwise.

  "vat_registered": true,
  // Boolean — whether the business is registered for VAT / sales tax

  "vat_number": "GB123456789",
  // VAT registration number. Null if not registered.

  "vat_scheme": "standard",
  // UK: standard | cash | flat_rate. Null for non-UK territories.
  // standard = invoice-basis VAT, most common
  // cash = VAT based on when cash is received/paid, not invoice date
  // flat_rate = fixed flat rate percentage of gross turnover

  "vat_flat_rate_percentage": null,
  // Required if vat_scheme = flat_rate. The flat rate percentage for this business's trade sector.

  "vat_stagger_group": 1,
  // UK VAT stagger group: 1, 2, or 3. Null for non-UK.
  // Group 1: quarters ending March, June, September, December
  // Group 2: quarters ending April, July, October, January
  // Group 3: quarters ending May, August, November, February

  "vat_quarter_end_months": [3, 6, 9, 12],
  // Derived from stagger group — months when VAT quarters end. For display and reminder purposes.

  "postponed_vat_accounting": false,
  // UK importers only — whether Postponed VAT Accounting (PVA) is in use for import VAT.
  // If true, Luca uses POSTPONED_VAT tax code for imports rather than treating import VAT
  // as a cash cost at the border.

  // ─── Accounting Settings ─────────────────────────────────────────────────────
  "accounting_year_end": "03-31",
  // MM-DD format. The last day of the accounting year. Default: 03-31 (31 March, common for UK sole traders).

  "accounting_basis": "accruals",
  // accruals | cash
  // accruals = transactions recorded when they occur, regardless of when cash moves (standard)
  // cash = transactions recorded when cash is received or paid

  "nominal_code_structure_version": "1.0",
  // Version of the chart of accounts structure in use

  // ─── Folder Paths ────────────────────────────────────────────────────────────
  "inbox_base_path": "lucas-general-ledger-inbox",
  // Base path for all inbox folders, relative to the user's home directory

  "inbox_purchase_invoices": "lucas-general-ledger-inbox/purchase-invoices",
  "inbox_sales_invoices": "lucas-general-ledger-inbox/sales-invoices",
  "inbox_bank_statements": "lucas-general-ledger-inbox/bank-statements",
  "inbox_other": "lucas-general-ledger-inbox/other",

  "processed_base_path": "lucas-general-ledger-processed",
  // Base path for processed files

  // ─── Luca Behaviour Settings ─────────────────────────────────────────────────
  "scheduled_batch_enabled": false,
  // Whether Luca runs automated batch processing on a schedule

  "batch_run_time": "0 6 * * 1-5",
  // Cron expression for when the batch run triggers. Default: 6am Monday–Friday.
  // Null if scheduled_batch_enabled is false.

  "auto_post_confidence_threshold": 0.85,
  // Transactions with a confidence score at or above this threshold are posted automatically
  // in batch mode without requiring human approval. Range: 0.0 to 1.0.
  // Default: 0.85. Lower values increase automation; higher values require more human review.
  // Recommended starting point: 0.85. Adjust based on experience with your document quality.

  "morning_report_enabled": true,
  // Whether Luca produces a morning summary report after each batch run

  "morning_report_output_path": "lucas-general-ledger-processed/reports"
  // Where morning report files are written
}
```

### How Luca Uses `business-profile.json`

On every activation, Luca reads this file and:

1. Sets the business name for use in reports and confirmations
2. Loads the tax reference file specified in `tax_reference_file`
3. Checks `vat_registered` and `vat_scheme` to inform all VAT handling decisions
4. Uses `vat_stagger_group` and `vat_quarter_end_months` for VAT return timing and reminders
5. Uses `accounting_year_end` for year-end alerts and report date ranges
6. Uses `accounting_basis` to correctly treat accruals vs cash transactions
7. Uses the folder paths for all inbox and processed file operations
8. Uses `auto_post_confidence_threshold` in batch mode to decide whether to post or stage

If `business-profile.json` is missing or unreadable, Luca must inform the user and ask them to run the Luca's General Ledger setup process before proceeding.

---

## Chart of Accounts — Quick Reference

The authoritative chart of accounts is in the `gl://accounts` resource. The table below is a summary for quick reference during decision-making. Always verify against the live resource when posting.

### Assets (1xxx)

| Code | Name | Use For |
|---|---|---|
| 1000 | Bank Current Account | Main bank — all payments and receipts |
| 1050 | Bank Deposit Account | Savings / deposit account |
| 1100 | Trade Debtors | Amounts owed BY customers (auto-posted by CUSTOMER_INVOICE) |
| 1150 | Other Debtors | Non-trade amounts owed to the company |
| 1200 | VAT Input Recoverable | VAT paid on purchases (reclaimable) — auto-posted with VAT |
| 1300 | Stock | Inventory / goods held for resale |
| 1350 | Goods Received Not Invoiced | Goods received, invoice not yet arrived |
| 1400 | Prepayments | Expenses paid in advance |
| 1500 | Fixed Assets Cost | Capital equipment, vehicles, property (cost) |
| 1510 | Fixed Assets Accum Depn | Accumulated depreciation (credit balance) |

### Liabilities (2xxx)

| Code | Name | Use For |
|---|---|---|
| 2000 | Trade Creditors | Amounts owed TO suppliers (auto-posted by SUPPLIER_INVOICE) |
| 2050 | Other Creditors | Non-trade amounts the company owes |
| 2100 | VAT Output | VAT charged on sales (owed to HMRC) — auto-posted with VAT |
| 2150 | Accruals | Expenses incurred but not yet invoiced |
| 2200 | PAYE/NI Payable | Payroll taxes owed to HMRC |

### Equity (3xxx)

| Code | Name | Use For |
|---|---|---|
| 3000 | Share Capital | Initial capital invested |
| 3100 | Retained Earnings | Accumulated profits carried forward |
| 3200 | Revaluation Reserve | Asset revaluation adjustments |

### Revenue (4xxx)

| Code | Name | Use For |
|---|---|---|
| 4000 | Sales Revenue Trade | Core product/service sales |
| 4100 | Sales Revenue Other | Secondary or occasional sales |
| 4200 | Other Income | Miscellaneous income, scrap, commissions |

### Direct Costs (5xxx)

| Code | Name | Use For |
|---|---|---|
| 5000 | Cost of Goods Sold | COGS journals |
| 5100 | Purchases Raw Materials | Raw materials, goods for resale, stock purchases |
| 5200 | Purchase Price Variance | Standard vs actual cost differences |

### Overheads (6xxx)

| Code | Name | Use For |
|---|---|---|
| 6000 | Wages and Salaries | Staff costs, gross pay, employer NI |
| 6100 | Rent and Rates | Premises rent, business rates, insurance |
| 6200 | Utilities | Electricity, gas, water |
| 6300 | Communications | Phone, internet, postage, hosting |
| 6400 | Office Supplies | Stationery, consumables, small office items |
| 6500 | Travel and Subsistence | Flights, hotels, taxis, mileage, meals |
| 6600 | Professional Fees | Accountancy, legal, consultancy, audit |
| 6700 | Marketing and Advertising | Ads, agencies, events, PR |
| 6800 | IT and Software | Software subscriptions, IT support, hardware |

### Finance (7xxx)

| Code | Name | Use For |
|---|---|---|
| 7000 | Bank Interest Received | Interest earned on bank balances |
| 7100 | Bank Charges | Bank fees, card processing charges |
| 7200 | FX Gains/Losses | Foreign exchange differences |

---

*ledger-formats.md — references file for Luca's General Ledger CFO skill*
*Read on every activation. Part of the Luca's General Ledger open source project.*
