# Contributing to Luca General Ledger

Thank you for your interest in contributing to Luca. This document explains how to set up the project for development, the standards we follow, and how to submit changes.

## Development Setup

### Prerequisites

- Node.js 20+
- Docker Desktop (for PostgreSQL)
- Git

### Getting Running

```bash
git clone https://github.com/roger296/lucaV0.5.git
cd lucaV0.5
cp .env.example .env          # edit with your values
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
npm install
npm run migrate
npm run seed
npm run dev
```

The API runs at http://localhost:3000. A separate test database runs on port 5433.

## Coding Standards

- **TypeScript strict mode** — no `any` types, explicit return types on exported functions
- **Decimal.js for money** — never use floating-point arithmetic for financial amounts
- **Double-entry validation** — every transaction must balance (debits equal credits) before it can be committed
- **Chain-first writes** — the chain file is the source of truth; always write to the chain before the database mirror
- **Tests for everything** — chain integrity, posting balance, period enforcement, and API endpoints all need test coverage

## Running Tests

```bash
# Start the test database
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db-test

# Run the full suite
NODE_ENV=test npm test

# Unit tests only
npm run test:unit

# Integration tests only
NODE_ENV=test npm run test:integration
```

All tests must pass before submitting a pull request. Integration tests run against a real PostgreSQL database, not mocks.

## Submitting Changes

1. Fork the repository
2. Create a feature branch from `main`: `git checkout -b feature/your-feature-name`
3. Make your changes and ensure all tests pass
4. Commit with a clear message describing what changed and why
5. Push to your fork and open a pull request against `main`

### Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Update documentation if you change behaviour
- The PR description should explain *what* changed and *why*, not just list files

### What We Look For in Reviews

- Does it maintain chain integrity? Any change to the posting engine must preserve the SHA-256 hash chain
- Does it balance? Transactions must always have equal debits and credits
- Does it respect periods? Closed periods must remain immutable
- Are there tests? Especially for edge cases around financial calculations

## Reporting Bugs

Open a GitHub issue using the **Bug Report** template. Include steps to reproduce, expected behaviour, and actual behaviour. If the bug involves incorrect financial calculations, include the transaction data.

## Feature Requests

Open a GitHub issue using the **Feature Request** template. Describe the problem you're trying to solve, not just the solution you want.

## Questions

If you have questions about the codebase or architecture, open a discussion on GitHub or review the documentation in the `docs/` directory.
