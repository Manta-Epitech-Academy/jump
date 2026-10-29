---
paths:
  - "frontend/src/routes/api/worker/**"
  - "frontend/src/lib/server/services/{syncService,syncConfigService,syncRunService,devSpaceVisibility,reconciliationService,schoolService}.ts"
  - "frontend/src/lib/server/annuaire.ts"
  - "frontend/src/lib/domain/{syncSchedule,reconciliation,sfMemberStatus}.ts"
  - "frontend/src/lib/validation/{workerSync,workerConfigContract.test}.ts"
  - "frontend/src/routes/**/sf-conflicts/**"
---

# The Salesforce worker contract

Six routes, one caller, and a second repository on the other end
([`jump-sf-worker`](https://github.com/Manta-Epitech-Academy/jump-sf-worker)). The
worker is **driven by Jump and stateless**: a k8s CronJob wakes it every minute
(the schedule lives in `jump-k3s`, mirrored here by `SYNC_WORKER_TICK_MINUTES`), it
asks what to do, obeys, and reports. It holds no configuration, no cadence
and no watermark of its own, exposes no port, and only ever talks outbound.

That inversion is the whole design. Tightening the incremental pass from three
hours to fifteen minutes during a stage is a write in Jump that takes effect at the
next tick, with nothing redeployed and nobody touching the cluster.

**A contract across two repositories with no shared artifact is a contract nobody
holds.** Six routes were renamed on the worker's side and stayed unimplemented here
until the first tick returned 404 and production stopped syncing.
`validation/workerSync.ts` transcribes the worker's own `parseWorkerConfig` and
`workerConfigContract.test.ts` holds our answer to it, over the wire as well as in
memory, because `since: undefined` is present in an object and gone from its JSON.

## What a tick does

| Step | Route                            | Note                                                                 |
| ---- | -------------------------------- | -------------------------------------------------------------------- |
| 1    | `GET /config`                    | Jump decides, on cadence or request. Nothing due: tick ends, no row. |
| 2    | `POST /runs`                     | Opens a `Sync_Run`. Only a real pass gets one.                       |
| 3    | `POST /events`                   | The whole list, campus per event.                                    |
| 4    | `POST /talents`                  | Identities, deduplicated across the run, paginated by 50.            |
| 5    | `POST /event/:id/participations` | One call per event, carrying its `mode`.                             |
| 6    | `PATCH /runs/:id`                | `ok` with counters, or `error`. The watermark moves on `ok` only.    |

## Rules, each of which a reasonable-looking change breaks quietly

- **The prune runs in `full` only, and the worker says which pass it is.** A full
  pass carries every member of a campaign, so an enrolment absent from it is gone.
  An incremental carries only the campaigns Salesforce reports as touched, and
  **removing a member from a campaign moves no modstamp anywhere**, so absence
  there proves nothing. The roster alone cannot tell the two apart, which is why
  `mode` is a required field rather than something Jump infers. Reading it off
  whichever run happens to be open would be shared mutable state on
  horizontally-scaled pods. This is also why deletions are caught by the spaced
  full reconcile and by nothing else, and why spacing that pass out has a cost.
- **A full pass prunes only from a complete roster, and holds what it cannot
  prove.** Complete means non-empty with every member resolved to a known talent,
  or to a contact erased at their request, whose enrolments no roster can name
  again and the prune therefore never touches.
  An empty roster looks exactly like a truncated fetch, and a member the talents
  push skipped (a nameless contact, `MISSING_NAME`, or a person whose talents
  Jump would not merge, `MERGE_REFUSED`) may be the very person whose enrolment
  the prune would take, so in either case the enrolments that did
  resolve are written, the removals are recorded on `Sync_PruneHold`, and the
  call succeeds. A later complete roster lifts the hold by pruning normally; an
  admin who knows the campaign really was emptied releases it
  (`ops_release_prune_hold`) and the next full pass applies it if its roster is
  still empty; an `ok` full run drops the holds it did not renew.
  `stats_sync_health.prunesHeld` lists them. **Only an empty roster can be
  released**, and a CHECK holds it: over unresolved members a release would
  hand a person exactly the deletion the hold refused, so that hold lifts by
  settling the member's sync error and nothing else.
- **A sync error lives exactly as long as the sync reproduces it, and nobody
  resolves one.** `Sync_Error` holds what a pass could not do, one closed cause
  per row (`Sync_ErrorKind`): a nameless contact, an address already taken, a
  technical login failure, a person split over talents Jump will not merge. A pass that finds the problem gone deletes the row,
  and an `ok` full run deletes every row it did not meet, as it does the holds.
  A « Résoudre » button used to hide a row that the next pass reopened in
  silence, so 217 errors sat open with « résolu » meaning nothing (#462); a
  manual resolve brought back is that queue again. Only the cause is stored:
  what it prevents, who holds the address and who can fix it are derived when
  read (`domain/syncError.ts`, through `syncErrorQueue.ts`), and the admin page
  and `stats_sync_health` read that one derivation.
- **A talent is one Salesforce person: its Contact once it has one, its Lead
  only while it never became a Contact.** The worker keys a member on its
  `ContactId` and sends `converted_lead_ids`, every Lead whose
  `ConvertedContactId` is that contact. Jump used to get a Lead id even for a
  Contact, and a Contact absorbs one Lead per salon the student was met at: one
  person became a talent per Lead, the first took the login address, and the
  current enrolment could never log in (October 2026, four talents for one
  student). `claimSalesforcePerson` folds the talents of those Leads into one
  (`mergeTalents`), rekeyed to the contact, before `syncTalents` looks it up.
  The link is Salesforce's own conversion, **never an address**: siblings share
  one. The one kept is the record a person used, otherwise the one already on
  the contact, otherwise the oldest; when more than one was used (a login, a
  dossier) nothing merges and the contact is recorded as `MERGE_REFUSED`,
  because which login and which dossier a student keeps is not Jump's to guess.
  A Lead never converted stays its own talent: Salesforce does not link it, and
  converting it into the contact is the fix. **Jump ships before the worker**:
  a Jump that ignores `converted_lead_ids` takes each `ContactId` for a new
  talent and doubles every converted person.
- **A refusal that replays identically must never fail a run.** A refusal fails
  the call, the worker closes the run in error, and a failed run is replayed at
  the next tick with the same input, so a refusal that depends only on that input
  is a refusal forever, and for every campaign of the run rather than the one it
  was about. On 2026-10-01 a guard that refused a full roster whose single member
  Jump did not know stopped the whole sync, the incremental included, because a
  due full pass outranks it. So skip, count and record what cannot be applied
  (`syncEvents` for an unknown campus, `syncTalents` for a nameless contact,
  `syncParticipations` for an unknown event or an unprovable prune), and keep
  refusals for a malformed payload, which is a worker bug and not data.
- **A contact erased at their request is never imported again.** The erasure
  nulls `Talent.externalId`, so without `Sync_ErasedContact` the next push
  re-creates the talent and its login as a first sight. Both pushes skip it
  before anything else, counted in `erased`, never a `Sync_Error` (which would
  store the id and the name again). The model says why it holds the id alone
  and why the inactivity sweep bars nothing.
- **A failed run moves nothing.** The watermarks are no column anywhere: each is
  read off the latest run of its mode with `status = 'ok'` (`lastOkRun`), and
  which of that run's dates counts is the `startedAt` rule below. So a run
  that dies mid-push simply replays its window at the next tick, and nothing in
  the system has to remember that it failed. Closing an already-closed run is
  refused for the same reason: the worker fires a second `error` PATCH when its
  success PATCH is what failed, and applying it would walk the watermark back over
  data that did land.
- **A requested pass is satisfied by a run that STARTED after it.** `ops_request_sync`
  writes one `Sync_Request` row per mode and nothing ever consumes it: it is
  pending while no successful run that covers it started after it. A run already
  in flight when the request landed may have read Salesforce before the change
  somebody is waiting for, so finishing later is not enough; a failed run leaves
  it pending, as it leaves the watermark; and a full pass covers an incremental
  request, never the reverse. That is why it is a date and not a flag: a flag
  needs clearing, and the clearing is where it would get lost.
- **Dueness and the incremental window both read `startedAt`, never `finishedAt`.**
  A record modified WHILE a run was executing carries a modstamp that run's
  `finishedAt` has already passed, so resuming from `finishedAt` drops it
  silently. And a cadence of N minutes is a pass starting every N minutes: on
  2026-10-19 dueness counted from `finishedAt` with a strict comparison, and on
  the fixed 15 min tick the elapsed time was always a few seconds short, so a 15
  min cadence ran every 30 and a 3 h one every 3h15 (#419). Starting from
  `startedAt` alone still falls a hair short, since a run is stamped after the
  tick that decided it, hence a small wake-up slack, counted in seconds and held
  under half the tick: the 2 minutes #421 chose were safe on a 15 min tick and
  would run a 5 min cadence every 3 on a 1 min one (#423). `domain/syncSchedule.ts`
  owns both dates, that slack, and the margin that absorbs the clock skew
  between Jump and Salesforce.
- **`mode` is always a real mode, and `since` is always a key.** The worker
  validates `mode` BEFORE it looks at `shouldSync`, so a heartbeat answer with an
  empty one makes the run throw instead of exiting quietly; and it rejects a
  missing `since` rather than reading it as null.
- **`/api/worker/config` is where the worker isolation lives.** It serves a source
  only when its campus carries a non-null `Campus.externalName`, and the seed
  generator writes none, so a generated database answers an empty list on any
  machine. It is a property of the data, not a flag somebody re-enables by
  forgetting. `seed.md` states the same rule from the other side,
  and `assert/inertness.ts` refuses a seeded `Sync_Source` outright. The rule is
  written once, as `servedSourceWhere` in `syncConfigService.ts`, with
  `isServedToWorker` its row form for the admin answers that report it.
- **Nothing here touches `Event.devActivatedAt`.** A new campaign under a
  whitelisted parent is discovered automatically, which is the point; publishing
  it to the dev workspace stays an admin's decision. Automatic discovery is not
  automatic publication.
- **`syncEvents` skips what it cannot resolve, it does not refuse the batch.** It
  used to return on the first bad row, leaving everything before it applied and
  everything after it not, with one string to explain the state.
- **An event's days are Salesforce's, and only the sync writes them.** `date` is
  the campaign's `StartDate` at 00:00 campus-local, `endDate` its `EndDate` at
  23:59, both through `eventStartInstant` / `eventEndInstant`, so the campus
  timezone decides the day and the server's never does. Jump owns the hour
  (`startMinutes`) and nothing else: the start day was once regex-parsed out of
  the campaign name, which dated a campaign named any other way on the day the
  worker ran, and the end day was typed by hand in the config wizard, where the
  next pass would have overwritten it. A wrong day is fixed in Salesforce and
  lands on the next pass (`ops_request_sync` for one now). And no end day is a
  single-day event, never a missing field: the activation rule asked for one
  while Jump typed it, and kept asking once the sync wrote it, which refused
  every single-day campaign and every later save of a visible event whose
  campaign had no `EndDate`.

## Shapes that look like errors and are not

- `{"events": []}` arrives on every incremental tick where Salesforce touched
  nothing.
- A participation value can be `""`: the worker maps a null `CampaignMember.Status`
  to the empty string rather than dropping the member.
- `first_name` can be `""`, because `Contact.FirstName` is optional in Salesforce.
  The row is skipped, counted in `invalid` and logged as a `Sync_Error` of kind
  `MISSING_NAME`; the page of 50 that carried it is still reconciled. Refusing it
  at the envelope closes the run in error, and since the watermark only moves on
  success, the next tick replays the identical page onto the identical row.
- `converted_lead_ids` is absent from a worker that predates it, which keyed a
  converted member on one of those Leads; nothing is merged then.
- `start_date` and `end_date` are `YYYY-MM-DD` or `null`. `null` is Salesforce
  having none: no end day makes a single-day event, and a new campaign with no
  usable start day is skipped and listed in `undated`. An ABSENT key, a value
  that is no calendar day, or an end day before the start day is "not sent" and
  leaves the stored day alone.
- `campus_ext_name` can be `""`, which resolves to no campus and is skipped.
- Jump's error body ends up quoted into `Sync_Run.error`, truncated by the worker
  at 300 characters. Keep refusals short and specific.

## Auth, and what this namespace does not have

One bearer check, `requireWorkerToken`, in front of all six. An unset
`WORKER_API_TOKEN` refuses everything rather than letting anything through.

Worth knowing rather than discovering: `/api/worker/*` sits **outside** the
`/api/admin` and `/api/mcp` prefixes that `admin-api.md` assumes are
rate-limited at the edge, and it writes no per-call audit row. What stands in for
both is that the credential is machine-only, the surface is six fixed operations,
and every real run leaves a `Sync_Run`. Mounting a seventh route by copying a block
is how that stops being true.

## Steering it

No admin screen, by design: a campaign is named by an opaque Salesforce id somebody
copies out of Salesforce, and the cadence is two numbers changed twice a year.
`config_sync_sources`, `stats_sync_runs`, `stats_sync_health`, `write_sync_source`,
`write_sync_cadence`, `ops_request_sync` and `ops_release_prune_hold` are the
surface, over HTTP and as MCP tools. "Sync now" is a request, never a lowered
cadence: a cadence lowered to get one pass has to be raised again by somebody who
remembers to.

**A request waits for the next tick, and that wait is why the tick is a minute.**
On the old 15 min tick a demo waited up to a quarter of an hour to see a
Salesforce change land (#423). Nothing pushes the worker awake sooner, and that is
deliberate: Jump starting a Job itself would need cluster rights in the app and tie
it to the cluster, and the worker listens on no port, all to save under a minute.
An idle tick costs one call to Jump, since the worker logs in to Salesforce only
once a pass is due; keep it that way, or the tick pays a Salesforce session every
minute.

## Salesforce reconciliation

Talent profile fields have two sources: the worker sync (Salesforce) and onboarding (the student). They are **reconciled, not blindly overwritten**.

- **`Talent` = Jump's current truth.** Onboarding writes it directly (**optimistic**: the student's input shows on their dashboard immediately; staff arbitrate divergences afterward, there is no pending-validation gate).
- **`TalentSfImport` = 1:1 typed mirror of Salesforce's last claim**: the anti-corruption boundary. Written _only_ by `syncService.syncTalents`, never by onboarding, and upserted only when the inbound payload differs.
- **`School` = canonical UAI-keyed directory**, resolved lazily from the éducation-nationale annuaire (`server/annuaire.ts` + `schoolService.resolveSchoolByUai`). Only schools actually attended ever land here, never the ~69k national set. It replaced the old free-text `highSchoolName/City/Uai` columns: `Talent` now carries a `schoolId` FK (+ `highSchoolNameManual`, used _only_ when a lycée has no UAI). The student's school and SF's claimed school (`TalentSfImport.sfSchoolId`) both FK the same `School`.
- **No-clobber rule:** before a field is talent-confirmed (its `*ValidatedAt` is set), sync re-seeds it on `Talent`; after, sync writes **only the mirror**. Never let SF overwrite a confirmed value. (This fixed a real bug where every sync overwrote the talent's confirmed phone/name.) `sfNoClobber.integration.test.ts` runs the sync and the conflict list over the same talents, so the two cannot read the rule differently.
- **Conflict** = field is talent-confirmed **AND** `Talent` ≠ `TalentSfImport` (school compared by FK). Computed in `reconciliationService`, never stored. Surfaced at `/staff/admin/sf-conflicts` (list + accept/reject + CSV export); `acceptJump` realigns the mirror optimistically. `niveau` is SF-owned (onboarding never sets it) → always synced, never a conflict.
