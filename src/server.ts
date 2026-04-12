import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ChainWriter } from './chain/writer';
import { ChainFileExistsError } from './chain/types';
import { apiRouter } from './api/routes';
import { oauthRouter, registerOAuthDiscovery } from './api/oauth';
import { mcpRouter } from './mcp/server';
import { errorHandler } from './api/middleware/errors';
import { requestIdMiddleware } from './api/middleware/request-id';
import { config } from './config';
import { db } from './db/connection';

// ---------------------------------------------------------------------------
// server.ts — Express application entry point
// ---------------------------------------------------------------------------

/**
 * Bootstrap chain files for any period that has a DB row but no chain file.
 * This handles the case where periods were created by the seed script without
 * a corresponding chain file (e.g., the initial period on first startup).
 */
async function bootstrapChainFiles(): Promise<void> {
  const writer = new ChainWriter({
    chainDir: config.chainDir,
    getPeriodStatus: async (periodId: string) => {
      const row = await db('periods')
        .where('period_id', periodId)
        .select('status')
        .first<{ status: string } | undefined>();
      return (row?.status as 'OPEN' | 'SOFT_CLOSE' | 'HARD_CLOSE' | null) ?? null;
    },
  });

  const periods = await db('periods').orderBy('period_id', 'asc');

  for (const period of periods) {
    const chainFilePath = path.join(config.chainDir, `${period.period_id}.chain.jsonl`);
    const fileExists = await fs.access(chainFilePath).then(() => true).catch(() => false);
    if (!fileExists) {
      // Find the most recent preceding period that has a HARD_CLOSE status.
      const prevPeriod = await db('periods')
        .where('period_id', '<', period.period_id)
        .where('status', 'HARD_CLOSE')
        .orderBy('period_id', 'desc')
        .first<{ period_id: string } | undefined>();

      try {
        await writer.createPeriodFile(
          period.period_id,
          prevPeriod?.period_id ?? null,
          {},
        );
        console.log(`Bootstrapped chain file for period ${period.period_id}`);
      } catch (err) {
        if (err instanceof ChainFileExistsError) {
          // Race condition — another startup already created it; that's fine.
        } else {
          console.error(`Failed to bootstrap chain file for ${period.period_id}:`, err);
        }
      }
    }
  }
}

const app = express();

// ── Request ID (must be first) ────────────────────────────────────────────────
app.use(requestIdMiddleware);

// ── Body parsers (registered early — needed by OAuth routes below Helmet) ────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true })); // needed for OAuth login form POST

// ── OAuth routes — registered BEFORE Helmet so the login page HTML is not
//    affected by X-Frame-Options: DENY or restrictive CSP headers, and the
//    well-known JSON endpoints are not blocked by frame/content policies. ──────
registerOAuthDiscovery(app, config.baseUrl);
app.use('/oauth', oauthRouter);

// ── Security middleware ───────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  }),
);
app.use(cors());
app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));

// ── Health check (no auth required — registered BEFORE apiRouter) ────────────
const serverStartTime = Date.now();

app.get('/api/health', async (_req, res) => {
  const uptime = Math.floor((Date.now() - serverStartTime) / 1000);

  // Test DB connectivity.
  let dbStatus = 'connected';
  try {
    await db.raw('SELECT 1');
  } catch {
    dbStatus = 'disconnected';
  }

  // Test chain directory is accessible and writable.
  let chainDirWritable = false;
  try {
    await fs.access(config.chainDir, fs.constants.W_OK);
    chainDirWritable = true;
  } catch {
    chainDirWritable = false;
  }

  const status = dbStatus === 'connected' && chainDirWritable ? 'healthy' : 'degraded';

  res.status(status === 'healthy' ? 200 : 503).json({
    status,
    database: dbStatus,
    chain_dir: config.chainDir,
    chain_dir_writable: chainDirWritable,
    version: '1.0.0',
    uptime_seconds: uptime,
  });
});

// ── OAuth Protected Resource metadata (RFC 9728) ─────────────────────────────
// Claude's MCP client fetches this to discover the authorization server.
app.get('/.well-known/oauth-protected-resource', (_req, res) => {
  res.json({
    resource: config.baseUrl,
    authorization_servers: [config.baseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: ['ledger:read', 'ledger:write'],
  });
});
app.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => {
  res.json({
    resource: `${config.baseUrl}/mcp`,
    authorization_servers: [config.baseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: ['ledger:read', 'ledger:write'],
  });
});

// ── MCP endpoint (authenticated via Bearer token, not JWT) ───────────────────
app.use('/mcp', mcpRouter);

// ── API routes ───────────────────────────────────────────────────────────────
app.use('/api', apiRouter);

// ── Serve React frontend (static build) ──────────────────────────────────────
// In production/Docker the frontend is pre-built into src/web/dist.
// In development, the Vite dev server handles this separately.
const webDistPath = path.join(__dirname, '..', 'src', 'web', 'dist');

app.use(express.static(webDistPath));

// SPA fallback — serve index.html for any non-API route
app.get('*', (_req, res) => {
  res.sendFile(path.join(webDistPath, 'index.html'));
});

// ── Error handler (must be last) ─────────────────────────────────────────────
app.use(errorHandler);

// ── Start server (skip in test mode — supertest binds its own port) ──────────
if (config.env !== 'test') {
  bootstrapChainFiles()
    .then(() => {
      app.listen(config.port, () => {
        console.log(`GL MVP server running on port ${config.port} [${config.env}]`);
      });
    })
    .catch((err: unknown) => {
      console.error('Fatal: chain bootstrap failed:', err);
      process.exit(1);
    });
}

export { app };
