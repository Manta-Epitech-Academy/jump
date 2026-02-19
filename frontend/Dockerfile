# Step 1: Build the application
FROM oven/bun:alpine AS builder

# Define build-time arguments for SvelteKit
ARG PUBLIC_POCKETBASE_URL
ARG PUBLIC_INTERNAL_POCKETBASE_URL

# Make them available as environment variables during build
ENV PUBLIC_POCKETBASE_URL=$PUBLIC_POCKETBASE_URL
ENV PUBLIC_INTERNAL_POCKETBASE_URL=$PUBLIC_INTERNAL_POCKETBASE_URL

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

# Timezone support for Alpine
RUN apk add --no-cache tzdata
ENV TZ=Europe/Paris

ENV NODE_ENV=production

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
