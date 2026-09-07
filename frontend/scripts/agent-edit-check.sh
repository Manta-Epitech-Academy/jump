#!/bin/sh
# Tell an agent, at the moment it writes a file, that the file breaks a prose
# rule. Wired as the `PostToolUse` hook for Edit and Write.
#
# It does NOT block the write, and that is not a shortcoming to fix: PostToolUse
# fires after the tool has run, so the edit has already landed. What it buys is
# the distance between finding out now and finding out at `bun run verify`,
# which in practice is after a commit. Exit 2 with the linter's output on stderr
# is the documented way to hand that text back to the model.
#
# Fails open everywhere, like agent-stop-gate.sh: no `set -e`, and every
# unexpected condition ends in exit 0. A hook that reports on its own bugs
# teaches the reader to ignore it.

command -v jq >/dev/null 2>&1 || exit 0

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -n "$repo_root" ] || exit 0

file=$(jq -r '.tool_input.file_path // empty' 2>/dev/null) || exit 0
[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

cd "$repo_root/frontend" 2>/dev/null || exit 0

# The linter decides what is in scope: it refuses a gitignored path itself, and
# it accepts a file that is not tracked yet, which is the common case here since
# the agent may have just created it.
out=$(bun run scripts/lint-prose.ts --file "$file" 2>&1) && exit 0

printf '%s\n' "$out" >&2
exit 2
