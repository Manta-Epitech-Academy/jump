#!/bin/sh
# Add a worktree in the shape this repository needs, and print its path.
#
#   sh scripts/new-worktree.sh feat-308-event-exports   # by hand
#
# Also wired as the `WorktreeCreate` hook in .claude/settings.json, where it
# replaces Claude Code's built-in `git worktree add` for every path that creates
# one: `claude --worktree`, `claude --worktree '#<pr>'`, a subagent declaring
# `isolation: worktree`, and a backgrounded session. Called that way it takes no
# argument and reads the hook payload on stdin instead.
#
# Three repository rules make the built-in placement and naming wrong here, and
# each is stated elsewhere rather than invented by this script:
#
#   1. A worktree belongs OUTSIDE the main checkout (AGENTS.md). The built-in
#      puts it in `.claude/worktrees/<name>`, inside it. That path is gitignored,
#      so git, ripgrep and this repo's linters are spared, but `find`, `grep -r`
#      and anything else that does not read .gitignore still walk every tracked
#      file twice.
#   2. The directory's BASENAME is load-bearing: frontend/scripts/with-test-db.sh
#      turns it into the test database name and the E2E port offset. So it has to
#      be the slug, never a generated two-word name.
#   3. The branch that carries the work to a pull request is `type/<issue>-slug`,
#      checked by the pre-push hook and by the `Work item` job. The built-in
#      names the branch `worktree-<name>`, which would reach the pull request
#      as-is and fail both.
#
# The name maps to a branch and a directory like this:
#
#   pr-123                 branch pr-123, fetched from origin's pull/123/head
#   feat-308-event-exports branch feat/308-event-exports, directory as given
#   chore/refresh-seeds    branch as given, directory chore-refresh-seeds
#   anything-else          branch and directory both as given
#
# A new branch starts from origin/dev, never from origin/HEAD. origin/HEAD is
# `main`, every pull request merges into `dev`, and `dev` is some five hundred
# commits ahead: Claude Code's own `baseRef: "fresh"` would open each worktree
# that far behind, on a base nothing here is ever merged into.
#
# Provisioning is not this script's job: .githooks/post-checkout fires on the
# `git worktree add` below and runs frontend/scripts/setup-worktree.sh, which
# links .env, seeds .env.test and installs the deps.
#
# Contract when it runs as the hook, verified against Claude Code 2.1.269 rather
# than taken from the published hook reference, which documents a nested
# `worktree` object this version does not send: stdin carries {session_id,
# transcript_path, cwd, hook_event_name, name}, the only thing on stdout is the
# absolute directory to use as the session's working directory, everything else
# goes to stderr, and a non-zero exit aborts creation and shows stderr to the
# user.
set -u

fail() {
  echo "[new-worktree] $1" >&2
  exit 1
}

name=${1:-}
session_cwd=$(pwd)

if [ -z "$name" ]; then
  payload=$(cat)
  command -v jq >/dev/null 2>&1 || fail "jq is needed to read the hook payload."
  name=$(printf '%s' "$payload" | jq -r '.name // empty')
  hook_cwd=$(printf '%s' "$payload" | jq -r '.cwd // empty')
  [ -n "$name" ] || fail "The hook payload carried no worktree name."
  [ -n "$hook_cwd" ] || fail "The hook payload carried no cwd."
  session_cwd=$hook_cwd
fi

cd "$session_cwd" 2>/dev/null || fail "Cannot enter $session_cwd."

# The main checkout, whatever the caller was standing in: a subdirectory such as
# frontend/, or another worktree. --git-common-dir resolves to the main
# repository's .git in all three cases, which is the same way post-checkout and
# setup-worktree.sh find it.
git_common=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) \
  || fail "No git repository at $session_cwd."
main_root=$(dirname "$git_common")

pr=""
case "$name" in
  pr-[0-9]*)
    pr=${name#pr-}
    slug=$name
    branch=$name
    ;;
  */*)
    slug=$(printf '%s' "$name" | tr '/' '-')
    branch=$name
    ;;
  feat-*|fix-*|refactor-*|docs-*|chore-*|test-*|perf-*|ci-*|build-*|style-*)
    slug=$name
    branch=$(printf '%s' "$name" | sed 's|-|/|')
    ;;
  *)
    slug=$name
    branch=$name
    ;;
esac

dir="$(dirname "$main_root")/$(basename "$main_root")-worktrees/$slug"

# Reusing a name reopens what is already there, the way the built-in does.
if [ -d "$dir" ]; then
  (cd "$dir" && pwd) || fail "Existing worktree is unreadable: $dir"
  exit 0
fi

cd "$main_root" || fail "Cannot enter the main checkout at $main_root."

if [ -n "$pr" ]; then
  git fetch --quiet origin "pull/$pr/head:$branch" >&2 \
    || fail "Fetching pull request #$pr from origin failed."
  start=""
elif git show-ref --verify --quiet "refs/heads/$branch"; then
  start=""
else
  # Best effort: an origin that is slow or unreachable must not block the
  # worktree, so a failed fetch falls through to the locally cached origin/dev,
  # and a missing origin/dev falls through to HEAD.
  timeout 15 git fetch --quiet origin dev >/dev/null 2>&1
  if git rev-parse --verify --quiet origin/dev >/dev/null; then
    start=origin/dev
  else
    start=HEAD
    echo "[new-worktree] no origin/dev to branch from, using HEAD." >&2
  fi
fi

mkdir -p "$(dirname "$dir")" || fail "Cannot create $(dirname "$dir")."

if [ -n "$start" ]; then
  git worktree add -b "$branch" "$dir" "$start" >&2 \
    || fail "git worktree add failed for $branch from $start."
else
  git worktree add "$dir" "$branch" >&2 \
    || fail "git worktree add failed for the existing branch $branch."
fi

(cd "$dir" && pwd) || fail "Worktree created but unreadable: $dir"
