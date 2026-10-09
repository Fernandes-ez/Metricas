const axios = require('axios');

const GRAPH_API_URL = 'https://graph.facebook.com/v19.0';

const getPageInsights = async (pageId, accessToken) => {
    try {
        const response = await axios.get(`${GRAPH_API_URL}/${pageId}/insights`, {
            params: {
                metric: 'page_impressions,page_engagement,page_reach',
                access_token: accessToken
            }
        });
        return response.data;
    } catch (error) {
        console.error("Erro ao buscar insights da página:", error.response?.data || error.message);
        throw error;
    }
};

const getInstagramBusinessId = async (pageId, accessToken) => {
    try {
        const response = await axios.get(`${GRAPH_API_URL}/${pageId}`, {
            params: {
                fields: 'instagram_business_account',
                access_token: accessToken
            }
        });
        return response.data.instagram_business_account.id;
    } catch (error) {
        console.error("Erro ao buscar ID do Instagram:", error.response?.data || error.message);
        throw error;
    }
};

const sendDirectMessage = async (recipientId, text, accessToken) => {
    try {
        const response = await axios.post(`${GRAPH_API_URL}/me/messages`, {
            recipient: { id: recipientId },
            message: { text: text }
        }, {
            params: { access_token: accessToken }
        });
        return response.data;
    } catch (error) {
        console.error("Erro ao enviar DM:", error.response?.data || error.message);
        throw error;
    }
};

module.exports = { getPageInsights, getInstagramBusinessId, sendDirectMessage };
