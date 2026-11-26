---
paths:
  - "frontend/src/lib/domain/badges.ts"
  - "frontend/src/lib/server/services/badgeAwards.ts"
  - "frontend/src/lib/server/adminApi/writes/badges.ts"
  - "frontend/src/routes/api/jobs/award-badges/**"
  - "frontend/scripts/seed/catalog/badges.ts"
  - "frontend/scripts/seed/catalog/badgeArt.ts"
  - "frontend/src/lib/server/badgeArtSanitize.ts"
  - "frontend/src/lib/server/services/badgeStickerPreview.ts"
  - "frontend/src/lib/server/talent/badgeCollection.ts"
  - "frontend/src/lib/components/talent/{EpidexCard,BadgeSticker}.svelte"
---

# Badges

A talent earns a badge on their journey when one of their counters reaches its rule (#448), keeps it, and finds it in « Mon Epidex » on Mon parcours, where their duck explains it (#551). They are not the printed name badges of an event (`badges.pdf`).

## A badge is data, a counter is code

- **The PO writes badges, by describing one to Claude** (`write_badge`, read back by `config_badges`). A badge is a label, a condition, a group, a drawing and a rule. Creating one on an existing counter needs no development.
- **The counters are a closed catalogue** (`BADGE_COUNTERS` in `domain/badges.ts`), each with the filters it takes. A new counter is one entry there and its query in `badgeHolders`, written when a badge needs it, and it lists the act that moves it (below). Nothing is collected for a counter: each reads facts Jump already holds (the run of days, #447, was the one addition).
- **A counter reads the rule the rest of Jump reads**, imported, never restated: an enrolment is one the talent's space shows (`shownEnrolmentWhere`), a visit is one the dev space counts on an event that is over (`attendedShownBeforeWhere`), an activity is finished as `isActivityFinished` says, a first place is the place the game finished at (`MinigameAttempt.rankAtFinish`, what the rank bonus pays, never revised). A badge that counted its own way would contradict the figures the PO reads elsewhere.

## A badge is drawn, by the model the PO talks to

- **One SVG per badge** (`Badge_Definition.art`): the mockup's stickers are each drawn for their badge, and the outline, pictogram and colours #448 picked from closed lists could draw none of them (#551). Only the inside is stored, in an 80-unit square; the frame is code (`badgeStickerSvg` in `domain/badges.ts`), shared by the collection and the preview, so every sticker has the same size and margin whatever its author wrote. The style is in `write_badge`'s description, the model being the author in practice.
- **The drawing goes straight into a talent's page**, often a minor's, with no sandboxed renderer behind it, so `screenBadgeArt` is the wall, not a courtesy: an allowlist of shapes, text and presentation attributes, `font-family` Space Mono or Anton, and no `id`, `style`, address, `url()` or script. Stored as written or not at all, like a certificate's design (`sanitizeRemoved.ts` names what would have been removed). No `id` also means thirty drawings on one page cannot paint each other. The CSP's `script-src` is a backstop, never the reason the list may loosen. A stored drawing is outside the `DESIGN.md` contract, as a certificate's is.
- **The admin sees it before a talent does.** `config_badge_preview` renders the sticker earned and still to earn, and the apply of `write_badge` answers with its link rather than the drawing it was sent. A badge is drafted archived (nobody is awarded or shown an archived badge they do not hold), previewed, redrawn, then unarchived, which is when the dry run counts who receives it. `config_badges` returns a drawing only for the badge `badgeKey` names: twenty of them on every read would cost the model a few dozen kilobytes to rewrite none.

## What the talent sees

- **« Mon Epidex » is the mockup as displayed**: a count of held over shown, then every badge in the PO's order, earned ones in colour and tilted, the others as a silhouette under their name (`EpidexCard`, `BadgeSticker`). The group orders it and is never shown; nor are a date or a condition: the mockup's grouped, dated version is code it never displays, and what is displayed is what the PO approved.
- **The duck is its voice.** A click asks him (`explain`): one of the badge's lines for the state it is in (`badgeEarned`, `badgeToEarn`, each line naming its badge), or its condition when the PO wrote none. `mascot.md` says how he answers, asleep included. The lines come with the page (`loadBadgeCollection`), so a click needs no request and the header's voice never grows with the catalogue.
- **An archived badge stays with its holders**, with its month, and leaves everybody else's collection: nobody can earn it any more. With no badge shown at all, the collection is left out of the page rather than reading « 0 / 0 ».

## An award is a fact

- **`Badge_Award` is never taken back**: not when the counter goes down (a run of days that restarts), not when the badge is archived. So an award has to keep meaning what it says, which is why **a badge's rule is fixed once it exists**. Its label, condition, group and drawing stay editable.
- **Creating a badge is two-step (class B).** The apply awards the badge to every talent who already meets the rule, dated that day, and that cannot be undone, so the dry run says how many talents it would reach (`newHolders`) and the admin checks the rule against that number first. The count is in the plan, so a talent who comes to meet the rule between the two calls makes the apply stale rather than award a number nobody approved.
- **Only a badge nobody holds is deleted** (`remove`), the shape `write_campus` gives its own: refused while any talent holds it, so it can only take away a badge nobody has seen, which writing it again gives back, and it frees the key and the label to do so. The common case is a badge on an event to come with its rule written wrong. A held badge is archived instead: nobody earns it any more, its holders keep it, and a new rule takes a new badge. A delete of a held badge would take back what talents earned, on a key any model can read, which is class C.
- **An erased account loses its badges, a reset to import too, a merge keeps the earlier day** of a badge both talents held (`talentScopedData.integration.test.ts`, and `talentMerge.integration.test.ts` for the day).

## Who awards, and when

One function decides, `awardDueBadges` (`services/badgeAwards.ts`): set-wise, one grouped query per live badge. Three callers:

1. **`write_badge`**, for the badge it creates or unarchives, over every talent.
2. **The talent's own acts**, in the act's transaction and only for the counters it moves, so a badge arrives with what earned it: a daily game finished (`xp`, `dailyFirstPlaces`), an activity's progress (`xp`, `finishedActivities`), a questionnaire sent (`questionnaires`), the onboarding signed (`xp`), the day's first visit (`signInStreak`). The run of days has to be awarded there: it can restart at the next visit, before any sweep has seen the day it reached.
3. **The sweep** (`POST /api/jobs/award-badges`, hourly, scheduled in `jump-k3s`), for what no act of the talent writes: an event ending (a visit only counts once its event is over, and nothing is written then), a status Salesforce sends, an émargement or a closing the staff writes, an admin's configuration, a reward granted from a file, a merge.

A new writer of a counter's facts is either one of the talent's acts, and calls `awardDueBadges` for its counters, or it is not, and the sweep covers it within the hour. Never evaluate on every request: a visit is not an achievement (`mascot.md`).

`badgeAwards.ts` takes its client as a parameter and imports nothing from SvelteKit, so the seed awards its generated world through it rather than restating the rules.
