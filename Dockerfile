# Production image for the Architech web app (Next.js standalone). Used by Fly (fly.toml).
FROM node:24-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g --force yarn@1.22.22
COPY package.json yarn.lock ./
COPY apps/web/package.json apps/web/
COPY apps/android/package.json apps/android/
COPY packages/ai/package.json packages/ai/
COPY packages/config/package.json packages/config/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/imaging/package.json packages/imaging/
COPY packages/measure/package.json packages/measure/
COPY packages/ui/package.json packages/ui/
RUN yarn install --frozen-lockfile --network-timeout 600000

FROM deps AS build
COPY . .
RUN yarn workspace @architech/web build

FROM node:24-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    MIGRATIONS_DIR=/app/packages/db/migrations
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public
COPY --from=build --chown=node:node /app/packages/db/migrations ./packages/db/migrations
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
