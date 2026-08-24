# Shared vocabulary for the work-item convention: which branch prefixes exist, and
# how the issue number is read out of a branch name.
#
# Sourced by scripts/{check-work-item,start-work,finish-work}.sh and by
# .githooks/pre-push, so adding a branch type is one edit instead of four that
# drift apart silently. Pure shell, no external commands: the pre-push hook runs
# on every push and must stay instant and work offline.

# Conventional Commit types actually used in this repository's history.
WORK_ITEM_TYPES='feat|fix|refactor|docs|chore|test|perf|ci|build|style'

# Long-lived branches. They carry no work item and never will, so every consumer
# has to let them through rather than fail the release.
WORK_ITEM_PROTECTED='dev staging main'

# 0 when $1 looks like type/<issue>-slug, for example feat/248-dossier-annuel.
work_item_branch_ok() {
  printf '%s' "$1" | grep -qE "^(${WORK_ITEM_TYPES})/[0-9]+-[a-z0-9]+(-[a-z0-9]+)*$"
}

# Echoes the issue number carried by branch $1. Only meaningful after
# work_item_branch_ok has said yes: the number is what sits between the first
# slash and the next hyphen.
work_item_issue() {
  local tail=${1#*/}
  printf '%s' "${tail%%-*}"
}

# 0 when $1 is one of the long-lived branches.
work_item_is_protected() {
  case " $WORK_ITEM_PROTECTED " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

# The allowed types, space separated, for error messages.
work_item_types_human() {
  printf '%s' "$WORK_ITEM_TYPES" | tr '|' ' '
}

# Prints the leading comment block of script $1 as usage text. By rule rather than
# by line range: a `sed -n '2,26p'` starts printing shell code the first time the
# header grows a line.
work_item_usage() {
  awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$1"
}
