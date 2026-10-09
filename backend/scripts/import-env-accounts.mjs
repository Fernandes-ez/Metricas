// Importa IG_<ALIAS>_ID / IG_<ALIAS>_TOKEN do ambiente para ig_accounts.
// Uso: node --env-file=.env scripts/import-env-accounts.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const prisma = require("../src/services/db");
const { encrypt } = require("../src/services/tokenCrypto");

const DAY = 24 * 60 * 60 * 1000;
const refreshedAt = new Date("2026-10-09T00:00:00Z");
const expiresAt = new Date(refreshedAt.getTime() + 60 * DAY);

const aliases = Object.keys(process.env)
  .filter((k) => /^IG_.+_TOKEN$/.test(k))
  .map((k) => k.slice(3, -6))
  .sort();

try {
  for (const alias of aliases) {
    const id = process.env[`IG_${alias}_ID`];
    const token = process.env[`IG_${alias}_TOKEN`];
    try {
      if (!id || !token) throw new Error(`IG_${alias}_ID ou _TOKEN ausente`);

      const url = new URL("https://graph.instagram.com/v26.0/me");
      url.searchParams.set("fields", "user_id,username");
      url.searchParams.set("access_token", token);
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const me = await res.json();
      if (!res.ok) throw new Error(me.error?.message || `HTTP ${res.status}`);
      if (String(me.user_id) !== id) throw new Error("user_id da API não confere com IG_ID");

      const existed = await prisma.igAccount.findUnique({ where: { alias } });
      const data = {
        igUserId: id,
        username: me.username,
        accessTokenEnc: encrypt(token),
        tokenExpiresAt: expiresAt,
        tokenRefreshedAt: refreshedAt,
        status: "active",
        lastError: null,
      };
      await prisma.igAccount.upsert({
        where: { alias },
        create: { alias, ...data },
        update: data,
      });
      console.log(`${alias}\t@${me.username}\t${existed ? "atualizado" : "importado"}`);
    } catch (e) {
      console.log(`${alias}\t-\terro: ${e.message}`);
    }
  }
} finally {
  await prisma.$disconnect();
}
