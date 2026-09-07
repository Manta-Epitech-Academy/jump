#!/bin/sh
# Refuse an agent's "I'm done" when the fast half of `bun run verify` is red.
#
# Wired as the `Stop` hook in .claude/settings.json. A textual rule is
# probabilistic: an agent can say it ran the checks when it did not, and the git
# hooks cannot catch that because they fire at commit and at push, which is
# after the claim. This runs at the moment the claim is made.
#
# THIS SCRIPT FAILS OPEN, DELIBERATELY AND EVERYWHERE. Any condition it did not
# expect ends in exit 0, letting the turn finish. A gate that blocks on its own
# bug gets disarmed within the week, and a disarmed gate guards nothing. So
# there is no `set -e` here: every step is allowed to fail into "say nothing".
#
# What it does NOT run, and why that is the whole design: not `check`, not
# `test`, not `test:integration`, not `test:seed`, not `test:e2e`. svelte-check
# and the database suites are tens of seconds to minutes; on every end of turn
# that is intolerable and it would be switched off. `bun run verify` stays the
# gate for the pull request. This catches the cheapest class of mistake at the
# only moment it is free to catch.

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -n "$repo_root" ] || exit 0

command -v jq >/dev/null 2>&1 || exit 0

payload=$(cat 2>/dev/null)

# Re-entry guard. Claude Code sets `stop_hook_active` once this hook has already
# refused repeatedly, and without honouring it a persistent failure becomes a
# loop the human cannot interrupt.
#
# Read with jq, not with a glob. The first version matched the pattern
# `*"stop_hook_active"*true*`, which is true for a payload carrying
# `"stop_hook_active": false` followed by any other field set to true: the guard
# would have disarmed the gate at random.
active=$(printf '%s' "$payload" | jq -r '.stop_hook_active // false' 2>/dev/null)
[ "$active" = "true" ] && exit 0

# A read-only turn pays nothing. This is what keeps the hook acceptable: a
# question, an explanation or a search never reaches a linter.
#
# `-uno` is load-bearing and not a shortcut. Plain `--porcelain` counts
# untracked files, and this checkout permanently carries some (a worktree that
# has not been moved out yet, personal seed scripts), so the tree would read
# dirty on every turn and the cheap path would never fire once. Tracked
# modifications and anything staged are what the linters can actually see.
#
# The gap that leaves: a brand-new file, written and not staged, does not
# trigger the gate. That is consistent rather than sloppy, since `lint-prose`
# reads `git ls-files` and cannot see it either, and staging is what the commit
# rule asks for anyway. Erring toward the cheap path is the same fail-open
# choice as everything else here.
[ -n "$(git -C "$repo_root" status --porcelain -uno 2>/dev/null)" ] || exit 0

cd "$repo_root/frontend" 2>/dev/null || exit 0

failures=""
for script in lint:scripts lint lint:design lint:tests lint:prose; do
  if ! out=$(bun run "$script" 2>&1); then
    failures="${failures}
=== bun run ${script} ===
${out}"
  fi
done

[ -n "$failures" ] || exit 0

# `decision: block` on stdout with exit 0 is the documented refusal: the reason
# is handed to the model, which goes back to work instead of returning a "done"
# that is not true. jq builds it so the linter's output, which carries quotes,
# newlines and ANSI escapes, cannot break the JSON.
printf '%s' "$failures" | jq -Rs '{
  decision: "block",
  reason: ("La fin de tour est refusée : la moitié rapide de `bun run verify` est rouge sur un arbre modifié. Corrige, puis conclus.\n" + .)
}' 2>/dev/null || exit 0
