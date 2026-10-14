FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=128 \
    DATA_DIR=/data

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
# volume com o estado OAuth (clientes e tokens em hash)
RUN mkdir /data && chown node:node /data

USER node
EXPOSE 3002
CMD ["node", "src/server.js"]
