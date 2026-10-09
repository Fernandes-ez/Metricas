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
