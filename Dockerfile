# syntax=docker/dockerfile:1
FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    NODE_USE_ENV_PROXY=1 npm ci --strict-ssl=true
COPY . .
RUN npm run check && npm run build
FROM node:24-trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates postgresql-client && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production PORT=3000 MEDIA_STORAGE_TYPE=disk MEDIA_STORAGE_PATH=/var/data/media EXTER_DB_PATH=/var/data/exter.db
EXPOSE 3000
CMD ["npm", "start"]
