# Step 1: Build the application
FROM oven/bun:alpine AS builder

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

ENV NODE_ENV=production

# Copy built files and dependencies from the builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./

# Use the pre-existing 'bun' user for security
USER bun

EXPOSE ${PORT}

# Start the server with Bun
CMD ["bun", "./build/index.js"]
