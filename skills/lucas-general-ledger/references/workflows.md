# Workflows — MCP Call Sequences

**Load this file when the user initiates any posting, reconciliation, VAT return, or multi-step accounting workflow.**

All workflows use the MCP tools defined in `references/ledger-formats.md`. Read that file before executing any workflow. The immutability constraint applies to all postings — review it in `references/ledger-formats.md` if needed.

---

## Workflow 1 — Post a Purchase Invoice

**Trigger:** User provides a supplier invoice (file, image, or description); or a supplier invoice is found in the purchase invoices inbox during batch processing.

### Step 1: Load the file and extract data

Use `references/file-handling.md` to extract:
- Supplier name
- Invoice number (reference)
- Invoice date
- Currency
- Line items: description, net amount, VAT rate, VAT amount
- Gross total

Verify the maths: sum of (net + VAT) for all lines must equal the gross total. If there is a discrepancy of more than a few pence, flag it before proceeding.

### Step 2: Determine the accounting treatment

For each line item, determine:
- The correct expense account code (use `gl://accounts` resource or `gl_list_accounts` if needed)
- The correct VAT tax code (`STANDARD_VAT_20`, `REDUCED_VAT_5`, `ZERO_RATED`, `EXEMPT`, `OUTSIDE_SCOPE`, `POSTPONED_VAT`)

If the business is not VAT registered (`vat_registered: false` in `business-profile.json`), use `OUTSIDE_SCOPE` for all lines.

If the invoice is in a foreign currency, note the currency and exchange rate. If no rate is shown on the invoice, ask the user (manual mode) or use the day's indicative rate and note it as unconfirmed (batch mode, stage for approval).

**Capital vs revenue:** If any line item appears to be a capital purchase (equipment, vehicles, fixtures — typically above £1,000 and with a useful life beyond one year), flag it: "This line looks like it may be a capital item rather than a revenue expense. Should it go to Fixed Assets (1500) rather than [expense account]?"

### Step 3: Check the period is open

Call `gl_get_period_status` for the invoice date. If the period is `HARD_CLOSE`, inform the user and ask whether to post to the current open period or raise a `PRIOR_PERIOD_ADJUSTMENT`.

### Step 4: Present for confirmation (manual mode only)

Present a clear confirmation summary:

> **Supplier Invoice — Ready to Post**
>
> Supplier: Acme Corp
> Invoice: INV-00441
> Date: 15 March 2026
> Period: 2026-03 (open)
>
> | Line | Account | Net | VAT | Gross |
> |---|---|---|---|---|
> | Office supplies | 6400 Office Supplies | £100.00 | £20.00 | £120.00 |
>
> Total: £100.00 net + £20.00 VAT = £120.00 gross
>
> Post it?

Wait for explicit confirmation before proceeding.

### Step 5: Post via MCP

Call `gl_post_transaction` with:
- `transaction_type: "SUPPLIER_INVOICE"`
- `reference`: invoice number
- `date`: invoice date
- `description`: "Invoice [ref] — [supplier name]"
- `lines`: one entry per line item with `net_amount`, `tax_code`, `tax_amount`, and `account_override` if non-default
- `counterparty`: include if trading account ID is known
- `idempotency_key`: `luca-[invoice-number]` (e.g. `luca-INV-00441`)
- `approval_context.confidence_score`: include in batch mode

### Step 6: Handle the response

**If `status: "POSTED"`:**
Confirm to the user:
> "Posted as TXN-2026-03-00089.
> Acme Corp INV-00441 — £120.00 (£100.00 + £20.00 VAT)
> Debited: 6400 Office Supplies £100.00, 1200 VAT Input £20.00
> Credited: 2000 Trade Creditors £120.00"

**If `status: "PENDING_APPROVAL"`:**
> "Invoice posted for approval — staging ID STG-20260315-007. It needs review before it's committed to the ledger. You'll find it in the approval queue."

**If error:**
Handle per the error codes in `references/ledger-formats.md`. Do not proceed without resolution.

### Step 7: Move the file (batch mode)

Move the source file from the inbox to the processed folder (see `references/file-handling.md`).

---

## Workflow 2 — Post a Sales Invoice

**Trigger:** User asks Luca to record a sales invoice they have issued, or a sales invoice file is found in the sales invoices inbox.

### Step 1: Gather the invoice details

For a file: extract using `references/file-handling.md`.

For a new invoice being created verbally, gather:
- Customer name
- Invoice number (if not specified, suggest the next sequential number — query `gl_query_journal` filtered to `CUSTOMER_INVOICE` transactions to find the last used number)
- Invoice date (default: today if not specified)
- Line items: description, quantity, unit price
- VAT treatment for each line
- Payment terms

### Step 2: Calculate totals

For each line: net = quantity × unit price. VAT = net × applicable rate. Gross = net + VAT.

If the business uses the flat rate VAT scheme (`vat_scheme: "flat_rate"` in `business-profile.json`): the VAT on the sales invoice is calculated at the standard rate and charged to the customer in the usual way. The flat rate scheme affects the VAT return calculation — not the invoice itself.

### Step 3: Check the period and present for confirmation

Call `gl_get_period_status` for the invoice date.

Present confirmation:

> **Sales Invoice — Ready to Post**
>
> Customer: Northern Building Supplies
> Invoice: INV-2026-0142
> Date: 15 March 2026
> Payment due: 14 April 2026 (30 days)
>
> | Line | Net | VAT | Gross |
> |---|---|---|---|
> | Steel brackets (50 units × £24.00) | £1,200.00 | £240.00 | £1,440.00 |
>
> Total: £1,200.00 net + £240.00 VAT = £1,440.00 gross
>
> Post it?

### Step 4: Post via MCP

Call `gl_post_transaction` with:
- `transaction_type: "CUSTOMER_INVOICE"`
- `reference`: invoice number
- `date`: invoice date
- `description`: "Invoice [ref] — [customer name]"
- `lines`: with `net_amount`, `tax_code`, `tax_amount`; default account is 4000 (use `account_override` for 4100 or 4200 if appropriate)
- `counterparty`: include if customer trading account ID is known
- `idempotency_key`: `luca-[invoice-number]`

### Step 5: Confirm

> "Posted as TXN-2026-03-00090.
> Northern Building Supplies INV-2026-0142 — £1,440.00 (£1,200.00 + £240.00 VAT)
> Debited: 1100 Trade Debtors £1,440.00
> Credited: 4000 Sales Revenue £1,200.00, 2100 VAT Output £240.00"

### Step 6: Consequential Transaction Check

After confirming the sales invoice posting, run the consequential transaction check (see Workflow 10). For sales invoices, the two primary checks are:

**a) Cost of Goods Sold / Stock Reduction**

Consult Luca's Log (Section 2 — Operations). If the business holds physical stock:

> "This invoice includes physical products sold to the customer. Those goods have either left or will leave your stock. Should I post a cost of goods sold entry to move the cost from Stock (1300) to Cost of Sales (5000)?
>
> I'll need either:
> - The cost price for each product on the invoice, or
> - Confirmation that you'd like me to use the average purchase cost from your recent supplier invoices
>
> If you maintain stock in a separate system and handle COGS there, let me know and I'll skip this."

If the owner confirms, post a `MANUAL_JOURNAL`:
- DR 5000 Cost of Sales — the cost value of the goods
- CR 1300 Stock — the same amount
- Reference: `COGS-[sales-invoice-ref]`
- Description: `Cost of goods sold — [customer name] [invoice ref]`

If the business is a **dropshipper** (noted in Luca's Log): skip the COGS check — the purchase invoice from the dropship supplier will capture the cost directly.

If the business is a **service business** (noted in Luca's Log): skip entirely — no stock is involved.

If Luca's Log does not exist or does not specify the business model, **always ask**. Do not skip silently.

**b) Delivery Cost Accrual**

Scan the invoice line items for anything that looks like a delivery, shipping, postage, or carriage charge. Common indicators: line descriptions containing "delivery", "shipping", "postage", "carriage", "P&P", "freight", "courier".

If a delivery charge is found, consult Luca's Log (Section 2 — Operations) for the delivery method:

**If third-party courier (e.g. DHL, Royal Mail, Hermes, DPD, UPS, FedEx):**

> "The invoice includes a delivery charge of £[amount] to the customer. Since you use [courier name] for deliveries, there'll be a corresponding cost when their invoice arrives. Should I post an accrual now so the cost is matched to this sale?
>
> I'd post:
> - DR 5200 Carriage Outwards — £[estimated cost]
> - CR 2150 Accruals — £[estimated cost]
>
> When the courier invoice arrives, I'll reverse the accrual and post the actual cost. What's the typical delivery cost per order — or should I use the delivery charge as a proxy?"

**If own delivery (own vehicles/drivers):**

> "The invoice includes a delivery charge of £[amount]. Since you handle delivery with your own vehicles, the costs are already captured through fuel, vehicle maintenance, and driver wages — so I won't post a separate accrual. Just wanted to flag it in case you'd prefer a different treatment."

**If delivery method is unknown (no Luca's Log or not specified):**

> "The invoice includes a delivery charge of £[amount] to the customer. How is delivery handled — do you use a courier service, deliver with your own vehicles, or is this digital delivery? This affects whether I need to accrue a cost."

**In batch mode:** If the business model is known from Luca's Log, post consequential transactions automatically at the confidence level of the parent transaction. If the business model is not known, add a note to the morning report flagging that consequential transactions were not posted and the log should be initialised.

---

## Workflow 3 — Bank Reconciliation

**Trigger:** User provides a bank statement or asks for a bank reconciliation; a bank statement is found in the bank statements inbox.

### Step 1: Read the bank statement

Extract all transactions using `references/file-handling.md`. For each statement line, note:
- Date
- Description / narrative
- Amount (debit = money out, credit = money in)
- Running balance

### Step 2: Retrieve ledger transactions for the period

Call `gl_query_journal` filtered to:
- `account_code: "1000"` (and 1050 if the statement covers a deposit account)
- Date range matching the statement period

Retrieve all committed transactions from the ledger for the bank account.

### Step 3: Match statement lines to ledger entries

Compare the bank statement list against the ledger list. Match on:
- Amount (exact match is required — partial payments should be matched carefully)
- Date (allow a few days either side for clearing time)
- Reference / description (keyword matching)

Build three lists:
1. **Matched** — statement line matches a ledger entry
2. **On statement, not in ledger** — bank has recorded it, ledger has not
3. **In ledger, not on statement** — ledger has it, bank has not (timing difference — e.g. cheque issued but not cleared)

### Step 4: Process unmatched items

**Statement items not in the ledger:**
For each, determine the correct treatment and post it. Common types:
- Bank charges → `BANK_PAYMENT` to 7100 Bank Charges
- Interest received → `BANK_RECEIPT` to 7000 Bank Interest Received
- Direct debit payments → `BANK_PAYMENT` to the relevant expense account
- Unrecognised receipts → ask the user what they relate to before posting

**Ledger items not on the statement:**
These are timing differences — payments or receipts recorded in the ledger that have not yet cleared the bank. Note them but do not make any additional postings. They should appear on the next statement.

### Step 5: Reconcile the balances

```
Bank statement closing balance:        £XX,XXX
Add: Ledger items not yet on statement:  £X,XXX
Less: Statement credits not yet in ledger: (£XXX)
─────────────────────────────────────────────────
Adjusted balance:                      £XX,XXX
GL account 1000 balance:               £XX,XXX
Difference:                                 £0
```

If the difference is not zero, investigate before closing the reconciliation. Common causes:
- A transaction posted to the wrong bank account (e.g. 1050 instead of 1000)
- A transaction posted with an incorrect amount
- A bank error (rare but possible — the bank's record should be treated as authoritative)

### Step 6: Report the result

> "Bank reconciliation complete for [month].
>
> Statement balance: £XX,XXX
> Matched: XX transactions
> Posted from statement: X transactions (bank charges, direct debits)
> Outstanding (timing): X transactions — will appear next month
>
> Ledger balance reconciles. ✓"

---

## Workflow 4 — VAT Return Preparation

**Trigger:** User asks Luca to prepare a VAT return; or Luca proactively flags that a VAT quarter end is approaching.

**Read `references/tax/uk.md` (or the relevant territory tax file) before this workflow.**

### Step 1: Confirm the VAT quarter

Identify the quarter end date from `vat_stagger_group` and `vat_quarter_end_months` in `business-profile.json`.

Confirm with the user: "The current VAT quarter ends [date]. I'll prepare the return for [start date] to [end date]. Is that right?"

### Step 2: Pull VAT data via MCP

Call `gl_query_journal` for the quarter period, filtered to transactions with VAT (i.e. any line with a tax_code other than `OUTSIDE_SCOPE`).

Alternatively, call `gl_get_account_balance` for:
- Account 1200 (VAT Input Recoverable) — this is Box 4
- Account 2100 (VAT Output) — this is the basis for Box 1

Also call `gl_get_trial_balance` for the quarter to confirm the VAT account movements.

### Step 3: Calculate the nine boxes

Under UK standard VAT accounting:

| Box | Description | Calculation |
|---|---|---|
| Box 1 | VAT due on sales | Sum of VAT output (2100) for the quarter |
| Box 2 | VAT due on acquisitions from EC | EC acquisition VAT (if applicable — usually nil for non-importers) |
| Box 3 | Total VAT due | Box 1 + Box 2 |
| Box 4 | VAT reclaimed on purchases | Sum of VAT input (1200) for the quarter |
| Box 5 | Net VAT payable / reclaimable | Box 3 − Box 4 (positive = pay HMRC; negative = HMRC owes you) |
| Box 6 | Total value of sales (exc. VAT) | Sum of net sales for the quarter |
| Box 7 | Total value of purchases (exc. VAT) | Sum of net purchases for the quarter |
| Box 8 | Total value of EC goods supplies | Intra-community goods supplies (usually nil for UK domestic) |
| Box 9 | Total value of EC acquisitions | Intra-community goods acquisitions (usually nil) |

**Flat rate scheme:** Box 1 is calculated as gross sales × the flat rate percentage from `business-profile.json`. Boxes 6–9 are still based on actual figures. Box 4 is normally nil (no input tax recovery under flat rate, except on capital purchases over £2,000).

**Cash accounting scheme:** Figures are based on payments received and made during the quarter, not invoice dates. Luca must filter transactions by the payment/receipt date, not the invoice date.

### Step 4: Sense check

Before presenting the return, check:
- Box 5 is arithmetically correct (Box 3 − Box 4)
- Box 6 is consistent with the P&L revenue for the period (should be close; any large variance needs explanation)
- No obvious input VAT has been claimed on non-reclaimable items (entertainment, business cars, etc.)
- If Box 5 is unexpectedly large or small, flag it

### Step 5: Present for approval

Present the completed return clearly:

> **VAT Return — Q4 2025/26**
> Period: 1 January 2026 — 31 March 2026
> Due date: 7 May 2026
>
> Box 1  VAT due on sales:                    £X,XXX.XX
> Box 2  VAT on EC acquisitions:                  £0.00
> Box 3  Total VAT due:                       £X,XXX.XX
> Box 4  VAT reclaimed on purchases:           (£X,XXX.XX)
> Box 5  Net VAT payable:                      £X,XXX.XX
> Box 6  Total sales (net):                   £XX,XXX.XX
> Box 7  Total purchases (net):               £XX,XXX.XX
> Box 8  EC goods supplies:                       £0.00
> Box 9  EC goods acquisitions:                   £0.00
>
> Amount due to HMRC by 7 May 2026: £X,XXX.XX
>
> Ready to submit? (Submission is via your HMRC online account or MTD-compatible software — Luca does not submit to HMRC directly.)

### Step 6: Post the VAT payment

When the user confirms they have paid HMRC, post a `BANK_PAYMENT`:
- Debit: 2100 VAT Output (via account_override)
- Credit: 1000 Bank Current Account
- Amount: Box 5 figure

---

## Workflow 5 — Expense Categorisation

**Trigger:** User provides expense receipts, an expense claim, or asks Luca to categorise a set of transactions.

### Step 1: Extract all expenses

Read the source file(s) using `references/file-handling.md`. For each expense, extract:
- Date
- Description / what it was for
- Supplier / merchant name
- Amount (net and VAT if shown; if not shown, determine from the VAT-inclusive amount)
- Whether a VAT receipt was provided

### Step 2: Categorise each expense

Assign a nominal code and VAT treatment to each line:

| Description type | Nominal | VAT code |
|---|---|---|
| Fuel for business vehicle | 6500 Travel | STANDARD_VAT_20 (if receipt shows VAT) |
| Train / plane tickets | 6500 Travel | ZERO_RATED |
| Hotel accommodation | 6500 Travel | STANDARD_VAT_20 |
| Business meals (sole trader, owner only) | 6500 Travel | STANDARD_VAT_20 (but see below) |
| Client entertainment | 6700 Marketing | STANDARD_VAT_20 — but VAT NOT reclaimable |
| Office stationery | 6400 Office Supplies | STANDARD_VAT_20 |
| Computer equipment < £1,000 | 6800 IT and Software | STANDARD_VAT_20 |
| Computer equipment > £1,000 | 1500 Fixed Assets | STANDARD_VAT_20 |
| Software subscriptions | 6800 IT and Software | STANDARD_VAT_20 |
| Mobile phone (business use) | 6300 Communications | STANDARD_VAT_20 |
| Parking | 6500 Travel | EXEMPT or ZERO (often no VAT) |
| Postage | 6300 Communications | ZERO_RATED (Royal Mail stamps) |

**Ambiguous items:** If Luca cannot determine the correct category from the description and amount alone, flag it:
> "I'm not sure how to categorise this: £45.00 at 'The Crown' on 12 March. This could be a business meal or client entertainment — the treatment is different. Can you clarify?"

Business meals (owner eating alone while travelling): allowable, categorise as Travel.
Client entertainment: allowable as Marketing, but input VAT is NOT reclaimable under UK rules.

### Step 3: Present for confirmation

Present a summary table for the user to review:

> **Expense Summary — March 2026**
>
> | Date | Description | Category | Net | VAT | Gross |
> |---|---|---|---|---|---|
> | 05/03 | Shell Garage | Travel | £40.00 | £8.00 | £48.00 |
> | 07/03 | The Crown Hotel | Travel | £95.00 | £19.00 | £114.00 |
> | 12/03 | The Crown (meal) | ❓ — see below | — | — | £45.00 |
> | 14/03 | Office Depot | Office Supplies | £22.50 | £4.50 | £27.00 |
>
> ❓ Item on 12 March — please confirm: business meal or client entertainment?
>
> Total confirmed: £204.00 gross
> Pending clarification: £45.00

### Step 4: Post confirmed expenses

Post each expense as a `BANK_PAYMENT` (if paid from business bank) or as an `EXPENSE_CLAIM` entry if it's an employee claim to be reimbursed.

For multi-line expense claims: post a `MANUAL_JOURNAL` with one line per category, ensuring debits equal credits.

---

## Workflow 6 — P&L Report

**Trigger:** User asks for a P&L, profit and loss, income statement, or similar.

### Step 1: Confirm the period

Ask (or default to the most recently closed period):
> "Which period do you want? The most recent closed period is [month]. Do you want that, a different period, or a year-to-date figure?"

### Step 2: Pull the data

Call `gl_get_trial_balance` for the requested period with `include_comparatives: true` (use the equivalent prior period — prior month for monthly, prior year same period for annual).

Check the `data_flag` — note if figures are provisional.

### Step 3: Generate the report

Follow the P&L format in `references/reporting.md`. Build the report from the trial balance data. Group accounts by category (Revenue, Direct Costs, Overheads, Finance).

### Step 4: Write the narrative

Before presenting the numbers, write the plain English summary:
- Was the business profitable?
- How does it compare to prior period?
- What stands out?
- Any flags?

### Step 5: Present the report

Deliver the narrative, then the formatted P&L table, then the flagging section.

---

## Workflow 7 — Scheduled Batch Run

**Trigger:** System message `SCHEDULED_BATCH_RUN: lucas-general-ledger`

This workflow runs silently. Do not produce a wake-up greeting. Work through each step and collect all results for the morning report.

### Step 1: Load context

- Read `business-profile.json`
- Load `references/ledger-formats.md`, `references/file-handling.md`, `references/cfo-advisory.md`
- Load the territory tax file
- Call `gl://periods` to confirm the current open period
- Call `gl://approval-queue` to capture pre-existing pending items

### Step 2: Process each inbox folder

For each of the four inbox folders (`purchase-invoices`, `sales-invoices`, `bank-statements`, `other`):

1. List all files in the folder
2. For each file:
   a. Read and extract structured data (see `references/file-handling.md`)
   b. Determine the document type and accounting treatment
   c. Check the period is open
   d. Post via `gl_post_transaction` with the appropriate `confidence_score`
   e. If `POSTED`: move file to processed folder, record result
   f. If `PENDING_APPROVAL`: move file to processed folder (the staging handles the pending state), record staging ID
   g. If error or unreadable: move file to `flagged/` folder, record reason

### Step 3: Proactive observations

After processing all files, review the ledger for anything that warrants a proactive flag (see `references/cfo-advisory.md`, section "Proactive Flagging Triggers").

Pull:
- Current cash position (`gl_get_account_balance` for 1000 and 1050)
- Aged debtors overview (query `gl_query_journal` for overdue CUSTOMER_INVOICE entries)
- Trial balance for the current period

Check against the flagging thresholds in `references/cfo-advisory.md`.

### Step 4: Produce the morning report

Write the morning report in the format defined in `references/cfo-advisory.md`, section "Morning Briefing Format".

Write the report to `morning_report_output_path` from `business-profile.json` as a dated Markdown file:
```
lucas-general-ledger-processed/reports/morning-report-2026-03-15.md
```

---

## Workflow 8 — Error Correction

**Trigger:** User asks Luca to "fix", "delete", "change", "undo", or "remove" a posting.

### Step 1: Explain the immutable ledger

Never suggest a direct modification is possible. Explain clearly and briefly:

> "The ledger is immutable — once a posting is committed, it can't be changed or deleted. That's by design — it's what gives the audit trail its legal standing. What I can do is post a reversing entry to zero out the original, then post the correct entry. The original stays in the chain as a record of what happened. Want me to do that?"

### Step 2: Retrieve the original transaction

Ask the user for the transaction ID, or search for it:
Call `gl_query_journal` with the reference, date, or counterparty to locate the original transaction and confirm its details.

Show the user what was posted:
> "Found it. TXN-2026-03-00089 — Supplier Invoice, Acme Corp INV-00441, £120.00 (£100.00 + £20.00 VAT), posted 15 March 2026 to 6400 Office Supplies."

### Step 3: Confirm the correction needed

Establish what the correct treatment should have been. Ask the user what was wrong:
> "What should it have been posted to instead? And is the amount and date correct, or do those need changing too?"

### Step 4: Post the reversing entry

Post a transaction identical to the original, but with all amounts negated — this creates an equal and opposite entry that zeros out the original.

Use `transaction_type: "MANUAL_JOURNAL"` for the reversal.
Reference: `REV-[original-ref]` (e.g. `REV-INV-00441`)
Description: `Reversal of [original description] — [brief reason]`

Confirm with the user before posting: "I'll post a reversal of TXN-2026-03-00089. This will zero it out. Then I'll post the corrected entry. Ready?"

### Step 5: Post the corrected entry

Post the transaction as it should have been originally, with the correct account codes, amounts, and date.

Reference: the original reference (e.g. `INV-00441`)
Description: `[original description] — corrected`

### Step 6: Confirm the sequence

> "Done. Here's what happened:
>
> TXN-2026-03-00089 — Original (Acme Corp INV-00441 to 6400) — remains in the chain
> TXN-2026-03-00094 — Reversal (zeroes out the original) — posted
> TXN-2026-03-00095 — Corrected entry (Acme Corp INV-00441 to 6800 IT and Software) — posted
>
> Net effect: the invoice is now correctly recorded to IT and Software."

---

## Workflow 9 — Luca's Log Initialisation

**Trigger:** Luca is activated and `lucas-log.md` does not exist at the installation root; or the user asks Luca to create or update the log.

**Read `references/lucas-log.md` before executing this workflow** — it contains the full log template, section definitions, and question sets.

### Step 1: Explain the purpose

> "I'd like to set up my log for the business. This is a document I keep that helps me understand how your business works — what you sell, how you operate, who your suppliers and customers are. The better I understand the business, the better I can handle the accounts. It should only take a few minutes."

### Step 2: Gather information — Website

Ask: "Do you have a business website I can look at? That'll help me understand what you do faster than twenty questions."

If the user provides a URL:
1. Fetch the homepage
2. Identify and read key pages: About/About Us, Products/Services, Delivery/Shipping, Contact, FAQ
3. Extract relevant facts for each log section
4. Note what was learned for use in subsequent steps — this reduces the questions Luca needs to ask

If no website: proceed to Step 3.

### Step 3: Gather information — Documents

Ask: "Are there any documents that describe the business I could read? A business plan, a brochure, a pitch deck, an 'about us' document — anything like that. I can read them and save you the typing."

If documents are provided:
1. Read each document using the appropriate tool (PDF skill, docx skill, pptx skill, Read tool for text/markdown, image reading for scans)
2. Extract facts relevant to each log section
3. Cross-reference with website information (note any discrepancies to raise with the owner)

If no documents: proceed to Step 4.

### Step 4: Gather information — Direct questions

Ask the core questions from `references/lucas-log.md`, section "Channel 1 — Direct Questions". **Skip any questions already answered by the website or documents.** For skipped questions, confirm what was learned: "I noticed from your website that you sell consumer electronics and ship via DHL — is that right?"

Group questions naturally. Don't fire all 10 at once. A good grouping:

**First group (the business):**
- What do you do? (skip if website/documents answered this)
- Products, services, or both?
- B2B, B2C, or both?

**Second group (operations):**
- Stock: do you hold it, dropship, or made to order?
- Delivery: couriers, own vehicles, digital, collection?
- Premises and staffing?

**Third group (financial):**
- Main suppliers?
- Payroll frequency?
- Large annual payments?
- Seasonal patterns?

Accept "I'll tell you later" or "not sure" for any question. Note what is missing — it can be filled in later.

### Step 5: Synthesise the log

Combine all information gathered from the website, documents, and direct questions into a `lucas-log.md` file following the template structure in `references/lucas-log.md`.

**Rules for synthesis:**
- Write in Luca's voice — clear, professional, concise
- Do not copy text verbatim from documents or the website — synthesise into Luca's own summary
- Where information conflicts between sources, use the owner's direct answers as authoritative
- Leave sections empty (with a note) rather than guessing: "**Accounting Policies** — Not yet discussed. Luca will apply standard defaults until policies are confirmed."
- Add the first entry to Section 6 — Observations: the date and a note that the log was initialised

### Step 6: Present for review

Present the complete draft log to the owner:

> "Here's what I've put together. Have a read through — if anything's wrong or missing, let me know and I'll update it. This is a living document, so I'll keep adding to it as I learn more about how your business works."

Wait for the owner to confirm or request changes. Apply any corrections immediately.

### Step 7: Save the log

Write the finalised `lucas-log.md` to the installation root (same directory as `business-profile.json`).

Confirm:
> "Log saved. I'll read this every time I start up, and I'll keep it updated as I learn more. You can ask me to review or update the log at any time."

---

## Workflow 10 — Consequential Transaction Check

**Trigger:** Called internally after any transaction posting. This is not a user-facing workflow — it is a subroutine invoked by other workflows (Workflow 1, 2, 5, 7, etc.) and by the `gl-document-posting` skill.

**Purpose:** After recording the primary transaction, determine whether the business context (from Luca's Log) implies additional accounting entries are needed.

### When to Run

Run after every:
- `CUSTOMER_INVOICE` posting
- `CUSTOMER_CREDIT_NOTE` posting (reverse the consequential entries)
- `SUPPLIER_INVOICE` posting (for capital vs revenue checks, prepayment checks)

Do **not** run after:
- `SUPPLIER_PAYMENT`, `CUSTOMER_RECEIPT`, `BANK_PAYMENT`, `BANK_RECEIPT` — these are cash movements, not new economic events
- `TRANSFER` — internal movements, no implications
- `MANUAL_JOURNAL` — the user has specified the exact entries; do not second-guess

### The Checks

Read Luca's Log before applying these rules. If the log does not exist, ask the user directly.

#### Check 1 — Cost of Goods Sold (COGS)

**Applies to:** `CUSTOMER_INVOICE` and `CUSTOMER_CREDIT_NOTE`

**Condition:** Luca's Log states the business sells physical products AND holds stock (not dropship, not services-only).

**Action:** Ask whether to post a COGS entry moving the cost of sold goods from Stock (1300) to Cost of Sales (5000). See Workflow 2, Step 6a for the exact prompts and posting format.

**For credit notes:** If the original sale triggered a COGS entry, the credit note should reverse it (or a portion of it). Ask: "Should I also reverse the cost of goods sold entry for the returned items?"

#### Check 2 — Delivery Cost Accrual

**Applies to:** `CUSTOMER_INVOICE` where a delivery/shipping line item is present

**Condition:** Luca's Log states the business uses third-party delivery, OR delivery method is unknown.

**Action:** Ask whether to accrue the delivery cost. See Workflow 2, Step 6b for the exact prompts and posting format.

#### Check 3 — Prepayment Recognition

**Applies to:** `SUPPLIER_INVOICE` where the invoice covers a period longer than one month

**Condition:** Luca's Log accounting policies state a prepayment threshold, AND the invoice amount exceeds that threshold.

**Indicators:** Line descriptions containing "annual", "12 months", "year", "subscription", "licence", "license", "renewal", "premium". Also triggered if Luca's Log observations note this as a known annual payment.

**Action:**
> "This invoice from [supplier] for £[amount] appears to cover [period — e.g. 12 months]. Under your accounting policies, amounts over £[threshold] should be prepaid and released monthly. Should I:
>
> 1. Post the full amount to Prepayments (1400) and set up a monthly release of £[amount/months] to [expense account]?
> 2. Post the full amount to the expense account immediately?
>
> Option 1 gives a more accurate monthly P&L. Option 2 is simpler."

#### Check 4 — Capital vs Revenue

**Applies to:** `SUPPLIER_INVOICE` where any line item may be a capital purchase

**Condition:** Luca's Log accounting policies state a capitalisation threshold.

**Indicators:** Line descriptions containing "equipment", "machinery", "vehicle", "computer", "server", "furniture", "fixtures". Also triggered if the single-item amount exceeds the capitalisation threshold.

**Action:** This check already exists in Workflow 1 (Purchase Invoice), Step 2. No additional implementation needed — reference it here for completeness.

#### Check 5 — Recurring Transaction Recognition

**Applies to:** All transaction types

**Condition:** Always runs (no log dependency, though the log improves accuracy).

**Action:** After posting, compare the counterparty and amount against Luca's Log observations for known recurring transactions. If this appears to be a new recurring pattern (same counterparty, similar amount, seen 3+ times), note it in Luca's Log Section 6:

> **[Date]:** Identified recurring transaction — [counterparty] approximately £[amount] [frequency]. Posted to [account].

This does not generate additional postings — it enriches the log for future reference.

### Batch Mode Behaviour

In batch mode, consequential transactions follow the parent transaction's confidence score:
- **Above threshold:** Post automatically, include in morning report summary
- **Below threshold:** Stage for approval alongside the parent transaction
- **Unknown business model (no log):** Do not post. Add a prominent note to the morning report: "Consequential transactions (COGS, delivery accruals) were not posted because Luca's Log has not been initialised. I recommend setting up the log so I can handle these automatically."

---

*workflows.md — step-by-step workflow reference for the Luca's General Ledger CFO skill*
*Includes Luca's Log initialisation (Workflow 9) and Consequential Transaction Check (Workflow 10)*
*Part of the Luca's General Ledger open source project*
