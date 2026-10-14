// Gera uma linha NOME=hash: node mcp/src/hash-password.js [NOME] (padrão MCP_PASSWORD_HASH; no frontend use AUTH_PASSWORD_HASH)
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const rl = createInterface({ input: process.stdin, output: process.stderr });
const pw = await rl.question('Senha (aparece ao digitar): ');
rl.close();
if (pw.length < 12) {
  console.error('Use pelo menos 12 caracteres.');
  process.exit(1);
}
const salt = randomBytes(16);
console.log(`${process.argv[2] ?? "MCP_PASSWORD_HASH"}=scrypt.${salt.toString('base64url')}.${scryptSync(pw, salt, 32).toString('base64url')}`);
