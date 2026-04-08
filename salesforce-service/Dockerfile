FROM oven/bun:alpine AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src ./src
COPY tsconfig.json ./

FROM oven/bun:alpine

WORKDIR /app

ENV NODE_ENV=production
ENV TZ=Europe/Paris

RUN apk add --no-cache tzdata

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./
COPY --from=builder /app/tsconfig.json ./

USER bun

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
