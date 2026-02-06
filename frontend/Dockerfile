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

# Copy built files from the builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json .

# Use the pre-existing 'bun' user for security
USER bun

EXPOSE 3000

# Start the BUN server
CMD ["bun", "run", "build/index.js"]
