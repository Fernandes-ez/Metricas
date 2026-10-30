// Fase 3a — criar anúncio a partir de um post do Instagram, dentro de um conjunto que já existe.
//
// Dois métodos, NUNCA trocados sozinhos (decisão de 30/10/2026: perguntar antes):
//   metodo = "post_existente" (padrão): o anúncio usa o próprio post (herda curtidas/comentários).
//            Se a Meta recusar, NADA é criado e o erro volta com a sugestão de tentar "upload".
//   metodo = "upload": só quando o usuário autorizar. Baixa o vídeo do post (media_url da API do
//            Instagram), envia para a conta de anúncios e cria um anúncio novo com ele (não herda engajamento).
// Anúncio sempre criado PAUSADO (ativar depois com alterar_status, que passa pela trava do teto).
// Por ora só conjuntos com destino WhatsApp (botão "Enviar mensagem" → WhatsApp).
const { adsGet, adsGetAll, adsPost, invalidate } = require("./adsClient");
const { structure, guard } = require("./adsService");
const { WriteError, withLock, log } = require("./adsWriteService");
const { getAccount } = require("./accountRepository");
const { igGet } = require("./igClient");

const WHATSAPP_CTA = {
  type: "WHATSAPP_MESSAGE",
  value: { app_destination: "WHATSAPP", link: "https://api.whatsapp.com/send" },
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findAdset(campanhas, adsetId) {
  for (const c of campanhas) for (const s of c.conjuntos) if (s.id === adsetId) return { campaign: c, adset: s };
  return null;
}

// página do Facebook: a do criativo de um anúncio do próprio conjunto (mesma configuração que já roda);
// senão, a única página que a conta de anúncios pode promover; senão, exige pagina_id.
async function resolvePage(account, adset, pageIdArg) {
  if (pageIdArg) return { pageId: pageIdArg, origem: "informada" };
  for (const ad of adset.anuncios) {
    if (!ad.criativo_id) continue;
    try {
      const cr = await adsGet(ad.criativo_id, { fields: "object_story_spec,object_id,actor_id" }, account.token);
      const pageId = cr.object_story_spec?.page_id || cr.object_id || cr.actor_id;
      if (pageId) return { pageId: String(pageId), origem: `criativo do anúncio "${ad.nome}"` };
    } catch {
      /* tenta o próximo */
    }
  }
  const pages = await adsGetAll(`${account.adAccountId}/promote_pages`, { fields: "id,name", limit: 50 }, account.token);
  if (pages.length === 1) return { pageId: pages[0].id, origem: `única página da conta (${pages[0].name})` };
  throw new WriteError(
    400,
    pages.length
      ? `Não deu para descobrir a página automaticamente. Informe pagina_id, uma destas: ${pages.map((p) => `${p.id} (${p.name})`).join(", ")}`
      : "A conta de anúncios não tem página para promover: atribua a página do Facebook ao usuário do sistema.",
  );
}

// post do Instagram do perfil (lido com o token do Instagram do próprio perfil = garante que é dele)
async function loadPost(alias, mediaId) {
  const ig = await getAccount(alias);
  if (!ig) throw new WriteError(404, `Perfil ${alias} não tem conta do Instagram cadastrada no Metricas`);
  if (!ig.token) throw new WriteError(409, `Conta do Instagram ${alias} precisa ser reconectada`);
  try {
    const post = await igGet(
      mediaId,
      { fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp" },
      ig.token,
    );
    return { ig, post };
  } catch (e) {
    throw new WriteError(404, `Post ${mediaId} não encontrado no Instagram de ${alias}: ${e.message}`);
  }
}

async function waitVideoReady(account, videoId) {
  for (let i = 0; i < 18; i++) {
    const v = await adsGet(videoId, { fields: "status" }, account.token);
    const st = v.status?.video_status;
    if (st === "ready") return;
    if (st === "error") throw new WriteError(502, `A Meta não conseguiu processar o vídeo (${JSON.stringify(v.status)})`);
    await sleep(5000);
  }
  throw new WriteError(504, `O vídeo ${videoId} ainda está processando na Meta. Tente de novo em alguns minutos com metodo=upload (o vídeo já enviado será reaproveitado só se você informar video_id).`);
}

/**
 * req: { conjunto_id, post_id, nome?, metodo?: 'post_existente'|'upload', pagina_id?, video_id?, simular?, origem? }
 */
async function createAdFromPost(account, req) {
  const adsetId = String(req.conjunto_id || "");
  const mediaId = String(req.post_id || "");
  const metodo = req.metodo || "post_existente";
  if (!/^\d{5,30}$/.test(adsetId)) throw new WriteError(400, "conjunto_id inválido");
  if (!/^\d{5,30}$/.test(mediaId)) throw new WriteError(400, "post_id inválido (use o id do post em midias_conta)");
  if (!["post_existente", "upload"].includes(metodo)) throw new WriteError(400, "metodo deve ser post_existente ou upload");
  if (!account.token) throw new WriteError(409, `Token ${account.tokenLabel} inválido; gere outro.`);

  return withLock(account.adAccountId, async () => {
    invalidate(account.adAccountId);
    const { campanhas } = await structure(account);
    const found = findAdset(campanhas, adsetId);
    if (!found) throw new WriteError(404, `Conjunto ${adsetId} não encontrado na conta ${account.adAccountId} (${account.alias})`);
    const { campaign, adset } = found;
    if (adset.destino !== "WHATSAPP")
      throw new WriteError(400, `Por enquanto só conjuntos com destino WhatsApp (este é ${adset.destino ?? "sem destino"}).`);

    const { ig, post } = await loadPost(account.alias, mediaId);
    const isVideo = post.media_type === "VIDEO";
    if (metodo === "upload" && !isVideo)
      throw new WriteError(400, `O método upload só vale para vídeo/Reel; este post é ${post.media_type}.`);
    const page = await guard(account, () => resolvePage(account, adset, req.pagina_id));

    const nome = (req.nome || `${post.media_product_type === "REELS" ? "Reel" : "Post"} ${mediaId}`).slice(0, 200);
    const plano = {
      apelido: account.alias,
      ad_account_id: account.adAccountId,
      campanha: { id: campaign.id, nome: campaign.nome },
      conjunto: { id: adset.id, nome: adset.nome, anuncios_atuais: adset.anuncios.length },
      post: { id: post.id, tipo: post.media_product_type || post.media_type, link: post.permalink },
      instagram_user_id: ig.userId,
      pagina: page,
      metodo,
      nome_do_anuncio: nome,
      status_inicial: "PAUSED",
    };
    if (req.simular) return { ...plano, executado: false, simulacao: true, mensagem: "Simulação: nada foi criado." };

    const base = {
      adAccountId: account.adAccountId,
      alias: account.alias,
      source: req.origem || "api",
      objectType: "ad",
      objectId: adset.id,
      objectName: nome,
      field: "create_ad",
      oldValue: null,
      newValue: `${metodo}:${mediaId}`,
      dailyBefore: null,
      dailyAfter: null,
    };

    // 1) criativo
    let creativeId;
    try {
      if (metodo === "post_existente") {
        const cr = await adsPost(
          `${account.adAccountId}/adcreatives`,
          {
            name: `${nome} — criativo`,
            object_id: page.pageId,
            instagram_user_id: ig.userId,
            source_instagram_media_id: mediaId,
            call_to_action: WHATSAPP_CTA,
          },
          account.token,
        );
        creativeId = cr.id;
      } else {
        let videoId = req.video_id;
        if (!videoId) {
          if (!post.media_url) throw new WriteError(502, "A API do Instagram não devolveu o arquivo do vídeo (media_url).");
          const v = await adsPost(`${account.adAccountId}/advideos`, { file_url: post.media_url, name: nome }, account.token);
          videoId = v.id;
        }
        await waitVideoReady(account, videoId);
        const cr = await adsPost(
          `${account.adAccountId}/adcreatives`,
          {
            name: `${nome} — criativo (upload)`,
            object_story_spec: {
              page_id: page.pageId,
              instagram_user_id: ig.userId,
              video_data: {
                video_id: videoId,
                image_url: post.thumbnail_url,
                message: post.caption || undefined,
                call_to_action: WHATSAPP_CTA,
              },
            },
          },
          account.token,
        );
        creativeId = cr.id;
      }
    } catch (e) {
      if (e instanceof WriteError) throw e;
      if (e.isAuth) await guard(account, () => Promise.reject(e)).catch(() => {});
      await log({ ...base, result: "erro", message: `criativo: ${e.message}` });
      const erroMeta = {
        mensagem: e.message,
        codigo: e.code ?? null,
        subcodigo: e.subcode ?? null,
        tipo: e.type ?? null,
      };
      // NÃO troca de método sozinho: devolve o erro e a pergunta
      throw new WriteError(422, `A Meta recusou criar o anúncio com o método "${metodo}". Nada foi criado.`, {
        detalhe: {
          ...plano,
          erro_meta: erroMeta,
          proximo_passo:
            e.subcode === 1885183
              ? "O app Metricas está em modo de desenvolvimento no Meta for Developers. Publique o app (modo público/Live) e tente de novo. O upload NÃO resolve: ele também cria o criativo pelo mesmo app."
              : metodo === "post_existente" && isVideo
              ? 'PERGUNTE AO USUÁRIO antes de seguir: dá para tentar com metodo="upload" (sobe o vídeo do post como anúncio novo, SEM herdar curtidas e comentários do post). Só chame de novo com metodo="upload" se ele autorizar.'
              : "Verifique o erro da Meta (página/Instagram atribuídos ao usuário do sistema, post elegível para anúncio).",
        },
      });
    }

    // 2) anúncio, sempre pausado
    let ad;
    try {
      ad = await adsPost(
        `${account.adAccountId}/ads`,
        { name: nome, adset_id: adset.id, creative: { creative_id: creativeId }, status: "PAUSED" },
        account.token,
      );
    } catch (e) {
      await log({ ...base, result: "erro", message: `anúncio (criativo ${creativeId} criado): ${e.message}` });
      throw new WriteError(422, `O criativo ${creativeId} foi criado, mas a Meta recusou o anúncio: ${e.message}`, {
        detalhe: { ...plano, criativo_id: creativeId, erro_meta: { mensagem: e.message, codigo: e.code ?? null, subcodigo: e.subcode ?? null } },
      });
    } finally {
      invalidate(account.adAccountId);
    }

    await log({ ...base, objectId: ad.id, result: "ok", message: `criativo ${creativeId}` });
    return {
      ...plano,
      executado: true,
      anuncio_id: ad.id,
      criativo_id: creativeId,
      mensagem:
        'Anúncio criado PAUSADO. Para veicular, ative com alterar_status (tipo "anuncio"); a Meta ainda revisa o anúncio depois de ativado.',
    };
  });
}

module.exports = { createAdFromPost };
