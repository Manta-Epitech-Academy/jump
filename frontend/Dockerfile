# Step 1: Build the application
# Pinned >= 1.3.14: the CMS welcome-image pipeline uses the built-in Bun.Image
# API (added in 1.3.14) instead of a native module like sharp, which avoids the
# musl/prebuilt-binary friction of native addons on this Alpine base.
FROM oven/bun:1.3.14-alpine AS builder

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
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" BETTER_AUTH_SECRET="build-placeholder" bun run build

# Step 2: The generator's image, built with `--target seeder`
#
# It exists because the generator cannot run in the runtime image below, and must
# not be made to. It reaches `src/lib/domain` by relative path on purpose ("the
# domain is imported, never restated"), and the runtime image ships the built app
# and no source at all. Copying `src/` into it would trade that invariant away
# for one tool, and the breakage would be invisible until somebody added a `$lib`
# import to a module the generator reaches: the image would still build, and only
# the seed would fail, only in the cluster.
#
# And it has to run INSIDE the cluster rather than through a port-forward from
# somebody's machine, because `scripts/seed/guard.ts` matches `--env` against the
# connection string. A port-forwarded URL reads `localhost`, carries no marker
# for staging, and `--env staging` is refused - so seeding staging from outside
# would mean passing `--env dev`, which is working around the strictest gate in
# the generator rather than using it.
#
# `src/lib` whole, rather than the three subtrees the generator reaches today
# (`domain`, `validation`, and `content`, which it reads off the disk rather than
# importing): a list of three goes stale the first time a scenario reaches for a
# fourth, and it goes stale silently. This is a tool image that runs once and
# exits, so carrying components it never reads costs less than a list somebody
# has to keep in step.
FROM oven/bun:1.3.14-alpine AS seeder

# The same patch posture as the runtime image, so the vulnerability scan over
# that one is representative of this one too.
RUN apk upgrade --no-cache

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/lib ./src/lib

USER bun

# The Job supplies the arguments: `--env staging --profile staging --today <date>`.
# None of them are defaulted here, because the generator refuses to guess a
# target and refuses to read the wall clock, and an ENTRYPOINT carrying either
# would be the place those refusals quietly stopped applying.
ENTRYPOINT ["bun", "run", "scripts/seed/index.ts"]

# Step 3: Runtime image
FROM oven/bun:1.3.14-alpine

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
COPY --from=builder /app/scripts ./scripts

# Use the pre-existing 'bun' user for security
USER bun

# EXPOSE is documented; the PORT env var will still be used by the adapter
EXPOSE 3030

# Run migrations then start the server
CMD ["sh", "-c", "bunx prisma migrate deploy && bun ./build/index.js"]
