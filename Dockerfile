##### DEPS #####
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy lockfile and manifests
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDeps needed for build)
RUN pnpm install --frozen-lockfile


##### BUILDER #####
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Skip env validation at build time; real vars are injected at runtime
ENV SKIP_ENV_VALIDATION=1
ENV NODE_ENV=production
# Provide a syntactically valid placeholder so libsql doesn't throw during page-data collection
ENV DATABASE_URL=file:/tmp/dummy.db

RUN pnpm build


##### RUNNER #####
FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public         ./public

COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle

COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules  

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]