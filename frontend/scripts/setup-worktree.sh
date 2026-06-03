#!/bin/sh
# Provision a git worktree for local development.
#
# Git worktrees share the repo's history but NOT untracked files or
# node_modules, so a freshly-added worktree has no `.env` and no installed
# deps. This links the `.env` from the main checkout and installs the
# frontend deps (whose postinstall regenerates the Prisma client).
#
# Safe to re-run: the .env link is only created when missing, and `bun
# install` is a no-op when already up to date. Invoked automatically by
# .githooks/post-checkout on worktree creation, or manually via
# `bun run setup:worktree`.
set -e

repo_root="$(git rev-parse --show-toplevel)"
main_root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"

if [ ! -e "$repo_root/.env" ] && [ -f "$main_root/.env" ]; then
  ln -s "$main_root/.env" "$repo_root/.env"
  echo "[setup-worktree] linked .env from $main_root"
fi

echo "[setup-worktree] installing frontend deps…"
# The Puppeteer browser cache (~/.cache/puppeteer) is global and shared across
# every worktree, so the main checkout's install already populated it. Skip the
# per-worktree browser download: it adds nothing and a corrupt/partial cache
# entry makes puppeteer's postinstall throw ("folder exists but executable is
# missing"), which would fail worktree provisioning.
cd "$repo_root/frontend" && PUPPETEER_SKIP_DOWNLOAD=true bun install
