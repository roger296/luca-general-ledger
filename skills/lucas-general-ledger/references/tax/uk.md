# UK Tax and Accounting Reference

**Load this file when `tax_territory` in `business-profile.json` is `uk`.**
**Load on every activation for UK-based businesses.**

> **Professional caveat:** Luca is not a qualified accountant, tax adviser, or solicitor. This reference provides guidance on UK tax and accounting rules to support bookkeeping and financial management. For tax planning, complex compliance questions, HMRC enquiries, or any situation with significant financial implications, the business owner should consult a qualified accountant or tax adviser. Tax law changes frequently — Luca's guidance reflects the rules as documented; always verify current rates and thresholds with HMRC or a qualified professional.

---

## The UK Tax Year

The UK tax year runs from **6 April to 5 April** the following year. This dates back to the switch from the Julian to Gregorian calendar in 1752 — and it has never been updated.

**Why it matters for Luca:**
- Self-assessment tax returns cover 6 April to 5 April
- PAYE years align to this calendar
- Corporation tax, however, is based on the company's own accounting year end — which can be any date
- VAT quarters and the Luca's General Ledger accounting periods can both be set independently of the tax year

When the user asks about tax year dates, they usually mean the 6 April − 5 April year. When they ask about their accounting year, they mean the date set in `business-profile.json` under `accounting_year_end`.

---

## Key Annual Deadlines

| Obligation | Deadline | Who |
|---|---|---|
| Self-assessment — paper return | 31 October following tax year end | Sole traders, partners, directors |
| Self-assessment — online return | 31 January following tax year end | Sole traders, partners, directors |
| Self-assessment — payment on account (1st) | 31 January | Sole traders, partners |
| Self-assessment — payment on account (2nd) | 31 July | Sole traders, partners |
| Self-assessment — balancing payment | 31 January following tax year end | Sole traders, partners |
| Corporation tax return (CT600) | 12 months after accounting year end | Limited companies |
| Corporation tax payment | 9 months and 1 day after accounting year end | Small companies |
| Confirmation statement (Companies House) | Annually, 14 days after review date | Limited companies |
| Statutory accounts (Companies House) | 9 months after accounting year end | Limited companies |
| VAT return and payment | 1 month and 7 days after quarter end | VAT-registered businesses |
| PAYE — monthly payment to HMRC | 22nd of following month (electronic) | Employers |
| P60 to employees | By 31 May following tax year end | Employers |
| P11D (benefits in kind) | 6 July following tax year end | Employers |

**Luca should proactively remind the user of approaching deadlines.** Flag the VAT return 2 weeks before the due date. Flag the self-assessment deadline in December and early January. Flag the corporation tax payment deadline 3 weeks before.

---

## Business Structures

### Sole Trader

- The simplest structure — the owner IS the business legally
- Income taxed through self-assessment on personal tax return
- Liable for Class 2 and Class 4 National Insurance contributions
- No legal separation between personal and business assets — unlimited personal liability
- For accounting purposes, treat all business income and expenditure as the business's, but drawings (the owner taking money out) are not a business expense — they are a reduction in equity
- Accounting year end can be any date but is commonly 31 March (close to the tax year end, simplifying the tax computation) or 5 April (matching the tax year exactly)

**Making Tax Digital (MTD) for Income Tax:** Sole traders with qualifying income above £50,000 (reducing to £30,000 from April 2027 — confirm current threshold with HMRC) will be required to use MTD-compatible software for their income tax records. Luca's General Ledger is designed to support this.

### Limited Company

- A separate legal entity from its owners (shareholders)
- Profits taxed through Corporation Tax (not income tax)
- Directors take salary (subject to PAYE and NI) and dividends (taxed differently from salary)
- Financial statements must be filed at Companies House annually
- More administrative overhead than sole trader, but limited liability protection
- Accounting year end is set when the company is incorporated, typically 31 March for new companies but can be changed

**Corporation Tax rates (as of the 2024/25 tax year — verify current rates):**
- Main rate: 25% (profits above £250,000)
- Small profits rate: 19% (profits below £50,000)
- Marginal relief applies between £50,000 and £250,000

### Partnership

- Two or more individuals (or companies) trading together
- Each partner is taxed on their share of profits through self-assessment
- Partnership tax return required in addition to individual returns
- Unlimited liability (in a traditional partnership) — each partner is liable for all partnership debts
- Limited Liability Partnership (LLP): combines limited liability with partnership tax treatment

---

## Making Tax Digital (MTD)

Making Tax Digital is HMRC's programme to move tax administration online. For Luca's General Ledger users:

**MTD for VAT:** Already in effect for all VAT-registered businesses. VAT returns must be submitted through MTD-compatible software with a digital link from the accounting records to the submission. Luca's General Ledger is designed to maintain the digital audit trail that MTD requires. Submission to HMRC is done through the business's MTD-compatible software or agent.

**MTD for Income Tax (MTD ITSA):** Being phased in from April 2026. Requires sole traders and landlords above the qualifying income threshold to:
- Keep digital records of business income and expenses
- Submit quarterly updates to HMRC (not full returns — a summary of income and expenditure)
- Submit a final declaration at the year end

Luca's General Ledger is structured to support this — the ledger provides the digital record, and Luca can produce the quarterly figures needed for the MTD ITSA submission.

---

## VAT

### Rates

| Rate | % | Applies to |
|---|---|---|
| Standard rate | 20% | Most goods and services |
| Reduced rate | 5% | Domestic fuel and power, children's car seats, some energy saving materials, some renovation work |
| Zero rate | 0% | Most food (not catering), children's clothing and footwear, books and newspapers, public transport, new residential construction |
| Exempt | N/A | Financial services, insurance, education, health, some property transactions — no VAT charged and no input VAT recovery |
| Outside scope | N/A | Wages, rates, dividends, some international transactions — outside the VAT system entirely |

**Difference between zero-rated and exempt:** Zero-rated supplies are taxable at 0% — the business is VAT-registered and can recover input VAT on costs related to them. Exempt supplies are not taxable — the business cannot recover input VAT on costs related to exempt supplies. This distinction matters for businesses with mixed supplies.

### Registration Threshold

Current threshold: **£90,000** rolling 12-month taxable turnover (verify with HMRC — this has changed and may change again).

A business must register for VAT within 30 days of the end of the month in which it exceeded the threshold. Voluntary registration below the threshold is permitted and can be advantageous if the business has significant input VAT to recover.

**Deregistration threshold:** A business can apply to deregister when taxable turnover falls below £88,000 (verify current threshold).

### VAT Return Periods and Stagger Groups

Most VAT-registered businesses submit quarterly returns. The quarter end month depends on the stagger group assigned by HMRC:

| Group | Quarter end months |
|---|---|
| Group 1 | 31 March, 30 June, 30 September, 31 December |
| Group 2 | 30 April, 31 July, 31 October, 31 January |
| Group 3 | 31 May, 31 August, 30 November, 28/29 February |

Returns are due **1 month and 7 days** after the quarter end. Payment is due at the same time (for electronic payment).

Monthly returns are available for businesses that consistently reclaim VAT (e.g. zero-rated traders), or that have high turnover.

Annual accounting scheme: one VAT return per year with payments on account throughout the year — available to businesses with turnover below £1.35m.

### The Nine Boxes — Detailed

| Box | Description | Calculation Notes |
|---|---|---|
| Box 1 | VAT due on sales | All VAT on standard, reduced, and reverse charge sales. NOT zero-rated. |
| Box 2 | VAT due on EC acquisitions | VAT on goods acquired from other EU countries (post-Brexit: relevant to Northern Ireland under Windsor Framework) |
| Box 3 | Total VAT due | Box 1 + Box 2 |
| Box 4 | VAT reclaimed on purchases | All recoverable input VAT on business purchases. Excludes: business entertainment, personal use, cars (usually) |
| Box 5 | Net VAT payable / reclaimable | Box 3 minus Box 4. Positive = pay HMRC. Negative = HMRC owes the business. |
| Box 6 | Total value of sales (exc. VAT) | Net value of all sales — standard, reduced, zero-rated, AND exempt. NOT outside-scope. |
| Box 7 | Total value of purchases (exc. VAT) | Net value of all purchases — same scope rule as Box 6 |
| Box 8 | Total value of supplies to EC countries | Goods dispatched to EU VAT-registered customers (relevant to Northern Ireland) |
| Box 9 | Total value of acquisitions from EC | Goods received from EU suppliers (relevant to Northern Ireland) |

### Input VAT — What Can Be Recovered

Generally recoverable:
- Goods and services used exclusively for business purposes
- Business travel (accommodation, public transport, subsistence — receipts required)
- Business telephone calls (on a shared contract, only the business proportion)
- Computer equipment and software used for business
- Professional services (accountancy, legal — on business matters)

Generally NOT recoverable:
- Business entertainment (client dinners, hospitality, corporate events)
- Cars purchased for the business (unless exclusively for business use, e.g. a taxi)
- Personal purchases made on business accounts
- Purchases related to exempt activities

**50% recovery rule for cars:** Input VAT on a car purchase or lease is usually only 50% recoverable if there is any private use — and most business cars have some private use.

### Import VAT and Postponed VAT Accounting (PVA)

When goods are imported into the UK from outside Great Britain, import VAT is normally due at the point of entry.

**Postponed VAT Accounting (PVA):** Available to VAT-registered importers. Instead of paying import VAT at the border and then reclaiming it on the next VAT return, PVA allows the importer to account for it on the VAT return directly:
- Box 1: Include the import VAT (as output VAT)
- Box 4: Include the same amount (as input VAT, if fully recoverable)
- Net effect: the two entries cancel out — no cash payment at the border

In Luca's General Ledger: when `postponed_vat_accounting: true` in `business-profile.json`, use the `POSTPONED_VAT` tax code for import transactions.

### VAT Schemes

**Standard (invoice) accounting:** VAT is accounted for when invoices are issued (sales) and received (purchases), regardless of when payment is made. The most common scheme.

**Cash accounting:** VAT is accounted for when payment is received (sales) and made (purchases). Simpler for businesses with late-paying customers — no VAT on invoices that haven't been paid. Available to businesses with turnover under £1.35m.

**Flat rate scheme:** Available to businesses with turnover under £150,000. Instead of accounting for input and output VAT separately, the business pays a fixed percentage of gross turnover (the rate varies by trade sector). The business still charges 20% VAT to customers, but pays HMRC only the flat rate percentage of the gross. Typically simpler but may cost more than standard accounting for businesses with high input VAT.

**Annual accounting scheme:** One return per year with quarterly payments on account. Available under £1.35m turnover.

### Reverse Charge

The reverse charge applies to certain B2B cross-border services where the recipient of the service (rather than the supplier) accounts for the VAT.

In the UK context:
- **Services received from overseas suppliers:** If a UK business receives services from an overseas supplier who would normally charge VAT, the UK business must account for the VAT itself under the reverse charge. Include in Box 1 (as output VAT) and Box 4 (as input VAT, if recoverable). Net cash effect is usually nil.
- **Domestic reverse charge for construction services:** Applies in the UK construction industry (CIS) — the customer rather than the supplier accounts for VAT on specified construction services.

Tax code to use: `REVERSE_CHARGE`.

### Common VAT Errors to Flag

- Reclaiming VAT on business entertainment — not permitted
- Reclaiming 100% of VAT on a car with mixed business/personal use — should be 50%
- Accounting for VAT on exempt supplies — there is no VAT on exempt supplies
- Missing a reverse charge obligation on overseas service purchases
- Using the wrong VAT rate (e.g. standard-rating something that is zero-rated)
- Not including zero-rated sales in Box 6 — they must be included even though there is no VAT
- Reclaiming VAT on supplier invoices that were never received or are not addressed to the business

---

## Allowable vs Non-Allowable Expenses

### Generally Allowable (deductible against business profits)

- Rent and rates on business premises
- Utilities at business premises
- Business insurance
- Wages, salaries, employer's NI, employer pension contributions
- Raw materials, stock, cost of goods sold
- Professional subscriptions and memberships
- Advertising and marketing
- Accountancy and bookkeeping fees
- Legal fees on business matters
- Business travel (not commuting)
- Staff training related to the current trade
- Office supplies and stationery
- Computer equipment and software (see Capital vs Revenue below)
- Business phone and internet (proportion of personal/business for mixed contracts)
- Bank charges and interest on business loans

### Generally NOT Allowable

- Personal expenses (clothing that could be worn outside work, personal travel, etc.)
- Commuting costs (travel between home and a fixed workplace)
- Entertainment (client dinners, corporate hospitality, staff parties above the annual exemption)
- Fines and penalties (parking fines, HMRC penalties)
- Drawings by the owner of a sole trader or partnership (not wages — wages must be to actual employees)
- Depreciation (as calculated in the accounts — replaced by capital allowances for tax purposes)

**Staff parties:** There is an annual staff entertainment exemption of £150 per person per year. Parties up to this amount per head (including VAT) are allowable. The whole amount becomes non-allowable if the cost per person exceeds £150.

---

## Import Duties

Relevant for businesses importing goods in bulk, particularly from outside the UK.

UK Global Tariff applies to goods imported from non-free-trade-agreement countries. Rates vary enormously by commodity code. Duties are paid to HMRC at the point of import (or deferred via a duty deferment account).

**Recording import duties in the ledger:** Import duties are a cost of acquiring goods and should be included in the cost of the goods for stock valuation purposes, not posted separately to an overhead account. They form part of the landed cost of the goods.

**Customs procedures:** Luca does not advise on customs procedure or tariff classification — this is specialist territory. Recommend a freight forwarder or customs broker for businesses with significant import activity.

---

## Capital vs Revenue Expenditure

This distinction affects how expenditure is reported in the accounts and how it is treated for tax.

**Revenue expenditure:** Day-to-day costs that maintain the current capacity of the business. Deducted in the year they are incurred. Examples: rent, wages, consumables, repairs and maintenance.

**Capital expenditure:** Expenditure that creates an asset or extends the useful life or capacity of the business beyond the current period. Not fully deducted in the year of purchase — instead, depreciation (for accounting) and capital allowances (for tax) spread the cost over the asset's useful life.

**Practical rule of thumb:** If a purchase:
- Has a useful life beyond 12 months, AND
- Costs more than an amount the business would consider material (commonly £500–£1,000)
...it is likely capital expenditure and should be posted to 1500 Fixed Assets.

### Annual Investment Allowance (AIA)

For tax purposes, most capital expenditure on plant and machinery qualifies for the Annual Investment Allowance — a 100% first-year deduction. Current AIA limit: £1,000,000 per year (verify with HMRC — this has changed historically).

This means that for tax purposes, most business equipment purchases can be fully deducted in the year of purchase, even though the accounting treatment spreads the cost through depreciation.

**Important:** The AIA is a tax allowance, not an accounting entry. Luca records depreciation in the accounts (to match accounting standards) and notes the AIA separately when advising on tax. They are different things.

---

## HMRC Mileage Rates

When employees or sole traders use their own vehicle for business travel, HMRC approved mileage rates determine the tax-free reimbursement amount:

| Vehicle | First 10,000 miles (per year) | Over 10,000 miles |
|---|---|---|
| Cars and vans | 45p per mile | 25p per mile |
| Motorcycles | 24p per mile | 24p per mile |
| Bicycles | 20p per mile | 20p per mile |

Passengers in the same vehicle: 5p per mile per passenger (in addition to the driver's rate).

**For posting:** If the business reimburses at the approved rate, the reimbursement is fully allowable as a business expense (6500 Travel and Subsistence) and there is no taxable benefit on the employee. The VAT treatment is complex — HMRC allows a VAT claim on the fuel element of mileage rates, calculated using HMRC's advisory fuel rates.

If the business reimburses at more than the approved rate, the excess is a taxable benefit and must be reported on a P11D.

---

*tax/uk.md — UK tax and accounting reference for the Luca's General Ledger CFO skill*
*Part of the Luca's General Ledger open source project*
