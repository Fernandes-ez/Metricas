const prisma = require("../services/db");
const { encrypt, decrypt } = require("../services/tokenCrypto");

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

async function refreshOne(acc) {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", decrypt(acc.accessTokenEnc));

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error?.message || "Erro ao renovar token");
    err.code = data.error?.code;
    throw err;
  }

  const now = new Date();
  await prisma.igAccount.update({
    where: { id: acc.id },
    data: {
      accessTokenEnc: encrypt(data.access_token),
      tokenExpiresAt: new Date(now.getTime() + data.expires_in * 1000),
      tokenRefreshedAt: now,
      lastError: null,
    },
  });
}

async function refreshTokens() {
  const due = await prisma.igAccount.findMany({
    where: {
      status: "active",
      tokenRefreshedAt: { lt: new Date(Date.now() - SEVEN_DAYS) },
    },
  });
  console.log(`[refresh-tokens] ${due.length} conta(s) para renovar`);

  for (const acc of due) {
    try {
      await refreshOne(acc);
      console.log(`[refresh-tokens] ${acc.alias}: renovado`);
    } catch (e) {
      const reauth = e.code === 190;
      await prisma.igAccount.update({
        where: { id: acc.id },
        data: {
          lastError: `[${e.code ?? "?"}] ${e.message}`,
          ...(reauth && { status: "needs_reauth" }),
        },
      });
      console.error(
        `[refresh-tokens] ${acc.alias}: ${reauth ? "needs_reauth" : "erro"} - ${e.message}`,
      );
    }
  }
}

module.exports = { refreshTokens };

if (require.main === module) {
  refreshTokens()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
