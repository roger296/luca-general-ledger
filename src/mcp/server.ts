import type { Request, Response } from 'express';
import { Router } from 'express';
import { validateAccessToken } from '../engine/oauth';
import { registerTools } from './tools';

// ---------------------------------------------------------------------------
// MCP HTTP Server — implements JSON-RPC 2.0 over HTTP (stateless mode)
//
// Claude's MCP client sends POST requests with JSON-RPC payloads.
// Each request is independent (stateless) — no persistent session needed.
//
// Protocol:
//   POST /mcp  Content-Type: application/json
//   Authorization: Bearer <token>
//
// Methods handled:
//   initialize          — return server capabilities
//   tools/list          — return list of available tools
//   tools/call          — invoke a tool and return result
//   ping                — health check
// ---------------------------------------------------------------------------

export const mcpRouter = Router();

// ── Types ──────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Tool registry — built once at startup ─────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
  handler: (args: Record<string, unknown>) => Promise<{
    content: Array<{ type: 'text'; text: string }>;
    isError?: boolean;
  }>;
}

const toolRegistry = new Map<string, ToolDef>();

// registerTools calls .tool() on our stub McpServer — we capture those calls here
const stubServer = {
  tool(
    name: string,
    description: string,
    schema: Record<string, { _def?: unknown; description?: string }>,
    handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }>,
  ) {
    // Convert zod schema to JSON Schema properties
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, zodType] of Object.entries(schema)) {
      // Basic zod → JSON Schema conversion
      const def = (zodType as { _def?: { typeName?: string; description?: string; innerType?: { _def?: { typeName?: string } }; checks?: Array<{ kind: string }> } })._def;
      const typeName = def?.typeName ?? '';

      let jsonType: unknown = { type: 'string' };

      if (typeName === 'ZodString') {
        jsonType = { type: 'string' };
      } else if (typeName === 'ZodNumber') {
        jsonType = { type: 'number' };
      } else if (typeName === 'ZodBoolean') {
        jsonType = { type: 'boolean' };
      } else if (typeName === 'ZodEnum') {
        const enumDef = def as { values?: string[] };
        jsonType = { type: 'string', enum: enumDef.values ?? [] };
      } else if (typeName === 'ZodArray') {
        jsonType = { type: 'array', items: { type: 'string' } };
      } else if (typeName === 'ZodObject') {
        jsonType = { type: 'object' };
      } else if (typeName === 'ZodOptional') {
        const inner = def?.innerType?._def?.typeName ?? '';
        if (inner === 'ZodNumber') jsonType = { type: 'number' };
        else if (inner === 'ZodBoolean') jsonType = { type: 'boolean' };
        else jsonType = { type: 'string' };
      }

      if (def?.description) {
        (jsonType as Record<string, unknown>)['description'] = def.description;
      }

      properties[key] = jsonType;

      // Mark as required if not optional/nullable
      if (typeName !== 'ZodOptional' && typeName !== 'ZodNullable') {
        required.push(key);
      }
    }

    toolRegistry.set(name, {
      name,
      description,
      inputSchema: { type: 'object', properties, required },
      handler,
    });
  },
};

// Populate the registry
registerTools(stubServer);

// ── JSON-RPC helpers ──────────────────────────────────────────────────────

function rpcOk(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

function rpcErr(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

// ── Handlers ──────────────────────────────────────────────────────────────

function handleInitialize(id: string | number | null): JsonRpcResponse {
  return rpcOk(id, {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo: { name: 'luca-general-ledger', version: '1.0.0' },
  });
}

function handleToolsList(id: string | number | null): JsonRpcResponse {
  const tools = Array.from(toolRegistry.values()).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  }));
  return rpcOk(id, { tools });
}

async function handleToolsCall(
  id: string | number | null,
  params: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  const toolName = params['name'] as string | undefined;
  const args = (params['arguments'] ?? {}) as Record<string, unknown>;

  if (!toolName) {
    return rpcErr(id, -32602, 'Missing tool name');
  }

  const tool = toolRegistry.get(toolName);
  if (!tool) {
    return rpcErr(id, -32602, `Unknown tool: ${toolName}`);
  }

  try {
    const result = await tool.handler(args);
    return rpcOk(id, result);
  } catch (err) {
    return rpcErr(id, -32603, err instanceof Error ? err.message : 'Tool execution failed');
  }
}

// ── Main route handler ────────────────────────────────────────────────────

mcpRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  // ── Authenticate ──────────────────────────────────────────────────────
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'unauthorized', error_description: 'Bearer token required' });
    return;
  }

  const session = await validateAccessToken(token);
  if (!session) {
    res.status(401).json({ error: 'unauthorized', error_description: 'Invalid or expired token' });
    return;
  }

  // ── Parse JSON-RPC body ───────────────────────────────────────────────
  const body = req.body as JsonRpcRequest | JsonRpcRequest[] | undefined;

  if (!body) {
    res.status(400).json(rpcErr(null, -32700, 'Parse error: empty body'));
    return;
  }

  // Handle batch requests
  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map((r) => dispatch(r)));
    res.json(responses);
    return;
  }

  const response = await dispatch(body);
  res.json(response);
});

// GET /mcp — used by Claude to check if the endpoint exists
mcpRouter.get('/', (_req: Request, res: Response): void => {
  res.json({
    name: 'luca-general-ledger',
    version: '1.0.0',
    description: 'Luca General Ledger MCP Server',
    tools: toolRegistry.size,
  });
});

// ── Dispatcher ────────────────────────────────────────────────────────────

async function dispatch(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id = null, method, params = {} } = req;

  if (req.jsonrpc !== '2.0') {
    return rpcErr(id, -32600, 'Invalid Request: jsonrpc must be "2.0"');
  }

  switch (method) {
    case 'initialize':
      return handleInitialize(id);

    case 'notifications/initialized':
      // Notification — no response needed, but return ok for robustness
      return rpcOk(id, null);

    case 'ping':
      return rpcOk(id, {});

    case 'tools/list':
      return handleToolsList(id);

    case 'tools/call':
      return await handleToolsCall(id, params);

    default:
      return rpcErr(id, -32601, `Method not found: ${method}`);
  }
}
