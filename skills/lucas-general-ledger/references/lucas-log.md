# Luca's Log — Business Knowledge Document

**Load this file when:**
- Initialising a new installation (to understand the template and process)
- Any activation where Luca needs to understand the business context (i.e. always — but the log itself lives at the installation root, not here)

This reference file describes **what Luca's Log is**, **how to build it**, and **how to maintain it**. The actual log for each installation is a separate file (`lucas-log.md`) stored alongside `business-profile.json` in the installation root.

---

## What Is Luca's Log?

Luca's Log is a plain-English markdown document that describes how a specific business works. It is written by Luca, for Luca — so that any future session has the context a financial controller would need on their first day.

The log answers the questions: What does this business do? How does it make money? How does it operate? What are the patterns and relationships that affect the accounts?

Without the log, Luca can post transactions correctly but cannot reason about their implications. With the log, Luca knows that a customer invoice for physical products means stock has moved, that a delivery charge means a courier cost is coming, and that a large payment in March is probably the annual insurance renewal.

---

## Where the Log Lives

The log file is `lucas-log.md` in the installation root — the same directory as `business-profile.json`. It is **not** part of the skill files. Each installation has its own log because each business is different.

**Path resolution:** Same as `business-profile.json` — passed via the MCP server environment, or `./lucas-log.md` relative to the installation root if not configured.

---

## When to Read the Log

**Every activation.** The log is loaded at step 2 of the startup sequence, immediately after `business-profile.json`. It is lightweight by design — a few hundred lines at most — so the context cost is justified by the improvement in Luca's reasoning.

If the log does not exist, Luca offers to create it (see Initialisation below).

---

## Log Structure

The log is organised into these sections. Not all sections will be populated at initialisation — some grow over time as Luca learns from transactions and interactions.

### Section 1 — The Business

**Purpose:** What the company does, in the language a person would use to describe it.

**Contents:**
- Business name and trading name (if different)
- What the business sells — physical products, professional services, digital products, food/drink, or a combination
- Who the customers are — consumers (B2C), other businesses (B2B), public sector, or a mix
- Revenue model — one-off sales, recurring subscriptions, project-based fees, retail transactions, wholesale
- Industry or sector — enough to contextualise the accounts (e.g. "e-commerce retailer selling consumer electronics" or "IT consultancy serving mid-market financial services firms")
- Brief description of the business in 2–3 sentences, as Luca would explain it to another accountant

**Example:**
```markdown
## The Business

CleverDeals Ltd is an e-commerce retailer selling consumer products through its own website
(cleverdeals.co.uk). The business model is B2C — products are purchased from suppliers, held
in stock, and shipped to individual customers via third-party couriers. Revenue comes from
product sales plus delivery charges passed on to customers. The company also earns a small
amount from affiliate commissions on partner products.
```

### Section 2 — Operations

**Purpose:** How the business fulfils its commitments — the operational facts that affect the accounts.

**Contents:**
- **Stock and fulfilment:** Does the business hold physical stock? If so, where (own warehouse, third-party logistics, home storage)? Does it manufacture, assemble, or resell? Is it dropship or made-to-order? What stock valuation method is used (FIFO, weighted average, specific identification)?
- **Delivery:** How are goods delivered to customers? Own vehicles, third-party couriers (name them if known), digital delivery, collection? Who bears the shipping cost — the business, the customer, or shared?
- **Premises:** What premises does the business operate from? Office, warehouse, retail, workshop, home-based? Owned or rented?
- **Staffing:** How many people work in the business? Are they employees or contractors? What is the payroll cycle (weekly, fortnightly, monthly)?
- **Key systems:** What software or platforms does the business use that generate financial data? (e.g. Shopify, Xero, Stripe, PayPal, Amazon Seller Central)

**Example:**
```markdown
## Operations

Stock is purchased from UK and international suppliers and held in a rented warehouse unit
in Manchester. The business does not manufacture — it resells finished goods. Stock is valued
using weighted average cost.

Orders are fulfilled in-house (picked and packed at the warehouse) and shipped via DHL Express
for UK deliveries and Royal Mail for smaller items. Customers are charged a flat delivery fee
of £4.99 per order. The actual delivery cost varies by carrier and parcel size — typically
£3.50–£6.00 per shipment.

The business operates from the warehouse unit (no separate office). Three full-time staff:
the owner, a warehouse operative, and a part-time bookkeeper. Payroll is monthly.

Sales are processed through Shopify (website platform) with payments via Stripe and PayPal.
```

### Section 3 — Key Commercial Relationships

**Purpose:** Who does the business buy from and sell to, and on what terms? This helps Luca recognise counterparties on invoices and predict cash flow patterns.

**Contents:**
- Major suppliers — name, what they supply, typical payment terms, approximate monthly spend
- Major customers — name (if B2B), typical order pattern, payment terms
- Key service providers — accountant, solicitor, IT support, insurance broker
- Any recurring contractual commitments — annual licences, maintenance contracts, lease agreements

This section grows as Luca processes transactions. At initialisation, capture whatever the owner can tell you. Over time, Luca fills in the detail from actual invoices.

**Example:**
```markdown
## Key Commercial Relationships

### Suppliers
- **Shenzhen Electronics Co** — primary product supplier, orders placed monthly, paid by bank
  transfer on 30-day terms. Invoices in USD, typically $8,000–$15,000/month.
- **DHL Express UK** — courier services, weekly invoices on 14-day terms, typically £800–£1,200/month.
- **Shopify** — e-commerce platform, monthly subscription £79/month by direct debit.
- **Stripe** — payment processing, fees deducted at source from settlements.

### Customers
Primarily individual consumers via the website. No single customer accounts for more than 1%
of revenue. Average order value approximately £45.

### Service Providers
- Accountant: Smith & Co, Manchester — annual accounts and tax return, fee approximately £2,500/year.
- Insurance: Hiscox — combined business insurance, annual premium £1,800, renews each September.
```

### Section 4 — Financial Patterns

**Purpose:** The rhythms and patterns of the business that affect cash flow, accruals, and forecasting. These are things a financial controller would pick up after a few months in the role.

**Contents:**
- Payroll dates and approximate amounts
- VAT quarter ends and typical net VAT position
- Seasonal revenue patterns — are there peak months?
- Large annual or quarterly payments and their due dates
- Typical debtor days (B2B) — how long customers take to pay
- Typical creditor days — how long the business takes to pay suppliers
- Any known cash flow pinch points

This section is mostly built by observation over time, but the owner can seed it with known patterns at setup.

**Example:**
```markdown
## Financial Patterns

Payroll runs on the 28th of each month — approximately £6,500 gross (3 staff).
VAT returns are quarterly (stagger group 1: Mar/Jun/Sep/Dec). Typical net VAT payment: £3,000–£4,500.

Revenue is seasonal — peak months are November and December (Black Friday / Christmas),
accounting for approximately 35% of annual revenue. January and February are the quietest months.

Major annual payments:
- Insurance renewal: September, approximately £1,800
- Accountancy fee: January, approximately £2,500
- Domain and hosting renewals: March, approximately £500

Cash is typically tightest in January–February (post-Christmas stock purchases paid, low revenue).
```

### Section 5 — Accounting Policies

**Purpose:** Decisions about how the business accounts for things — beyond what is captured in `business-profile.json`. These are the policies a financial controller needs to apply consistently.

**Contents:**
- Depreciation method and rates for each asset class
- Capitalisation threshold (below which items are expensed immediately)
- Stock valuation method (also noted in Operations, but restated here as a policy)
- Bad debt provisioning policy
- Prepayment and accrual policy — does the business prepay/accrue, and if so, what threshold?
- Revenue recognition policy (if not straightforward point-of-sale)
- Foreign currency policy — how exchange rates are determined, when FX gains/losses are recognised

This section may be sparse for small businesses. That is fine — Luca notes the defaults he will apply in the absence of a stated policy.

**Example:**
```markdown
## Accounting Policies

- **Depreciation:** Straight-line. Computer equipment: 3 years. Warehouse fixtures: 5 years.
  Vehicles: 4 years. All from the month of purchase.
- **Capitalisation threshold:** £500. Items below this are expensed immediately.
- **Stock valuation:** Weighted average cost. Stock count performed quarterly.
- **Bad debts:** Not applicable (B2C, payment at point of sale). If B2B sales are introduced,
  provision at 90 days overdue.
- **Prepayments:** Accrue annual costs over 12 months if the amount exceeds £500.
- **Revenue recognition:** At point of dispatch (when goods leave the warehouse).
```

### Section 6 — Luca's Observations

**Purpose:** This is the section that makes Luca progressively smarter. It captures things Luca has learned from processing transactions that are not obvious from the setup information.

**How it grows:** After processing batches of transactions, reconciling the bank, or preparing reports, Luca may notice patterns, anomalies, or facts worth recording. These are added here with a date stamp.

**What belongs here:**
- Supplier patterns ("DHL always invoices on a Friday, payment due the following Friday")
- Customer patterns ("Revenue is concentrated in the first two weeks of the month")
- Recurring transaction patterns ("There is a £29.99 direct debit to Adobe on the 15th of each month")
- Corrections and clarifications from the business owner ("The owner confirmed that payments to 'J Smith' are director's loan repayments, not supplier payments")
- Changes in the business ("As of March 2026, the business has started selling on Amazon Marketplace in addition to the Shopify website")

**What does not belong here:**
- Individual transaction details (those are in the ledger)
- Anything that duplicates the ledger or the audit trail
- Temporary notes that will not be relevant next month

**Example:**
```markdown
## Luca's Observations

**2026-03-15:** First batch run processed. Identified 3 regular suppliers: Shenzhen Electronics,
DHL Express, and Shopify. The Shenzhen invoices are in USD — exchange rate confirmed by the owner
at the rate shown on the invoice.

**2026-03-22:** Bank reconciliation revealed a monthly direct debit of £79.00 to "SHOPIFY INT"
and £14.99 to "MAILCHIMP" — both are software subscriptions posted to 6800 IT and Software.

**2026-04-01:** Owner mentioned that the business is trialling Amazon FBA for a subset of products.
If this continues, there will be Amazon settlement statements to process and FBA fees to categorise.
Revenue from Amazon sales should still go to 4000 but may warrant a separate tracking code in future.
```

---

## Initialisation Process

When Luca is activated for the first time on an installation where `lucas-log.md` does not yet exist, Luca offers to create it. The initialisation process has three input channels, used in combination:

### Channel 1 — Direct Questions

Luca asks the business owner a focused set of questions. These are not an interrogation — Luca asks conversationally, grouping related questions, and accepts "I'll tell you later" for anything the owner doesn't know or want to answer right now.

**Core questions (always ask):**

1. "What does your business do? Give me the version you'd tell someone at a networking event."
2. "Do you sell physical products, services, or both?"
3. If products: "Do you hold stock yourself, or is it dropshipped / made to order?"
4. If products: "How do you get goods to your customers — your own delivery, couriers, digital, or collection?"
5. "Who are your customers — individual consumers, other businesses, or both?"
6. "Do you have a business website I can look at? That'll help me understand what you do faster than twenty questions."
7. "Are there any documents you could share that describe the business — a business plan, a brochure, a pitch deck, an 'about us' page? I can read those and save you the typing."
8. "How many people work in the business, and how often does payroll run?"
9. "Who are your main suppliers — the ones whose invoices I'll see most often?"
10. "Are there any large annual payments I should know about — insurance, subscriptions, rate demands?"

**Follow-up questions (ask if relevant based on answers):**

- If products with stock: "How do you value your stock — first in first out, average cost, or something else?"
- If foreign suppliers: "Do you get invoices in foreign currencies? How do you usually handle the exchange rate?"
- If the business has been trading for a while: "Are there any seasonal patterns in your revenue — busy months, quiet months?"
- If B2B: "What payment terms do you give your customers? And how long do they typically take to pay?"

### Channel 2 — Website Analysis

If the business owner provides a website URL, Luca reads it to extract business intelligence. This is the equivalent of a new employee Googling their new employer before their first day.

**What Luca looks for on the website:**

- **About / About Us page:** Business description, history, team, values — useful for Section 1
- **Products / Services pages:** What the business sells, pricing model, product categories — useful for Sections 1 and 2
- **Delivery / Shipping information:** Delivery methods, costs, timescales — useful for Section 2
- **Contact / Location pages:** Where the business operates from — useful for Section 2
- **FAQ / Help pages:** Often reveal operational details (returns policy, payment methods accepted)
- **Blog / News:** May reveal recent changes, new product lines, or business developments
- **Footer:** Often contains company registration number, VAT number, registered address

**Process:**
1. Fetch the homepage and identify the site structure
2. Read the key pages listed above (prioritise About, Products/Services, Delivery)
3. Extract relevant facts and cross-reference with what the owner has already said
4. Note anything the website reveals that the owner did not mention — bring it up conversationally: "I noticed from your website that you also offer gift wrapping — should I expect to see that as a separate revenue line?"

**Important:** The website is a public source of information about the business. Luca uses it the way any new employee would — to build context, not to make assumptions. If the website says one thing and the owner says another, the owner's word takes precedence.

### Channel 3 — Document Analysis

The business owner may provide documents that describe the business — business plans, corporate brochures, investor decks, bank loan applications, insurance summaries, or any other material that gives Luca a richer picture.

**How Luca handles provided documents:**

1. Read the document in full using the appropriate tool (PDF skill for PDFs, Read for text/markdown, image reading for scanned documents, pptx skill for presentations, docx skill for Word documents)
2. Extract facts relevant to each section of the log
3. Cross-reference with information already gathered from questions and the website
4. Note any discrepancies or gaps — ask the owner about them
5. Do **not** copy large blocks of text verbatim from the document — Luca synthesises the information into the log in Luca's own voice

**What Luca looks for in common document types:**

| Document Type | Key Information to Extract |
|---|---|
| Business plan | Business model, target market, revenue projections, cost structure, growth strategy |
| Corporate brochure | Products/services offered, positioning, key selling points |
| Pitch deck / investor presentation | Business model, unit economics, market size, team structure |
| Insurance schedule | Assets insured, renewal dates, premium amounts |
| Bank loan application | Financial projections, asset register, existing liabilities |
| Lease agreement | Premises details, rent amount, lease term, break clauses |
| Employment contracts (summary) | Staff count, salary levels, notice periods |

### Combining the Channels

Luca does not need all three channels to create a useful log. A conversation alone is enough to get started. The website and documents add richness and reduce the number of questions Luca needs to ask.

**Recommended order:**
1. Ask if the owner has a website → if yes, read it first (this gives Luca context for smarter follow-up questions)
2. Ask if there are any documents to share → if yes, read them
3. Ask the direct questions, skipping any that have already been answered by the website or documents
4. Synthesise everything into the log

After initialisation, present the draft log to the owner for review:

> "Here's what I've put together for my log. Have a read through — if anything's wrong or missing, let me know and I'll update it. This is a living document, so I'll keep adding to it as I learn more about how your business works."

---

## Maintaining the Log

### When Luca Updates the Log

Luca adds to the log (primarily Section 6 — Observations, but also correcting/enriching other sections) when:

- A new supplier or customer pattern is identified during transaction processing
- The business owner corrects an assumption or provides new information
- A batch run reveals a previously unknown recurring transaction
- A bank reconciliation reveals a pattern (regular direct debits, seasonal cash movements)
- The business owner mentions a change in operations ("we've switched couriers" / "we've hired someone")

### How Luca Updates the Log

- Read the current log before making changes
- Add observations to Section 6 with a date stamp
- Update factual sections (1–5) when the information changes, not when observations are made — wait until the fact is confirmed
- Keep the log concise — if an observation in Section 6 has matured into a confirmed fact, promote it to the relevant section and remove the observation
- Never delete information from the log without the owner's knowledge — if something is wrong, correct it and note why

### Periodic Review

At year end (or when the owner asks), Luca reviews the entire log:

> "It's been [X months] since I last reviewed my log. I'd like to go through it with you to make sure everything is still accurate — businesses change, and I want to make sure my understanding has kept up. This should only take a few minutes."

Review each section, confirm or update, and clean up any observations that have been superseded.

---

## Using the Log in Day-to-Day Work

The log is not just a reference document — it actively shapes Luca's behaviour. Here is how each section influences Luca's work:

| Log Section | How It Affects Luca's Behaviour |
|---|---|
| The Business | Determines which consequential transaction rules apply (see gl-document-posting). A service business does not trigger stock movement checks. |
| Operations | Tells Luca whether to ask about COGS entries, delivery accruals, and stock valuations. Also determines whether FX handling is routine or exceptional. |
| Key Relationships | Helps Luca recognise suppliers and customers on invoices, predict which invoices to expect, and flag unexpected counterparties. |
| Financial Patterns | Feeds into cash flow forecasting, VAT deadline awareness, and proactive flags about upcoming large payments. |
| Accounting Policies | Ensures Luca applies the correct depreciation rates, capitalisation threshold, and valuation methods without asking every time. |
| Observations | Provides the accumulated context that makes Luca's categorisation faster and more accurate over time. |

---

*lucas-log.md — reference file for building and maintaining Luca's Log*
*Part of the Luca's General Ledger open source project*
