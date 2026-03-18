FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/parser/package.json packages/parser/
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/

RUN npm ci --ignore-scripts

COPY packages/parser packages/parser
COPY packages/backend packages/backend
COPY packages/frontend packages/frontend
COPY tsconfig.json ./

# Build parser first (backend depends on it)
RUN npm run build -w packages/parser
RUN npm run build -w packages/backend
RUN npm run build -w packages/frontend

# ── Production stage ──
FROM node:22-alpine

RUN apk add --no-cache tini
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/parser/package.json packages/parser/
COPY packages/backend/package.json packages/backend/

# Install production deps only
RUN npm ci --omit=dev --ignore-scripts

# Copy built artifacts
COPY --from=builder /app/packages/parser/dist packages/parser/dist
COPY --from=builder /app/packages/backend/dist packages/backend/dist
COPY --from=builder /app/packages/frontend/dist packages/frontend/dist

# Backend serves frontend static files from ../frontend/dist
ENV NODE_ENV=production
ENV PORT=8000
EXPOSE 8000

# Data directory for SQLite
RUN mkdir -p /app/data /tmp/logcat-ai-uploads
VOLUME ["/app/data"]

ENTRYPOINT ["tini", "--"]
CMD ["node", "--max-old-space-size=1024", "packages/backend/dist/server.js"]
