# The Salesforce worker contract

Six routes, one caller, and a second repository on the other end
([`jump-sf-worker`](https://github.com/Manta-Epitech-Academy/jump-sf-worker)). The
worker is **driven by Jump and stateless**: a k8s CronJob wakes it on a fixed fine
tick, it asks what to do, obeys, and reports. It holds no configuration, no cadence
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
| 1    | `GET /config`                    | Jump decides. Nothing due means the tick ends here, with no run row. |
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
- **A failed run moves nothing.** `lastDeltaAt` / `lastFullAt` are no column
  anywhere: they are `MAX(finishedAt) WHERE mode = ? AND status = 'ok'`. So a run
  that dies mid-push simply replays its window at the next tick, and nothing in
  the system has to remember that it failed. Closing an already-closed run is
  refused for the same reason: the worker fires a second `error` PATCH when its
  success PATCH is what failed, and applying it would walk the watermark back over
  data that did land.
- **Dueness reads `finishedAt`, the incremental window reads `startedAt`.** They
  are deliberately two dates. A record modified WHILE a run was executing carries
  a modstamp that run's `finishedAt` has already passed, so resuming from
  `finishedAt` drops it silently. `domain/syncSchedule.ts` owns both, plus the
  margin that absorbs the clock skew between Jump and Salesforce.
- **`mode` is always a real mode, and `since` is always a key.** The worker
  validates `mode` BEFORE it looks at `shouldSync`, so a heartbeat answer with an
  empty one makes the run throw instead of exiting quietly; and it rejects a
  missing `since` rather than reading it as null.
- **`/api/worker/config` is where the worker isolation lives.** It serves a source
  only when its campus carries a non-null `Campus.externalName`, and the seed
  generator writes none, so a generated database answers an empty list on any
  machine. It is a property of the data, not a flag somebody re-enables by
  forgetting. `scripts/seed/CLAUDE.md` states the same rule from the other side,
  and `assert/inertness.ts` refuses a seeded `Sync_Source` outright.
- **Nothing here touches `Event.devActivatedAt`.** A new campaign under a
  whitelisted parent is discovered automatically, which is the point; publishing
  it to the dev workspace stays an admin's decision. Automatic discovery is not
  automatic publication.
- **`syncEvents` skips what it cannot resolve, it does not refuse the batch.** It
  used to return on the first bad row, leaving everything before it applied and
  everything after it not, with one string to explain the state.

## Shapes that look like errors and are not

- `{"events": []}` arrives on every incremental tick where Salesforce touched
  nothing.
- A participation value can be `""`: the worker maps a null `CampaignMember.Status`
  to the empty string rather than dropping the member.
- `first_name` can be `""`, because `Contact.FirstName` is optional in Salesforce.
  The row is skipped, counted in `invalid` and logged as a `SyncError` of kind
  `MISSING_NAME`; the page of 50 that carried it is still reconciled. Refusing it
  at the envelope closes the run in error, and since the watermark only moves on
  success, the next tick replays the identical page onto the identical row.
- `date` is **absent**, never `null`, when the campaign name carries none, and it
  is written `YYYY/MM/DD`.
- `campus_ext_name` can be `""`, which resolves to no campus and is skipped.
- Jump's error body ends up quoted into `Sync_Run.error`, truncated by the worker
  at 300 characters. Keep refusals short and specific.

## Auth, and what this namespace does not have

One bearer check, `requireWorkerToken`, in front of all six. An unset
`WORKER_API_TOKEN` refuses everything rather than letting anything through.

Worth knowing rather than discovering: `/api/worker/*` sits **outside** the
`/api/admin` and `/api/mcp` prefixes that `adminApi/CLAUDE.md` assumes are
rate-limited at the edge, and it writes no per-call audit row. What stands in for
both is that the credential is machine-only, the surface is six fixed operations,
and every real run leaves a `Sync_Run`. Mounting a seventh route by copying a block
is how that stops being true.

## Steering it

No admin screen, by design: a campaign is named by an opaque Salesforce id somebody
copies out of Salesforce, and the cadence is two numbers changed twice a year.
`config_sync_sources`, `stats_sync_runs`, `stats_sync_health`, `write_sync_source`
and `write_sync_cadence` are the surface, over HTTP and as MCP tools.

---

Ce fichier porte la doctrine d'une surface. Les règles qui valent partout
(philosophie, commandes, espaces, conventions, contraintes) vivent dans
[`AGENTS.md`](../../../../../AGENTS.md) à la racine du dépôt, qui nomme ce fichier.
