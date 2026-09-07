# Usage analytics: a catalogue of features, recorded server-side

Jump could say who was enrolled, who had signed and who was present, and nothing
about which of its own screens anybody opened. `Usage_FeatureUse` is that fact,
`Usage_FeatureMonthly` its actor-free monthly cube, and `domain/usage.ts` the
catalogue both read.

- **A key enters the catalogue only if a product decision depends on it.**
  Micro-interactions (a theme toggle, confetti seen, a collapsible opened) stay
  with Umami in aggregate. The boundary decides where a new measurement belongs:
  Umami answers "how much traffic", this catalogue answers "which campus adopted
  which feature", and only the second can be joined to `Participation`, `Campus`
  and `Event`, which is the whole reason it lives in our own database. A key is
  never added for a fact the database already records; `USAGE_MEASURED_ELSEWHERE`
  names those and the API carries the list, so a consumer is told where to look
  rather than reading a zero.

  The Umami half of that line is narrower than "traffic", and stating it loosely
  invites a cleanup that would lose something. **Umami keeps what the server
  cannot see**: a failure that never reaches an action, a duration
  (`secondsToSign`, `sessionDurationSec`), the OTP funnel before a session
  exists, and the low-cardinality dimensions this catalogue refuses on purpose
  (`sizeBucket`, `daysOpen`, `fromRole`/`toRole`). Several of its events name the
  same act as a catalogue key, and that is not duplication to remove: they are
  measured at different moments (a `track()` in `use:enhance` usually fires on
  success, `recordUsage` fires when the control is invoked), each success event
  is the denominator of a `_failed` twin, and Jump has no Sentry, so those twins
  are the only client error signal there is. Neither system is the other's check;
  quote one or the other, never both at once.

- **What is absent from the fact table is the PII boundary, and it is structural.**
  No `path`, no `url`, no `referer`, no `userAgent`, no `ip`, no `params`, no free
  text, and no `talentId`. The question is answerable from counts, so per-person
  identity for a minor is not necessary, and under art. 6(1)(f) what is not
  necessary has no basis. Before adding a column, say which figure it makes
  possible that the existing ones cannot.
- **Two actor regimes, deliberately asymmetric.** Staff are identified
  (`staffProfileId`), because they are adults, employees, and per-person history is
  what was asked for; the FK cascades, so a departure takes the history with it.
  That is the opposite of `AdminApi_Call.actorUserId`, which carries no FK
  precisely so an audit row outlives the person: an audit must, a behavioural log
  of an ex-employee must not. Talents get `actorHash` only, a monthly-rotating
  pseudonym, so the talent metric is **monthly active, never annual**. There is no
  `parent` value, because measuring a data subject on legitimate interest owes them
  an operable art. 21 objection and there is nowhere to store one for a guardian
  today (no Parent entity, `/parent/settings` holds no preferences).
- **Nothing is recorded by client code, and no view is recorded from a `load`.**
  Instructing a browser to post a result back is an access to the terminal under
  art. 5(3) ePD, which would drag the whole thing into art. 82 consent; a pure
  server log does not. There is no `/api/usage` endpoint and there must not be one.
  Views come from `USAGE_VIEW_ROUTES` in `hooks.server.ts` and connections from
  the space prefix beside it, both after the guards, which also keeps writes out
  of `load` functions that SvelteKit runs on hover-preload.
- **Where a use is recorded is a rule, not a judgement call per site.** An endpoint
  that produces an artifact records once the artifact exists, so an event issuing
  no certificate never counts a 404 as a render. Everything else records when the
  control is invoked.
- **`dedupeKey` must stay composed.** Only `feature` and `dedupeKey` are in the
  unique constraint, so the actor, the event and the impersonation flag all live
  inside the key. Drop any one of them and `skipDuplicates` silently discards a
  legitimate row; `record.test.ts` pins all three.
- **Fold before you purge.** `/api/jobs/usage-rollup` is one job for that reason:
  it folds every month present in the raw table, then purges past
  `USAGE_RAW_RETENTION_MONTHS`. Two jobs would make the ordering a scheduling
  assumption, and the purge would win a race nobody would notice until a month was
  missing from every year-on-year figure.
- **`USAGE_SALT` fails closed.** Unset means no talent recording at all, rather
  than hashing against an empty salt and producing a stable identifier for a
  minor. Same doctrine as `OUTBOUND_MODE`.
- **`db/scoped.ts` deliberately carries no delegate for these tables.** They are
  written by the recorder and read only through the admin API, which resolves its
  own scope; they are never reached through `scopedPrisma`. Same treatment, and the
  same kind of comment, as `Closing_Answer`.
- **A NARROWED talent cell is masked below five distinct actors**
  (`USAGE_SMALL_CELL_FLOOR`), because a cell of one or two in a small campus is
  nearly a statement about named children. A zero is never masked: it discloses
  nobody and it is the most actionable answer the matrix produces. The floor
  belongs to the READ, not to one operation, and not to one filter: it shipped
  applied inside the coverage matrix while `stats_feature_usage` took the same
  `campus` filter, was reachable with a leadership token, and answered unmasked;
  it then keyed on the campus filter alone while that operation also takes
  `eventId`, which names one campus, one date and a roster a dev can read by
  name, so it discloses more than the cell already withheld. The rule is the
  narrowing and not the word campus: any filter that can bring a talent count
  below the whole platform goes through `maskCell`, and the share is masked with
  the count or it hands the count straight back.
- **Two stores, one figure, and a distinct actor is counted per month.** Inside
  the retention window the answer comes from `Usage_FeatureUse`, beyond it from
  the actor-free cube, and both go through `server/usage/read.ts` so the store
  boundary cannot change what a number means. The month is not a formatting
  detail: the talent pseudonym rotates monthly, so distinct actors are additive
  across campuses and actor kinds INSIDE a month and across nothing else. The
  reported figure is therefore the busiest month's count, never a running total,
  which is also why it can never exceed a month's population. Both halves shipped
  broken and neither was visible to a test that asserted only the announced
  source or that compared the stores inside a single month.
- **A named school year IS the window.** Asking about 2025-2026 asks about
  2025-2026, so a `days` count narrows the year only when it was actually passed.
  Defaulting it and intersecting made every question about a past year an empty
  range, answered as zeros with the filters echoed back to confirm them. A
  period covering no time at all is a refusal, exactly as an unknown campus is,
  and it collapses two ways: the day count and the year do not meet, or the year
  has not opened yet. The second needs no day count, which is why the guard sits
  after the whole branch rather than inside it; while it did not, a year still
  ahead answered zeros through a `source` whose « au » preceded its « du ».
- **A connection is a DAY, and a `*_connection` row is one per person, per space,
  per UTC day.** It is written by the request itself, from `usageConnectionFeature`
  matching the space by prefix, so it covers every page of a space and not only
  the 36 routes `USAGE_VIEW_ROUTES` names. Two things follow that a
  finer-grained row would not give: it is the only hard per-actor cap in the
  catalogue, which is what makes a hover-preload structurally harmless rather
  than harmless by slice arithmetic, and the day it is sliced on is the day
  `memberActivity` casts `occurredAt::date` to, so a connection row and the
  members dialog's day count cannot disagree.

  Never a `bauth_session` row, and it never was: the session table is not a login
  history, which the schema states twice, on both `StaffProfile.firstLoginAt` and
  `Talent.firstLoginAt`, since logout, identity repair and relinks delete from
  it, so it under-reports whoever signs out and over-reports whoever never does.
  It shipped once as the source of the members page's connection list, where
  6046 of the development database's 6049 rows were expired sessions nobody had
  closed. The two projections answer "has this account ever been opened, and
  when", the connection keys answer "how often", and neither question is ever
  asked of `bauth_session`.

  The key was a login for one release and the day replaced it, so the reasoning
  is worth keeping. A row keyed on the session id counted logins, a BetterAuth
  session lives a fortnight, and somebody working daily and never signing out
  therefore produced about two rows a month: an order of magnitude out on the
  members dialog, and blind on the per-campus adoption figure, where a campus
  opening the dev space every day and one opening it twice a month returned the
  same number. The dialog had grown a tooltip explaining the fortnight away,
  which is the tell: a sentence whose job is to excuse a figure means the figure
  is the defect. **Granularity is declared by `dedupe` and by nothing else.**
  That branch keyed on the session id and returned before `dedupe` was read, so
  the value those three keys declared was dead text that would have taken effect
  silently on the first session-less request, and it skipped `impersonated` and
  `eventId` where the general path composes them.

Reads are `stats_feature_usage`, `stats_feature_adoption_gaps`,
`stats_campus_feature_coverage` (leadership) and `ops_staff_activity` (core), over
`services/adminStats/{featureUsage,staffActivity}.ts`, all reading through
`server/usage/read.ts`. The weekly digest's Adoption section reads the same
service, so an inbox figure and an asked figure cannot disagree, and it says
"adoption non mesurable" rather than naming every feature when nothing was
measured over the window: an absence of rows is an absence of measurement, and
printing it as a list of unused features is the one error that makes somebody
delete something in use. **Whichever store answers**, which is the half that was
missing: the detailed path asserted it had measured, and the digest asks for
ninety days, which always sits inside the retention window, so its own guard was
unreachable and the first mails after a deploy would have named the whole
catalogue.

---

Ce fichier porte la doctrine d'une surface. Les règles qui valent partout (philosophie, commandes, espaces, conventions, contraintes) vivent dans [`AGENTS.md`](../../../../../AGENTS.md) à la racine du dépôt, qui nomme ce fichier.
