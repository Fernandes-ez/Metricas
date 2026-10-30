// Cadastro de tokens e contas de anúncios (Marketing API).
// Na VM (o prefixo aponta o banco para "db"):
//   docker compose exec backend ./docker-entrypoint.sh npm run ads -- token EZF_TECH
//       pede o token do usuário do sistema SEM mostrar na tela, valida, cifra e salva
//   docker compose exec backend ./docker-entrypoint.sh npm run ads -- conta AQUA act_1031390936714177 EZF_TECH 1500
//       liga a conta de anúncios ao perfil; o último argumento (teto mensal) é opcional ("sem" remove o teto)
//   docker compose exec backend ./docker-entrypoint.sh npm run ads -- listar
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const prisma = require("../src/services/db");
const { encrypt, decrypt } = require("../src/services/tokenCrypto");
const { adsGet, adsGetAll } = require("../src/services/adsClient");

const USAGE = `Uso:
  npm run ads -- token <LABEL>                          cadastra/atualiza o token (digitação oculta)
  npm run ads -- conta <APELIDO> <act_ID> <LABEL> [teto] liga a conta de anúncios ao perfil
  npm run ads -- listar                                 mostra tokens e contas cadastrados`;

const LABEL = /^[A-Z0-9_-]{1,32}$/;
const CTRL_C = String.fromCharCode(3);
const DEL = String.fromCharCode(127);
const BACKSPACE = String.fromCharCode(8);
const BRACKETED_PASTE = new RegExp(String.fromCharCode(27) + "\\[20[01]~", "g");

// lê o token sem eco no terminal; se vier por pipe, lê o stdin inteiro
async function readSecret(prompt) {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    let s = "";
    for await (const chunk of stdin) s += chunk;
    return s.trim();
  }
  process.stdout.write(prompt);
  return new Promise((resolve) => {
    let buf = "";
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    const onData = (data) => {
      for (const ch of data) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(buf.replace(BRACKETED_PASTE, "").trim());
        }
        if (ch === CTRL_C) {
          stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (ch === DEL || ch === BACKSPACE) buf = buf.slice(0, -1);
        else buf += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function cmdToken(label) {
  if (!LABEL.test(label || "")) throw new Error("LABEL deve ter A-Z, 0-9, _ ou - (ex.: EZF_TECH)");
  const token = await readSecret(`Cole o token do usuário do sistema (${label}) e tecle Enter: `);
  if (!token) throw new Error("Token vazio");

  const me = await adsGet("me", { fields: "id,name" }, token);
  const accounts = await adsGetAll("me/adaccounts", { fields: "account_id,name,currency", limit: 100 }, token);

  const existed = await prisma.adToken.findUnique({ where: { label } });
  const data = { tokenEnc: encrypt(token), status: "active", lastError: null, checkedAt: new Date() };
  await prisma.adToken.upsert({ where: { label }, create: { label, ...data }, update: data });

  console.log(`\nToken ${label} ${existed ? "atualizado" : "cadastrado"} (usuário do sistema: ${me.name}).`);
  console.log(`Contas de anúncios visíveis para ele (${accounts.length}):`);
  for (const a of accounts) console.log(`  act_${a.account_id}\t${a.currency}\t${a.name}`);
  if (!accounts.length)
    console.log("  (nenhuma) — atribua as contas de anúncios ao usuário do sistema e gere o token de novo.");
}

async function cmdConta(aliasArg, actArg, label, capArg) {
  const alias = String(aliasArg || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,32}$/.test(alias)) throw new Error("APELIDO inválido (ex.: AQUA)");
  const digits = String(actArg || "").replace(/^act_/, "");
  if (!/^\d{5,25}$/.test(digits)) throw new Error("act_ID inválido (ex.: act_1031390936714177)");
  const adAccountId = `act_${digits}`;

  const tokenRow = await prisma.adToken.findUnique({ where: { label: label || "" } });
  if (!tokenRow) throw new Error(`Token ${label} não cadastrado; rode antes: npm run ads -- token ${label}`);

  let monthlyCap; // undefined = não mexe
  if (capArg !== undefined) {
    if (capArg === "sem") monthlyCap = null;
    else {
      const n = Number(String(capArg).replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) throw new Error('teto deve ser um número positivo (ex.: 1500) ou "sem"');
      monthlyCap = n;
    }
  }

  const info = await adsGet(adAccountId, { fields: "name,currency,timezone_name" }, decrypt(tokenRow.tokenEnc));
  const data = {
    alias,
    tokenId: tokenRow.id,
    name: info.name,
    currency: info.currency,
    timezone: info.timezone_name,
    status: "active",
    lastError: null,
    ...(monthlyCap !== undefined ? { monthlyCap } : {}),
  };
  const row = await prisma.adAccount.upsert({
    where: { adAccountId },
    create: { adAccountId, ...data },
    update: data,
  });
  console.log(
    `${alias}\t${adAccountId}\t${info.name}\t${info.currency}\tteto: ${row.monthlyCap === null ? "sem (só leitura)" : row.monthlyCap}`,
  );
}

async function cmdListar() {
  const tokens = await prisma.adToken.findMany({ orderBy: { label: "asc" } });
  console.log("Tokens:");
  for (const t of tokens) console.log(`  ${t.label}\t${t.status}${t.lastError ? `\t${t.lastError}` : ""}`);
  const accounts = await prisma.adAccount.findMany({ include: { token: true }, orderBy: { alias: "asc" } });
  console.log("Contas de anúncios:");
  for (const a of accounts)
    console.log(
      `  ${a.alias}\t${a.adAccountId}\t${a.name ?? "-"}\t${a.token.label}\tteto: ${a.monthlyCap === null ? "sem" : a.monthlyCap}`,
    );
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === "token") await cmdToken(args[0]);
  else if (cmd === "conta") await cmdConta(...args);
  else if (cmd === "listar") await cmdListar();
  else console.log(USAGE);
} catch (e) {
  console.error(`Erro: ${e.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
