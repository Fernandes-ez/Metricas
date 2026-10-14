# Deploy numa VM Linux (Debian/Ubuntu, 1 GB de RAM)

**Regra: a VM nunca constrói imagem.** Backend, mcp e frontend são construídos pelo GitHub Actions
(`linux/amd64`) e publicados no GHCR; a VM só faz `pull`. `docker-compose.yml` usa apenas `image:`.

| Serviço | Imagem |
|---|---|
| backend | `ghcr.io/fernandes-ez/metricas-backend:latest` |
| mcp | `ghcr.io/fernandes-ez/metricas-mcp:latest` |
| frontend | `ghcr.io/fernandes-ez/metricas-frontend:latest` |
| db, caddy | `postgres:17`, `caddy:2-alpine` (oficiais) |

## 1. Configuração única no GitHub

1. **Actions ligado** no repositório (Settings → Actions → General → "Allow all actions"). O workflow
   `.github/workflows/images.yml` já declara `permissions: packages: write`; não precisa mudar a permissão
   padrão do `GITHUB_TOKEN`, a menos que a organização a restrinja.
2. **Primeiro build**: faça push na `main` (o workflow roda quando muda `backend/`, `mcp/` ou `frontend/`) ou
   rode manualmente em Actions → images → Run workflow. Espere os 3 jobs terminarem.
3. **Pacotes** (GitHub → seu perfil/organização → Packages → `metricas-backend`, `metricas-mcp`,
   `metricas-frontend`): no primeiro push eles nascem **privados** e ligados ao repositório. Escolha:
   - deixar privados (recomendado: o frontend e o backend não precisam ser públicos) e fazer login na VM (item 3), ou
   - Package settings → Danger Zone → Change visibility → Public, e dispensar o login.
   Em "Manage Actions access", o repositório precisa estar com papel **Write** (já vem assim quando o
   pacote é criado pelo próprio workflow).

## 2. Preparar a VM

```
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER      # sair e entrar de novo na sessão
git clone https://github.com/Fernandes-ez/Metricas.git && cd Metricas
```

Swap (a VM tem 1 GB; os limites de memória do compose já somam ~900 MB):
```
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Arquivos `.env` (nenhum vai para o git)

| Arquivo | Variáveis |
|---|---|
| `backend/.env` | copie de `backend/.env.example` e preencha tudo (`POSTGRES_*`, `TOKEN_ENCRYPTION_KEY`, `IG_*` para a importação inicial…) |
| `mcp/.env` | `MCP_DOMAIN`, `MCP_PASSWORD_HASH` |
| `frontend/.env` | `AUTH_PASSWORD_HASH`, `AUTH_SECRET`, `BACKEND_URL` (opcional; o compose já define `http://backend:3001`) |
| `.env` (raiz) | só um link: `ln -s backend/.env .env`. O compose lê `POSTGRES_*` dele |

- Chave de criptografia do backend: `openssl rand -base64 32`. Guarde uma cópia **fora da VM**: sem ela os
  tokens do banco ficam ilegíveis.
- `DATABASE_URL` pode ficar com `localhost`; dentro do Docker o host vira `db` sozinho.
- **Hash da senha** (mínimo 12 caracteres; a senha em si não é guardada). Escolha uma forma:
  ```
  # com Node na máquina (a própria VM não precisa):
  node mcp/src/hash-password.js MCP_PASSWORD_HASH        # para mcp/.env
  node mcp/src/hash-password.js AUTH_PASSWORD_HASH       # para frontend/.env
  # na VM, usando a imagem do mcp (depois do pull do item 3):
  docker compose run --rm --no-deps mcp node src/hash-password.js AUTH_PASSWORD_HASH
  ```
  Cole a linha impressa no `.env` correspondente. Pode usar a mesma senha ou senhas diferentes.
- `AUTH_SECRET` (assina o cookie de sessão; trocar invalida todas as sessões):
  `openssl rand -base64 32`
- Se `frontend/.env` não existir, o compose **não quebra**: o painel sobe sem senha configurada e o login
  recusa tudo até você preencher.

## 3. Login no GHCR (só para pacotes privados)

Crie um **Personal access token (classic)** em GitHub → Settings → Developer settings → Personal access
tokens → Tokens (classic), com **somente o escopo `read:packages`** (tokens fine-grained não funcionam com o GHCR).
Na VM:
```
echo SEU_TOKEN | docker login ghcr.io -u SEU_USUARIO_GITHUB --password-stdin
```
O login fica salvo em `~/.docker/config.json`. Use um token só de leitura: ele fica na VM.

## 4. Subir

```
docker compose pull
docker compose up -d
docker compose ps
```
Não use `--build` na VM (não há `build:` no compose). Logs: `docker compose logs -f backend mcp frontend caddy`.

### Atualizar depois

Depois de um push que gerou imagens novas (confira em Actions):
```
git pull                       # só se compose/Caddyfile/DEPLOY mudaram
docker compose pull
docker compose up -d           # recria só o que mudou
docker image prune -f          # libera disco
```
Para atualizar um serviço só: `docker compose pull frontend && docker compose up -d frontend`.
O backend aplica as migrações do banco sozinho ao iniciar.

### Construir localmente (no seu PC, nunca na VM)

```
docker compose --env-file backend/.env -f docker-compose.yml -f docker-compose.build.yml build
```

## 5. DNS, HTTPS e roteamento

1. **DNS**: registro `A` de `metricas.ezf-tech.com` (ou outro subdomínio) para o IP público da VM. Libere
   TCP 80 e 443 (e UDP 443) no firewall da nuvem. Precisa estar apontando **antes** de subir o Caddy.
2. O Caddy emite o certificado sozinho. O `Caddyfile` manda `/mcp`, `/authorize`, `/token`, `/register`,
   `/revoke`, `/mcp-login` e `/.well-known/*` para o `mcp`; **todo o resto** vai para o `frontend`. O
   desafio ACME (`/.well-known/acme-challenge/`) é atendido pelo próprio Caddy antes dessas rotas.
3. Só o Caddy expõe portas públicas (80/443). `backend` (`127.0.0.1:3001`) e `db` (`127.0.0.1:5432`) só
   escutam no loopback da VM; `mcp` e `frontend` não publicam porta. O `/health` do backend **não** é
   alcançável pelo domínio (`https://SEU_DOMINIO/health` cai no frontend e dá 404).

## 6. Conector MCP (claude.ai web e celular)

1. `curl -i -X POST https://SEU_DOMINIO/mcp` deve responder `401` com `WWW-Authenticate: Bearer ... resource_metadata=...`.
2. claude.ai → Configurações → Conectores → Adicionar conector personalizado → URL `https://SEU_DOMINIO/mcp`
   (deixe client ID/secret em branco; o registro é automático) → Conectar → digite a senha do `MCP_PASSWORD_HASH`.
   No celular o conector aparece sozinho, pois é da conta.
3. Tokens do conector: acesso de 1 h (renova sozinho), refresh de 30 dias. Estado no volume `mcpdata`.
   Para desconectar tudo: `docker compose down mcp && docker volume rm <projeto>_mcpdata`.

## 7. Operação

- Comandos no backend (o prefixo `./docker-entrypoint.sh` aponta o banco para `db`):
  ```
  docker compose exec backend ./docker-entrypoint.sh npm run import-accounts   # importa IG_*_ID/TOKEN do .env
  docker compose exec backend ./docker-entrypoint.sh npm run refresh-tokens    # renovação manual
  ```
- Saúde do backend (só de dentro da VM): `curl http://127.0.0.1:3001/health`
- Backup: `docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup_$(date +%F).sql`
  Restore: `docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < backup.sql`
- Memória (`mem_limit`): db 256 MB, backend 192 MB, mcp 160 MB, frontend 256 MB, caddy 64 MB.
