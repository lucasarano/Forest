FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY src/lib/sprint4 ./src/lib/sprint4

EXPOSE 4001

CMD ["node", "server/sprint4Server.js"]
