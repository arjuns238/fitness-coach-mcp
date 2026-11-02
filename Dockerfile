# Build the dashboard (needs dev dependencies), then ship only the server and the built files.
FROM node:24-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY web ./web
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY --from=web /app/web/dist ./web/dist
# Mount persistent storage at /data so the log survives redeploys.
ENV HOST=0.0.0.0 PORT=8080 DB_PATH=/data/fitness.db USER_TIMEZONE=America/Chicago
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
