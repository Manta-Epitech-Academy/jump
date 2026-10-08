#!/bin/sh
# Provision a git worktree for local development.
#
# Git worktrees share the repo's history but NOT untracked files or
# node_modules, so a freshly-added worktree has no `.env` and no installed deps.
# This links the `.env` from the main checkout and installs the frontend deps
# (whose postinstall regenerates the Prisma client).
#
# The test environment is NOT provisioned here any more, and that is the point:
# `frontend/.env.test.defaults` is tracked, so a worktree already has it, and
# `with-test-db.sh` sources it directly. Seeding a per-worktree copy is what let
# a new variable reach every developer and never CI.
#
# Safe to re-run: the link is not rewritten when it already exists, and `bun
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
      # Two halves, and only one survives being gitignored. The search noise does
      # not: ripgrep, git and this repo's own linters all read .gitignore, and
      # `/.claude/worktrees/` is in it because Claude Code places its worktrees
      # there and we do not get to choose the path. Telling somebody "nothing
      # ignores it" about a directory the repository deliberately ignores is a
      # false sentence, and a warning caught being wrong once is a warning nobody
      # reads again. The basename half holds either way, so it is what is left.
      if git -C "$main_root" check-ignore -q "$repo_root" 2>/dev/null; then
        cat >&2 <<MSG
[setup-worktree] NOTE: this worktree sits inside the main checkout, at a
  gitignored path, so searches and git status are spared.
  $repo_root
  What still applies: with-test-db.sh names the test database and derives the
  E2E port from this directory, so both read $(basename "$repo_root").
MSG
      else
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
      fi
      ;;
  esac
fi

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
