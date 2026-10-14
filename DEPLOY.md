# Deploy numa VM Ubuntu nova

1. Instalar Docker:
   ```
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER   # sair e entrar de novo na sessão
   ```
2. Clonar o projeto e entrar na pasta.
3. Criar `backend/.env` a partir de `backend/.env.example` e preencher tudo.
   - Chave de criptografia: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
     (ou `openssl rand -base64 32`). Guarde uma cópia fora da VM: sem ela os tokens do banco ficam ilegíveis.
   - `DATABASE_URL` pode ficar com `localhost`; dentro do Docker o host vira `db` sozinho.
4. Subir: `docker compose up -d --build`
5. Logs: `docker compose logs -f backend` (tudo vai para stdout).
6. Comandos dentro do container (o prefixo `./docker-entrypoint.sh` aponta o banco para `db`):
   ```
   docker compose exec backend ./docker-entrypoint.sh npm run import-accounts   # importa IG_*_ID/TOKEN do .env
   docker compose exec backend ./docker-entrypoint.sh npm run refresh-tokens    # renovação manual
   ```
7. Saúde: `curl http://127.0.0.1:3001/health`
8. Backup: `docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup_$(date +%F).sql`
   Restore: `docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < backup.sql`

## Conector MCP (claude.ai web e celular)

Serviços: `mcp` (OAuth + ferramentas somente leitura, fala só com o `backend` pela rede interna) e `caddy` (HTTPS, portas 80/443). O `backend` continua sem porta pública. O painel ainda não tem login, então o frontend **não** entra no Caddy por enquanto.

1. **DNS**: crie um registro `A` de `metricas.ezf-tech.com` (ou outro subdomínio) para o IP público da VM. No firewall da VM/nuvem libere TCP 80 e 443 (e UDP 443).
2. **Variáveis do compose**: `docker-compose.yml` lê `POSTGRES_*` do `.env` da raiz. No servidor: `ln -s backend/.env .env` (o arquivo já é ignorado pelo git). Sem isso o `db` não sobe e avisa qual variável falta. Na sua máquina use `docker compose --env-file backend/.env ...`.
3. **`mcp/.env`**: `cp mcp/.env.example mcp/.env`, ajuste `MCP_DOMAIN` e gere a senha de login:
   ```
   node mcp/src/hash-password.js      # só precisa do Node, não depende do compose
   ```
   (mínimo 12 caracteres.) Cole a linha `MCP_PASSWORD_HASH=...` em `mcp/.env`. A senha em si não fica salva em lugar nenhum.
4. **Subir**: `docker compose up -d --build`. O Caddy emite o certificado sozinho na primeira requisição (o DNS precisa já estar apontando). Logs: `docker compose logs -f caddy mcp`.
5. **Conferir**: `curl -i -X POST https://SEU_DOMINIO/mcp` deve responder `401` com `WWW-Authenticate: Bearer ... resource_metadata=...`.
6. **Adicionar no claude.ai**: Configurações → Conectores → Adicionar conector personalizado → URL `https://SEU_DOMINIO/mcp` (deixe client ID/secret em branco; o registro é automático) → Conectar. Abre a tela de login: digite a senha. Depois ative o conector na conversa. No celular o conector aparece sozinho, pois é da conta.
7. Os tokens do conector expiram em 1 h (renovam sozinhos; o refresh vale 30 dias). Estado em volume `mcpdata`. Para desconectar tudo: `docker compose down mcp && docker volume rm <projeto>_mcpdata`.
8. Memória (VM de 1 GB): `mem_limit` de 256 MB (db), 192 MB (backend), 160 MB (mcp, heap de 128 MB) e 64 MB (caddy). O **build** do backend/Next pode estourar a RAM: se precisar, crie swap (`sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`) ou faça o build fora da VM.

## Painel (frontend)

O painel é a página principal do domínio (`https://SEU_DOMINIO/`); o Caddy manda `/mcp` e o OAuth para o `mcp` e o resto para o `frontend`. Tem login próprio (senha única, cookie de sessão assinado).

**1. Variáveis**: `cp frontend/.env.example frontend/.env` e preencha:
```
node mcp/src/hash-password.js AUTH_PASSWORD_HASH      # cole a linha gerada
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # valor de AUTH_SECRET
```

**2. A imagem NÃO é construída na VM** (1 GB de RAM não aguenta `next build`). Escolha uma opção; as duas geram `linux/amd64` e publicam em `ghcr.io/fernandes-ez/metricas-frontend`:

- **GitHub Actions (recomendado)**: o workflow `.github/workflows/frontend-image.yml` roda a cada push em `main` que mexa em `frontend/` (ou manualmente, em Actions → frontend-image → Run workflow). Depois do primeiro build, em GitHub → Packages, confira se o pacote tem acesso ao repositório.
- **No seu PC**:
  ```
  docker login ghcr.io -u SEU_USUARIO          # senha: token pessoal com o escopo write:packages
  docker buildx build --platform linux/amd64 -t ghcr.io/fernandes-ez/metricas-frontend:latest --push frontend
  ```

**3. Na VM**: se o pacote for privado, faça `docker login ghcr.io` uma vez (token com `read:packages`). Depois:
```
docker compose pull frontend
docker compose up -d --no-build
```
`--no-build` evita que a VM tente construir qualquer coisa. Para `backend` e `mcp`, que são leves, use `docker compose build backend mcp` quando mudarem. Atualizar o painel = novo push (ou build no PC) + `docker compose pull frontend && docker compose up -d --no-build frontend`.

Memória do `frontend`: `mem_limit` de 256 MB e `--max-old-space-size=192`. Se a VM ficar sem RAM, veja o swap no item 8 da seção acima.
