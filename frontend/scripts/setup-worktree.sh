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
cd "$repo_root/frontend" && bun install
