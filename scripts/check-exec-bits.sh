#!/bin/sh
# Anything with a shebang must be committed executable.
#
# `core.fileMode` is false in this repo, so `chmod +x` is invisible to git and a
# new script gets committed 100644. A non-executable git hook does not run at
# all, silently, which is how the pre-push guard nearly shipped inert. The rule
# is self-maintaining: a sourced library has no shebang and needs no exception.
#
# This lived inline in `.github/workflows/test.yml` and therefore ran nowhere but
# CI, which put it in the one category `bun run verify` exists to empty: a
# required check with no local equivalent. It is a file now so both callers run
# the same code, and `::error file=` still annotates the diff when the caller is
# Actions.
#
#   bun run lint:scripts    # from frontend/, and inside `bun run verify`
#   sh scripts/check-exec-bits.sh
set -eu

cd "$(git rev-parse --show-toplevel)"

# `while read` rather than `for f in $(...)`: the inline version this replaces
# word-split on the file list, so a path with a space in it would have been
# checked as two names that exist neither of them.
fail=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  head -1 "$f" | grep -q '^#!' || continue
  mode=$(git ls-files -s -- "$f" | awk '{print $1}')
  if [ "$mode" != "100755" ]; then
    echo "::error file=$f::$f has a shebang but is committed $mode. Fix it with: git update-index --chmod=+x $f"
    fail=1
  fi
done <<EOF
$(git ls-files '.githooks/*' 'scripts/*.sh' 'frontend/scripts/*.sh')
EOF

if [ "$fail" -eq 0 ]; then
  echo "Every committed script with a shebang is executable."
fi
exit "$fail"
