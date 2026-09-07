#!/bin/sh
# Provision a git worktree for local development.
#
# Git worktrees share the repo's history but NOT untracked files or
# node_modules, so a freshly-added worktree has no `.env`, no `.env.test` and no
# installed deps. This links the `.env` from the main checkout, seeds
# `.env.test` from the example, and installs the frontend deps (whose
# postinstall regenerates the Prisma client).
#
# Safe to re-run: neither file is written when it already exists, and `bun
# install` is a no-op when already up to date. Invoked automatically by
# .githooks/post-checkout on worktree creation, or manually via
# `bun run setup:worktree`.
set -e

repo_root="$(git rev-parse --show-toplevel)"
main_root="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"

# A worktree belongs OUTSIDE the main checkout, and getting this wrong costs
# more than tidiness. Nothing gitignores it, so every search run from the repo
# root returns each file two or three times, which is how an audit of this repo
# came to report one test file under fifteen paths. And
# frontend/scripts/with-test-db.sh derives the test database name and the E2E
# port offset from this directory's basename, so a placeholder directory name
# becomes a placeholder database name.
#
# Warn and carry on rather than refuse: the worktree may already hold work, and
# this script is also run by hand to re-provision one.
if [ "$repo_root" != "$main_root" ]; then
  case "$repo_root" in
    "$main_root"/*)
      worktrees_dir="$(dirname "$main_root")/$(basename "$main_root")-worktrees"
      branch_slug="$(git branch --show-current | tr '/' '-')"
      cat >&2 <<MSG
[setup-worktree] WARNING: this worktree sits inside the main checkout.
  $repo_root
  Nothing ignores it, so every search from the repo root matches each tracked
  file more than once, and with-test-db.sh names its database after the
  directory: $(basename "$repo_root").
  Move it out, keeping the work and the branch:
    mkdir -p "$worktrees_dir"
    git worktree move "$repo_root" "$worktrees_dir/$branch_slug"
  Note that the move changes the basename, so the test database and its port
  are recomputed and the old database is left behind in the container.
MSG
      ;;
  esac
fi

if [ ! -e "$repo_root/.env" ] && [ -f "$main_root/.env" ]; then
  ln -s "$main_root/.env" "$repo_root/.env"
  echo "[setup-worktree] linked .env from $main_root"
fi

# `.env.test` deliberately carries no DATABASE_URL, PORT or ORIGIN: with-test-db.sh
# computes those per worktree and exports them last so they win. The example is
# therefore the whole file, not a template to fill in, which is what makes
# copying it the correct provisioning step. Skipping it fails the E2E leg of
# `bun run verify` on BETTER_AUTH_SECRET, a long way from the cause.
if [ ! -e "$repo_root/frontend/.env.test" ] && [ -f "$repo_root/frontend/.env.test.example" ]; then
  cp "$repo_root/frontend/.env.test.example" "$repo_root/frontend/.env.test"
  echo "[setup-worktree] seeded frontend/.env.test from .env.test.example"
fi

echo "[setup-worktree] installing frontend deps…"
# The Puppeteer browser cache (~/.cache/puppeteer) is global and shared across
# every worktree, so the main checkout's install already populated it. Skip the
# per-worktree browser download: it adds nothing and a corrupt/partial cache
# entry makes puppeteer's postinstall throw ("folder exists but executable is
# missing"), which would fail worktree provisioning.
cd "$repo_root/frontend" && PUPPETEER_SKIP_DOWNLOAD=true bun install
