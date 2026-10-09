const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
require("dotenv").config();

const { analyzeMetrics } = require("./services/geminiService");
const { getPageInsights } = require("./services/metaService");
const instagramRoutes = require("./routes/instagramRoutes");
const cron = require("node-cron");
const prisma = require("./services/db");
const { refreshTokens } = require("./jobs/refreshTokens");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());

// Novas rotas de Insights
app.use("/api", instagramRoutes);

// Rota de verificação do Webhook da Meta
// ... existing code ...
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// Rota para receber eventos do Webhook (Comentários e Directs)
app.post("/webhook", async (req, res) => {
  const body = req.body;

  if (body.object === "instagram") {
    for (const entry of body.entry) {
      // Lógica Simplificada para Agente #4 (Comentários) e Agente #2 (Direct)
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === "comments") {
            const commentText = change.value.text.toUpperCase();
            if (
              commentText.includes("INSTA") ||
              commentText.includes("QUERO")
            ) {
              console.log("Gatilho de comentário detectado!");
              // Chamar metaService.sendDirectMessage(...)
            }
          }
        }
      }
    }
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
});

// Rota para IA analisar métricas (Agente #1)
app.post("/api/analyze-metrics", async (req, res) => {
  const { query, pageId } = req.body;
  const accessToken = process.env.META_ACCESS_TOKEN;

  try {
    const metrics = await getPageInsights(pageId, accessToken);
    const analysis = await analyzeMetrics(metrics, query);
    res.json({ analysis });
  } catch (error) {
    res.status(500).json({ error: "Erro ao processar análise" });
  }
});

app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "ok" });
  } catch (error) {
    res.status(503).json({ status: "error", db: "down" });
  }
});

app.get("/", (req, res) => {
  res.send("Instagram Automation API Running");
});

cron.schedule("17 3 * * *", () => refreshTokens().catch(console.error), {
  timezone: "America/Sao_Paulo",
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
