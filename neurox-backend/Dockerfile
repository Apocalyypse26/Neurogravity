FROM node:20-alpine AS base

RUN apk add --no-cache dumb-init

WORKDIR /app

FROM base AS deps

COPY package.json package-lock.json* ./

RUN npm ci --only=production

FROM base AS builder

COPY package.json package-lock.json* ./

RUN npm ci

COPY . .

RUN npm run build

FROM base AS runner

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs

RUN adduser --system --uid 1001 nodejs

COPY --from=deps /app/node_modules ./node_modules

COPY --from=builder /app/src ./src

COPY --from=builder /app/package.json ./

USER nodejs

EXPOSE 3000

ENV PORT=3000

ENTRYPOINT ["dumb-init", "--"]

CMD ["node", "src/server.js"]