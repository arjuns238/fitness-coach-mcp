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

# Litestream streams every SQLite change to Blob Storage and restores the file when a new container starts.
ARG LITESTREAM_VERSION=0.5.17
ARG LITESTREAM_SHA256=cfb371176d164437ae869f8351cfde49bd1804ae71c61923f75c9cba9c9c006d
ADD https://github.com/benbjohnson/litestream/releases/download/v${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-x86_64.tar.gz /tmp/litestream.tar.gz
RUN echo "${LITESTREAM_SHA256}  /tmp/litestream.tar.gz" | sha256sum -c - \
  && tar -xzf /tmp/litestream.tar.gz -C /usr/local/bin litestream \
  && rm /tmp/litestream.tar.gz \
  && mkdir -p /data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY scripts/snapshot.ts ./scripts/
COPY deploy/litestream.yml /etc/litestream.yml
COPY deploy/start.sh ./
COPY --from=web /app/web/dist ./web/dist
# The log lives at /data. Without Litestream configured, mount persistent storage there instead.
ENV HOST=0.0.0.0 PORT=8080 DB_PATH=/data/fitness.db USER_TIMEZONE=America/Chicago
EXPOSE 8080
CMD ["./start.sh"]
