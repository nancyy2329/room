FROM node:22-bookworm-slim

WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev && mkdir -p /app/.runtime && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=4173
EXPOSE 4173
USER node
CMD ["npm", "start"]
