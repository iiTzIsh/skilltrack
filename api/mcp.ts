import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildServer } from './_lib/tools.js';
import { ownerStore } from './_lib/supabaseStore.js';
import type { DocStore } from './_lib/model.js';

/**
 * SkillTrack connector for Claude (remote MCP, stateless Streamable HTTP).
 * URL: https://<your-site>/mcp/<MCP_SECRET>   (or /api/mcp with header "Authorization: Bearer <MCP_SECRET>")
 */
type Req = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };

function secretOk(req: Req) {
  const secret = process.env.MCP_SECRET || '';
  if (secret.length < 16) return false;
  const url = new URL(req.url || '/', 'http://x');
  const given = String(req.query?.key ?? url.searchParams.get('key') ?? '') || (String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
const send = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body));
};

export async function handleMcp(req: Req, res: ServerResponse, getStore: () => Promise<DocStore>) {
  if (!secretOk(req)) return send(res, 401, { error: 'Unauthorized. Check the connector URL (it must end with your MCP_SECRET).' });
  if (req.method !== 'POST') { res.setHeader('allow', 'POST'); return send(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }); }
  let store: DocStore;
  try { store = await getStore(); } catch (e: any) { return send(res, 500, { jsonrpc: '2.0', error: { code: -32603, message: e?.message || 'Server not configured' }, id: null }); }
  const server = buildServer(store);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* let transport report */ } }
  await transport.handleRequest(req, res, body);
}

export default function handler(req: Req, res: ServerResponse) {
  return handleMcp(req, res, ownerStore);
}

