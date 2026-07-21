---
name: ship
description: Generate branch name, commit message, and PR title/description for the current changes. Writes artifacts to .ship/ files and outputs ready-to-paste git/gh commands. Use when user wants to prepare git metadata before committing.
disable-model-invocation: true
---

Figure out what's being shipped, then write the artifacts.

## Scope the diff

`/ship` is almost always preparing a PR, so the payload is **every commit on the feature branch plus any uncommitted changes**, not just the working tree. Default to whole-branch scope; only narrow when the user explicitly says so.

1. **Pick the base.** Parse the user's args first — `From <branch> onto <base>`, `onto <base>`, and `--base <base>` all set the base explicitly. Otherwise infer: if the repo has a `dev` branch and the current branch was cut from it, prefer `dev`; otherwise fall back to `gh repo view --json defaultBranchRef` (or `main`).
2. **Fetch and survey the branch.** `git fetch origin <base>`, then `git log --oneline origin/<base>..HEAD` and `git diff --name-status origin/<base>...HEAD`. If a wrapping shell swallows large diff output, redirect with `--output=/tmp/<file>` and read that.
3. **Check uncommitted work separately.** `git status` + `git diff` + `git diff --staged`. If anything is uncommitted, call it out and ask whether to ship in the same PR or split — don't quietly fold it into the branch summary.
4. **For long branches (10+ commits), group before writing.** Read every commit subject, cluster them into themes, then write the PR body from the themes. For short branches (1–2 commits), summarizing from `git log` alone is fine.

## Generate

1. **Branch name** — `type/short-kebab-description` (e.g. `feat/per-campus-timezone`, `fix/auth-token-expiry`). If you're already on the feature branch, reuse its name.
2. **Commit message** — Conventional Commits matching the repo's existing style (check `git log --oneline -10`): `type(scope): short description`, subject under 50 chars, optional body explaining *why*.
3. **PR title** — `type: short human-readable title` (under 70 chars).
4. **PR description** — Markdown with `## Summary` (3–5 bullets), `## Context` (1–2 sentences on *why*), `## Test plan` (checklist). For branches with new migrations or env vars, add `## Migrations` and/or `## Env vars` sections so reviewers don't miss them.

## Write artifacts

Write these files at the **repo root** (find it with `git rev-parse --show-toplevel`). If `.ship/` already holds artifacts from a previous run, `rm -f .ship/*` first — the Write tool refuses to overwrite existing files it hasn't Read, and retrying the same Write won't fix that.

- `.ship/branch.txt` — branch name, single line, nothing else.
- `.ship/commit.txt` — full commit message (subject + blank line + body).
- `.ship/pr-title.txt` — PR title, single line.
- `.ship/pr-body.md` — PR description markdown.

`git commit -F` and `gh pr create --body-file` render these files verbatim. The whole reason this skill exists is to avoid copy-pasting multi-line markdown through the terminal where newlines and bullets get mangled.

**Do not hard-wrap paragraphs or bullets in `commit.txt` or `pr-body.md`.** One bullet = one line, however long. One paragraph = one line. Don't insert manual line breaks at ~72 cols — that re-introduces the exact mangling the file workflow is built to prevent. The consumer (`git commit -F`, `gh pr create --body-file`, GitHub's renderer) handles wrapping. Hard newlines only between distinct paragraphs / list items / sections.

If `.ship/` is not already in `.gitignore`, mention it to the user once.

## Output to user

Print a short summary block:

```
Branch:  <name>
Title:   <pr title>
Files:   .ship/{branch,commit,pr-title,pr-body}.{txt,md}
```

Then a fenced `sh` block with the commands to run. Skip `git checkout -b` when the user is already on the feature branch (call this out explicitly). Skeleton:

```sh
git checkout -b "$(cat .ship/branch.txt)"   # omit if already on the branch
git add <explicit paths>                     # see note below
git commit -F .ship/commit.txt
git push -u origin "$(cat .ship/branch.txt)"
gh pr create --base <base> \
  --title "$(cat .ship/pr-title.txt)" \
  --body-file .ship/pr-body.md
```

Prefer explicit paths over `git add -A` whenever `git status` shows untracked files that aren't part of the change (scratch notes, summary dumps, screenshots). Surface them to the user so they can decide.

## Rules

- Match the repo's existing commit style — check `git log --oneline -10` before writing the subject.
- Reference actual symbols, models, files, routes — never generic phrases like "various improvements".
- **Never hard-wrap lines inside `commit.txt` or `pr-body.md`.** One line per bullet / paragraph / section.
- Default scope is the whole branch vs the base branch. Only narrow when the user explicitly asks for a working-tree-only summary.
- Read-only git only: `status`, `diff`, `log`, `rev-parse`, `fetch`, `merge-base`, `show`. Never `commit`, `checkout`, `branch`, `push`, `reset`, `rebase`. The user runs the write commands themselves.
