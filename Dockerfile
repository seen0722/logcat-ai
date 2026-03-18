FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/parser/package.json packages/parser/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/parser packages/parser
COPY packages/backend packages/backend
COPY packages/frontend packages/frontend

# Build parser first (backend depends on it)
RUN npm run build -w packages/parser
RUN npm run build -w packages/backend
RUN npm run build -w packages/frontend

# ── Production stage (no build tools needed) ──
FROM node:22-alpine

RUN apk add --no-cache tini
WORKDIR /app

# Copy everything from builder (includes compiled native modules)
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/parser/package.json packages/parser/
COPY --from=builder /app/packages/backend/package.json packages/backend/
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/packages/parser/node_modules packages/parser/node_modules
COPY --from=builder /app/packages/backend/node_modules packages/backend/node_modules
COPY --from=builder /app/packages/parser/dist packages/parser/dist
COPY --from=builder /app/packages/backend/dist packages/backend/dist
COPY --from=builder /app/packages/frontend/dist packages/frontend/dist

ENV NODE_ENV=production
ENV PORT=8000
EXPOSE 8000

RUN mkdir -p /app/data /tmp/logcat-ai-uploads
VOLUME ["/app/data"]

ENTRYPOINT ["tini", "--"]
CMD ["node", "--max-old-space-size=1024", "packages/backend/dist/server.js"]
