FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
# Mount a persistent volume at /data so the log survives redeploys.
ENV HOST=0.0.0.0 PORT=8080 DB_PATH=/data/fitness.db USER_TIMEZONE=America/Chicago
EXPOSE 8080
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.ts"]
