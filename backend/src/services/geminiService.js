const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const analyzeMetrics = async (metricsData, query) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const prompt = `
            Você é um analista de marketing digital especialista em Instagram.
            Analise os seguintes dados de métricas (em JSON) e responda à pergunta do usuário.
            
            Dados: ${JSON.stringify(metricsData)}
            Pergunta: ${query}
            
            Dê uma resposta clara, objetiva e baseada em dados.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Erro ao processar com Gemini:", error);
        throw error;
    }
};

const chatWithLead = async (history, message) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-pro" });
        const chat = model.startChat({
            history: history,
            generationConfig: {
                maxOutputTokens: 500,
            },
        });

        const result = await chat.sendMessage(message);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Erro no chat Gemini:", error);
        throw error;
    }
};

module.exports = { analyzeMetrics, chatWithLead };
