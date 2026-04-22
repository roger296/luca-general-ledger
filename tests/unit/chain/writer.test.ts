import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { computeEntryHash } from '../../../src/chain/hash';
import { ChainReader } from '../../../src/chain/reader';
import {
  ChainFileExistsError,
  ChainFileNotFoundError,
  PeriodClosedError,
  PeriodSoftClosedError,
} from '../../../src/chain/types';
import { ChainWriter } from '../../../src/chain/writer';
import type { PeriodStatus } from '../../../src/chain/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

/** Recursively make all files in a directory writable (needed for cleanup after
 * sealPeriod tests, which make chain files read-only). */
async function makeWritable(dir: string): Promise<void> {
  try {
    await fs.chmod(dir, 0o777);
  } catch {
    return;
  }
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      await fs.chmod(full, entry.isDirectory() ? 0o777 : 0o666);
    } catch {
      // best-effort
    }
    if (entry.isDirectory()) await makeWritable(full);
  }
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gl-writer-test-'));
});

afterEach(async () => {
  await makeWritable(tmpDir);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Returns a writer whose getPeriodStatus mock returns the given status. */
function makeWriter(status: PeriodStatus | null = 'OPEN'): ChainWriter {
  return new ChainWriter({
    chainDir: tmpDir,
    getPeriodStatus: () => Promise.resolve(status),
  });
}

const EMPTY_BALANCES: Record<string, { debit: number; credit: number }> = {};

// ---------------------------------------------------------------------------
// createPeriodFile
// ---------------------------------------------------------------------------

describe('createPeriodFile', () => {
  it('creates a JSONL file with a single GENESIS entry', async () => {
    const writer = makeWriter();
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);

    const filePath = path.join(tmpDir, '2026-03.chain.jsonl');
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]!);
    expect(entry.sequence).toBe(1);
    expect(entry.type).toBe('GENESIS');
  });

  it('sets previous_hash to "GENESIS" for the very first period', async () => {
    const writer = makeWriter();
    const entry = await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);
    expect(entry.previous_hash).toBe('GENESIS');
  });

  it('links to the previous period closing hash for subsequent periods', async () => {
    const writer = makeWriter();

    // Create and seal first period.
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);
    const closeEntry = await writer.sealPeriod('2026-03', {
      period_id: '2026-03',
      total_transactions: 0,
    });

    // Create second period.
    const genesis = await writer.createPeriodFile('2026-04', '2026-03', EMPTY_BALANCES);

    expect(genesis.previous_hash).toBe(closeEntry.entry_hash);
    expect(genesis.payload['previous_period_closing_hash']).toBe(closeEntry.entry_hash);
    expect(genesis.payload['previous_period_id']).toBe('2026-03');
  });

  it('stores opening_balances in the genesis payload', async () => {
    const balances = { '1000': { debit: 15000, credit: 0 } };
    const writer = makeWriter();
    const entry = await writer.createPeriodFile('2026-04', null, balances);
    expect(entry.payload['opening_balances']).toEqual(balances);
  });

  it('computes a valid entry_hash for the genesis entry', async () => {
    const writer = makeWriter();
    const entry = await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);
    expect(entry.entry_hash).toHaveLength(64);
    expect(computeEntryHash(entry)).toBe(entry.entry_hash);
  });

  it('throws ChainFileExistsError if the file already exists', async () => {
    const writer = makeWriter();
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);
    await expect(writer.createPeriodFile('2026-03', null, EMPTY_BALANCES)).rejects.toThrow(
      ChainFileExistsError,
    );
  });

  it('throws when previousPeriodId has no PERIOD_CLOSE entry', async () => {
    const writer = makeWriter();
    // Create 2026-03 but don't seal it.
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);

    await expect(
      writer.createPeriodFile('2026-04', '2026-03', EMPTY_BALANCES),
    ).rejects.toThrow(/PERIOD_CLOSE/);
  });

  it('creates the chain directory if it does not exist', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'chains', 'default');
    const writer = new ChainWriter({ chainDir: nestedDir, getPeriodStatus: () => Promise.resolve('OPEN') });
    await expect(
      writer.createPeriodFile('2026-03', null, EMPTY_BALANCES),
    ).resolves.toBeDefined();
    const stat = await fs.stat(path.join(nestedDir, '2026-03.chain.jsonl'));
    expect(stat.isFile()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// appendEntry
// ---------------------------------------------------------------------------

describe('appendEntry', () => {
  it('appends a second entry with sequence 2 after genesis', async () => {
    const writer = makeWriter();
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);

    const entry = await writer.appendEntry('2026-03', 'TRANSACTION', {
      transaction_id: 'TXN-001',
    });

    expect(entry.sequence).toBe(2);
    expect(entry.type).toBe('TRANSACTION');
  });

  it('sets previous_hash of appended entry to last entry_hash', async () => {
    const writer = makeWriter();
    const genesis = await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);

    const entry = await writer.appendEntry('2026-03', 'TRANSACTION', { n: 1 });
    expect(entry.previous_hash).toBe(genesis.entry_hash);
  });

  it('computes a valid entry_hash', async () => {
    const writer = makeWriter();
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);
    const entry = await writer.appendEntry('2026-03', 'TRANSACTION', { amount: 500 });
    expect(computeEntryHash(entry)).toBe(entry.entry_hash);
  });

  it('sequences multiple entries correctly', async () => {
    const writer = makeWriter();
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);

    for (let i = 1; i <= 5; i++) {
      await writer.appendEntry('2026-03', 'TRANSACTION', { n: i });
    }

    const reader = new ChainReader(tmpDir);
    const entries = await reader.readAllEntries('2026-03');
    expect(entries).toHaveLength(6); // genesis + 5 transactions
    entries.forEach((e, idx) => expect(e.sequence).toBe(idx + 1));
  });

  it('maintains a valid hash chain across multiple appends', async () => {
    const writer = makeWriter();
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);
    for (let i = 0; i < 5; i++) {
      await writer.appendEntry('2026-03', 'TRANSACTION', { i });
    }
    const reader = new ChainReader(tmpDir);
    const result = await reader.verifyChain('2026-03');
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(6);
  });

  it('throws PeriodClosedError when period status is HARD_CLOSE', async () => {
    const writer = makeWriter('HARD_CLOSE');
    await expect(
      writer.appendEntry('2026-02', 'TRANSACTION', {}),
    ).rejects.toThrow(PeriodClosedError);
  });

  it('throws PeriodSoftClosedError when period is SOFT_CLOSE without override', async () => {
    const writer = makeWriter('SOFT_CLOSE');
    await expect(
      writer.appendEntry('2026-03', 'TRANSACTION', {}),
    ).rejects.toThrow(PeriodSoftClosedError);
  });

  it('succeeds when period is SOFT_CLOSE with softCloseOverride: true', async () => {
    // Use a writer that returns OPEN for creation, SOFT_CLOSE for append.
    let callCount = 0;
    const writer = new ChainWriter({
      chainDir: tmpDir,
      getPeriodStatus: () =>
        Promise.resolve(callCount++ === 0 ? ('OPEN' as const) : ('SOFT_CLOSE' as const)),
    });
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);

    const entry = await writer.appendEntry(
      '2026-03',
      'TRANSACTION',
      { ref: 'month-end' },
      { softCloseOverride: true },
    );
    expect(entry.type).toBe('TRANSACTION');
  });

  it('throws ChainFileNotFoundError if the file has not been created', async () => {
    const writer = makeWriter();
    await expect(
      writer.appendEntry('2026-99', 'TRANSACTION', {}),
    ).rejects.toThrow(ChainFileNotFoundError);
  });

  it('persists entries to disk (survives reader after write)', async () => {
    const writer = makeWriter();
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);
    await writer.appendEntry('2026-03', 'TRANSACTION', { ref: 'TXN-001' });

    const reader = new ChainReader(tmpDir);
    const entries = await reader.readAllEntries('2026-03');
    expect(entries).toHaveLength(2);
    expect(entries[1]?.payload['ref']).toBe('TXN-001');
  });
});

// ---------------------------------------------------------------------------
// sealPeriod
// ---------------------------------------------------------------------------

describe('sealPeriod', () => {
  it('writes a PERIOD_CLOSE entry', async () => {
    const writer = makeWriter();
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);

    const closeEntry = await writer.sealPeriod('2026-03', {
      period_id: '2026-03',
      total_transactions: 0,
    });

    expect(closeEntry.type).toBe('PERIOD_CLOSE');
    expect(closeEntry.sequence).toBe(2); // after genesis
  });

  it('PERIOD_CLOSE entry has valid hash', async () => {
    const writer = makeWriter();
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);
    const closeEntry = await writer.sealPeriod('2026-03', { period_id: '2026-03' });
    expect(computeEntryHash(closeEntry)).toBe(closeEntry.entry_hash);
  });

  it('makes the chain file read-only', async () => {
    const writer = makeWriter();
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);
    await writer.sealPeriod('2026-03', { period_id: '2026-03' });

    const filePath = path.join(tmpDir, '2026-03.chain.jsonl');
    // Attempting to open the file for appending should fail.
    // Windows reports EPERM; Linux/macOS report EACCES.
    await expect(fs.open(filePath, 'a')).rejects.toThrow(/EACCES|EPERM|permission/i);
  });

  it('the chain remains valid after sealing', async () => {
    const writer = makeWriter();
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);
    await writer.appendEntry('2026-03', 'TRANSACTION', { n: 1 });
    await writer.sealPeriod('2026-03', { period_id: '2026-03' });

    const reader = new ChainReader(tmpDir);
    const result = await reader.verifyChain('2026-03');
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(3); // genesis + transaction + period_close
  });

  it('throws ChainFileNotFoundError if the file does not exist', async () => {
    const writer = makeWriter();
    await expect(
      writer.sealPeriod('2026-99', { period_id: '2026-99' }),
    ).rejects.toThrow(ChainFileNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Crash recovery
// ---------------------------------------------------------------------------

describe('crash recovery', () => {
  it('truncates an incomplete last line before appending the next entry', async () => {
    const writer = makeWriter();
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);
    const first = await writer.appendEntry('2026-03', 'TRANSACTION', { n: 1 });

    // Simulate a crash: append a partial (invalid) JSON line directly.
    const filePath = path.join(tmpDir, '2026-03.chain.jsonl');
    await fs.appendFile(filePath, '{"sequence":3,"truncated":tru'); // intentionally broken

    // The writer should clean up the incomplete line and continue correctly.
    const second = await writer.appendEntry('2026-03', 'TRANSACTION', { n: 2 });
    expect(second.sequence).toBe(3);
    expect(second.previous_hash).toBe(first.entry_hash);

    const reader = new ChainReader(tmpDir);
    const result = await reader.verifyChain('2026-03');
    expect(result.valid).toBe(true);
    expect(result.entries).toBe(3); // genesis + n:1 + n:2
  });
});

// ---------------------------------------------------------------------------
// Concurrent writes
// ---------------------------------------------------------------------------

describe('concurrent writes', () => {
  it('serialises concurrent appends and produces a valid hash chain', async () => {
    // Allow up to 30s: 10 serialised file writes with fsync on a real disk.
    const writer = makeWriter();
    await writer.createPeriodFile('2026-03', null, EMPTY_BALANCES);

    // Fire 10 appends concurrently — the mutex must serialise them.
    const promises = Array.from({ length: 10 }, (_, i) =>
      writer.appendEntry('2026-03', 'TRANSACTION', { index: i }),
    );
    const results = await Promise.all(promises);

    // All sequence numbers must be unique.
    const sequences = results.map((e) => e.sequence).sort((a, b) => a - b);
    expect(sequences).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    const reader = new ChainReader(tmpDir);
    const verify = await reader.verifyChain('2026-03');
    expect(verify.valid).toBe(true);
    expect(verify.entries).toBe(11); // genesis + 10 transactions
  }, 30_000);
});
