# EU VAT and Tax Reference — Common Framework

**Load this file when `tax_territory` in `business-profile.json` is any `eu_*` value.**
**Also load the country-specific file if one exists for the member state.**

> **Professional caveat:** EU tax law is complex, changes regularly, and is implemented differently in each of the 27 member states. This reference covers the common EU framework — the Directives and regulations that apply across all member states. Country-specific implementation details (exact rates, domestic reporting formats, registration thresholds) vary significantly. For country-specific advice, VAT registration questions, cross-border transactions, or any situation with significant tax implications, Luca strongly recommends consulting a local tax adviser qualified in the relevant member state. Current rates and thresholds should always be verified at the European Commission's VAT Information Exchange System (VIES) and the relevant national tax authority.

---

## The EU VAT Directive — The Framework

EU VAT operates under the **EU VAT Directive** (Council Directive 2006/112/EC and its amendments). This is the primary legal framework that all member state VAT systems derive from. Member states implement the Directive through their own national legislation, which means the rules are consistent in structure but differ in detail.

**Key principles common across all member states:**

- VAT is a **consumption tax** — it is borne by the final consumer, not by businesses in the supply chain
- Businesses act as **tax collectors** — they charge VAT on their sales (output VAT) and recover the VAT they paid on their purchases (input VAT)
- The difference is remitted to the tax authority — businesses pay over only the net VAT they have collected
- VAT is **destination-based** — it is generally paid where the consumer is located, not where the seller is

---

## VAT Rates Across Member States

The EU VAT Directive requires each member state to have:
- A **standard rate** of at least 15% (in practice, all member states set this at 17–27%)
- An optional **reduced rate** of at least 5% for specified goods and services
- An optional **super-reduced rate** below 5% for limited specified categories
- Zero rating is permitted for some goods and services in states that applied it before joining the EU

**Luca cannot list current rates for every member state** — these change and vary significantly. Always verify the current rate for the member state in question at:
- European Commission VAT Rates page: ec.europa.eu/taxation_customs/tedb/
- Or the national tax authority of the relevant member state

**How to determine the correct rate:** The standard rate of the customer's member state generally applies to B2C sales. For B2B sales, the reverse charge mechanism usually applies (see below). The correct rate depends on the supply type, the parties involved (B2B or B2C), and the location of each.

---

## Intra-Community Supplies (Goods Between EU Member States)

### B2B — Intra-Community Supply of Goods

When a VAT-registered business in one EU member state supplies goods to a VAT-registered business in another member state:

1. The supplier **zero-rates** the supply (no VAT charged)
2. The customer **self-accounts** for VAT in their own member state (acquisition VAT)
3. The supplier must verify the customer's VAT number using VIES (ec.europa.eu/vies)
4. The supplier must include the supply on their EC Sales List (see Reporting Obligations below)

**Conditions for zero-rating:**
- The goods must physically move from one member state to another
- The customer must be VAT-registered in another member state
- The supplier must have evidence of the goods' departure (shipping documents, CMR, transport records)
- The customer's VAT number must be valid (check via VIES before each supply)

If any condition is not met, the supplier must charge VAT at the standard rate of their own member state.

### B2C — Distance Selling (Goods to Private Individuals)

When a business sells goods to private consumers in other EU member states, the destination country's VAT rate applies once the business's sales to that country exceed the relevant threshold.

From July 2021, the EU introduced a harmonised cross-border threshold of **€10,000 per year** across all EU member states combined (for goods and digital services). Once this threshold is exceeded, the business must either:
- Register for VAT in every member state where their customers are located, OR
- Register for the **One Stop Shop (OSS)** scheme (see below)

---

## Intra-Community Acquisition of Goods

When a VAT-registered business purchases goods from a supplier in another EU member state:

1. The supplier zero-rates their supply
2. The purchasing business accounts for **acquisition VAT** in their own member state:
   - Declare the VAT as output tax (as if they had charged themselves)
   - If the purchase is for business use, simultaneously recover it as input tax
   - Net cash effect: usually nil for fully taxable businesses

The acquisition must be declared on the VAT return (in most member states this corresponds to the equivalent of UK Boxes 2 and 9).

---

## Reverse Charge on Cross-Border B2B Services

The **general rule** for B2B services under EU VAT (Article 44 of the VAT Directive): Services supplied B2B are taxed where the **recipient** (customer) is established. This means:

- When an EU business receives services from a supplier in another EU member state (or from outside the EU), the recipient accounts for VAT under the **reverse charge mechanism**
- The supplier does not charge VAT; the recipient declares output VAT and (if the service is for business use) simultaneously recovers it as input VAT
- Net cash effect: usually nil for fully taxable businesses

**Exceptions:** Some services are taxed where they are physically performed (e.g. services connected with immovable property, cultural events, restaurant services). The general rule should not be applied to these without confirming the specific treatment.

**For Luca:** When posting services received from EU suppliers or overseas suppliers where reverse charge applies, use the `REVERSE_CHARGE` tax code. The posting creates matching output and input VAT entries.

---

## The One Stop Shop (OSS) Scheme

OSS was introduced in July 2021 to simplify VAT compliance for businesses selling goods or services across EU member states to consumers (B2C).

### Who it applies to

- Businesses selling goods or digital services to consumers in multiple EU member states
- Businesses that exceed the €10,000 annual cross-border B2C threshold

### How it works

Instead of registering for VAT in every EU member state where customers are located, the business registers for OSS in a single member state (their "member state of identification"). They file a single OSS return covering all their EU cross-border B2C sales, using the VAT rate of each destination country for each sale.

**Three OSS schemes:**
- **Union OSS:** For EU-established businesses selling goods or services B2C to customers in other member states
- **Non-Union OSS:** For non-EU businesses selling services (not goods) to EU consumers
- **Import OSS (IOSS):** For businesses selling goods imported from outside the EU to EU consumers, where the consignment value is below €150

### Luca's role

Luca can help track the sales figures needed for OSS reporting — sales by destination country, at the correct local VAT rate. The actual OSS return is filed separately through the business's OSS registration portal. Luca cannot file OSS returns directly.

---

## Import VAT on Goods Entering the EU

When goods are imported into the EU from a non-EU country (or from Great Britain following Brexit), import VAT is generally due at the point of entry at the applicable rate of the member state of import.

The import VAT is recoverable as input tax by a VAT-registered importer, subject to the usual input tax recovery rules.

**For parcels below €150:** The IOSS scheme applies for goods sold to EU consumers — the seller charges and collects the VAT at point of sale and remits it through the IOSS return.

**Import duties** (customs duties) are separate from import VAT and are generally not recoverable. They form part of the cost of the imported goods.

---

## EC Sales Lists (ESL) and Intrastat

### EC Sales Lists (Recapitulative Statements)

VAT-registered businesses that supply goods or services to VAT-registered customers in other EU member states must submit an EC Sales List (called a "recapitulative statement" under the VAT Directive).

The ESL shows:
- The VAT number of each customer in another member state
- The total value of supplies to each customer for the period

Filing frequency: monthly or quarterly depending on the member state. Most member states require monthly ESLs above certain thresholds.

**Post-Brexit note:** UK businesses no longer file UK EC Sales Lists (the UK left the EU VAT area on 1 January 2021). However, businesses established in Northern Ireland continue to have obligations under the Windsor Framework for goods (not services).

### Intrastat

Intrastat is a separate statistical reporting requirement for businesses that move goods above certain value thresholds between EU member states. It provides trade statistics to Eurostat.

Thresholds vary by member state and are reviewed annually. Most small businesses fall below the Intrastat threshold, but it applies to businesses with significant intra-community goods movements.

**For Luca:** Intrastat is a statistical filing, not a tax return. Luca can provide the figures needed for Intrastat reporting from the ledger, but the filing itself is made separately.

---

## GDPR and Financial Record Keeping

The General Data Protection Regulation (GDPR) applies across the EU (and the UK via UK GDPR post-Brexit) and affects how financial records are kept.

**Key GDPR principles relevant to financial records:**

- **Lawful basis for processing:** Processing personal data in financial records is typically lawful under "legal obligation" (tax law requires businesses to maintain accounting records) or "legitimate interests"
- **Data minimisation:** Only collect and retain the personal data necessary for the accounting purpose — customer names, addresses, and invoice details are necessary; other personal information on invoices should not be retained unnecessarily
- **Retention periods:** Financial records must be kept for a minimum period required by tax law (typically 6–7 years in most EU member states — verify locally). GDPR does not override this legal retention obligation, but records should be deleted after the retention period expires
- **Security:** Financial records containing personal data must be secured appropriately. Luca's General Ledger's local deployment (no cloud, no third-party access) provides strong security by design

**Supplier and customer data in the ledger:** Names and addresses in transaction records are personal data. The legal basis for processing is the tax and accounting obligation. No separate consent is required.

---

## Summary: What to Ask a Local Tax Adviser

Luca provides the common EU framework. A local tax adviser in the relevant member state is needed for:

- Current VAT registration thresholds and procedures
- Domestic VAT return formats and filing requirements
- Local reduced rate and exemption rules (these vary significantly)
- Country-specific OSS or ESL filing requirements
- Corporate income tax, local business taxes, and other non-VAT matters
- Any tax planning or structuring advice

---

*tax/eu-common.md — EU VAT common framework reference for the Luca's General Ledger CFO skill*
*Part of the Luca's General Ledger open source project*
