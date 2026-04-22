---
name: gl-document-posting
description: >
  Post financial documents (invoices, credit notes, payments, receipts, journals, expenses, payroll)
  to the General Ledger via REST API. Use this skill whenever the user uploads or mentions a financial
  document they want recorded in their accounting system — including supplier invoices, purchase orders,
  sales invoices, credit notes, bank statements, expense receipts, petty cash vouchers, payroll summaries,
  journal entries, or any document that needs to become an accounting transaction. Also trigger when the
  user says things like "post this to the ledger", "record this invoice", "book this payment", "enter
  this into accounts", or asks about account codes, double-entry bookkeeping, or GL postings.
---

# Financial Document Posting to the General Ledger

This skill guides you through analysing any financial document, determining its type, making the correct
accounting decisions, and posting it to the General Ledger (GL) via the REST API. The goal is to turn
a real-world document (PDF, image, spreadsheet, or text) into a properly coded double-entry transaction.

## How This Skill Works

When a user gives you a financial document, you will:

1. **Read and extract** key data from the document
2. **Classify** the document type (or ask the user if uncertain)
3. **Determine** the correct accounting treatment
4. **Check** whether counterparty records need to be created
5. **Build** the GL transaction with correct account codes
6. **Post** it to the GL via the REST API
7. **Verify** the posting was successful

Read the reference file at `references/account-codes.md` (relative to this skill's directory) for the
full chart of accounts and transaction type mappings before posting any transaction.

---

## Step 1 — Read the Document

Use whatever tool is appropriate to extract the document contents:

- **PDF files**: Use the Read tool or PDF skill to extract text and tables
- **Images** (photos of receipts, scanned invoices): Use the Read tool to view them visually and transcribe
- **Spreadsheets**: Use the Read tool or xlsx skill
- **Plain text / email**: Read directly from the conversation

Extract these fields (not all will be present on every document):

| Field | Examples |
|-------|----------|
| **Counterparty name** | "Landu Innovations", "Amazon Web Services" |
| **Counterparty reference** | Supplier/customer account number |
| **Document number** | Invoice #INV-001, Credit Note #CN-042 |
| **Document date** | The date printed on the document |
| **Due date** | Payment due date (if shown) |
| **Currency** | GBP, USD, EUR — look for currency symbols (£, $, €) |
| **Line items** | Description, quantity, unit price, line total |
| **Subtotal** | Net amount before tax |
| **Tax / VAT** | Tax amount and rate (e.g., 20% VAT) |
| **Total** | Gross amount including tax |
| **Payment terms** | "Net 30", "Due on receipt", etc. |
| **Bank details** | For payment documents — sort code, account number |

Present a brief summary of what you found to the user before proceeding.

---

## Step 2 — Classify the Document Type

Based on the extracted data, determine which type of financial document you are looking at. Here are
the document types the GL supports, with guidance on how to identify each one:

### Supplier Invoice (SUPPLIER_INVOICE)
**Indicators**: Addressed TO your company, FROM a supplier. Has "Invoice" in the title. Shows goods
or services your company is buying. May say "Tax Invoice", "Proforma Invoice", or "Commercial Invoice".

### Supplier Credit Note (SUPPLIER_CREDIT_NOTE)
**Indicators**: FROM a supplier, reducing an amount your company owes. Has "Credit Note" or "Credit
Memo" in the title. Shows negative amounts or says "credit to your account".

### Customer Invoice / Sales Invoice (CUSTOMER_INVOICE)
**Indicators**: FROM your company TO a customer. Has "Invoice" or "Sales Invoice" in the title. Shows
goods or services your company is selling. Revenue is being earned.

### Customer Credit Note (CUSTOMER_CREDIT_NOTE)
**Indicators**: FROM your company TO a customer, reducing an amount they owe. Has "Credit Note" in
the title. Reduces previously invoiced revenue.

### Payment Made to Supplier (SUPPLIER_PAYMENT)
**Indicators**: Evidence of money leaving your bank account to pay a supplier. Bank statement line,
payment confirmation, remittance advice showing "paid" status. Reduces the amount owed to a creditor.

### Payment Received from Customer (CUSTOMER_RECEIPT)
**Indicators**: Evidence of money arriving in your bank account from a customer. Bank statement credit,
payment received notification, remittance advice from the customer. Reduces the amount owed by a debtor.

### Bank Payment (BANK_PAYMENT)
**Indicators**: Money leaving the bank for something other than paying a supplier — bank charges,
direct debits, utility bills paid by direct debit, loan repayments. Not linked to a supplier account.

### Bank Receipt (BANK_RECEIPT)
**Indicators**: Money arriving in the bank from a source other than a customer — interest received,
refunds from HMRC, insurance payouts, ad-hoc income.

### Expense Claim / Petty Cash (EXPENSE_CLAIM)
**Indicators**: Employee expense report, petty cash voucher, receipt for a small purchase. Usually
has a staff member's name and a list of small expenses (travel, meals, office supplies).

### Payroll Entry (PAYROLL)
**Indicators**: Payroll summary, wage slip summary, P32 report. Shows gross pay, PAYE, NI, net pay
for one or more employees. Usually a monthly or weekly summary.

### Journal Entry (JOURNAL)
**Indicators**: The user explicitly says "journal" or "adjustment". Corrections, accruals,
prepayments, depreciation, year-end adjustments. Not a source document — it's an accounting entry.

### VAT Payment / VAT Return (VAT_PAYMENT)
**Indicators**: HMRC VAT return, VAT payment confirmation, MTD submission receipt. Shows VAT
collected vs VAT paid and the net amount due to/from HMRC.

### Inter-Account Transfer (TRANSFER)
**Indicators**: Moving money between the company's own bank accounts. No external counterparty.
Shows same company on both sides.

### If You Are Not Sure

If the document doesn't clearly match one of the above types, or if it could reasonably be more than
one type, **ask the user**. Present what you've found and offer the most likely options:

> "This document from [counterparty] for [amount] could be either a **supplier invoice** (a bill
> for goods/services you've purchased) or a **proforma invoice** (a quote that doesn't need posting
> yet). Which is it — or is it something else?"

Never guess when the accounting treatment would be materially different between options. It's better
to ask one clarifying question than to post to the wrong accounts.

---

## Step 3 — Determine the Accounting Treatment

Each document type has a specific double-entry treatment. The GL's transaction type system handles
the debit/credit split automatically — you just need to supply the right transaction type, amount,
and account code. The reference file `references/account-codes.md` has the full chart of accounts.

Here is how each document type is treated:

### SUPPLIER_INVOICE
Posts a purchase. The GL automatically debits a cost/expense account and credits Trade Creditors (2000).

- **Transaction type**: `SUPPLIER_INVOICE`
- **Account to specify**: The expense or cost account for what was purchased (see account selection below)
- **Amount**: The gross total including VAT/tax
- **If VAT applies**: Include the VAT amount — the GL will separate it to VAT Input Recoverable (1200)

**Account selection guide for purchases:**
| What was purchased | Account Code | Account Name |
|---|---|---|
| Raw materials, goods for resale, manufacturing inputs | 5100 | Purchases Raw Materials |
| Stock / inventory items | 5100 | Purchases Raw Materials |
| Staff wages (if invoiced via agency) | 6000 | Wages and Salaries |
| Rent for premises | 6100 | Rent and Rates |
| Electricity, gas, water | 6200 | Utilities |
| Phone, internet, hosting | 6300 | Communications |
| Stationery, printer ink, office consumables | 6400 | Office Supplies |
| Flights, hotels, taxis, mileage | 6500 | Travel and Subsistence |
| Accountancy, legal, consultancy | 6600 | Professional Fees |
| Google Ads, Facebook Ads, marketing agency | 6700 | Marketing and Advertising |
| Software subscriptions, IT support, hardware | 6800 | IT and Software |
| Insurance premiums | 6100 | Rent and Rates (or create a specific insurance account) |
| Equipment, machinery, vehicles (capital items > £1000) | 1500 | Fixed Assets Cost |

If unsure which expense category, ask the user: "This invoice is for [description]. Which cost
category does this fall under?" and present the options above.

### SUPPLIER_CREDIT_NOTE
Reverses part or all of a previous supplier invoice. Debits Trade Creditors (2000), credits the
original expense account.

- **Transaction type**: `SUPPLIER_CREDIT_NOTE`
- **Account to specify**: The same expense account that the original invoice was posted to
- **Amount**: The credit note amount (positive number — the GL handles the reversal)

### CUSTOMER_INVOICE
Records revenue earned. Debits Trade Debtors (1100), credits a revenue account.

- **Transaction type**: `CUSTOMER_INVOICE`
- **Account to specify**: The revenue account
- **Amount**: Gross total including VAT

**Revenue account selection:**
| Type of sale | Account Code | Account Name |
|---|---|---|
| Core product/service sales | 4000 | Sales Revenue Trade |
| Secondary or occasional sales | 4100 | Sales Revenue Other |
| Miscellaneous income (e.g., scrap sales) | 4200 | Other Income |

### CUSTOMER_CREDIT_NOTE
Reverses part or all of a previous customer invoice. Credits Trade Debtors (1100), debits the
revenue account.

- **Transaction type**: `CUSTOMER_CREDIT_NOTE`
- **Account to specify**: Same revenue account as the original invoice
- **Amount**: Credit note amount (positive number)

### SUPPLIER_PAYMENT
Records paying a supplier. Credits Bank (1000), debits Trade Creditors (2000).

- **Transaction type**: `SUPPLIER_PAYMENT`
- **Account to specify**: Bank account used (1000 for current, 1050 for deposit)
- **Amount**: Amount paid

### CUSTOMER_RECEIPT
Records receiving payment from a customer. Debits Bank (1000), credits Trade Debtors (1100).

- **Transaction type**: `CUSTOMER_RECEIPT`
- **Account to specify**: Bank account receiving the money (1000 or 1050)
- **Amount**: Amount received

### BANK_PAYMENT
A payment from the bank that isn't to a supplier on account. Directly expenses the cost.

- **Transaction type**: `BANK_PAYMENT`
- **Account to specify**: The expense account (use the purchase account selection guide above)
- **Amount**: Payment amount

### BANK_RECEIPT
Income received directly into the bank, not from a customer on account.

- **Transaction type**: `BANK_RECEIPT`
- **Account to specify**: The income account (usually 4200 Other Income, or 7000 Bank Interest)
- **Amount**: Amount received

### EXPENSE_CLAIM
An employee expense claim. Credits Other Creditors (2050) or Bank, debits expense accounts.

- **Transaction type**: `EXPENSE_CLAIM`
- **Account to specify**: The expense account for each line item
- **Amount**: Total claim amount
- **Note**: If the claim has multiple categories (e.g., travel + meals), post as a JOURNAL with
  multiple lines, one per expense category.

### PAYROLL
Monthly payroll summary. This is always a journal entry with multiple lines:

- **Transaction type**: `JOURNAL`
- **Lines**:
  - DR 6000 Wages and Salaries — gross pay
  - CR 2200 PAYE/NI Payable — PAYE + employer's NI + employee's NI
  - CR 1000 Bank Current Account — net pay
- **Note**: Employer's NI is an additional cost on top of gross pay. If the document shows it
  separately, debit 6000 for (gross pay + employer's NI).

### JOURNAL
A manual journal entry. The user will specify the accounts and amounts. Debits must equal credits.

- **Transaction type**: `JOURNAL`
- **Lines**: As specified by the user — each line has an account code and amount
- **Validation**: Total debits must equal total credits before posting

### VAT_PAYMENT
Paying VAT to HMRC after a VAT return.

- **Transaction type**: `BANK_PAYMENT`
- **Account to specify**: Use VAT Output (2100) as the expense account
- **Contra account**: Bank (1000)
- **Amount**: Net VAT due

### TRANSFER
Moving money between the company's own accounts.

- **Transaction type**: `TRANSFER`
- **From account**: The bank account money is leaving (e.g., 1000)
- **To account**: The bank account money is going to (e.g., 1050)
- **Amount**: Transfer amount

---

## Step 4 — Multi-Currency Handling

If the document is in a foreign currency (anything other than GBP):

1. **Identify the currency** from the document (USD, EUR, etc.)
2. **Determine the exchange rate**: If the document shows a rate, use it. If not, ask the user
   or state that you'll use the rate shown and ask them to confirm.
3. **Include in the API call**: Set `currency` to the foreign currency code and `exchange_rate`
   to the rate (foreign currency per 1 GBP — e.g., if 1 GBP = 1.27 USD, the rate is 1.27).

The GL records both the transaction currency amount and the base currency (GBP) equivalent
automatically. Exchange differences go to account 7200 (FX Gains/Losses).

**Important**: The exchange rate is expressed as "how many units of foreign currency per 1 GBP".
So for USD when £1 = $1.27, the rate is 1.27. For EUR when £1 = €1.16, the rate is 1.16.

If the document shows a total in both currencies, calculate the implied rate and use that.

---

## Step 5 — Counterparty Management

### When to Flag a New Supplier
If the document is from a supplier you haven't seen before (not in the GL's existing records),
tell the user:

> "This invoice is from **[Supplier Name]**, which doesn't appear to be an existing supplier.
> I'll post the transaction with their name as the reference. You may want to create a formal
> supplier record in the system."

Use the supplier name in the `reference` or `description` field of the transaction.

### When to Flag a New Customer
Similarly, if a sales invoice or receipt references a customer not in the system:

> "This document references **[Customer Name]** as the customer. They don't appear to be in the
> system yet. I'll post with their name as the reference."

### General Principle
The GL module records transactions — it doesn't manage a contacts database (that's a separate
module in the platform). So for now, include the counterparty name in the transaction description
and reference fields to maintain a clear audit trail. Flag to the user when a counterparty appears
to be new so they can create the formal record when the contacts module is available.

---

## Step 6 — Build and Post the Transaction

### Authentication

Before making any API calls, you need a valid JWT token. Here's how to get one:

```bash
# Login to get a JWT token
TOKEN=$(curl -s -X POST http://host.docker.internal:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","password":"Admin123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")
```

If the auth endpoint isn't available yet (the login feature may not be built), use the dev API key:

```bash
# Alternative: use dev API key header instead of Bearer token
-H "X-API-Key: dev"
```

Store the token for reuse across multiple calls in the same session.

### Check Available Transaction Types

If you need to verify what transaction types are available:

```bash
curl -s http://host.docker.internal:3000/api/v1/gl/transaction-types \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### Post the Transaction

```bash
curl -s -X POST http://host.docker.internal:3000/api/v1/gl/transactions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @/tmp/gl_payload.json | python3 -m json.tool
```

First, write the payload to a file. The structure is:

```json
{
  "transaction_type": "SUPPLIER_INVOICE",
  "description": "Invoice #INV-001 from Acme Corp — office supplies",
  "reference": "INV-001",
  "date": "2026-03-15",
  "currency": "GBP",
  "exchange_rate": 1.0,
  "lines": [
    {
      "account_code": "6400",
      "amount": 100.00,
      "description": "Office supplies"
    }
  ]
}
```

**Field notes:**
- `date`: Use the document date, not today's date (unless it's a journal with no source document date)
- `reference`: The document number (invoice number, credit note number, etc.)
- `description`: A clear one-line summary — include counterparty name and document number
- `lines`: Each line represents one side of the posting. For simple transactions, one line is enough
  (the GL auto-generates the contra entry from the transaction type). For journals, provide all lines
  with debits as positive and credits as negative.
- `source.module_reference`: Set this to the document reference number (invoice number, etc.).
  The original file itself is attached separately in Step 6b — do not attempt to embed file data
  in the transaction payload.

### For Multi-Line Journals

When posting a journal entry (e.g., payroll), provide all lines:

```json
{
  "transaction_type": "JOURNAL",
  "description": "March 2026 payroll",
  "reference": "PAYROLL-2026-03",
  "date": "2026-03-31",
  "lines": [
    { "account_code": "6000", "amount": 15000.00, "description": "Gross wages" },
    { "account_code": "2200", "amount": -4500.00, "description": "PAYE and NI payable" },
    { "account_code": "1000", "amount": -10500.00, "description": "Net pay to bank" }
  ]
}
```

Debits are positive, credits are negative. The total must sum to zero.

---

## Step 6b — Attach the Supporting Document

After a successful posting (HTTP 201 response with a `transaction_id`), attach the original source
document to the transaction so it can be viewed from the GL Journal UI.

This step only applies when there is a **physical source document** — a PDF, image, or similar file
that was read from the inbox or uploaded by the user. Skip this step for:
- Transactions derived entirely from a verbal instruction (no file involved)
- Manual journal entries with no source document
- Transactions that were already posted in a prior session (re-runs)

### How to attach the document

1. **Read the source file as base64.** Use a bash command to encode the original file:

```bash
FILE_B64=$(base64 -w 0 "/path/to/original/document.pdf")
```

Replace the path with the actual path to the file that was used to create the transaction
(e.g. the file from the inbox folder that was read in Step 1).

2. **Determine the MIME type** from the file extension:
   - `.pdf` → `application/pdf`
   - `.jpg` / `.jpeg` → `image/jpeg`
   - `.png` → `image/png`
   - `.gif` → `image/gif`
   - `.webp` → `image/webp`
   - `.tiff` → `image/tiff`

3. **Post to the documents endpoint:**

```bash
curl -s -X POST "http://host.docker.internal:3000/api/v1/gl/transactions/${TXN_ID}/documents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"filename\": \"acme-invoice-INV-001.pdf\",
    \"mime_type\": \"application/pdf\",
    \"file_data\": \"${FILE_B64}\"
  }" | python3 -m json.tool
```

Where `$TXN_ID` is the transaction ID returned by the posting in Step 6 (e.g. `TXN-2026-03-00005`).

A successful response will be HTTP 201 with the document metadata (id, filename, file_size, etc.).

4. **Confirm to the user** — include a brief note in your Step 7 summary:

> "Supporting document attached — it can be viewed from the Journal by expanding the transaction
> and clicking **View Supporting Doc**."

If the attachment call fails (e.g. file too large, unsupported type, network error), log the error
but **do not treat it as a failure of the transaction posting** — the transaction is already safely
posted. Simply note it to the user:

> "The transaction was posted successfully, but I was unable to attach the supporting document
> automatically. You can attach it manually from the Journal UI."

---

## Step 7 — Verify the Posting

After a successful post, the API returns the transaction details including a transaction ID
(e.g., `TXN-2026-03-00005`). Confirm to the user:

> "Posted successfully as **TXN-2026-03-00005**. Here's a summary:
> - Type: Supplier Invoice
> - Supplier: Acme Corp
> - Reference: INV-001
> - Amount: £100.00
> - Debited: 6400 Office Supplies
> - Credited: 2000 Trade Creditors"

If the GL requires approval for the transaction, let the user know:

> "This transaction requires approval before it's final. It's currently in PENDING status."

### Optional: Verify Chain Integrity

For high-value or important transactions, verify the chain integrity:

```bash
curl -s http://host.docker.internal:3000/api/v1/gl/chain/verify \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

This confirms the hash chain is intact and no entries have been tampered with.

---

## Common Scenarios and Examples

### Scenario: User uploads a supplier invoice PDF
1. Read the PDF, extract supplier name, invoice number, date, line items, VAT, total
2. Classify as SUPPLIER_INVOICE
3. Determine expense account from the line item descriptions
4. Check if it's multi-currency
5. Post with transaction_type "SUPPLIER_INVOICE"

### Scenario: User says "I paid the electric bill, £145.20 from the bank"
1. No document to read — extract details from the user's message
2. Classify as BANK_PAYMENT (direct payment, not against a supplier account)
3. Account: 6200 Utilities
4. Post with transaction_type "BANK_PAYMENT"

### Scenario: User uploads a bank statement
1. Read the statement — it will contain multiple transactions
2. Present a summary of all transactions to the user
3. Process each one individually, confirming the treatment for any that are ambiguous
4. This will result in multiple postings — summarise all of them at the end

### Scenario: User says "we need to accrue £5,000 for the Q1 audit fee"
1. No source document — this is an accounting adjustment
2. Classify as JOURNAL
3. Lines: DR 6600 Professional Fees £5,000 / CR 2150 Accruals £5,000
4. Post with transaction_type "JOURNAL"

### Scenario: User uploads a sales invoice they sent to a customer
1. This is FROM the user's company TO their customer
2. Classify as CUSTOMER_INVOICE
3. Account: 4000 Sales Revenue Trade
4. Post with transaction_type "CUSTOMER_INVOICE"

---

## Error Handling

If the API returns an error:

- **MISSING_AUTH**: Your token has expired or wasn't sent. Re-authenticate.
- **VALIDATION_ERROR**: Check your payload — common issues are missing required fields, invalid
  account codes, or debits not equalling credits on journal entries.
- **PERIOD_CLOSED**: The accounting period for the transaction date is closed. Ask the user if
  they want to use a different date in an open period.
- **INVALID_ACCOUNT**: The account code doesn't exist. Check against the chart of accounts.

Always show the user the error message and suggest how to fix it.

---

## Important Accounting Principles

These principles should guide your decisions:

1. **Matching principle**: Expenses should be recorded in the period they relate to, not when
   they're paid. An invoice dated February should be posted to February's period.

2. **Prudence**: When uncertain about an amount or classification, choose the option that
   doesn't overstate profits. If unsure whether something is revenue or a liability, treat
   it as a liability until confirmed.

3. **Materiality**: Small discrepancies (a few pence in rounding) aren't worth holding up a
   posting. Note them and move on.

4. **Consistency**: If similar invoices have been posted to a particular account before, use
   the same account unless there's a good reason to change.

5. **Substance over form**: Post based on the economic reality of the transaction, not just
   what the paperwork says. A "proforma invoice" that has actually been paid is effectively
   a real invoice.

---

## Consequential Transactions — "What Else Does This Mean?"

A competent accountant does not just record the transaction in front of them — they ask what the transaction implies about other events in the business. This section defines the consequential transaction checks that Luca performs after posting any primary transaction.

**Dependency on Luca's Log:** These checks rely on business context from `lucas-log.md` at the installation root. If the log exists, Luca uses it to determine which checks apply and to provide sensible defaults. If the log does not exist, Luca asks the user directly rather than skipping the checks silently.

### When Consequential Checks Run

After every successful posting of these transaction types:
- `CUSTOMER_INVOICE` — checks for COGS/stock reduction and delivery cost accruals
- `CUSTOMER_CREDIT_NOTE` — checks for reversal of COGS entries
- `SUPPLIER_INVOICE` — checks for prepayment recognition and capital vs revenue treatment

The checks do **not** run after payment/receipt transactions, transfers, or manual journals.

### Check 1 — Cost of Goods Sold (Stock Reduction)

**Triggered by:** `CUSTOMER_INVOICE` posting where the invoice includes physical goods

**Logic:**
1. Read Luca's Log, Section 2 (Operations) — does the business hold physical stock?
2. If yes: the sale of goods implies that stock has left (or will leave) the warehouse. The cost of those goods should be transferred from the balance sheet to the P&L.
3. If the business is a dropshipper or services-only: skip this check.
4. If no log exists or the answer is unclear: ask the user.

**What to ask (manual mode):**

> "This invoice includes physical products sold to [customer]. Should I also post a cost of goods sold entry? This would move the cost of the items from Stock (1300) to Cost of Sales (5000), so your gross margin reflects the true profit on this sale.
>
> I'll need either:
> - The cost price for each product on the invoice, or
> - Your approval to use the weighted average purchase cost from recent supplier invoices for these items
>
> If you track stock in a separate system that handles COGS, let me know and I'll skip this."

**What to post if confirmed:**

```json
{
  "transaction_type": "JOURNAL",
  "description": "Cost of goods sold — [customer] [invoice ref]",
  "reference": "COGS-[invoice-ref]",
  "date": "[same date as the sales invoice]",
  "lines": [
    { "account_code": "5000", "amount": [cost_value], "description": "Cost of goods sold" },
    { "account_code": "1300", "amount": [-cost_value], "description": "Stock reduction" }
  ]
}
```

**For credit notes:** If the original sale had a COGS entry, ask whether to reverse it:
> "The original sale included a cost of goods sold entry for £[amount]. Should I reverse that as well, or has the stock not been returned?"

### Check 2 — Delivery Cost Accrual

**Triggered by:** `CUSTOMER_INVOICE` posting where any line item appears to be a delivery/shipping charge

**How to identify delivery lines:** Look for line descriptions containing: "delivery", "shipping", "postage", "carriage", "P&P", "freight", "courier", "dispatch", "handling". Also check if the line item has no quantity (delivery charges are typically flat fees, not per-unit).

**Logic:**
1. Read Luca's Log, Section 2 (Operations) — how does the business deliver goods?
2. If third-party courier: the business will receive a corresponding cost invoice from the courier. This cost should be accrued at the point of sale to match revenue and cost in the same period.
3. If own delivery (own vehicles/drivers): the costs are already captured through fuel, wages, and vehicle expenses. No separate accrual needed — but flag it for awareness.
4. If digital delivery: no physical delivery cost. Skip.
5. If no log or delivery method unknown: ask.

**What to ask — third-party delivery (manual mode):**

> "The invoice includes a delivery charge of £[amount] to the customer. Since you use [courier name from log] for deliveries, there'll be a courier cost to match against this revenue. Should I post an accrual?
>
> I'd post:
> - DR 5200 Carriage Outwards — £[estimated cost]
> - CR 2150 Accruals — £[estimated cost]
>
> When the courier invoice arrives, I'll reverse the accrual and post the actual cost. What's the typical delivery cost per order — or should I use the customer delivery charge as a proxy for now?"

**What to ask — delivery method unknown:**

> "The invoice includes a delivery charge of £[amount]. How do you handle delivery — courier service, your own vehicles, or digital? This affects whether I need to accrue a cost."

**What to post if confirmed:**

```json
{
  "transaction_type": "JOURNAL",
  "description": "Delivery cost accrual — [customer] [invoice ref]",
  "reference": "DLVACR-[invoice-ref]",
  "date": "[same date as the sales invoice]",
  "lines": [
    { "account_code": "5200", "amount": [estimated_cost], "description": "Carriage outwards accrual" },
    { "account_code": "2150", "amount": [-estimated_cost], "description": "Accrued delivery cost" }
  ]
}
```

**When the courier invoice arrives:** Post the supplier invoice as normal (Workflow 1). Then post a journal to reverse the accrual:
- DR 2150 Accruals — release the accrued amount
- CR 5200 Carriage Outwards — reverse the estimated cost
The net effect is that the actual courier cost (from the supplier invoice) replaces the estimate.

### Check 3 — Prepayment Recognition

**Triggered by:** `SUPPLIER_INVOICE` posting where the invoice covers a future period

**How to identify prepayable invoices:** Look for line descriptions containing: "annual", "12 months", "yearly", "subscription", "licence", "license", "renewal", "premium", "maintenance contract". Also check Luca's Log Section 6 (Observations) for known annual payments.

**Logic:**
1. Read Luca's Log, Section 5 (Accounting Policies) — is there a prepayment threshold?
2. If the invoice amount exceeds the threshold and covers more than one month: suggest prepayment treatment.
3. If no threshold is stated: suggest prepayment for amounts over £500 covering 6+ months (sensible default for SMEs).

**What to ask:**

> "This invoice from [supplier] for £[amount] appears to cover [period]. Would you like me to:
>
> 1. **Prepay it** — post to Prepayments (1400) and release £[amount/months] per month to [expense account]. This gives a more accurate monthly P&L.
> 2. **Expense it immediately** — post the full amount to [expense account] this month. Simpler, but this month's P&L takes the full hit.
>
> Your accounting policies [state a threshold of £X / don't specify a threshold — I'd suggest prepaying anything over £500 that covers 6 months or more]."

### Check 4 — New Counterparty Alert

**Triggered by:** Any transaction where the counterparty name does not match any name previously seen in the ledger or recorded in Luca's Log.

**Logic:** After posting, compare the counterparty against Luca's Log Section 3 (Key Commercial Relationships). If not found, and this is the first transaction with this counterparty:

> "This is the first time I've seen [counterparty name]. I've posted the transaction, but I'll keep an eye on them — if invoices from them become regular, I'll add them to my log."

If this is the third or more transaction with a counterparty not in the log, add them to Section 3 with the observed pattern.

### Batch Mode Handling

In scheduled batch processing, consequential transactions follow the parent:
- **Auto-posted parent (confidence ≥ threshold):** Post consequential entries automatically if the business model is known from Luca's Log. Use the established cost estimates (e.g., average delivery cost from previous accruals).
- **Staged parent (confidence < threshold):** Stage consequential entries alongside the parent for joint approval.
- **No Luca's Log:** Do not post consequential entries. Flag in the morning report.

### Consequential Transaction Summary

After all consequential checks are complete, summarise what was (or was not) posted:

**If consequential entries were posted:**
> "In addition to the sales invoice, I've also posted:
> - COGS entry: £[amount] from Stock to Cost of Sales (TXN-[id])
> - Delivery accrual: £[amount] to Carriage Outwards (TXN-[id])
>
> Your gross margin on this sale is approximately [X]%."

**If checks were run but nothing additional was needed:**
> (No additional message — don't clutter the confirmation with negatives.)

**If checks were skipped due to missing context:**
> "I wasn't able to check whether additional entries are needed (e.g., stock movements or delivery accruals) because I don't yet have a full picture of how your business operates. Setting up my log would fix that — want to do it now?"

---

*gl-document-posting SKILL.md — includes consequential transactions extension*
*Part of the Luca's General Ledger open source project*
