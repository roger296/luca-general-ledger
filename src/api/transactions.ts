import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { db } from '../db/connection';
import { postTransaction } from '../engine/post';
import type { CommittedResult, StagedResult, TransactionSubmission, TransactionType } from '../engine/types';
import { requirePermission } from './middleware/authorise';
import { getDocumentsByTransactionId } from '../engine/document-inbox';

// ---------------------------------------------------------------------------
// transactions.ts — Transaction posting and query endpoints
// ---------------------------------------------------------------------------

export const transactionsRouter = Router();

/** GET /api/transactions?period_id=&type=&search=&limit=&offset= */
transactionsRouter.get('/', requirePermission('transaction:view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { period_id, type, search, limit = '50', offset = '0' } =
      req.query as Record<string, string | undefined>;

    let query = db('transactions').orderBy('date', 'desc').orderBy('transaction_id', 'desc');

    if (period_id) query = query.where('period_id', period_id);
    if (type) query = query.where('transaction_type', type);
    if (search) {
      query = query.where(function () {
        this.where('reference', 'ilike', `%${search}%`)
          .orWhere('description', 'ilike', `%${search}%`)
          .orWhere('transaction_id', 'ilike', `%${search}%`);
      });
    }

    const total = await query.clone().clear('order').count<[{ count: string }]>('transaction_id as count').first();
    const rows = await query.limit(parseInt(limit, 10)).offset(parseInt(offset, 10));

    res.json({
      success: true,
      data: rows,
      total: parseInt(total?.count ?? '0', 10),
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/transactions/bulk */
transactionsRouter.post('/bulk', requirePermission('transaction:post'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { transactions, stop_on_error = false } = req.body as {
      transactions: Array<Record<string, unknown>>;
      stop_on_error?: boolean;
    };

    if (!Array.isArray(transactions) || transactions.length === 0) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'transactions must be a non-empty array' } });
      return;
    }

    let posted = 0;
    let staged = 0;
    let errors = 0;
    const results: Array<Record<string, unknown>> = [];

    for (let i = 0; i < transactions.length; i++) {
      const txn = transactions[i]!;
      try {
        const submission: TransactionSubmission = {
          transaction_type: txn['transaction_type'] as TransactionType,
          date: txn['date'] as string,
          period_id: txn['period_id'] as string,
          reference: txn['reference'] as string | undefined,
          description: txn['description'] as string | undefined,
          amount: txn['amount'] as number | undefined,
          idempotency_key: txn['idempotency_key'] as string | undefined,
          counterparty: txn['counterparty'] as { trading_account_id?: string; contact_id?: string } | undefined,
          lines: txn['lines'] as Array<{ account_code: string; description: string; debit: number; credit: number }> | undefined,
          account_code: txn['account_code'] as string | undefined,
          tax_code: txn['tax_code'] as import('../engine/types').TaxCode | undefined,
        };
        const result = await postTransaction(submission);
        if (result.status === 'COMMITTED') {
          posted++;
          results.push({ index: i, status: 'COMMITTED', transaction_id: (result as CommittedResult).transaction_id });
        } else {
          staged++;
          results.push({ index: i, status: 'STAGED', staging_id: (result as StagedResult).staging_id });
        }
      } catch (err) {
        errors++;
        const message = err instanceof Error ? err.message : String(err);
        results.push({ index: i, status: 'ERROR', error: message });
        if (stop_on_error) break;
      }
    }

    res.status(201).json({
      success: true,
      data: { total: transactions.length, posted, staged, errors, results },
    });
  } catch (err) {
    next(err);
  }
});

/** POST /api/transactions/:id/documents — upload and attach a document to a transaction */
transactionsRouter.post(
  '/:id/documents',
  requirePermission('transaction:post'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { uploadDocument } = await import('../engine/document-inbox');
      const { filename, mime_type, file_data } = req.body as Record<string, string | undefined>;

      if (!filename || !mime_type || !file_data) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'filename, mime_type, and file_data are required' },
        });
        return;
      }

      const doc = await uploadDocument({ filename, mime_type, file_data, transaction_id: req.params['id'] });
      res.status(201).json({ success: true, data: doc });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found') || message.includes('exceeds') || message.includes('not valid base64')) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
        return;
      }
      next(err);
    }
  },
);

/** GET /api/transactions/:id/documents — documents linked to this transaction */
transactionsRouter.get(
  '/:id/documents',
  requirePermission('transaction:view'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const docs = await getDocumentsByTransactionId(id!);
      res.json({ success: true, data: docs });
    } catch (err) {
      next(err);
    }
  },
);

/** GET /api/transactions/:id — transaction with lines */
transactionsRouter.get('/:id', requirePermission('transaction:view'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const txn = await db('transactions').where('transaction_id', id).first();
    if (!txn) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Transaction ${id} not found` } });
      return;
    }
    const lines = await db('transaction_lines')
      .where('transaction_id', id)
      .orderBy('debit', 'desc');
    const documents = await db('inbox_documents')
      .where('assigned_transaction_id', id)
      .select('id', 'filename', 'mime_type', 'document_type', 'file_size', 'completed_at')
      .orderBy('completed_at', 'desc');
    res.json({ success: true, data: { ...txn, lines, documents } });
  } catch (err) {
    next(err);
  }
});

/** POST /api/transactions */
transactionsRouter.post('/', requirePermission('transaction:post'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const submission = req.body as TransactionSubmission;
    const result = await postTransaction(submission);
    const status = result.status === 'COMMITTED' ? 201 : 202;
    res.status(status).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});
