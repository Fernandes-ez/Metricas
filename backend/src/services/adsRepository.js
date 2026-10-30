const prisma = require("./db");
const { decrypt } = require("./tokenCrypto");

const num = (d) => (d === null || d === undefined ? null : Number(d));

function toAccount(row) {
  return {
    adAccountId: row.adAccountId,
    alias: row.alias,
    name: row.name,
    currency: row.currency,
    timezone: row.timezone,
    monthlyCap: num(row.monthlyCap),
    tokenId: row.tokenId,
    tokenLabel: row.token.label,
    tokenStatus: row.token.status,
    tokenError: row.token.lastError,
    // não descriptografa token marcado como inválido
    token: row.token.status === "active" ? decrypt(row.token.tokenEnc) : null,
  };
}

// contas de anúncios (todas ou de um perfil), com token descriptografado quando ativo
async function listAdAccounts(alias) {
  const rows = await prisma.adAccount.findMany({
    where: alias ? { alias } : undefined,
    include: { token: true },
    orderBy: [{ alias: "asc" }, { adAccountId: "asc" }],
  });
  return rows.map(toAccount);
}

async function markTokenInvalid(tokenId, message) {
  await prisma.adToken
    .update({ where: { id: tokenId }, data: { status: "invalid", lastError: message, checkedAt: new Date() } })
    .catch(console.error);
}

async function updateAccountInfo(adAccountId, data) {
  await prisma.adAccount.update({ where: { adAccountId }, data }).catch(console.error);
}

module.exports = { listAdAccounts, markTokenInvalid, updateAccountInfo };
