import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const token = process.env.IG_EZF_TOKEN;
const mediaId = '18107735059954025';

async function test() {
    try {
        const info = await axios.get(`https://graph.instagram.com/v26.0/${mediaId}`, {
            params: {
                fields: 'media_type,media_product_type,media_url,permalink',
                access_token: token
            }
        });
        console.log('Media Info:', info.data);

        const metrics = ['reach', 'total_interactions', 'likes', 'comments', 'shares', 'saved'];
        try {
            const insights = await axios.get(`https://graph.instagram.com/v26.0/${mediaId}/insights`, {
                params: {
                    metric: metrics.join(','),
                    access_token: token
                }
            });
            console.log('Insights:', insights.data);
        } catch (e) {
            console.log('Error Code:', e.response?.data?.error?.code);
            console.log('Error Message:', e.response?.data?.error?.message);
        }
    } catch (e) {
        console.error(e.message);
    }
}

test();
