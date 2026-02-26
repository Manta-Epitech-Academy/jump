# Step 1: Build the application
FROM oven/bun:alpine AS builder

# Define build-time arguments for SvelteKit
ARG PUBLIC_POCKETBASE_URL
ARG PUBLIC_INTERNAL_POCKETBASE_URL

# Make them available as environment variables during build
ENV PUBLIC_POCKETBASE_URL=$PUBLIC_POCKETBASE_URL
ENV PUBLIC_INTERNAL_POCKETBASE_URL=$PUBLIC_INTERNAL_POCKETBASE_URL

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun run build

# Step 2: Runtime image
FROM oven/bun:alpine

WORKDIR /app

# INSTALLATION OF CHROMIUM DEPENDENCIES FOR ALPINE
RUN apk add --no-cache \
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

# Use the pre-existing 'bun' user for security
USER bun

# EXPOSE is documented; the PORT env var will still be used by the adapter
EXPOSE 3030

# Start the server with Bun
CMD ["bun", "./build/index.js"]
