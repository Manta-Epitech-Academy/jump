# Reading a named section out of an issue or pull-request body.
#
# Deliberately NOT in work-item-lib.sh. That file promises pure shell with no
# external commands, because .githooks/pre-push sources it on every push and has
# to stay instant and work offline; this one needs grep, awk and sed. Keeping the
# promise true is worth a second file.
#
# Sourced by scripts/check-work-item.sh (does the section exist and carry
# anything) and scripts/release-validation.sh (what does it say).

# Prints the body of the first heading matching $2 in file $1, stripped of HTML
# comments and of GitHub's "_No response_" filler for an empty form field.
#
# The heading match is anchored and the body runs to the next heading of any
# level, so a section is what sits under its own title and nothing else.
section_body() {
  local file="$1" pattern="$2" start end
  start=$(grep -niE "^#+[[:space:]]+(${pattern})[[:space:]]*:?[[:space:]]*$" "$file" | head -1 | cut -d: -f1)
  [ -n "$start" ] || return 1
  end=$(awk -v s="$start" 'NR > s && /^#+[ \t]/ { print NR - 1; exit }' "$file")
  [ -n "$end" ] || end=$(wc -l < "$file")
  sed -n "$((start + 1)),${end}p" "$file" \
    | grep -v '^[[:space:]]*<!--' \
    | grep -v '^[[:space:]]*-->' \
    | grep -viF '_No response_'
}

# 0 when the section exists AND carries something other than whitespace. A
# heading with nothing under it is the failure this distinguishes: the template
# renders the heading whether or not anybody filled it in.
has_section() {
  section_body "$1" "$2" 2>/dev/null | grep -q '[^[:space:]]'
}

# The heading patterns, bilingual, so the guard and the release checklist agree on
# what an issue is required to carry.
WORK_ITEM_STORIES_PATTERN="user stor(y|ies)|histoires? utilisateur"
WORK_ITEM_CRITERIA_PATTERN="acceptance criteria|crit[eè]res d'acceptation"
WORK_ITEM_EXCEPTION_PATTERN="process exception"
