FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js store.js index.html manifest.json sw.js logo.jpg icon-maskable.svg schema.sql ./
COPY js ./js
COPY css ./css
COPY audio ./audio
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
