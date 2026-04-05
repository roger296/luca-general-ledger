import type { Request, Response, Express } from 'express';
import { Router } from 'express';
import bcrypt from 'bcrypt';
import {
  findOAuthClient,
  createAuthorizationCode,
  exchangeCodeForToken,
} from '../engine/oauth';
import { findUserByEmail } from '../db/queries/users';
import { config } from '../config';

// ---------------------------------------------------------------------------
// api/oauth.ts — OAuth 2.0 authorization server endpoints
//
// Implements the Authorization Code flow (with optional PKCE) so that
// Claude's "Add custom connector" dialog can authenticate users.
//
// Endpoints:
//   GET  /.well-known/oauth-authorization-server  — discovery
//   GET  /oauth/authorize                          — show login form
//   POST /oauth/authorize                          — validate & redirect
//   POST /oauth/token                              — exchange code for token
// ---------------------------------------------------------------------------

// ── HTML escaping helper ──────────────────────────────────────────────────

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Login page HTML ───────────────────────────────────────────────────────

function loginPage(opts: {
  clientName: string;
  params: Record<string, string>;
  error?: string;
}): string {
  const hidden = Object.entries(opts.params)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('\n      ');

  const errorHtml = opts.error
    ? `<div class="error">${esc(opts.error)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sign in — Luca General Ledger</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #1a1d23; color: #e9ecef; min-height: 100vh;
           display: flex; align-items: center; justify-content: center; }
    .card { background: #23272f; border: 1px solid rgba(255,255,255,0.08);
            border-radius: 12px; padding: 40px; width: 100%; max-width: 400px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
    .logo { text-align: center; margin-bottom: 28px; }
    .logo-icon { font-size: 36px; }
    h1 { font-size: 20px; font-weight: 700; margin-top: 8px; }
    .subtitle { color: #6c757d; font-size: 13px; margin-top: 4px; }
    .connector { background: rgba(13,110,253,0.1); border: 1px solid rgba(13,110,253,0.3);
                 border-radius: 6px; padding: 10px 14px; font-size: 13px; color: #7eb7ff;
                 margin-bottom: 24px; text-align: center; }
    .error { background: rgba(220,53,69,0.15); border: 1px solid rgba(220,53,69,0.4);
             border-radius: 6px; padding: 10px 14px; color: #ff6b7a;
             font-size: 13px; margin-bottom: 18px; }
    label { display: block; color: #adb5bd; font-size: 11px; font-weight: 600;
            text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    input[type=email], input[type=password] {
      width: 100%; padding: 10px 12px; background: #1a1d23;
      border: 1px solid rgba(255,255,255,0.12); border-radius: 6px;
      color: #fff; font-size: 14px; margin-bottom: 16px; outline: none;
    }
    input[type=email]:focus, input[type=password]:focus {
      border-color: #0d6efd; }
    button { width: 100%; padding: 11px; background: #0d6efd; color: #fff;
             border: none; border-radius: 6px; font-size: 14px; font-weight: 600;
             cursor: pointer; margin-top: 4px; }
    button:hover { background: #0b5ed7; }
    .footer { text-align: center; color: #495057; font-size: 11px; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-icon">📒</div>
      <h1>Luca General Ledger</h1>
      <p class="subtitle">Authorise connector access</p>
    </div>
    <div class="connector">Connecting: <strong>${esc(opts.clientName)}</strong></div>
    ${errorHtml}
    <form method="POST" action="/oauth/authorize">
      ${hidden}
      <label>Email address</label>
      <input type="email" name="email" required autofocus autocomplete="email"
             placeholder="you@yourcompany.com">
      <label>Password</label>
      <input type="password" name="password" required autocomplete="current-password">
      <button type="submit">Sign in &amp; Authorise</button>
    </form>
    <div class="footer">Your credentials are verified securely. This grants read/write access to your ledger.</div>
  </div>
</body>
</html>`;
}

// ── Router ────────────────────────────────────────────────────────────────

export const oauthRouter = Router();

/**
 * GET /oauth/authorize
 * Shows the login form. Claude redirects the user here.
 */
oauthRouter.get('/authorize', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      client_id,
      redirect_uri,
      response_type,
      state,
      code_challenge,
      code_challenge_method,
      scope,
      resource,
    } = req.query as Record<string, string | undefined>;

    if (response_type !== 'code') {
      res.status(400).send('Unsupported response_type. Only "code" is supported.');
      return;
    }
    if (!client_id || !redirect_uri) {
      res.status(400).send('client_id and redirect_uri are required.');
      return;
    }

    const client = await findOAuthClient(client_id);
    if (!client || !client.is_active) {
      res.status(400).send('Unknown or inactive client.');
      return;
    }

    // Accept any https://claude.ai/* redirect URI dynamically
    const isClaudeUri = redirect_uri.startsWith('https://claude.ai/');
    const registeredUris = Array.isArray(client.redirect_uris)
      ? client.redirect_uris as string[]
      : [];
    const isRegistered = registeredUris.includes(redirect_uri);
    if (!isClaudeUri && !isRegistered) {
      res.status(400).send('redirect_uri not permitted for this client.');
      return;
    }

    res.send(loginPage({
      clientName: client.name,
      params: {
        client_id,
        redirect_uri,
        response_type: 'code',
        ...(state ? { state } : {}),
        ...(code_challenge ? { code_challenge } : {}),
        ...(code_challenge_method ? { code_challenge_method } : {}),
        ...(scope ? { scope } : {}),
        ...(resource ? { resource } : {}),
      },
    }));
  } catch (err) {
    console.error('[oauth] GET /authorize error:', err);
    res.status(500).send('An internal error occurred. Please try again.');
  }
});

// Pre-computed bcrypt hash of a random string used for timing-safe comparison
// when a user email is not found. Must be a valid 60-char bcrypt hash.
const DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';

/** Build the OAuth params object to pass back into the hidden form fields. */
function oauthParams(body: Record<string, string | undefined>): Record<string, string> {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope, resource } = body;
  return {
    ...(client_id ? { client_id } : {}),
    ...(redirect_uri ? { redirect_uri } : {}),
    response_type: 'code',
    ...(state ? { state } : {}),
    ...(code_challenge ? { code_challenge } : {}),
    ...(code_challenge_method ? { code_challenge_method } : {}),
    ...(scope ? { scope } : {}),
    ...(resource ? { resource } : {}),
  };
}

/**
 * POST /oauth/authorize
 * Validates login credentials, issues auth code, redirects back to client.
 */
oauthRouter.post('/authorize', async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body as Record<string, string | undefined>;
    const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope, email, password } = body;

    // ── Validate client ───────────────────────────────────────────────────
    const client = await findOAuthClient(client_id ?? '');
    if (!client || !client.is_active) {
      res.status(400).send('Invalid or inactive client.');
      return;
    }

    const isClaudeUri = (redirect_uri ?? '').startsWith('https://claude.ai/');
    const registeredUris = Array.isArray(client.redirect_uris)
      ? client.redirect_uris as string[]
      : [];
    const isRegistered = registeredUris.includes(redirect_uri ?? '');
    if (!isClaudeUri && !isRegistered) {
      res.status(400).send('redirect_uri not permitted for this client.');
      return;
    }

    // Helper to re-show the form with an error
    const showError = (error: string) => {
      res.send(loginPage({ clientName: client.name, params: oauthParams(body), error }));
    };

    // ── Validate credentials ──────────────────────────────────────────────
    if (!email?.trim() || !password) {
      showError('Email and password are required.');
      return;
    }

    const user = await findUserByEmail(email.trim().toLowerCase());
    const hashToCheck = user?.password_hash ?? DUMMY_HASH;

    let valid = false;
    try {
      valid = await bcrypt.compare(password, hashToCheck);
    } catch {
      // bcrypt throws on malformed hashes — treat as invalid credentials
      valid = false;
    }

    if (!user || !valid || !user.is_active) {
      showError('Invalid email or password.');
      return;
    }

    // ── Issue authorization code ──────────────────────────────────────────
    const scopes = scope ? scope.split(/[\s+]+/).filter(Boolean) : ['ledger:read', 'ledger:write'];

    const code = await createAuthorizationCode({
      clientId: client_id!,
      userId: user.id,
      redirectUri: redirect_uri!,
      scopes,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
    });

    const callbackUrl = new URL(redirect_uri!);
    callbackUrl.searchParams.set('code', code);
    callbackUrl.searchParams.set('iss', config.baseUrl); // RFC 9207 — required by MCP spec
    if (state) callbackUrl.searchParams.set('state', state);

    console.log('[oauth] Redirecting to callback:', callbackUrl.toString());
    res.redirect(callbackUrl.toString());

  } catch (err) {
    console.error('[oauth] POST /authorize error:', err);
    res.status(500).send('An internal error occurred during authorisation. Please try again.');
  }
});

/**
 * OPTIONS /oauth/token — CORS preflight
 * Claude's backend calls this cross-origin from their servers.
 */
oauthRouter.options('/token', (req: Request, res: Response): void => {
  res
    .set('Access-Control-Allow-Origin', req.headers.origin ?? '*')
    .set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    .set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    .set('Access-Control-Max-Age', '86400')
    .status(204)
    .end();
});

/**
 * POST /oauth/token
 * Exchanges authorization code for a Bearer access token.
 * Accepts both application/x-www-form-urlencoded and application/json.
 */
oauthRouter.post('/token', async (req: Request, res: Response): Promise<void> => {
  // Allow cross-origin calls from Claude's backend servers
  res.set('Access-Control-Allow-Origin', req.headers.origin ?? '*');

  // Support both JSON and form-encoded bodies
  const body = req.body as Record<string, string | undefined>;
  const grant_type = body['grant_type'];
  const code = body['code'];
  const redirect_uri = body['redirect_uri'];
  const client_id = body['client_id'];
  const client_secret = body['client_secret'];
  const code_verifier = body['code_verifier'];

  console.log('[oauth] POST /token', {
    grant_type,
    client_id,
    has_code: !!code,
    has_verifier: !!code_verifier,
    has_redirect: !!redirect_uri,
  });

  if (grant_type !== 'authorization_code') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }
  if (!code || !client_id || !redirect_uri) {
    res.status(400).json({ error: 'invalid_request', error_description: 'code, client_id, and redirect_uri are required' });
    return;
  }

  try {
    const token = await exchangeCodeForToken({
      code,
      clientId: client_id,
      clientSecret: client_secret,
      codeVerifier: code_verifier,
      redirectUri: redirect_uri,
    });

    res.json({
      access_token: token,
      token_type: 'Bearer',
      scope: 'ledger:read ledger:write',
    });
  } catch (err) {
    console.error('[oauth] Token exchange failed:', err);
    res.status(400).json({
      error: 'invalid_grant',
      error_description: err instanceof Error ? err.message : 'Token exchange failed',
    });
  }
});

// ── OAuth discovery ───────────────────────────────────────────────────────

export function registerOAuthDiscovery(app: Express, baseUrl: string): void {
  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      authorization_response_iss_parameter_supported: true,
      scopes_supported: ['ledger:read', 'ledger:write'],
    });
  });
}
