// tests/integration/setup.test.ts
// Integration tests for the setup and onboarding engine.

import { db } from '../../src/db/connection';
import {
  getSetupStatus,
  saveBusinessProfile,
  importChartOfAccounts,
  postOpeningBalances,
} from '../../src/engine/setup';

const TEST_PERIOD = '2085-01'; // far-future to avoid conflicts

beforeAll(async () => {
  // Ensure a test period exists for posting opening balances
  await db('periods').where('period_id', TEST_PERIOD).del();
  await db('periods').insert({
    period_id: TEST_PERIOD,
    start_date: '2085-01-01',
    end_date: '2085-01-31',
    status: 'OPEN',
    data_flag: 'PROVISIONAL',
    opened_at: new Date().toISOString(),
  });
  // Create chain file for that period
  const { ChainWriter } = await import('../../src/chain/writer');
  const { config } = await import('../../src/config');
  const writer = new ChainWriter({
    chainDir: config.chainDir,
    getPeriodStatus: async (pid: string) => {
      const row = await db('periods').where('period_id', pid).select('status').first<{ status: string }>();
      return (row?.status as 'OPEN' | 'SOFT_CLOSE' | 'HARD_CLOSE' | null) ?? null;
    },
  });
  await writer.createPeriodFile(TEST_PERIOD, null, {}).catch(() => { /* already exists */ });
});

afterAll(async () => {
  // Clean up test data
  await db('transaction_lines')
    .whereIn('transaction_id', db('transactions').where('period_id', TEST_PERIOD).select('transaction_id'))
    .del();
  await db('transactions').where('period_id', TEST_PERIOD).del();
  await db('staging').where('period_id', TEST_PERIOD).del();
  await db('periods').where('period_id', TEST_PERIOD).del();
  // Clean up chain file
  const path = await import('node:path');
  const fs = await import('node:fs/promises');
  const { config } = await import('../../src/config');
  const fp = path.join(config.chainDir, `${TEST_PERIOD}.chain.jsonl`);
  try { await fs.chmod(fp, 0o644); } catch { /**/ }
  try { await fs.unlink(fp); } catch { /**/ }
  await db.destroy();
});

// ---------------------------------------------------------------------------
// getSetupStatus
// ---------------------------------------------------------------------------

describe('getSetupStatus', () => {
  it('returns has_business_profile false when no company settings', async () => {
    await db('company_settings').where('id', 1).del();
    const status = await getSetupStatus();
    expect(status.has_business_profile).toBe(false);
    expect(status.is_configured).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// saveBusinessProfile
// ---------------------------------------------------------------------------

describe('saveBusinessProfile', () => {
  it('saves a company profile', async () => {
    await db('company_settings').where('id', 1).del();
    await saveBusinessProfile({
      company_name: 'Test Company Ltd',
      vat_registered: true,
      vat_number: 'GB123456789',
      territory: 'UK',
    });
    const status = await getSetupStatus();
    expect(status.has_business_profile).toBe(true);
  });

  it('can be called twice (upsert)', async () => {
    await expect(
      saveBusinessProfile({
        company_name: 'Test Company Ltd (Updated)',
        vat_registered: false,
      }),
    ).resolves.not.toThrow();

    // Verify update took effect
    const row = await db('company_settings').where('id', 1).first<{ company_name: string }>();
    expect(row?.company_name).toBe('Test Company Ltd (Updated)');
  });
});

// ---------------------------------------------------------------------------
// importChartOfAccounts
// ---------------------------------------------------------------------------

describe('importChartOfAccounts', () => {
  it('GENERIC format creates and updates accounts', async () => {
    // Delete test accounts if they exist
    await db('accounts').whereIn('code', ['TEST01', 'TEST02']).del();

    const csv = [
      'code,name,type,category',
      'TEST01,Test Asset Account,ASSET,CURRENT_ASSET',
      'TEST02,Test Revenue Account,REVENUE,REVENUE',
    ].join('\n');

    const result = await importChartOfAccounts({
      csv_content: csv,
      source_system: 'GENERIC',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.imported).toBe(2);
    expect(result.updated).toBe(0);

    // Run again — should update
    const result2 = await importChartOfAccounts({
      csv_content: csv,
      source_system: 'GENERIC',
    });
    expect(result2.updated).toBe(2);
    expect(result2.imported).toBe(0);

    // Clean up
    await db('accounts').whereIn('code', ['TEST01', 'TEST02']).del();
  });

  it('XERO format creates accounts with type mapping', async () => {
    // Remove test accounts if they exist
    await db('accounts').whereIn('code', ['610', '720']).del();

    const csv = [
      '*Code,*Name,*Type',
      '610,Test Bank Account,BANK',
      '720,Test Sales,SALES',
    ].join('\n');

    const result = await importChartOfAccounts({
      csv_content: csv,
      source_system: 'XERO',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.imported + result.updated).toBeGreaterThanOrEqual(1);

    // Clean up
    await db('accounts').whereIn('code', ['610', '720']).del();
  });

  it('XERO format maps BANK type to ASSET', async () => {
    await db('accounts').where('code', '611').del();

    const csv = [
      '*Code,*Name,*Type',
      '611,Another Bank Account,BANK',
    ].join('\n');

    await importChartOfAccounts({ csv_content: csv, source_system: 'XERO' });

    const account = await db('accounts').where('code', '611').first<{ type: string; category: string }>();
    expect(account?.type).toBe('ASSET');
    expect(account?.category).toBe('CURRENT_ASSET');

    // Clean up
    await db('accounts').where('code', '611').del();
  });
});

// ---------------------------------------------------------------------------
// postOpeningBalances
// ---------------------------------------------------------------------------

describe('postOpeningBalances', () => {
  it('posts a balanced journal', async () => {
    // Ensure accounts 1000 and 3100 exist (they're system accounts)
    const acc1000 = await db('accounts').where('code', '1000').first();
    if (!acc1000) {
      await db('accounts').insert({ code: '1000', name: 'Bank Current Account', type: 'ASSET', category: 'CURRENT_ASSET', active: true });
    }
    const acc3100 = await db('accounts').where('code', '3100').first();
    if (!acc3100) {
      await db('accounts').insert({ code: '3100', name: 'Retained Earnings', type: 'EQUITY', category: 'EQUITY', active: true });
    }

    const result = await postOpeningBalances({
      balances: [
        { account_code: '1000', debit: 10000, credit: 0 },
        { account_code: '3100', debit: 0, credit: 10000 },
      ],
      effective_date: `${TEST_PERIOD}-15`,
      description: 'Test opening balances',
    });

    expect(result.transaction_id).toBeTruthy();
    expect(result.total_debits).toBe('10000.00');
    expect(result.total_credits).toBe('10000.00');

    // MANUAL_JOURNAL requires manual approval, so the entry goes to the staging table.
    // Verify a MANUAL_JOURNAL with reference OPENING-BALANCES was staged.
    const staged = await db('staging')
      .where('reference', 'OPENING-BALANCES')
      .where('period_id', TEST_PERIOD)
      .first<{ transaction_type: string; reference: string; status: string }>();
    expect(staged).toBeTruthy();
    expect(staged?.transaction_type).toBe('MANUAL_JOURNAL');
    expect(staged?.reference).toBe('OPENING-BALANCES');
  });

  it('rejects unbalanced entries', async () => {
    await expect(
      postOpeningBalances({
        balances: [
          { account_code: '1000', debit: 5000, credit: 0 },
          { account_code: '3100', debit: 0, credit: 3000 },
        ],
        effective_date: `${TEST_PERIOD}-15`,
      }),
    ).rejects.toThrow(/do not balance/);
  });
});

// ---------------------------------------------------------------------------
// getSetupStatus after posting
// ---------------------------------------------------------------------------

describe('getSetupStatus after posting', () => {
  it('shows opening_balances_pending_approval while staged, has_opening_balances still false', async () => {
    // Opening-balances MANUAL_JOURNALs require manual approval. Until the
    // staged entry is committed to the ledger (real transactions row), the
    // ledger is effectively empty, so has_opening_balances must be false.
    // The new opening_balances_pending_approval flag surfaces the pending
    // staged entry so the UI can prompt "approve opening balances".
    const status = await getSetupStatus();
    expect(status.has_opening_balances).toBe(false);
    expect(status.opening_balances_pending_approval).toBe(true);
  });
});
