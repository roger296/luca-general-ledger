# Reporting — Reference and Format Guide

**Load this file when the user asks for any report, analysis, trend, or financial summary.**

---

## Luca's Reporting Philosophy

**Plain English first, always.** Every report Luca produces begins with a plain English narrative — one to three paragraphs that explain what the numbers mean. The numbers follow the narrative. They support it. They do not replace it.

A business owner who reads only the narrative summary should come away understanding the key message of the report. A business owner who reads the numbers should find them confirming and expanding on what the narrative said.

**Numbers support the narrative, not the other way round.** Luca does not produce tables of numbers without interpretation. Raw data is not a report.

**Flag what matters.** Below every report, Luca adds a flagging section for anything that warrants attention — unusual figures, trends worth watching, actions that should be taken. If there is nothing to flag, say so briefly: "Nothing unusual to flag."

**Respect the data's reliability.** Always check the `data_flag` from `gl_get_trial_balance` or the period status. If figures are `PROVISIONAL` (period still open), state that clearly. Never present provisional figures as if they are final.

**State the period clearly.** Every report header states the period covered and whether the figures are provisional or final.

---

## Standard Accounting Reports

### Profit & Loss Statement

**MCP calls required:**
1. `gl_get_trial_balance` — for the reporting period, with `include_comparatives: true` if a prior period comparison is requested
2. `gl://periods` — to confirm period status and data flag

**Report structure:**

```
PROFIT & LOSS
[Business Name]
Period: [Month/Quarter/Year ending date]
Figures: [PROVISIONAL — period still open] OR [FINAL — period closed]
[Comparison: vs [prior period] if requested]

                              Current    Prior       Change
                              Period     Period
─────────────────────────────────────────────────────────
REVENUE
  Sales Revenue — Trade       £X,XXX     £X,XXX     +X.X%
  Sales Revenue — Other         £XXX       £XXX
  Other Income                  £XXX       £XXX
─────────────────────────────────────────────────────────
TOTAL REVENUE                 £X,XXX     £X,XXX     +X.X%

DIRECT COSTS
  Cost of Goods Sold           £X,XXX     £X,XXX
  Purchases — Raw Materials    £X,XXX     £X,XXX
─────────────────────────────────────────────────────────
TOTAL DIRECT COSTS            £X,XXX     £X,XXX

─────────────────────────────────────────────────────────
GROSS PROFIT                  £X,XXX     £X,XXX
Gross Margin                   XX.X%      XX.X%

OVERHEADS
  Wages and Salaries           £X,XXX     £X,XXX
  Rent and Rates               £X,XXX
  Utilities                      £XXX
  Communications                 £XXX
  Office Supplies                £XXX
  Travel and Subsistence         £XXX
  Professional Fees              £XXX
  Marketing and Advertising      £XXX
  IT and Software                £XXX
─────────────────────────────────────────────────────────
TOTAL OVERHEADS               £X,XXX     £X,XXX

─────────────────────────────────────────────────────────
OPERATING PROFIT              £X,XXX     £X,XXX
Net Margin                     XX.X%      XX.X%

FINANCE
  Bank Interest Received           £XX
  Bank Charges                    (£XX)
  FX Gains/Losses                 (£XX)
─────────────────────────────────────────────────────────
NET PROFIT                    £X,XXX     £X,XXX
```

**Gross margin calculation:** (Gross Profit / Total Revenue) × 100

**Net margin calculation:** (Net Profit / Total Revenue) × 100

**Narrative summary must address:**
- Whether the business was profitable and by how much
- How gross margin compares to the prior period (if available)
- The largest overhead categories and whether they are in line with expectations
- Any significant movements versus prior period
- One clear observation about the business's profitability position

---

### Balance Sheet

**MCP calls required:**
1. `gl_get_trial_balance` — for the period end date
2. `gl://accounts` — to ensure all accounts are correctly categorised

**Report structure:**

```
BALANCE SHEET
[Business Name]
As at: [Date]
Figures: [PROVISIONAL] OR [FINAL]

ASSETS
─────────────────────────────────────────────────
CURRENT ASSETS
  Bank Current Account         £X,XXX
  Bank Deposit Account         £X,XXX
  Trade Debtors                £X,XXX
  Other Debtors                  £XXX
  VAT Input Recoverable          £XXX
  Stock                        £X,XXX
  Prepayments                    £XXX
─────────────────────────────────────────────────
TOTAL CURRENT ASSETS          £XX,XXX

FIXED ASSETS
  Fixed Assets at Cost         £X,XXX
  Less: Accumulated Depreciation (£X,XXX)
─────────────────────────────────────────────────
NET FIXED ASSETS               £X,XXX

─────────────────────────────────────────────────
TOTAL ASSETS                  £XX,XXX

LIABILITIES
─────────────────────────────────────────────────
CURRENT LIABILITIES
  Trade Creditors              £X,XXX
  Other Creditors                £XXX
  VAT Output                     £XXX
  Accruals                       £XXX
  PAYE/NI Payable                 £XXX
─────────────────────────────────────────────────
TOTAL CURRENT LIABILITIES     £X,XXX

─────────────────────────────────────────────────
TOTAL LIABILITIES             £X,XXX

─────────────────────────────────────────────────
NET ASSETS                    £XX,XXX

EQUITY
  Share Capital                  £XXX
  Retained Earnings            £X,XXX
  Current Period Profit/(Loss) £X,XXX
─────────────────────────────────────────────────
TOTAL EQUITY                  £XX,XXX
```

**Verification:** Total Assets must equal Total Liabilities + Equity. If they do not, there is a data integrity issue — stop and flag it before presenting the report.

**Narrative summary must address:**
- The overall financial position — assets, liabilities, net worth
- The cash/bank position
- The level of debtors and creditors and whether they look reasonable
- Whether the business has net assets or net liabilities
- Any significant items that stand out

---

### Cash Flow Statement

**MCP calls required:**
1. `gl_query_journal` — filtered to bank accounts (1000, 1050) for the period
2. `gl_get_trial_balance` — to reconcile opening and closing positions

**Report structure (indirect method):**

```
CASH FLOW STATEMENT
[Business Name]
Period: [dates]

                                              £
OPERATING ACTIVITIES
  Net Profit / (Loss) for period          X,XXX
  Add back: Depreciation                    XXX
  (Increase) / Decrease in Debtors        (XXX)
  (Increase) / Decrease in Stock          (XXX)
  Increase / (Decrease) in Creditors        XXX
  Increase / (Decrease) in VAT payable      XXX
─────────────────────────────────────────────
NET CASH FROM OPERATIONS                  X,XXX

INVESTING ACTIVITIES
  Purchase of Fixed Assets               (X,XXX)
  Proceeds from Asset Sales               X,XXX
─────────────────────────────────────────────
NET CASH FROM INVESTING                  (X,XXX)

FINANCING ACTIVITIES
  Capital introduced                      X,XXX
  Drawings / dividends                   (X,XXX)
  Loan proceeds                           X,XXX
  Loan repayments                        (X,XXX)
─────────────────────────────────────────────
NET CASH FROM FINANCING                   X,XXX

─────────────────────────────────────────────
NET MOVEMENT IN CASH                      X,XXX
Opening cash balance                      X,XXX
Closing cash balance                      X,XXX
```

**Verification:** Closing cash balance must equal the bank account balance(s) from the trial balance. If there is a difference, note it and investigate.

**Narrative summary must address:**
- Whether the business generated or consumed cash in the period
- The quality of cash generation — is profit converting to cash?
- Significant investing or financing activity
- The closing cash position and whether it appears adequate

---

### Aged Debtors Report

**Purpose:** Shows how much is owed to the business by customers, and how long each balance has been outstanding.

**MCP calls required:**
1. `gl_query_journal` — filtered by `account_code: "1100"` (Trade Debtors) and `transaction_type: "CUSTOMER_INVOICE"`, for all open invoices
2. `gl_get_account_balance` — for account 1100 to cross-check the total

**Report structure:**

```
AGED DEBTORS
[Business Name]
As at: [Date]

Customer             Current    30-60 days   60-90 days   90+ days   Total
─────────────────────────────────────────────────────────────────────────────
[Customer A]         £X,XXX                              £X,XXX      £X,XXX
[Customer B]           £XXX      £X,XXX                              £X,XXX
[Customer C]                                   £XXX                    £XXX
─────────────────────────────────────────────────────────────────────────────
TOTAL               £XX,XXX      £X,XXX        £XXX       £X,XXX     £XX,XXX
```

Flag any balance in the 60-90 or 90+ days columns. A balance over 90 days outstanding should be called out specifically: "Customer A has £X,XXX outstanding for over 90 days. This may need chasing or a bad debt provision."

---

### Aged Creditors Report

**Purpose:** Shows how much the business owes to suppliers and how long each balance has been outstanding.

**Structure:** Identical to Aged Debtors, but filtered to account 1100 (Trade Creditors) and SUPPLIER_INVOICE transactions.

Flag any balance in the 60+ days columns — it may indicate a payment problem or a disputed invoice worth investigating.

---

## CFO-Level Business Analysis

### Trend Analysis

**When to run:** Explicitly requested, or proactively when Luca has access to multiple periods of data.

**MCP calls required:**
- `gl_get_trial_balance` for each of the last 6 months (or quarters)

**What to show:** Revenue, gross profit, gross margin %, net profit, net margin %, and total overheads — plotted month by month (presented as a table, with direction indicators).

```
TREND ANALYSIS — Last 6 Months
[Business Name]

Month        Revenue    Gross Profit   Gross Margin   Net Profit   Net Margin
────────────────────────────────────────────────────────────────────────────
Oct 2025     £X,XXX       £X,XXX          XX.X%        £X,XXX       XX.X%
Nov 2025     £X,XXX       £X,XXX          XX.X%        £X,XXX       XX.X%
Dec 2025     £X,XXX       £X,XXX          XX.X%        £X,XXX       XX.X%
Jan 2026     £X,XXX       £X,XXX          XX.X%        £X,XXX       XX.X%
Feb 2026     £X,XXX       £X,XXX          XX.X%        £X,XXX       XX.X%
Mar 2026     £X,XXX       £X,XXX          XX.X%        £X,XXX       XX.X%
────────────────────────────────────────────────────────────────────────────
6m avg       £X,XXX       £X,XXX          XX.X%        £X,XXX       XX.X%
Trend        ↑ +X.X%      ↑ +X.X%       ↑/↓/→         ↑ +X.X%     ↑/↓/→
```

**Narrative must address:**
- The direction of revenue — growing, flat, or declining?
- Whether margin is holding up as revenue changes (revenue growth with margin compression is a warning sign)
- Whether overhead growth is proportionate to revenue growth
- Any seasonal patterns visible in the data

---

### Margin Analysis

**When to run:** Requested, or when Luca notices significant margin movement in trend data.

**Purpose:** Identify which parts of the business are most and least profitable.

If the chart of accounts includes multiple revenue lines (4000, 4100, 4200) and corresponding cost centres, Luca can break down margin by income stream. If cost centres are not in use, the analysis is at the business level.

**What to present:**
- Gross margin by revenue line (if data available)
- Gross margin trend over the period
- The relationship between overhead growth and revenue growth
- Any line items that appear disproportionate

**Key question Luca should answer:** "Where is this business making money, and where is it leaking it?"

---

### Cash Runway Analysis

**When to run:** When asked, when cash balances are declining, or as a proactive observation in any period where cash has fallen.

**MCP calls required:**
1. `gl_get_account_balance` for accounts 1000 and 1050 (all bank accounts)
2. `gl_get_trial_balance` for the last 3 months — to calculate average monthly cash burn

**Calculation:**
- Current cash = sum of all bank account balances
- Average monthly net cash movement = (cash balance 3 months ago − current cash balance) / 3
- If net movement is negative (cash declining): runway = current cash / average monthly decline

**Presentation:**

```
CASH RUNWAY
Current cash position:   £XX,XXX
Average monthly burn:    £X,XXX  (3-month average)
Estimated runway:        X months  (based on current burn rate)
```

**Thresholds:**
- Runway > 6 months: no immediate concern, note in passing
- Runway 3–6 months: flag as "worth keeping an eye on"
- Runway under 3 months (90 days): **flag prominently** — "At the current rate, the business has approximately X months of cash remaining. This warrants attention."
- Runway under 1 month: escalate — "This is urgent. Cash is critically low."

**Narrative must address:**
- The current cash position
- The burn rate and what is driving it
- How long the runway is at current rates
- What could extend or shorten it

---

### Anomaly Detection

**When to run:** As part of any period review, or explicitly requested.

**What Luca looks for:**
- Transactions significantly larger than the average for that account (more than 3× the monthly average is a starting threshold)
- Unusual transaction types or counterparties not seen before
- Duplicate references — same reference number appearing twice
- Transactions posted to accounts that don't match their description (e.g. a large amount in Office Supplies that looks more like a capital item)
- Revenue or expense line items spiking or collapsing without explanation
- VAT input claimed on expense types that are not normally VAT-reclaimable

**How to flag anomalies:**
> "There's a transaction worth noting: on [date], £X,XXX was posted to [account] with reference [ref]. This is [X]× the usual monthly figure for this account. It may be entirely legitimate — worth confirming it posted to the right account."

Do not accuse. Flag, explain, and ask.

---

### Working Capital Assessment

**When to run:** When asked, or as part of an annual review or CFO advisory session.

**MCP calls required:**
1. `gl_get_trial_balance` for the current period

**Calculations:**

Current Ratio = Total Current Assets / Total Current Liabilities
- Above 2.0: strong working capital position
- 1.0–2.0: adequate — acceptable for most businesses
- Below 1.0: current liabilities exceed current assets — flag as a potential liquidity concern

Quick Ratio = (Current Assets − Stock) / Current Liabilities
- Excludes stock because stock may not be immediately convertible to cash
- Above 1.0: the business can meet short-term obligations without selling stock
- Below 1.0: flag — the business depends on stock conversion to meet short-term debts

**Presentation:**

```
WORKING CAPITAL
Current Assets:         £XX,XXX
Current Liabilities:     £X,XXX
─────────────────────────────────
Working Capital:        £XX,XXX
Current Ratio:               X.X  [Strong / Adequate / Concern]
Quick Ratio:                 X.X  [Strong / Adequate / Concern]
```

**Narrative:** Explain what the ratios mean in plain English. "The business has £X in current assets for every £1 of current liabilities, which means it is well placed to meet its short-term obligations." Or, if the position is weak: "The current ratio suggests the business may struggle to meet short-term obligations from current assets alone. This is worth monitoring."

---

## Report Formatting Rules

1. **Always state the period and whether figures are provisional or final** — in the header, not buried in a footnote.

2. **Always include a plain English narrative** — before the numbers, not after.

3. **Comparative periods:** Whenever practical and when data is available, include a prior period comparison. Prior period = same period last year for annual views; previous month for monthly views; previous quarter for quarterly views.

4. **Nil figures:** If an account has a zero balance for the period, omit it from the report (unless its absence is itself notable — e.g. expected revenue that is not there).

5. **Rounding:** Round to the nearest penny for individual transactions. Round to the nearest pound in summary tables for readability. State "figures rounded to nearest £" if rounding is applied.

6. **Flagging section:** Always end the report with a flagging section, even if empty. Use "Nothing unusual to flag." rather than omitting the section — this tells the user that Luca checked, not that Luca forgot.

---

*reporting.md — reporting reference for the Luca's General Ledger CFO skill*
*Part of the Luca's General Ledger open source project*
