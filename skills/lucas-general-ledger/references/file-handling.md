# File Handling — Intake and Processing Reference

**Load this file when:**
- Running a scheduled batch
- The user mentions a file, document, PDF, invoice, statement, or attachment
- Any task that involves processing an incoming document

---

## The Intake Principle

File format handling is the intake layer only. Luca's job during intake is to extract structured data from whatever format the file arrives in. Once that structured data is in hand — supplier name, date, amounts, line items, VAT — all downstream workflows are identical regardless of the original file format.

The intake layer answers one question: *what data is in this file?*
Everything after that is a posting or reconciliation workflow.

---

## Inbox Folder Structure

Luca monitors four inbox folders during batch runs. The actual paths are read from `business-profile.json`. The defaults are:

| Folder | Expected Contents |
|---|---|
| `lucas-general-ledger-inbox/purchase-invoices/` | Supplier invoices, bills, purchase orders awaiting confirmation |
| `lucas-general-ledger-inbox/sales-invoices/` | Sales invoices the business has issued |
| `lucas-general-ledger-inbox/bank-statements/` | Bank statements in any format |
| `lucas-general-ledger-inbox/other/` | Expense receipts, credit notes, payroll summaries, anything that doesn't fit the above |

In manual mode, the user may also drop a file into conversation directly. Treat it as if it arrived in the appropriate inbox folder for the duration of the session.

---

## Processed and Flagged File Conventions

### Successfully processed files

After a document is successfully posted or reconciled, move it from the inbox to:
```
lucas-general-ledger-processed/[type]/[YYYY-MM-DD]/[original-filename]
```

Where:
- `[type]` matches the inbox subfolder: `purchase-invoices`, `sales-invoices`, `bank-statements`, or `other`
- `[YYYY-MM-DD]` is today's date (the processing date, not the document date)
- `[original-filename]` is the original filename, unchanged

Examples:
```
lucas-general-ledger-processed/purchase-invoices/2026-03-15/acme-INV-00441.pdf
lucas-general-ledger-processed/bank-statements/2026-03-15/hsbc-march-2026.csv
lucas-general-ledger-processed/other/2026-03-15/receipt-fuel-14mar2026.jpg
```

### Staged for approval

If a document was processed but the resulting transaction was staged (confidence below threshold), the file is still moved to the processed folder. The staging ID is recorded in the morning report. The file has been handled — it's the posting that awaits approval, not the file intake.

### Files that could not be processed

If intake fails for any reason (see "Unreadable and Unprocessable Files" below), move the file to:
```
lucas-general-ledger-inbox/[type]/flagged/[original-filename]
```

The flagged subfolder sits within the original inbox type folder so the user can find it easily.

---

## Format-Specific Intake Procedures

### PDF Files

PDFs are the most common format for invoices and statements.

**Step 1: Determine whether the PDF contains extractable text.**

Most modern PDFs from accounting software, invoicing tools, or email attachments are text-based — the text layer is embedded and can be read directly.

Use the Read tool to open the PDF. If the result is readable text with recognisable structure (amounts, dates, names), proceed to data extraction.

**Step 2: If the PDF is a scanned image (no extractable text).**

Some PDFs are scans — photographs of paper documents embedded in a PDF wrapper. The Read tool will display these visually as images. Treat them the same as image files (see below).

Common indicators of a scanned PDF:
- The Read tool returns the file as an image rather than text
- The extracted text is garbled, contains no recognisable amounts, or is empty
- The file has a large size relative to its apparent content

**Step 3: Data extraction from text PDF.**

Extract these fields (not all present on every document):

| Field | Notes |
|---|---|
| Supplier / customer name | Look for "From:", "Invoice From:", company name at top |
| Their address | Useful for new supplier records |
| Document type | Invoice, credit note, statement, remittance advice |
| Document number | Invoice #, Credit Note #, reference number |
| Document date | The date printed on the document — use this as the posting date |
| Due date | Payment due date if shown |
| Currency | Look for currency symbols: £ = GBP, $ = USD/other, € = EUR. Confirm if ambiguous. |
| Line items | Description, quantity, unit price, line total |
| Subtotal | Net before tax |
| VAT / tax | Amount and rate. Multiple VAT rates may appear on one document. |
| Gross total | Including VAT |
| Bank details | Sort code and account number, IBAN, SWIFT/BIC — for supplier payment setup |
| Payment terms | "Net 30", "Due on receipt", "30 days from invoice date" |

**Step 4: Verify the maths.**

Before posting any invoice, verify: net amount + VAT = gross total. If the maths does not check out, flag the discrepancy to the user before proceeding.

**Step 5: Multi-page PDFs.**

Some PDFs contain multiple invoices (e.g. a monthly statement with itemised invoice lines). Read all pages and process each invoice as a separate posting. Bank statements are typically multi-page — treat as a bank statement (see below).

---

### Image Files (JPEG, PNG, TIFF, HEIC, WebP)

Images of financial documents arrive as:
- Photographs taken on a mobile phone (receipts, handwritten invoices)
- Scanned documents saved as image files
- Screenshots of invoices from accounting software

**Intake procedure:**

Use the Read tool to view the image visually. Extract data exactly as described for text PDFs above.

**Image-specific considerations:**

*Poor quality images:* If the image is too blurry, poorly lit, or too low resolution to read clearly, flag it:
> "I can see this is an image of what appears to be a [receipt/invoice], but the image quality isn't good enough to extract the figures reliably. Could you provide a clearer version, or type the key details — supplier, date, amount, and what it's for?"

*Handwritten documents:* Handwritten invoices or receipts are acceptable. Read the handwriting carefully. If a value is ambiguous (a 1 that might be a 7, a partially legible amount), ask for confirmation before posting: "I read the total as £147.00 — is that right?"

*Partial visibility:* If part of the document is cut off or obscured, note what is missing and ask the user to supply it.

*Multiple documents in one image:* Process each as a separate posting.

---

### Word Documents (.docx, .doc)

Some businesses produce invoices or remittances in Word format. Less common but entirely valid.

Use the Read tool to extract the text content. The extraction will include all text, tables, and structured content from the document.

Proceed with data extraction as for text PDFs. Note that Word invoices may be less standardised in layout than PDF invoices from accounting software — read the whole document before attempting to extract fields.

---

### Excel Spreadsheets (.xlsx, .xls, .csv)

Excel and CSV files arrive most commonly as:
- Bank statement exports
- Expense claim summaries
- Supplier statements
- Bulk invoice data from e-commerce platforms

**Bank statement exports:** Typically structured with columns: Date, Description/Narrative, Debit, Credit, Balance. Read the column headers first to understand the layout, then process each row as a separate transaction. See the Bank Reconciliation workflow in `references/workflows.md`.

**Expense claim spreadsheets:** Usually a table with columns: Date, Description, Category, Amount, VAT. Each row is a separate expense line. Group by category for the posting.

**Multi-invoice spreadsheets:** Some suppliers or e-commerce platforms send monthly transaction files with multiple invoices. Read the full sheet, identify each unique invoice by reference number, and process each separately.

**CSV parsing notes:** CSV files may use commas, semicolons, or tabs as delimiters. The Read tool handles this automatically. If amounts include thousands separators (1,000.00 vs 1000.00), strip the separator before using in calculations.

---

### Email Exports (.eml, .msg, .mbox)

Invoices or remittances sometimes arrive as exported email files. These may contain:
- The invoice as body text (plain text or HTML)
- The invoice as an attachment (PDF, image, or spreadsheet)

**For email body content:** Extract the text from the email body and process as plain text, looking for the standard invoice fields.

**For attachments within the email:** Extract and process the attachment according to its format (PDF, image, etc.).

**Forwarded email chains:** If the email is a forwarded chain, identify the most recent invoice content. Ignore footer boilerplate and quoted reply chains.

---

### Plain Text Files (.txt)

Plain text invoices are rare but do occur, particularly from technical or automated systems.

Read the file and extract invoice fields from the unstructured text. Plain text invoices from automated systems often have a consistent format — identify the pattern and extract accordingly.

---

### Unknown or Unrecognised Formats

If a file arrives in the inbox that Luca cannot identify or open, flag it immediately with a clear description:

> "There's a file in the purchase invoices inbox I can't process: `quarterly-summary.xyz`. I don't recognise the file format. Could you open it and either tell me what it contains, or save it in a format I can read (PDF, image, Excel, or Word)?"

Do not attempt to guess the contents of a file that cannot be opened. Do not attempt to parse binary data as text.

---

## Data Extraction Quality Standards

### Confidence levels

After extracting data from a document, Luca should have a sense of confidence in the extraction. This feeds into the `approval_context.confidence_score` in the MCP posting call.

| Scenario | Confidence guidance |
|---|---|
| Clean, text-based PDF from known software | 0.90–0.98 |
| Good quality image, all fields clearly legible | 0.85–0.92 |
| Poor quality image, some fields inferred | 0.60–0.80 |
| Handwritten document, all fields readable | 0.80–0.90 |
| Handwritten document, some fields ambiguous | 0.50–0.70 |
| Document in unusual format or non-standard layout | 0.70–0.85 |
| Document with arithmetic errors or inconsistencies | Cap at 0.60 regardless of other factors |

In manual mode, confidence scores do not affect the posting decision — Luca always confirms with the user before posting. Confidence scoring matters in batch mode, where it determines auto-post vs. stage-for-approval.

### What "structured data" means

After intake, Luca should have extracted:
- Document type (supplier invoice, sales invoice, credit note, bank statement line, etc.)
- Counterparty (supplier or customer name)
- Reference (document number)
- Date
- Currency
- At least one line item with: net amount, tax code, tax amount
- Gross total (used for verification)

If any of these cannot be determined from the document, either ask the user (manual mode) or flag the file (batch mode). Do not post a transaction with missing required fields.

---

## Batch Mode Intake Reporting

At the end of a batch run, the morning report must include an intake summary. See `references/cfo-advisory.md` for the full morning report format.

The intake summary must show:
- Number of files found in each inbox folder
- Number successfully processed (and posted or staged)
- Number flagged (and why — one line per flagged file)
- Any folders that were empty

Example intake summary for the morning report:

```
Inbox — 2026-03-15

Purchase Invoices: 4 files
  ✓ Acme Corp INV-00441 — £1,200.00 + VAT — posted as TXN-2026-03-00089
  ✓ Sheffield Steel INV-8823 — £4,560.00 + VAT — staged (confidence 0.78, below threshold)
  ✓ Royal Mail quarterly — £89.40 incl. VAT — posted as TXN-2026-03-00090
  ⚠ quarterly-summary.xyz — unrecognised format, moved to flagged/

Sales Invoices: 0 files

Bank Statements: 1 file
  ✓ HSBC March 2026 statement — 47 lines — 44 matched, 3 unmatched (see reconciliation section)

Other: 2 files
  ✓ Fuel receipt 14 Mar — £65.00 incl. VAT — posted as TXN-2026-03-00091
  ✓ Staff expenses March — £234.50 — staged (multiple ambiguous categories, below threshold)
```

---

*file-handling.md — intake reference for the Luca's General Ledger CFO skill*
*Part of the Luca's General Ledger open source project*
