// Aquece o cache de insights dos últimos 30 posts de cada conta (1x por dia).
const { listActiveAccounts } = require("../services/accountRepository");
const { igGet } = require("../services/igClient");
const { withMetrics } = require("../services/mediaInsights");

async function warmMediaInsights() {
  for (const account of await listActiveAccounts()) {
    try {
      const { data } = await igGet(
        `${account.userId}/media`,
        { fields: "id,media_type,media_product_type,timestamp", limit: 30 },
        account.token,
      );
      // orçamento longo: aqui ninguém está esperando a resposta
      const { pending } = await withMetrics(account, data, { budgetMs: 10 * 60 * 1000 });
      console.log(`[warm-media-insights] ${account.alias}: ${data.length} posts, ${pending} pendentes`);
    } catch (e) {
      console.error(`[warm-media-insights] ${account.alias}: ${e.message}`);
    }
  }
}

module.exports = { warmMediaInsights };
