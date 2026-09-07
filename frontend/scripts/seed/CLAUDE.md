# Development data

`bun run seed` fills a database from named scenarios (`frontend/scripts/seed/`).
It replaced a 3326-line demo seed, and the reason it exists is not tidiness: the
only credible dataset used to be a clone of production, so that is where feature
validation happened, which put real minors' personal data on non-prod
environments for days at a time and put the validation gate after the release
freeze. Both problems are downstream of the data.

Seven rules, and each is enforced rather than hoped for:

- **A pull request that adds a behaviour adds its example.** A new enum value
  fails `bun run test:seed` until some scenario produces a row, because the enum
  list is read out of `schema.prisma` (via `getDMMF`) rather than maintained by
  hand. That check is in the `verify` chain, so it fails on the branch that
  caused it. A vocabulary carried by a `String` column instead of an enum is
  covered too (`assert/stringCatalogues.ts`), and there the check runs both ways:
  every declared value needs a row, and no seeded row may carry a value the
  catalogue does not declare. That second direction is not pedantry - it caught
  four invented `Usage_FeatureUse.feature` keys the generator was writing, which
  no screen would ever have shown as wrong. That half is a hand-kept table,
  because a `String` column cannot announce its own vocabulary.
- **And a state the schema can express needs a row, not only an enum value.**
  Every check above validates the CONTENT of rows that exist, so none of them can
  see a table with nothing in it or a nullable column that is null on every row -
  which was the shape of 104 gaps, `TalentInterest` (declared in the buffer,
  ordered in the flush, never pushed) and `Usage_FeatureMonthly` (the store that
  answers beyond the retention window, never written) among them. `assert/coverage.ts`
  asks `getDMMF` what is expressible and the database whether it is present: every
  model has a row, every nullable column has both a null and a non-null one, every
  boolean has both values.

  It carries two exemption lists and the split is the load-bearing part, because a
  check whose exemption list is comfortable to append to dies of a thousand
  additions. `NEVER_SEEDED` is structural, one-directional, one reason per line -
  **`Campus.externalName` heads it, since that column being empty IS the worker
  isolation**. `NOT_YET_SEEDED` is debt and **two-directional**: an entry whose gap
  has been closed fails until its line is deleted, so the list is an exact
  description of what is missing rather than a place to hide things, and its length
  is printed on every run as a number that only goes down. Moving a line between
  the two is possible and meant to be; doing it by accident is not.

  A rare state is **placed, never drawn.** A few per cent of the `ci` profile's
  couple of dozen dossiers rounds to none, so a failure rate makes coverage depend
  on the profile rather than on the generator. The PDF renders that fail and the
  closing verdicts are both placed for this reason.

- **Nothing reads the wall clock and nothing draws from `Math.random()`.** Every
  date derives from `--today` and every choice from `--seed`, both printed in the
  manifest the run emits. A scenario written as "an event that has not happened
  yet" must still mean that in six months.
- **The domain is imported, never restated.** `src/lib/domain` is alias-free, so
  a plain `bun` script reaches it by relative path. The services are not: they
  reach `$lib/server/db` and do not resolve outside Vite, so the generator writes
  rows and `--check` runs the domain's own functions over the result. The
  generator constructs, the domain verifies.
- **The measured shape of production lives in `frontend/scripts/seed/PROFILE.md`**
  and is not re-measured. It was taken once, in aggregates, with no row ever read;
  a figure that is missing from it gets asked for rather than looked up in
  production.
- **A reset is what a database that has never been generated needs, and nothing
  else is.** The generator records its own runs - `MANIFEST_SETTING_KEY` in
  `scripts/seed/ids.ts`, the key of the manifest row every full run upserts - and
  `assertGeneratorOwnsDataset` reads that marker to tell the two situations
  apart. Never generated and already holding rows means a sync, an import or a
  restore filled it, so it is refused and `prisma migrate reset` is the answer,
  because `migrate deploy` does not replay what a migration inserted. Generated
  before means a re-seed, and the `sd_`-scoped wipe is enough.

  The distinction is not a nicety, and the version of this gate that lacked it
  refused every environment on its second run. All five aggregate roots are
  `@default(cuid())`, so no row the running application writes can carry the seed
  prefix, and three of them are written by ordinary use: `School` by a talent
  picking a lycée, `Talent` by a Microsoft sign-in, `StaffProfile` by an invited
  member's first login and by `bootstrap-admins.ts`. "Holds rows the generator did
  not write" therefore describes every environment anybody has used, which is all
  of them. Ask whether the generator has run here, never whether the database is
  pristine.

- **A seeded database is inert to every background worker, by construction.**
  The Salesforce worker is the case this was written for. It takes its scope from
  Jump - `GET /api/worker/campus` hands out `listCampuses()`, and `syncEvents`
  resolves what comes back against `Campus.externalName` - so the generator
  writes no external name at all and `listCampuses` only returns campuses that
  have one. A generated environment therefore answers an empty list, on any
  machine, and no real minor's data can land in it. This is not a flag somebody
  re-enables by forgetting: there is no campus to resolve. Turning the sync on
  for one campus is an explicit act on `/staff/admin/campuses`, where a blank
  external name already means null.

  **The broadcast queue is the second worker, and it was not inert.**
  `operations.ts` seeded four campaigns in a non-terminal status
  (`queued`/`sending`) with their recipients `pending` and a `createdAt` fourteen
  days back, which put them at the head of `processNextQueuedBroadcast`'s queue.
  So a `migrate` plus a `bun run seed` on the dev database was also a send: six
  SMS landed on a team member's personal phone through the outbound trap, and the
  provider was billed for all six. `OUTBOUND_MODE` is what kept them off a
  minor's phone, and a gate is not what makes a dataset inert. The factory's own
  header asserted the opposite ("Nothing is ever sent") the whole time, which is
  how it survived.

  **So the test to apply to a new table: a seeded row must be a FACT, never an
  INSTRUCTION.** A row a scheduler finds by ITSELF is an instruction, whatever
  the table is called, and the tell is not the word "job" in its name:
  `OnboardingPdfJob` may be seeded `pending` because nothing sweeps for it
  (`runOnboardingPdfJob` is only ever called with an explicit id). Two artifacts
  hold that line for broadcasts, because a written rule was not holding it:
  `BroadcastStatus` is classified terminal-or-outstanding once, in a total map in
  `domain/broadcasts.ts`, so `addBroadcast` cannot be handed a claimable status
  and `bun run check` refuses the call site; and `assert/inertness.ts` refuses a
  claimable `sd_` row in the check pass, which is what covers a write path the
  factory does not own.

The seed deliberately over-represents what production barely contains. There are
three part-way dossiers in production out of 887; the generator stands one on
every rung of the ladder, because those are the states the wizard is made of and
no amount of realistic volume produces them.

Two things it does not touch. The E2E fixtures
(`frontend/tests/e2e/fixtures/seed.ts`) keep their own six accounts: a spec
anchored to a large dataset breaks the first time somebody adjusts it. And the
integration suites keep building their own fixtures per file, several of them
reading platform-wide aggregates a full dataset would silently widen.

---

Ce fichier porte la doctrine d'une surface. Les règles qui valent partout (philosophie, commandes, espaces, conventions, contraintes) vivent dans [`AGENTS.md`](../../../AGENTS.md) à la racine du dépôt, qui nomme ce fichier.
