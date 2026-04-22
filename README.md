# Luca General Ledger

**Cryptographically-linked double-entry accounting for modern businesses**

![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?logo=typescript)
![Node](https://img.shields.io/badge/Node-20-green?logo=node.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-ready-blue?logo=docker)
![Tests](https://img.shields.io/badge/Tests-520%20passing-brightgreen)

---

## What is Luca?

Luca is an AI-driven general ledger built for small and medium businesses who want the audit guarantees of enterprise accounting without the enterprise price tag. Every transaction is written to an append-only chain file where each entry is SHA-256 hash-linked to the previous one, making the audit trail cryptographically tamper-evident — if any historical entry is modified, the entire chain after it becomes invalid. Luca is operated conversationally via 50 MCP tools by the Luca AI agent (Claude), or through its REST API and React web UI. Other modules — Sales, Purchasing, Stock — connect to Luca's REST API and post their financial transactions; the GL module is the single source of financial truth.

---

## Quick Start — Production (VPS)

**Prerequisites:** A fresh Ubuntu 22.04/24.04 or Debian 11/12 VPS with your domain already pointing at its IP address.

```bash
curl -sSL https://raw.githubusercontent.com/roger296/lucaV0.5/main/install.sh \
  -o /tmp/luca-install.sh && sudo bash /tmp/luca-install.sh
```

> Download the script first rather than piping directly — this ensures interactive prompts work correctly on all systems.

The installer will:
- Prompt for your company name, domain, and admin credentials
- Install Docker, nginx, and certbot automatically
- Build and launch Luca in Docker containers
- Obtain a free Let's Encrypt SSL certificate
- Configure systemd so Luca starts automatically on reboot
- Generate secure random secrets for JWT and the database

When complete, open your browser to `https://your-domain` and log in with the credentials you entered.

**After installation:** See the [Operations Guide](docs/Operations%20Guide.md) for connecting Claude, updating the server, troubleshooting, and complete reinstall procedures.

---

## Quick Start — Local Development

```bash
git clone https://github.com/roger296/lucaV0.5.git
cd lucaV0.5
cp .env.example .env          # edit with your values
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
npm install
npm run migrate
npm run seed
npm run dev
# App: http://localhost:3000
# Test DB also running on port 5433
```

The dev compose override exposes the database on port 5432 (for TablePlus, DBeaver, etc.) and the API directly on port 3000. A separate test database runs on port 5433 for integration tests.

---

## Architecture

```
+-------------------------------------------------------------+
|  Luca AI Agent (Claude)          React Web UI               |
|  50 MCP tools                    dashboard, journal,         |
|  conversational accounting       approval queue              |
+--------------------+------------------------+---------------+
                     | MCP / REST API          | REST API
+--------------------v------------------------v---------------+
|  Express.js API (Node 20 + TypeScript)                      |
|  JWT auth  *  RBAC  *  Request ID middleware                 |
+-------------------------------------------------------------+
|  Engine Layer                                               |
|  posting  *  approval  *  periods  *  bank-reconciliation   |
|  setup  *  batch-runs  *  FX  *  webhooks  *  year-end      |
+---------------------------+---------------------------------+
|  Chain Files (source of   |  PostgreSQL (mirror DB)         |
|  truth)                   |  fast querying & reporting      |
|  SHA-256 hash-linked      |  can be rebuilt from chain      |
|  Merkle tree verified     |  files at any time              |
|  append-only JSONL        |                                 |
+---------------------------+---------------------------------+
```

The chain file is the authoritative record. The PostgreSQL database is a mirror that can be rebuilt from chain files at any time. Writes always go to the chain file first; if the database write subsequently fails, the chain file is still intact and the database can be re-synced.

---

## Key Features

- **Cryptographic audit trail** — SHA-256 hash-linked chain file; any tampering breaks the chain
- **Double-entry validation** — every transaction is validated to balance before being committed
- **Period management** — open, soft-close, and hard-close accounting periods; closed periods are immutable
- **Approval workflow** — transactions enter a staging area and are auto-approved or queued for manual review based on configurable rules
- **14 transaction types** — manual journals, customer invoices, supplier invoices, payments, bank imports, payroll, depreciation, prior-period adjustments, and more
- **Bank reconciliation** — import bank statements (CSV/OFX) and match against ledger entries
- **Document inbox** — attach source documents (PDF, CSV) to transactions
- **Year-end close** — automated P&L zeroing to retained earnings with opening balances carried forward
- **Webhook events** — real-time notifications to external modules when transactions are committed
- **MCP tools** — 50 tools for conversational accounting via Claude
- **React web UI** — dashboard, journal view, chart of accounts, approval queue, trial balance, period management
- **One-command VPS install** — `install.sh` handles everything from Docker to SSL

---

## MCP Tools and Claude Co-Work

Luca exposes 50 MCP (Model Context Protocol) tools that allow Claude to operate the accounting system conversationally. Tools cover the full accounting workflow: posting transactions, approving journal entries, querying the ledger, running reports, managing periods, importing bank statements, and more.

### Connecting Claude

1. Log in to your Luca instance and go to **Co-Work Credentials** (Admin section in the sidebar)
2. Click **+ Generate credentials** to get a Client ID and Client Secret
3. In Claude, go to **Customize → Connectors → Add connector**
4. Enter the MCP Server URL (`https://your-domain/mcp`), Client ID, and Client Secret
5. Click Connect — you'll be redirected to a login page, sign in with your Luca credentials

The connection uses OAuth 2.0 Authorization Code flow with PKCE. See the [Operations Guide](docs/Operations%20Guide.md) for full details and troubleshooting.

See the `skills/` directory for the skill definitions, and `src/mcp/tools.ts` for the tool implementations.

---

## Database

Luca uses 21 PostgreSQL tables organised by domain:

**Core ledger**
- `accounts` — chart of accounts
- `transactions` — committed transaction headers
- `transaction_lines` — individual debit/credit lines
- `periods` — accounting period definitions and status
- `chain_metadata` — chain checkpoint hashes

**Workflow**
- `staging` — pending transactions awaiting approval
- `approval_rules` — auto-approval thresholds and escalation rules
- `transaction_type_mappings` — default account mappings per transaction type

**Banking**
- `bank_statements` — imported bank statement files
- `bank_statement_lines` — individual statement entries
- `bank_reconciliation_matches` — matches between statement lines and ledger entries

**Documents & users**
- `document_inbox` — attached source documents
- `users` — system users and roles
- `company_settings` — company profile and financial year configuration

**Automation**
- `webhooks` — outbound webhook configurations
- `webhook_deliveries` — delivery log and retry queue
- `batch_runs` — scheduled batch job execution log
- `exchange_rates` — currency exchange rate history

---

## Testing

```bash
# Start test database
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db-test

# Run all tests
NODE_ENV=test npm test

# Unit tests only
npm run test:unit

# Integration tests only
NODE_ENV=test npm run test:integration
```

**520 tests, 32 suites, 0 failures.**

Test philosophy:
- Chain integrity tests are the most important — every chain write is verified with hash re-computation
- Every posting test asserts that debits equal credits
- Period closing tests verify that closed periods reject new postings
- Integration tests run against a real PostgreSQL database, not mocks

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `production` | Runtime environment |
| `PORT` | No | `3000` | HTTP port the API listens on |
| `BASE_URL` | Yes | `http://localhost:3000` | Full public URL (e.g. `https://accounts.yourcompany.com`). Used in OAuth discovery responses. |
| `JWT_SECRET` | Yes | — | Secret key for signing JWT tokens. Generate with `openssl rand -base64 48` |
| `JWT_EXPIRES_IN` | No | `24h` | JWT token lifetime |
| `POSTGRES_DB` | No | `gl_ledger` | PostgreSQL database name |
| `POSTGRES_USER` | No | `gl_admin` | PostgreSQL username |
| `POSTGRES_PASSWORD` | Yes | — | PostgreSQL password |
| `CHAIN_DIR` | No | `/data/chains` | Directory for chain files (inside container) |
| `ESCALATION_HOURS` | No | `48` | Hours before pending approvals are escalated |
| `LOG_LEVEL` | No | `info` | Logging verbosity: `debug`, `info`, `warn`, `error` |

Copy `.env.example` to `.env` and fill in the required values before running.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on setting up a development environment, coding standards, and submitting pull requests.

---

## Security

See [SECURITY.md](SECURITY.md) for our vulnerability reporting policy. Please report security issues privately rather than opening a public GitHub issue.

---

## License

A custom open-source license will be added shortly. See the repository for updates.
