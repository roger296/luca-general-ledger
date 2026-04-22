# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.5.0] - 2026-04-22

### Added

- **Luca's Log** — per-installation business knowledge document that Luca builds and maintains over time, enabling contextual accounting decisions
- **Consequential transactions** — Luca now detects implied transactions (COGS entries, delivery accruals, prepayments) from business context and offers to post them
- **GL document posting skill** — structured workflow for analysing financial documents, classifying them, and posting to the GL via REST API
- **CFO advisory references** — guidance for Luca's role as AI CFO including business analysis, cash flow monitoring, and strategic advice
- **Tax reference files** — UK, US, and EU VAT/tax rules for automated compliance checking
- **Personality and tone guidelines** — consistent Luca persona across all interactions
- **File handling references** — inbox processing, document attachment, and archive workflows
- **Reporting references** — standard report formats and presentation guidelines
- **Business profile template** — `business-profile.example.json` for new installations

### Changed

- **Workflows** — added Workflow 9 (Log Initialisation) and Workflow 10 (Consequential Transaction Check); enhanced Workflow 2 with COGS and delivery accrual checks
- **Ledger formats** — streamlined and updated reference documentation
- **CFO advisory** — expanded from basic guidance to comprehensive business analysis framework

### Infrastructure

- 520 tests passing across 32 suites
- SHA-256 hash-linked chain file with Merkle tree verification
- PostgreSQL 16 mirror database
- OAuth 2.0 + PKCE MCP server for Claude integration
- One-command VPS installer with Let's Encrypt SSL
- React web UI with dashboard, journal, approval queue, and reports

## [0.1.0] - 2026-03-01

### Added

- Initial GL module with chain file writer, posting engine, and REST API
- Double-entry validation and period management
- Bank reconciliation and document inbox
- Approval workflow with configurable rules
- Year-end close with P&L zeroing
- React web frontend
- Docker deployment with docker-compose
- VPS installer script
- 50 MCP tools for conversational accounting via Claude
