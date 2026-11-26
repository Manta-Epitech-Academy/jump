---
paths:
  - "frontend/src/lib/domain/badges.ts"
  - "frontend/src/lib/server/services/badgeAwards.ts"
  - "frontend/src/lib/server/adminApi/writes/badges.ts"
  - "frontend/src/routes/api/jobs/award-badges/**"
  - "frontend/scripts/seed/catalog/badges.ts"
---

# Badges

A talent earns a badge on their journey when one of their counters reaches its rule (#448), and keeps it. What the talent sees of them, the collection on Mon parcours and the duck explaining one, is #551. They are not the printed name badges of an event (`badges.pdf`).

## A badge is data, a counter is code

- **The PO writes badges, by describing one to Claude** (`write_badge`, read back by `config_badges`). A badge is a label, a condition the talent reads, a group, a look (outline, pictogram, colours, a few characters) and a rule. Creating one on an existing counter needs no development.
- **The counters are a closed catalogue** (`BADGE_COUNTERS` in `domain/badges.ts`), each with the filters it takes. A new counter is one entry there and its query in `badgeHolders`, written when a badge needs it, and it lists the act that moves it (below). Nothing is collected for a counter: each reads facts Jump already holds (the run of days, #447, was the one addition).
- **A counter reads the rule the rest of Jump reads**, imported, never restated: an enrolment is one the talent's space shows (`shownEnrolmentWhere`), a visit is one the dev space counts on an event that is over (`attendedShownBeforeWhere`), an activity is finished as `isActivityFinished` says, a first place is the place the game finished at (`MinigameAttempt.rankAtFinish`, what the rank bonus pays, never revised). A badge that counted its own way would contradict the figures the PO reads elsewhere.
- **The pictograms are a closed list** because each is a drawing the collection ships; the colours are free `#rrggbb`, like a category's.

## An award is a fact

- **`Badge_Award` is never taken back**: not when the counter goes down (a run of days that restarts), not when the badge is archived. So an award has to keep meaning what it says, which is why **a badge's rule is fixed once it exists**: archive it and create another. Its label, condition, group and look stay editable.
- **Creating a badge is two-step (class B).** The apply awards the badge to every talent who already meets the rule, dated that day, and that cannot be undone, so the dry run says how many talents it would reach (`newHolders`) and the admin checks the rule against that number first. The count is in the plan, so a talent who comes to meet the rule between the two calls makes the apply stale rather than award a number nobody approved.
- **"Remove" is archive**: nobody earns it any more, its holders keep it. There is no delete, which would take back what talents earned.
- **An erased account loses its badges, a reset to import too, a merge keeps the earlier day** of a badge both talents held (`talentScopedData.integration.test.ts`).

## Who awards, and when

One function decides, `awardDueBadges` (`services/badgeAwards.ts`): set-wise, one grouped query per live badge. Three callers:

1. **`write_badge`**, for the badge it creates or unarchives, over every talent.
2. **The talent's own acts**, in the act's transaction and only for the counters it moves, so a badge arrives with what earned it: a daily game finished (`xp`, `dailyFirstPlaces`), an activity's progress (`xp`, `finishedActivities`), a questionnaire sent (`questionnaires`), the onboarding signed (`xp`), the day's first visit (`signInStreak`). The run of days has to be awarded there: it can restart at the next visit, before any sweep has seen the day it reached.
3. **The sweep** (`POST /api/jobs/award-badges`, hourly, scheduled in `jump-k3s`), for what no act of the talent writes: an event ending (a visit only counts once its event is over, and nothing is written then), a status Salesforce sends, an émargement or a closing the staff writes, an admin's configuration, a reward granted from a file, a merge.

A new writer of a counter's facts is either one of the talent's acts, and calls `awardDueBadges` for its counters, or it is not, and the sweep covers it within the hour. Never evaluate on every request: a visit is not an achievement (`mascot.md`).

`badgeAwards.ts` takes its client as a parameter and imports nothing from SvelteKit, so the seed awards its generated world through it rather than restating the rules.
