FROM node:24-bookworm-slim

# Prisma precisa de openssl no bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY scripts ./scripts
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

USER node
EXPOSE 3001

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["sh", "-c", "npx prisma migrate deploy && node src/index.js"]
