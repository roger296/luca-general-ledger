// ---------------------------------------------------------------------------
// config/index.ts — centralised environment configuration
// ---------------------------------------------------------------------------

const env = process.env['NODE_ENV'] ?? 'development';

export const config = {
  env,
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  chainDir: process.env['CHAIN_DIR'] ?? 'chains/default',
  documentStorageDir: process.env['DOCUMENT_STORAGE_DIR'] ?? 'data/documents',
  database: {
    url:
      env === 'test'
        ? (process.env['TEST_DATABASE_URL'] ??
          'postgresql://gl_admin:gl_test_password@localhost:5433/gl_ledger_test')
        : (process.env['DATABASE_URL'] ??
          'postgresql://gl_admin:gl_dev_password_change_me@localhost:5432/gl_ledger'),
    pool: { min: env === 'test' ? 1 : 2, max: env === 'test' ? 5 : 10 },
  },
  jwt: {
    secret: process.env['JWT_SECRET'] ?? 'dev-secret-change-me-in-production',
    expiresIn: process.env['JWT_EXPIRES_IN'] ?? '24h',
  },
  baseUrl: process.env['BASE_URL'] ?? `http://localhost:3000`,
  dev: {
    apiKey: process.env['DEV_API_KEY'] ?? 'dev',
  },
  webhooks: {
    escalationHours: parseInt(process.env['ESCALATION_HOURS'] ?? '48', 10),
    maxRetryAttempts: 5,
    retryDelaysMs: [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000],
  },
} as const;
