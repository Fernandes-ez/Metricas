import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = 'http://localhost:3001';
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const portBusy = () =>
  new Promise((resolve) => {
    const s = net.connect(3001, '127.0.0.1');
    s.on('connect', () => (s.destroy(), resolve(true)));
    s.on('error', () => resolve(false));
  });

async function call(url) {
  const t = Date.now();
  let status, body;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    status = `${res.status} X-Cache=${res.headers.get("x-cache")} X-IG-Calls=${res.headers.get("x-ig-calls")} X-Insights-Pending=${res.headers.get("x-insights-pending")}`;
    body = await res.text();
  } catch (e) {
    status = 'ERRO';
    body = String(e);
  }
  console.log(`=== GET ${url} → ${status} (${Date.now() - t}ms)\n${body}\n`);
  return body;
}

if (await portBusy()) {
  console.error('Porta 3001 já está ocupada. Encerre o processo que a usa e rode de novo.');
  process.exit(1);
}

const child = spawn(process.execPath, ['--env-file-if-exists=.env', 'src/index.js'], { cwd, stdio: ['ignore', 'inherit', 'inherit'] });
try {
  const deadline = Date.now() + 15000;
  let up = false;
  while (Date.now() < deadline && !up) {
    try {
      await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(5000) });
      up = true;
    } catch {
      await sleep(500);
    }
  }
  if (!up) throw new Error('Servidor não respondeu em 15s');

  await call(`${BASE}/api/accounts`);
  await call(`${BASE}/api/accounts/EZF/insights`);
  await call(`${BASE}/api/accounts/AQUA/insights`);
  await call(`${BASE}/api/media/18107735059954025/insights?account=EZF`);
  await call(`${BASE}/api/accounts/TABUA/media`);
  await call(`${BASE}/api/accounts/TABUA/insights`);
  const f = await call(`${BASE}/api/accounts/AQUA/media?limit=10`);

  let reel;
  try {
    reel = JSON.parse(f).find((m) => m.media_product_type === 'REELS');
  } catch {}
  if (reel) await call(`${BASE}/api/media/${reel.id}/insights?account=AQUA`);
  else console.log('sem reels em AQUA\n');

  await call(`${BASE}/api/accounts/AQUA/media-insights?limit=3`);
  await call(`${BASE}/api/accounts/TABUA/media-insights`);
  // ordenação com cache em Postgres: 1ª chamada busca o que falta; a 2ª deve ter X-IG-Calls=0 (ou 1 se a lista expirou)
  await call(`${BASE}/api/accounts/AQUA/media?ordenar=reach&limite=5`);
  await call(`${BASE}/api/accounts/AQUA/media?ordenar=reach&limite=5`);
  await call(`${BASE}/api/accounts/AQUA/media?ordenar=xyz`);
  await call(`${BASE}/api/accounts/NAOEXISTE/insights`);
} finally {
  child.kill();
}
