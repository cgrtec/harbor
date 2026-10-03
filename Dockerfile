# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

# [HERMES] git + ca-certificates para 'vp' (vite-plus) y fetches HTTPS
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

RUN npm install -g corepack@latest && corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack prepare pnpm@11.9.0 --activate
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 1420

CMD ["pnpm", "dev", "--host", "0.0.0.0"]
