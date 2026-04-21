# Step 1: Build the application
FROM oven/bun:alpine AS builder

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" bunx prisma generate
RUN bun run build

# Step 2: Runtime image
FROM oven/bun:alpine

WORKDIR /app

# Patch OS-level vulnerabilities and install Chromium dependencies
RUN apk upgrade --no-cache && apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    tzdata

ENV TZ=Europe/Paris
ENV NODE_ENV=production

# ENV VARIABLES SO THAT PUPPETEER USES ALPINE'S CHROMIUM
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Copy built files and dependencies from the builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

# Use the pre-existing 'bun' user for security
USER bun

# EXPOSE is documented; the PORT env var will still be used by the adapter
EXPOSE 3030

# Run migrations then start the server
CMD ["sh", "-c", "bunx prisma migrate deploy && bun ./build/index.js"]
