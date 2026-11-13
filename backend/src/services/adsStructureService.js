// Fase 3 — criar campanha e conjunto (click-to-WhatsApp). Sempre PAUSADOS: a criação não gasta nada.
// Para veicular, ative com alterar_status, que passa pela trava do teto (regra de 30/10/2026).
//
// Campanha nova é ABO (o orçamento fica no conjunto). O conjunto novo copia público (targeting),
// página e otimização de um conjunto existente desta conta (copiar_de_conjunto_id), para o teste
// sair com a mesma audiência do que já roda. Sem fonte, não cria: não há como garantir página e público.
const { adsGet, adsPost, invalidate } = require("./adsClient");
const { structure, guard, round2 } = require("./adsService");
const { WriteError, withLock, log } = require("./adsWriteService");

const OBJETIVOS = new Set(["OUTCOME_LEADS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT"]);
const ID = /^\d{5,30}$/;

// Lance do conjunto novo. A Meta exige bid_amount quando o tipo tem teto (LOWEST_COST_WITH_BID_CAP / COST_CAP)
// e recusa o tipo sem o valor (erro 100, subcode 2490487). Copia o teto da origem junto com o tipo; se a origem
// não tiver lance próprio (ex.: conjunto de campanha CBO, onde o lance fica na campanha), usa
// LOWEST_COST_WITHOUT_CAP, que não exige valor.
const CAP_STRATEGIES = new Set(["LOWEST_COST_WITH_BID_CAP", "COST_CAP"]);
function lanceConfig(config) {
  if (CAP_STRATEGIES.has(config.bid_strategy) && config.bid_amount)
    return { bid_strategy: config.bid_strategy, bid_amount: config.bid_amount };
  return { bid_strategy: "LOWEST_COST_WITHOUT_CAP" };
}

const validNome = (nome) => {
  const n = String(nome || "").trim();
  if (!n || n.length > 200) throw new WriteError(400, "nome é obrigatório (até 200 caracteres)");
  return n;
};

const metaErro = (e) => ({
  mensagem: e.message,
  codigo: e.code ?? null,
  subcodigo: e.subcode ?? null,
  tipo: e.type ?? null,
});

// entrada do log de criação (object_id é NOT NULL: usa o id do pai, ou "novo" antes de existir)
function entry(account, source, { objectType, objectId, objectName, field, newValue, result, message }) {
  return {
    adAccountId: account.adAccountId,
    alias: account.alias,
    source,
    objectType,
    objectId: String(objectId || "novo"),
    objectName,
    field,
    oldValue: null,
    newValue,
    dailyBefore: null,
    dailyAfter: null,
    result,
    message: message ?? null,
  };
}

function requireToken(account) {
  if (!account.token) throw new WriteError(409, `Token ${account.tokenLabel} inválido; gere outro.`);
}

/**
 * Campanha nova (PAUSADA). req: { nome, objetivo?, simular?, origem? }
 */
async function createCampaign(account, req) {
  const nome = validNome(req.nome);
  const objetivo = req.objetivo || "OUTCOME_LEADS";
  if (!OBJETIVOS.has(objetivo)) throw new WriteError(400, `objetivo deve ser um de: ${[...OBJETIVOS].join(", ")}`);
  requireToken(account);

  const plano = {
    apelido: account.alias,
    ad_account_id: account.adAccountId,
    nome,
    objetivo,
    orcamento: "no conjunto (ABO)",
    status_inicial: "PAUSED",
  };
  if (req.simular) return { ...plano, executado: false, simulacao: true, mensagem: "Simulação: nada foi criado." };

  const source = req.origem || "api";
  return withLock(account.adAccountId, async () => {
    invalidate(account.adAccountId);
    let created;
    try {
      created = await guard(account, () =>
        adsPost(
          `${account.adAccountId}/campaigns`,
          {
            name: nome,
            objective: objetivo,
            status: "PAUSED",
            special_ad_categories: [],
            is_adset_budget_sharing_enabled: false,
          },
          account.token,
        ),
      );
    } catch (e) {
      await log(entry(account, source, { objectType: "campaign", objectName: nome, field: "create_campaign", newValue: objetivo, result: "erro", message: e.message }));
      throw new WriteError(422, "A Meta recusou criar a campanha. Nada foi criado.", {
        detalhe: { ...plano, erro_meta: metaErro(e) },
      });
    } finally {
      invalidate(account.adAccountId);
    }
    await log(entry(account, source, { objectType: "campaign", objectId: created.id, objectName: nome, field: "create_campaign", newValue: objetivo, result: "ok" }));
    return { ...plano, executado: true, campanha_id: created.id, mensagem: "Campanha criada PAUSADA." };
  });
}

/**
 * Conjunto novo (PAUSADO) numa campanha desta conta, copiando público/página/otimização de outro conjunto.
 * req: { campanha_id, nome, orcamento_diario (reais), copiar_de_conjunto_id, simular?, origem? }
 */
async function createAdSet(account, req) {
  const nome = validNome(req.nome);
  const campanhaId = String(req.campanha_id || "");
  if (!ID.test(campanhaId)) throw new WriteError(400, "campanha_id inválido");
  const orcamento = round2(Number(req.orcamento_diario));
  if (!(Number.isFinite(orcamento) && orcamento > 0))
    throw new WriteError(400, "orcamento_diario deve ser um número positivo (em reais)");
  const fonteId = String(req.copiar_de_conjunto_id || "");
  if (!ID.test(fonteId)) throw new WriteError(400, "copiar_de_conjunto_id é obrigatório (id de um conjunto desta conta)");
  requireToken(account);

  // estrutura lida na hora: campanha e conjunto-fonte têm de ser DESTA conta
  const { campanhas } = await structure(account);
  const campaign = campanhas.find((c) => c.id === campanhaId);
  if (!campaign) throw new WriteError(404, `Campanha ${campanhaId} não encontrada na conta ${account.adAccountId} (${account.alias})`);
  if (campaign.orcamento_no === "campanha")
    throw new WriteError(400, `A campanha ${campaign.id} (${campaign.nome}) tem orçamento na campanha (CBO); conjunto novo com orçamento próprio não cabe nela. Crie a campanha com criar_campanha (ABO) e use o id que ela devolver.`);
  const fonte = campanhas.flatMap((c) => c.conjuntos).find((s) => s.id === fonteId);
  if (!fonte) throw new WriteError(404, `Conjunto de origem ${fonteId} não encontrado na conta ${account.adAccountId} (${account.alias})`);
  if (fonte.destino !== "WHATSAPP")
    throw new WriteError(400, `O conjunto de origem tem destino ${fonte.destino ?? "sem destino"}; por enquanto só WhatsApp.`);

  // configuração da fonte na Meta (público, página e otimização)
  let config;
  try {
    config = await guard(account, () =>
      adsGet(
        fonteId,
        { fields: "targeting,promoted_object,optimization_goal,destination_type,billing_event,bid_strategy,bid_amount" },
        account.token,
      ),
    );
  } catch (e) {
    throw new WriteError(502, `Não consegui ler o conjunto de origem ${fonteId} na Meta: ${e.message}`);
  }
  if (!config.targeting || !config.promoted_object)
    throw new WriteError(502, `O conjunto de origem ${fonteId} não tem público ou página configurados na Meta; não copio.`);

  const payload = {
    name: nome,
    campaign_id: campanhaId,
    status: "PAUSED",
    daily_budget: Math.round(orcamento * 100),
    billing_event: config.billing_event || "IMPRESSIONS",
    optimization_goal: config.optimization_goal || "CONVERSATIONS",
    destination_type: "WHATSAPP",
    promoted_object: config.promoted_object,
    targeting: config.targeting,
    ...lanceConfig(config),
  };

  const plano = {
    apelido: account.alias,
    ad_account_id: account.adAccountId,
    campanha: { id: campaign.id, nome: campaign.nome },
    conjunto: { nome, orcamento_diario: orcamento, otimizacao: payload.optimization_goal, destino: "WHATSAPP" },
    copiado_de: { id: fonte.id, nome: fonte.nome },
    lance: payload.bid_amount
      ? `${payload.bid_strategy} (teto ${payload.bid_amount} centavos, copiado da origem)`
      : payload.bid_strategy,
    status_inicial: "PAUSED",
  };
  if (req.simular) return { ...plano, executado: false, simulacao: true, mensagem: "Simulação: nada foi criado." };

  const source = req.origem || "api";
  return withLock(account.adAccountId, async () => {
    invalidate(account.adAccountId);
    let created;
    try {
      created = await guard(account, () => adsPost(`${account.adAccountId}/adsets`, payload, account.token));
    } catch (e) {
      await log(entry(account, source, { objectType: "adset", objectId: campanhaId, objectName: nome, field: "create_adset", newValue: `orcamento ${orcamento}`, result: "erro", message: e.message }));
      throw new WriteError(422, "A Meta recusou criar o conjunto. Nada foi criado.", {
        detalhe: { ...plano, erro_meta: metaErro(e) },
      });
    } finally {
      invalidate(account.adAccountId);
    }
    await log(entry(account, source, { objectType: "adset", objectId: created.id, objectName: nome, field: "create_adset", newValue: `orcamento ${orcamento}`, result: "ok" }));
    return { ...plano, executado: true, conjunto_id: created.id, mensagem: "Conjunto criado PAUSADO. Para veicular, ative com alterar_status (passa pela trava do teto)." };
  });
}

module.exports = { createCampaign, createAdSet };
