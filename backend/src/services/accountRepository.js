const prisma = require("./db");
const { decrypt } = require("./tokenCrypto");

// { alias, userId, token, status } ou null se o alias não existir
async function getAccount(alias) {
  const row = await prisma.igAccount.findUnique({ where: { alias } });
  if (!row) return null;
  return {
    alias: row.alias,
    userId: row.igUserId,
    status: row.status,
    // não descriptografa conta que precisa de reconexão
    token: row.status === "active" ? decrypt(row.accessTokenEnc) : null,
  };
}

// contas ativas, com token descriptografado
async function listActiveAccounts() {
  const rows = await prisma.igAccount.findMany({
    where: { status: "active" },
    orderBy: { alias: "asc" },
  });
  return rows.map((r) => ({
    alias: r.alias,
    userId: r.igUserId,
    token: decrypt(r.accessTokenEnc),
  }));
}

module.exports = { getAccount, listActiveAccounts };
