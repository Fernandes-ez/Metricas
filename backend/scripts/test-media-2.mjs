import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const token = process.env.IG_EZF_TOKEN;
const mediaId = '18107735059954025';

async function test() {
    try {
        const metrics = ['reach', 'total_interactions', 'likes', 'comments', 'shares', 'saved'];
        const insights = await axios.get(`https://graph.instagram.com/v26.0/${mediaId}/insights`, {
            params: {
                metric: metrics.join(','),
                access_token: token
            }
        });
        console.log('Insights sem impressions:', insights.data);
    } catch (e) {
        console.log('Error Message:', e.response?.data?.error?.message);
    }
}

test();
