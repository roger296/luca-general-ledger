// src/engine/setup.ts
// Onboarding and initial setup engine.
// Handles: setup status checks, chart of accounts import, opening balances, business profile.

import Decimal from 'decimal.js';
import { db } from '../db/connection';
import { postTransaction } from './post';
import { ChainWriter } from '../chain/writer';
import { config } from '../config';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetupStatus {
  is_configured: boolean;
  has_business_profile: boolean;
  has_chart_of_accounts: boolean;
  has_opening_balances: boolean;
  /**
   * True when an opening-balances entry is sitting in the staging table with
   * status PENDING. Useful for the UI to distinguish "not yet entered" from
   * "entered but waiting for approval". Does NOT imply the ledger is funded.
   */
  opening_balances_pending_approval: boolean;
  current_period: string | null;
}

export interface ChartImportResult {
  imported: number;
  updated: number;
  deactivated: number;
  errors: string[];
}

export interface ImportChartParams {
  csv_content: string;
  source_system: 'XERO' | 'SAGE' | 'QUICKBOOKS' | 'GENERIC';
  replace_existing?: boolean;
}

export interface OpeningBalanceLine {
  account_code: string;
  debit: number;
  credit: number;
}

export interface PostOpeningBalancesParams {
  balances: OpeningBalanceLine[];
  effective_date: string;
  description?: string;
}

export interface PostOpeningBalancesResult {
  transaction_id: string;
  total_debits: string;
  total_credits: string;
}

export interface BusinessProfileParams {
  company_name: string;
  company_number?: string;
  vat_registered?: boolean;
  vat_number?: string;
  vat_scheme?: string;
  financial_year_end_month?: string;
  base_currency?: string;
  territory?: string;
  industry?: string;
  registered_address?: string;
}

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

function parseCsv(content: string): string[][] {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result: string[][] = [];
  for (const line of lines) {
    if (line.trim() === '') continue;
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    result.push(fields);
  }
  return result;
}

// ---------------------------------------------------------------------------
// getSetupStatus
// ---------------------------------------------------------------------------

export async function getSetupStatus(): Promise<SetupStatus> {
  // Check business profile
  const settingsRow = await db('company_settings').where('id', 1).first<{ company_name: string | null } | undefined>();
  const has_business_profile = Boolean(settingsRow && settingsRow.company_name && settingsRow.company_name.trim() !== '');

  // Check chart of accounts
  const accountCount = await db('accounts').count<[{ count: string }]>('code as count').first();
  const has_chart_of_accounts = parseInt(accountCount?.count ?? '0', 10) > 25;

  // Check for a committed opening-balances transaction. Only a row in the
  // `transactions` table counts as "done" — a staging entry (PENDING or even
  // APPROVED-but-uncommitted, from the old broken MCP approve handler) means
  // the ledger is not yet funded and reports will show zero balances.
  const openingRow = await db('transactions')
    .where('reference', 'like', '%OPENING%')
    .first<{ transaction_id: string } | undefined>();
  const has_opening_balances = Boolean(openingRow);

  // Separately surface whether an opening-balances entry is sitting in the
  // approval queue, so the UI can prompt "approve opening balances" rather
  // than "enter opening balances".
  const openingStagedRow = openingRow
    ? null
    : await db('staging')
        .where('reference', 'like', '%OPENING%')
        .where('status', 'PENDING')
        .first<{ staging_id: string } | undefined>();
  const opening_balances_pending_approval = Boolean(openingStagedRow);

  // Get current open period
  const periodRow = await db('periods')
    .where('status', 'OPEN')
    .orderBy('period_id', 'desc')
    .first<{ period_id: string } | undefined>();
  const current_period = periodRow?.period_id ?? null;

  const is_configured = has_business_profile && (has_chart_of_accounts || has_opening_balances);

  return {
    is_configured,
    has_business_profile,
    has_chart_of_accounts,
    has_opening_balances,
    opening_balances_pending_approval,
    current_period,
  };
}

// ---------------------------------------------------------------------------
// importChartOfAccounts
// ---------------------------------------------------------------------------

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

function mapXeroType(xeroType: string): { type: AccountType; category: string } {
  const t = xeroType.trim().toUpperCase();
  const typeMap: Record<string, AccountType> = {
    REVENUE: 'REVENUE',
    SALES: 'REVENUE',
    EXPENSE: 'EXPENSE',
    OVERHEADS: 'EXPENSE',
    DIRECTCOSTS: 'EXPENSE',
    BANK: 'ASSET',
    CURRENT: 'ASSET',
    CURRLIAB: 'LIABILITY',
    FIXED: 'ASSET',
    EQUITY: 'EQUITY',
    DEPRECIATN: 'EXPENSE',
  };
  const categoryMap: Record<string, string> = {
    REVENUE: 'REVENUE',
    SALES: 'REVENUE',
    OVERHEADS: 'OVERHEADS',
    DIRECTCOSTS: 'DIRECT_COSTS',
    BANK: 'CURRENT_ASSET',
    CURRENT: 'CURRENT_ASSET',
    CURRLIAB: 'CURRENT_LIABILITY',
    FIXED: 'FIXED_ASSET',
    EQUITY: 'EQUITY',
    EXPENSE: 'OVERHEADS',
    DEPRECIATN: 'OVERHEADS',
  };
  return {
    type: typeMap[t] ?? 'EXPENSE',
    category: categoryMap[t] ?? 'OVERHEADS',
  };
}

function mapSageType(sageType: string): { type: AccountType; category: string } {
  const t = sageType.trim();
  const typeMap: Record<string, AccountType> = {
    Sales: 'REVENUE',
    Purchases: 'EXPENSE',
    'Direct Expenses': 'EXPENSE',
    Overheads: 'EXPENSE',
    'Fixed Assets': 'ASSET',
    'Current Assets': 'ASSET',
    Bank: 'ASSET',
    'Current Liabilities': 'LIABILITY',
    'Long Term Liabilities': 'LIABILITY',
    'Capital & Reserves': 'EQUITY',
  };
  const categoryMap: Record<string, string> = {
    Sales: 'REVENUE',
    Purchases: 'DIRECT_COSTS',
    'Direct Expenses': 'DIRECT_COSTS',
    Overheads: 'OVERHEADS',
    'Fixed Assets': 'FIXED_ASSET',
    'Current Assets': 'CURRENT_ASSET',
    Bank: 'CURRENT_ASSET',
    'Current Liabilities': 'CURRENT_LIABILITY',
    'Long Term Liabilities': 'CURRENT_LIABILITY',
    'Capital & Reserves': 'EQUITY',
  };
  return {
    type: typeMap[t] ?? 'EXPENSE',
    category: categoryMap[t] ?? 'OVERHEADS',
  };
}

function mapQbType(qbType: string): { type: AccountType; category: string } {
  const t = qbType.trim();
  const typeMap: Record<string, AccountType> = {
    Income: 'REVENUE',
    'Cost of Goods Sold': 'EXPENSE',
    Expense: 'EXPENSE',
    Bank: 'ASSET',
    'Accounts Receivable': 'ASSET',
    'Other Current Asset': 'ASSET',
    'Fixed Asset': 'ASSET',
    'Accounts Payable': 'LIABILITY',
    'Credit Card': 'LIABILITY',
    'Other Current Liability': 'LIABILITY',
    Equity: 'EQUITY',
  };
  const categoryMap: Record<string, string> = {
    Income: 'REVENUE',
    'Cost of Goods Sold': 'DIRECT_COSTS',
    Expense: 'OVERHEADS',
    Bank: 'CURRENT_ASSET',
    'Accounts Receivable': 'CURRENT_ASSET',
    'Other Current Asset': 'CURRENT_ASSET',
    'Fixed Asset': 'FIXED_ASSET',
    'Accounts Payable': 'CURRENT_LIABILITY',
    'Credit Card': 'CURRENT_LIABILITY',
    'Other Current Liability': 'CURRENT_LIABILITY',
    Equity: 'EQUITY',
  };
  return {
    type: typeMap[t] ?? 'EXPENSE',
    category: categoryMap[t] ?? 'OVERHEADS',
  };
}

const SYSTEM_ACCOUNTS = new Set(['1000', '1100', '2000', '2100', '3000', '3100']);

export async function importChartOfAccounts(params: ImportChartParams): Promise<ChartImportResult> {
  const result: ChartImportResult = { imported: 0, updated: 0, deactivated: 0, errors: [] };
  const rows = parseCsv(params.csv_content);
  if (rows.length < 2) {
    result.errors.push('CSV has no data rows');
    return result;
  }

  const header = rows[0]!.map((h) => h.trim());
  const dataRows = rows.slice(1);
  const importedCodes: Set<string> = new Set();

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]!;
    const cell = (idx: number) => (row[idx] ?? '').trim();

    try {
      let code: string;
      let name: string;
      let type: AccountType;
      let category: string;

      if (params.source_system === 'XERO') {
        const codeIdx = header.indexOf('*Code');
        const nameIdx = header.indexOf('*Name');
        const typeIdx = header.indexOf('*Type');
        if (codeIdx === -1 || nameIdx === -1 || typeIdx === -1) {
          result.errors.push('XERO CSV missing required columns: *Code, *Name, *Type');
          break;
        }
        code = cell(codeIdx);
        name = cell(nameIdx);
        const mapped = mapXeroType(cell(typeIdx));
        type = mapped.type;
        category = mapped.category;
      } else if (params.source_system === 'SAGE') {
        const codeIdx = header.indexOf('Account Number');
        const nameIdx = header.indexOf('Account Name');
        const typeIdx = header.indexOf('Account Type');
        if (codeIdx === -1 || nameIdx === -1 || typeIdx === -1) {
          result.errors.push('SAGE CSV missing required columns: Account Number, Account Name, Account Type');
          break;
        }
        code = cell(codeIdx);
        name = cell(nameIdx);
        const mapped = mapSageType(cell(typeIdx));
        type = mapped.type;
        category = mapped.category;
      } else if (params.source_system === 'QUICKBOOKS') {
        const nameIdx = header.indexOf('Account');
        const typeIdx = header.indexOf('Type');
        const detailIdx = header.indexOf('Detail Type');
        if (nameIdx === -1 || typeIdx === -1) {
          result.errors.push('QUICKBOOKS CSV missing required columns: Account, Type');
          break;
        }
        // QB doesn't always have numeric codes, use row index if missing
        const codeRaw = cell(nameIdx).replace(/[^0-9]/g, '');
        code = codeRaw || String(9000 + i);
        name = cell(nameIdx);
        const detailType = detailIdx !== -1 ? cell(detailIdx) : '';
        const mapped = mapQbType(detailType || cell(typeIdx));
        type = mapped.type;
        category = mapped.category;
      } else {
        // GENERIC
        const codeIdx = header.indexOf('code');
        const nameIdx = header.indexOf('name');
        const typeIdx = header.indexOf('type');
        const catIdx = header.indexOf('category');
        if (codeIdx === -1 || nameIdx === -1 || typeIdx === -1) {
          result.errors.push('GENERIC CSV missing required columns: code, name, type');
          break;
        }
        code = cell(codeIdx);
        name = cell(nameIdx);
        type = (cell(typeIdx).toUpperCase() as AccountType) || 'EXPENSE';
        category = catIdx !== -1 ? cell(catIdx) : defaultCategory(type);
      }

      if (!code || !name) continue;

      importedCodes.add(code);

      const existing = await db('accounts').where('code', code).first<{ code: string } | undefined>();
      if (existing) {
        await db('accounts').where('code', code).update({ name, category, active: true, updated_at: new Date().toISOString() });
        result.updated++;
      } else {
        await db('accounts').insert({ code, name, type, category, active: true });
        result.imported++;
      }
    } catch (e) {
      result.errors.push(`Row ${i + 2}: ${(e as Error).message}`);
    }
  }

  // Deactivate accounts not in import (if replace_existing)
  if (params.replace_existing) {
    const toDeactivate = await db('accounts')
      .where('active', true)
      .whereNotIn('code', Array.from(importedCodes))
      .whereNotIn('code', Array.from(SYSTEM_ACCOUNTS))
      .select('code');
    if (toDeactivate.length > 0) {
      await db('accounts')
        .whereIn('code', toDeactivate.map((r: { code: string }) => r.code))
        .update({ active: false, updated_at: new Date().toISOString() });
      result.deactivated = toDeactivate.length;
    }
  }

  return result;
}

function defaultCategory(type: AccountType): string {
  const map: Record<AccountType, string> = {
    ASSET: 'CURRENT_ASSET',
    LIABILITY: 'CURRENT_LIABILITY',
    EQUITY: 'EQUITY',
    REVENUE: 'REVENUE',
    EXPENSE: 'OVERHEADS',
  };
  return map[type];
}

// ---------------------------------------------------------------------------
// postOpeningBalances
// ---------------------------------------------------------------------------

export async function postOpeningBalances(params: PostOpeningBalancesParams): Promise<PostOpeningBalancesResult> {
  // Validate balance
  let totalDebits = new Decimal(0);
  let totalCredits = new Decimal(0);
  for (const b of params.balances) {
    totalDebits = totalDebits.plus(b.debit);
    totalCredits = totalCredits.plus(b.credit);
  }
  if (!totalDebits.equals(totalCredits)) {
    throw new Error(
      `Opening balances do not balance. Debits: ${totalDebits.toFixed(2)}, Credits: ${totalCredits.toFixed(2)}`,
    );
  }

  // Validate all account codes exist
  const codes = params.balances.map((b) => b.account_code);
  const existingAccounts = await db('accounts').whereIn('code', codes).select('code');
  const existingCodes = new Set(existingAccounts.map((r: { code: string }) => r.code));
  const missingCodes = codes.filter((c) => !existingCodes.has(c));
  if (missingCodes.length > 0) {
    throw new Error(`Account codes not found: ${missingCodes.join(', ')}`);
  }

  // Derive period_id from effective_date
  const period_id = params.effective_date.substring(0, 7); // YYYY-MM

  // Create ChainWriter
  const writer = new ChainWriter({
    chainDir: config.chainDir,
    getPeriodStatus: async (pid: string) => {
      const row = await db('periods')
        .where('period_id', pid)
        .select('status')
        .first<{ status: string } | undefined>();
      return (row?.status as 'OPEN' | 'SOFT_CLOSE' | 'HARD_CLOSE' | null) ?? null;
    },
  });

  // Build lines
  const lines = params.balances.map((b) => ({
    account_code: b.account_code,
    description: 'Opening balance',
    debit: Number(b.debit),
    credit: Number(b.credit),
  }));

  const result = await postTransaction(
    {
      transaction_type: 'MANUAL_JOURNAL',
      reference: 'OPENING-BALANCES',
      description: params.description ?? 'Opening balances',
      date: params.effective_date,
      period_id,
      lines,
    },
    writer,
  );

  const transactionId =
    result.status === 'COMMITTED'
      ? (result as import('./types').CommittedResult).transaction_id
      : (result as import('./types').StagedResult).staging_id;

  return {
    transaction_id: transactionId,
    total_debits: totalDebits.toFixed(2),
    total_credits: totalCredits.toFixed(2),
  };
}

// ---------------------------------------------------------------------------
// saveBusinessProfile
// ---------------------------------------------------------------------------

export async function saveBusinessProfile(params: BusinessProfileParams): Promise<void> {
  const settings = {
    vat_registered: params.vat_registered ?? false,
    vat_number: params.vat_number,
    vat_scheme: params.vat_scheme,
    company_number: params.company_number,
    registered_address: params.registered_address,
    industry: params.industry,
    territory: params.territory,
  };

  const existing = await db('company_settings').where('id', 1).first<{ id: number } | undefined>();
  if (existing) {
    await db('company_settings').where('id', 1).update({
      company_name: params.company_name,
      company_number: params.company_number ?? null,
      vat_registered: params.vat_registered ?? false,
      vat_number: params.vat_number ?? null,
      vat_scheme: params.vat_scheme ?? null,
      financial_year_end_month: params.financial_year_end_month ?? null,
      base_currency: params.base_currency ?? 'GBP',
      territory: params.territory ?? null,
      industry: params.industry ?? null,
      settings: JSON.stringify(settings),
      updated_at: new Date().toISOString(),
    });
  } else {
    await db('company_settings').insert({
      id: 1,
      company_name: params.company_name,
      company_number: params.company_number ?? null,
      vat_registered: params.vat_registered ?? false,
      vat_number: params.vat_number ?? null,
      vat_scheme: params.vat_scheme ?? null,
      financial_year_end_month: params.financial_year_end_month ?? null,
      base_currency: params.base_currency ?? 'GBP',
      territory: params.territory ?? null,
      industry: params.industry ?? null,
      settings: JSON.stringify(settings),
    });
  }
}
