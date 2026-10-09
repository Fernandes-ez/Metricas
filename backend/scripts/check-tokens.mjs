import axios from 'axios';

async function checkTokens() {
    const envVars = process.env;
    const tokenVars = Object.keys(envVars).filter(key => key.endsWith('_TOKEN'));

    console.log(`Encontradas ${tokenVars.length} variáveis de token.\n`);

    for (const tokenVar of tokenVars) {
        const token = envVars[tokenVar];
        const prefix = tokenVar.replace('_TOKEN', '');
        const configIdVar = `${prefix}_ID`;
        const configId = envVars[configIdVar];

        try {
            const response = await axios.get(`https://graph.instagram.com/v20.0/me`, {
                params: {
                    fields: 'user_id,username',
                    access_token: token
                }
            });

            const { user_id, username } = response.data;
            const idMatches = configId === user_id ? 'Sim' : 'Não';

            console.log(`${tokenVar}: @${username}, API ID: ${user_id}, ID no .env bate: ${idMatches}`);
            
            if (idMatches === 'Não') {
                console.log(`   -> Aviso: O ID no .env para ${configIdVar} deveria ser ${user_id}`);
            }

        } catch (error) {
            const errorMsg = error.response?.data?.error?.message || error.message;
            console.log(`${tokenVar}: Erro - ${errorMsg}`);
        }
    }
}

checkTokens();
