# US Tax and Accounting Reference

**Load this file when `tax_territory` in `business-profile.json` is `us`.**
**Load on every activation for US-based businesses.**

> **Professional caveat:** Luca is not a Certified Public Accountant (CPA), tax attorney, or enrolled agent. US tax law is complex, changes frequently, and varies significantly by state. This reference provides general federal-level guidance to support bookkeeping and financial management. For tax filing, planning, complex transactions, or any situation with significant tax implications, the business owner must consult a qualified US tax professional. The IRS provides authoritative guidance at irs.gov — always verify current rules, rates, and thresholds.

---

## US Fiscal Year Conventions

The **standard tax year** in the US is the calendar year: January 1 through December 31. Most small businesses use the calendar year.

A business may elect a **fiscal year** (any 12-month period ending on the last day of any month other than December), but there are restrictions on who can use a fiscal year, and election requires IRS approval in some cases.

**Luca uses the `accounting_year_end` from `business-profile.json`** to determine which year-end to apply. If this is `12-31`, the business is on the calendar year.

---

## Federal Tax Calendar — Key Deadlines

| Filing / Payment | Due Date | Who |
|---|---|---|
| Estimated tax — Q1 | April 15 | Sole proprietors, partners, S-Corp shareholders, self-employed |
| Estimated tax — Q2 | June 15 | Same |
| Estimated tax — Q3 | September 15 | Same |
| Estimated tax — Q4 | January 15 (following year) | Same |
| Individual return (Form 1040) | April 15 | Sole proprietors, individuals with business income |
| Individual return extension | October 15 (with Form 4868 extension request by April 15) | Same |
| Partnership return (Form 1065) | March 15 | Partnerships |
| S-Corp return (Form 1120-S) | March 15 | S-Corporations |
| C-Corp return (Form 1120) | April 15 (calendar year corps) | C-Corporations |
| Corporate extension | 6 months (Form 7004) | All entity types |
| W-2 to employees | January 31 | Employers |
| 1099-NEC to contractors | January 31 | Businesses paying non-employees ≥ $600 |
| FUTA (federal unemployment) annual reconciliation | January 31 | Employers |
| FICA deposits | Varies by deposit schedule (monthly or semi-weekly) | Employers |

**Luca should flag approaching deadlines proactively.** The April 15 deadlines are the most commonly missed — flag in March and early April.

---

## Business Structures — Tax Treatment

### Sole Proprietor

- The simplest structure — the owner and business are one legal entity
- Business income and expenses reported on **Schedule C** (attached to personal Form 1040)
- Net profit (Schedule C line 31) is subject to:
  - **Ordinary income tax** (at the owner's marginal rate)
  - **Self-employment tax** (see below)
- The owner takes "draws" rather than a salary — draws are not a deductible expense
- No separate business tax return required (Schedule C is part of the 1040)

### Single-Member LLC

- Taxed as a **sole proprietor by default** (disregarded entity — same Schedule C treatment)
- Can elect to be taxed as a corporation (Form 8832) — rare for small businesses
- Provides liability protection but has no separate tax treatment from sole proprietor unless an election is made

### Multi-Member LLC

- Taxed as a **partnership by default** — files Form 1065
- Each member receives a K-1 showing their share of income, deductions, and credits
- Each member reports their K-1 income on their personal 1040

### S-Corporation (S-Corp)

- Passes income through to shareholders — files Form 1120-S
- Shareholders receive K-1s — income flows through to personal returns
- Key advantage over sole proprietor: owner-employees must pay themselves a **reasonable salary** (subject to FICA); distributions above salary are not subject to self-employment tax
- This can reduce self-employment tax for profitable businesses — but requires payroll setup
- Restrictions: only US citizens/permanent residents can be shareholders; maximum 100 shareholders; only one class of stock

### C-Corporation (C-Corp)

- Pays corporate income tax at the entity level — does not pass through to shareholders
- **Flat 21% federal corporate tax rate** (as of current law — verify)
- Profits distributed as dividends are taxed again at the shareholder level ("double taxation")
- No self-employment tax on salary for owner-employees, but salary is subject to FICA
- Generally chosen when the business needs to retain earnings, raise investment, or is preparing for a sale or IPO

---

## Federal Income Tax Basics for Businesses

### Sole Proprietors and Pass-Through Entities

Income is taxed at the owner's personal marginal tax rate (after all deductions). Federal income tax brackets are progressive — the more you earn, the higher the rate on the top slice.

Current federal income tax brackets (verify current rates at irs.gov):
- 10%, 12%, 22%, 24%, 32%, 35%, 37% (rates as of recent years — verify for current year)

The **Qualified Business Income (QBI) deduction** (Section 199A): Many pass-through business owners can deduct up to 20% of qualified business income, subject to income limits and restrictions. This can significantly reduce the effective tax rate. Consult a tax professional to determine eligibility.

### C-Corporations

Flat 21% federal corporate income tax rate on net profits.

---

## Self-Employment Tax

Self-employed individuals (sole proprietors, general partners, LLC members taxed as sole proprietors or partnerships) pay **self-employment (SE) tax** in lieu of the employer and employee portions of FICA (Social Security and Medicare).

**Current SE tax rate:** 15.3% of net self-employment income up to the Social Security wage base, then 2.9% above (verify current wage base — approximately $168,600 as of 2024, indexed annually). An additional 0.9% Medicare surtax applies on income above $200,000 (single filers) or $250,000 (married filing jointly).

**Deduction:** One-half of SE tax is deductible as an adjustment to gross income on Form 1040.

**For Luca's General Ledger:** SE tax is not recorded in the business ledger (it's a personal tax). However, Luca should be aware of it when projecting the owner's total tax liability for cash flow planning purposes.

---

## Sales Tax Overview

Sales tax in the US is a **state and local tax** — there is no federal sales tax. This creates significant complexity.

### Key Principles

- 45 states and Washington D.C. have a sales tax (Alaska, Delaware, Montana, New Hampshire, and Oregon do not)
- Rates vary by state and often by county and city within a state — combined rates can range from 0% to over 10%
- What is taxable varies by state: most states tax tangible goods; services are taxed in some states but not others; digital goods and SaaS have varying treatment

### Nexus

A business must collect and remit sales tax only in states where it has **nexus** — a sufficient connection to the state. Nexus can be established by:
- **Physical presence:** office, warehouse, employee, or inventory in the state
- **Economic nexus:** exceeding a revenue or transaction threshold in the state (following the *South Dakota v. Wayfair* Supreme Court decision in 2018, most states have economic nexus thresholds — typically $100,000 in sales or 200 transactions per year)

### Luca's Limitations on Sales Tax

> Luca cannot provide state-specific sales tax advice without knowing the business's full nexus footprint and the specific products and states involved. Sales tax compliance for businesses selling in multiple states is complex specialist territory. Use a sales tax compliance tool (Avalara, TaxJar, Vertex) or consult a tax professional with US sales tax expertise.

What Luca can do: flag when it appears the business may have sales tax obligations based on revenue figures or business description, and recommend getting specialist advice.

---

## 1099 Obligations

A business must issue Form **1099-NEC** to any non-employee (independent contractor, freelancer, unincorporated service provider) paid **$600 or more** during the calendar year for services.

Key rules:
- 1099-NEC covers payments for services performed in the course of a trade or business
- Payments to corporations are generally exempt (with exceptions — lawyers and medical providers must receive 1099s regardless of entity type)
- Payments via credit card or payment network (PayPal, Venmo Business, etc.) are reported by the payment processor on Form 1099-K — the business does not need to issue a separate 1099-NEC for those payments
- Deadline: January 31

**For Luca's General Ledger:** When posting payments to contractors and freelancers, Luca should note the payee name and amount. At year end, Luca can produce a summary of payments to non-employee individuals and unincorporated entities to help the business owner identify who needs a 1099.

Also relevant:
- **1099-INT:** Interest paid of $10 or more
- **1099-MISC:** Rents paid ($600+), certain other payments
- **1099-DIV:** Dividends paid

---

## Estimated Quarterly Tax Payments

Sole proprietors, partners, S-Corp shareholders, and others with income not subject to withholding must make quarterly estimated tax payments to avoid an underpayment penalty.

**Who must pay:** Anyone who expects to owe $1,000 or more in federal tax after subtracting withholding and credits.

**How much to pay:** Either 100% of the prior year's total tax liability (divided into four payments), OR 90% of the current year's expected liability. Paying 110% of the prior year's liability provides a safe harbour if income is higher than prior year (applies to taxpayers with AGI above $150,000).

**State estimated taxes:** Most states with income tax also require estimated quarterly payments on a similar schedule. Luca cannot advise on specific state requirements.

---

## Common Deductible Business Expenses (Federal)

Under IRS rules, business expenses must be **ordinary** (common in your trade or business) and **necessary** (helpful and appropriate for your business) to be deductible.

| Expense | Notes |
|---|---|
| Advertising and marketing | Fully deductible |
| Business insurance | Premiums for property, liability, professional indemnity |
| Car and truck expenses | Business-use portion only. Two methods: actual expenses (track fuel, maintenance, insurance, depreciation) or standard mileage rate ($0.67 per mile for 2024 — verify current rate) |
| Commissions and fees | Paid to employees or contractors |
| Contract labour | 1099 reporting obligations apply |
| Depreciation | For assets placed in service — see Section 179 and bonus depreciation below |
| Employee benefit programs | Health insurance, retirement plan contributions |
| Home office | If a portion of the home is used regularly and exclusively for business — simplified method ($5/sq ft up to 300 sq ft) or actual expense method |
| Interest | On business loans |
| Legal and professional fees | Accountancy, legal, consulting |
| Office supplies | |
| Rent | For business premises — not the home office if using the simplified method |
| Repairs and maintenance | Routine repairs are deductible; improvements must be capitalised |
| Software subscriptions | Business-use software |
| Telephone and internet | Business proportion |
| Travel | Business travel — flights, hotels, ground transport. 50% limit on meals |
| Wages | Salaries and wages to employees |

**Meals:** Generally 50% deductible for business meals (meetings with clients, business travel meals). Entertainment is generally NOT deductible under current law (TCJA 2017 eliminated the entertainment deduction).

### Section 179 and Bonus Depreciation

**Section 179:** Allows immediate expensing of qualifying depreciable assets (equipment, software, vehicles) up to an annual limit (currently $1,160,000 — verify for current year). Reduces the asset's tax basis to nil in year one.

**Bonus depreciation:** Additional first-year depreciation on qualifying assets. Was 100% bonus depreciation for 2022; phasing down by 20% per year (80% in 2023, 60% in 2024, 40% in 2025, 20% in 2026, then 0% unless Congress acts). Verify current year percentage.

**Important:** Section 179 and bonus depreciation are tax deductions, not accounting entries. The accounting ledger records depreciation over the asset's useful life (GAAP or book depreciation). The tax return uses the accelerated deductions. These are different.

---

## GAAP vs Cash Basis Accounting

### GAAP (Generally Accepted Accounting Principles)

GAAP uses the accrual basis: income is recorded when earned, expenses when incurred, regardless of when cash changes hands. Required for publicly traded companies; expected for companies seeking outside investment.

Luca's General Ledger uses accrual accounting by default (`accounting_basis: "accruals"` in `business-profile.json`).

### Cash Basis

Income is recorded when received, expenses when paid. Simpler and more closely tracks cash flow. Permitted for the IRS and for small businesses under GAAP (with restrictions).

If `accounting_basis: "cash"` in the business profile, Luca adjusts posting timing accordingly.

**Note:** For federal tax purposes, most small businesses (average annual gross receipts of $29m or less — verify current threshold) can use the cash method regardless of what their accounting records use. This means the accounting basis and the tax basis may differ — a reality that a tax professional can navigate.

---

*tax/us.md — US federal tax and accounting reference for the Luca's General Ledger CFO skill*
*Part of the Luca's General Ledger open source project*
