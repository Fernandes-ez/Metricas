import express from 'express';
import { mcpAuthRouter, getOAuthProtectedResourceMetadataUrl } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { provider, login } from './oauth.js';
import { buildServer } from './tools.js';

const base = process.env.MCP_PUBLIC_URL ?? (process.env.MCP_DOMAIN && `https://${process.env.MCP_DOMAIN}`);
if (!base) throw new Error('Defina MCP_DOMAIN (ou MCP_PUBLIC_URL)');
if (!process.env.MCP_PASSWORD_HASH) throw new Error('Defina MCP_PASSWORD_HASH (node src/hash-password.js)');
const publicUrl = new URL(base);
const resourceUrl = new URL('/mcp', publicUrl);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // atrás do Caddy

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.post('/mcp-login', express.urlencoded({ extended: false, limit: '4kb' }), login);
app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: publicUrl,
    resourceServerUrl: resourceUrl,
    scopesSupported: ['mcp:read'],
    resourceName: 'Métricas Instagram',
  }),
);

const auth = requireBearerAuth({
  verifier: provider,
  requiredScopes: ['mcp:read'],
  resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(resourceUrl),
});

// Stateless: um servidor+transporte por requisição (pouca memória, sem sessões)
app.post('/mcp', auth, express.json({ limit: '100kb' }), async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Erro interno' }, id: null });
  }
});
app.all('/mcp', auth, (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Use POST' }));

const port = process.env.PORT ?? 3002;
app.listen(port, () => console.log(`MCP em :${port} (${publicUrl.origin}/mcp)`));
