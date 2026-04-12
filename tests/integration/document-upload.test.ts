/**
 * Integration tests for POST /api/documents/upload and POST /api/transactions/:id/documents
 */
import request from 'supertest';
import { db } from '../../src/db/connection';
import { app } from '../../src/server';

const API_KEY = 'dev';
const AUTH = { 'X-API-Key': API_KEY };
const TEST_PERIOD = '2076-04';
const CHAIN_DIR = 'chains/default';

const testFileContent = Buffer.from('Hello, this is a test document.').toString('base64');
const testFilename = 'test-doc.txt';
const testMimeType = 'text/plain';

let testTransactionId: string;

async function cleanupPeriod(pid: string): Promise<void> {
  await db('inbox_documents')
    .whereIn('assigned_transaction_id',
      db('transactions').where('period_id', pid).select('transaction_id'))
    .del();
  await db('transaction_lines')
    .whereIn('transaction_id', db('transactions').where('period_id', pid).select('transaction_id'))
    .del();
  await db('transactions').where('period_id', pid).del();
  await db('staging').where('period_id', pid).del();
  await db('periods').where('period_id', pid).del();
}

async function cleanupDocuments(): Promise<void> {
  await db('inbox_documents').where('processed_by', 'api-upload').del();
}

beforeAll(async () => {
  await cleanupPeriod(TEST_PERIOD);
  await cleanupDocuments();

  await db('periods').insert({
    period_id: TEST_PERIOD,
    start_date: '2076-04-01',
    end_date: '2076-04-30',
    status: 'OPEN',
    data_flag: 'PROVISIONAL',
    opened_at: new Date().toISOString(),
  });

  const { ChainWriter } = await import('../../src/chain/writer');
  const writer = new ChainWriter({
    chainDir: CHAIN_DIR,
    getPeriodStatus: async (pid: string) => {
      const row = await db('periods').where('period_id', pid).select('status').first<{ status: string }>();
      return (row?.status as 'OPEN' | 'SOFT_CLOSE' | 'HARD_CLOSE' | null) ?? null;
    },
  });
  await writer.createPeriodFile(TEST_PERIOD, null, {});

  // Post a transaction to link documents to
  const res = await request(app)
    .post('/api/transactions')
    .set(AUTH)
    .send({
      transaction_type: 'CUSTOMER_INVOICE',
      date: '2076-04-05',
      period_id: TEST_PERIOD,
      amount: 120,
      description: 'Test transaction for document upload',
    });
  testTransactionId = res.body.data?.transaction_id as string;
});

afterAll(async () => {
  await cleanupDocuments();
  await cleanupPeriod(TEST_PERIOD);
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const fp = path.join(CHAIN_DIR, `${TEST_PERIOD}.chain.jsonl`);
  try { await fs.chmod(fp, 0o644); } catch { /**/ }
  try { await fs.unlink(fp); } catch { /**/ }
});

describe('POST /api/documents/upload', () => {
  it('uploads a document and links it to a transaction', async () => {
    const res = await request(app)
      .post('/api/documents/upload')
      .set(AUTH)
      .send({
        filename: testFilename,
        mime_type: testMimeType,
        file_data: testFileContent,
        transaction_id: testTransactionId,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeTruthy();
    expect(res.body.data.filename).toBe(testFilename);
    expect(res.body.data.file_size).toBe(Buffer.from(testFileContent, 'base64').byteLength);
    expect(res.body.data.assigned_transaction_id).toBe(testTransactionId);
    expect(res.body.data.status).toBe('PROCESSED');
  });

  it('document appears in GET /api/documents/by-transaction/:txId', async () => {
    const res = await request(app)
      .get(`/api/documents/by-transaction/${testTransactionId}`)
      .set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const docs = res.body.data as Array<{ filename: string }>;
    expect(docs.some((d) => d.filename === testFilename)).toBe(true);
  });

  it('returns 400 when filename is missing', async () => {
    const res = await request(app)
      .post('/api/documents/upload')
      .set(AUTH)
      .send({ mime_type: testMimeType, file_data: testFileContent });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for a non-existent transaction_id', async () => {
    const res = await request(app)
      .post('/api/documents/upload')
      .set(AUTH)
      .send({
        filename: testFilename,
        mime_type: testMimeType,
        file_data: testFileContent,
        transaction_id: 'TXN-DOES-NOT-EXIST',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not found/i);
  });

  it('returns 400 when file exceeds 25 MB', async () => {
    const bigFile = Buffer.alloc(26 * 1024 * 1024, 'x').toString('base64');
    const res = await request(app)
      .post('/api/documents/upload')
      .set(AUTH)
      .send({ filename: 'big.bin', mime_type: 'application/octet-stream', file_data: bigFile });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/exceeds/i);
  });
});

describe('POST /api/transactions/:id/documents (convenience route)', () => {
  it('uploads via the transactions convenience route', async () => {
    const res = await request(app)
      .post(`/api/transactions/${testTransactionId}/documents`)
      .set(AUTH)
      .send({
        filename: 'convenience-test.txt',
        mime_type: 'text/plain',
        file_data: testFileContent,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assigned_transaction_id).toBe(testTransactionId);
  });

  it('returns 400 when mime_type is missing', async () => {
    const res = await request(app)
      .post(`/api/transactions/${testTransactionId}/documents`)
      .set(AUTH)
      .send({ filename: testFilename, file_data: testFileContent });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/documents/:id/file', () => {
  it('returns the file content after upload', async () => {
    const uploadRes = await request(app)
      .post('/api/documents/upload')
      .set(AUTH)
      .send({ filename: 'retrieve-test.txt', mime_type: 'text/plain', file_data: testFileContent });

    expect(uploadRes.status).toBe(201);
    const docId = uploadRes.body.data.id as string;

    const fileRes = await request(app)
      .get(`/api/documents/${docId}/file`)
      .set(AUTH);

    expect(fileRes.status).toBe(200);
    expect(fileRes.text).toBe('Hello, this is a test document.');
  });
});
