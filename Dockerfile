FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global pnpm@10.28.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend/package.json apps/frontend/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
RUN pnpm lint && pnpm test && pnpm build
RUN pnpm --filter @dtr/backend deploy --legacy --prod /production

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production DTR_PORT=8080 DTR_DATA_ROOT=/data/registry DTR_ALLOWED_DATA_PARENT=/data DTR_RUNTIME_DIR=/app/runtime DTR_PUBLIC_DIR=/app/public
WORKDIR /app
COPY --from=builder --chown=node:node /production/ ./
COPY --from=builder --chown=node:node /app/apps/frontend/dist/ ./public/
RUN mkdir -p /data /app/runtime && chown node:node /data /app/runtime
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+(process.env.DTR_PORT||8080)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
