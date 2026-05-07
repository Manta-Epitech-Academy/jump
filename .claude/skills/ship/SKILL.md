---
name: ship
description: Generate branch name, commit message, and PR title/description for the current changes. Writes artifacts to .ship/ files and outputs ready-to-paste git/gh commands. Use when user wants to prepare git metadata before committing.
disable-model-invocation: true
---

Look at the current uncommitted/staged changes (run `git diff` and `git diff --staged`) and the conversation context to understand what was done.

## Generate

1. **Branch name** — `type/short-kebab-description` (e.g. `feat/per-campus-timezone`, `fix/auth-token-expiry`)
2. **Commit message** — Conventional Commits format matching this repo's style: `type(scope): short description` with an optional body explaining *why*, not *what*. Keep subject under 50 chars.
3. **PR title** — `type: short human-readable title` (under 70 chars)
4. **PR description** — Markdown with `## Summary` (3-5 bullet points), `## Context` (1-2 sentences on *why*), and `## Test plan` (checklist)

## Write artifacts

Use the `Write` tool to create these files at the **repo root** (run `git rev-parse --show-toplevel` to find it):

- `.ship/branch.txt` — branch name only, no trailing newline issues
- `.ship/commit.txt` — full commit message (subject + blank line + body)
- `.ship/pr-title.txt` — PR title
- `.ship/pr-body.md` — PR description markdown

This avoids the user having to copy multi-line markdown from the terminal (line breaks get mangled). `git commit -F` and `gh pr create --body-file` consume these files verbatim, preserving formatting exactly.

If `.ship/` is not already in `.gitignore`, mention it to the user once.

## Output to user

After writing, output a short summary block:

```
Branch:  <name>
Title:   <pr title>
Files:   .ship/{branch,commit,pr-title,pr-body}.{txt,md}
```

Then a fenced `sh` block with ready-to-run commands. Detect the PR base branch from context (default `main`, or whatever the user specified — e.g. for a stacked PR). Example:

```sh
git checkout -b "$(cat .ship/branch.txt)"
git add -A && git commit -F .ship/commit.txt
git push -u origin "$(cat .ship/branch.txt)"
gh pr create --base <base> \
  --title "$(cat .ship/pr-title.txt)" \
  --body-file .ship/pr-body.md
```

If the user is already on a feature branch (not `main`/`dev`), skip the `git checkout -b` line and note it.

## Rules

- Match the repo's existing commit style (check `git log --oneline -10`)
- Be specific — reference actual models, files, features changed
- PR description should be scannable, not verbose
- Do NOT run any git commands beyond read-only ones (status, diff, log, rev-parse)
- Do NOT create commits, branches, or PRs — only write metadata files and output commands for the user to run
 