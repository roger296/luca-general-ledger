# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Luca General Ledger, please report it privately rather than opening a public GitHub issue.

**Email:** security@lucaledger.com

Include the following in your report:

- A description of the vulnerability
- Steps to reproduce
- The potential impact
- Any suggested fixes (optional but appreciated)

We aim to acknowledge reports within 48 hours and provide an initial assessment within 5 business days.

## What Counts as a Security Issue

- Authentication or authorisation bypasses
- Chain file integrity vulnerabilities (ways to modify historical entries without detection)
- SQL injection or other injection attacks
- Exposure of sensitive financial data
- JWT token vulnerabilities
- Privilege escalation between user roles

## Responsible Disclosure

We ask that you do not share details of unpatched vulnerabilities publicly until a fix has been released. We will credit reporters in the changelog unless they prefer to remain anonymous.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.5.x   | Yes       |

Security patches are applied to the latest release only.
