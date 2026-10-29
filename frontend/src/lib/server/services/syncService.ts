/**
 * What the Salesforce worker pushes: events (campus per row, never deleted),
 * talent identities (seeds `Talent`, upserts the `TalentSfImport` mirror,
 * no-clobber), and enrolments, whose prune runs on a `full` pass only and only
 * from a complete roster (anything else is held on `Sync_PruneHold`, never
 * refused).
 *
 * The rules behind each of those, and the incidents that set them, are in
 * `.claude/rules/salesforce.md`.
 */
import { prisma } from '$lib/server/db';
import { Prisma, type Sync_ErrorKind } from '@prisma/client';
import { defaultEventModules } from '$lib/domain/eventModules';
import { isNiveau, type Niveau } from '$lib/domain/niveau';
import { normalizePhoneToE164 } from '$lib/domain/phone';
import { resolveSchoolByUai } from '$lib/server/services/schoolService';
import { autoResolveAuthIdentity } from '$lib/server/services/authIdentityRepairService';
import { claimSalesforcePerson } from '$lib/server/services/talentMergeService';
import {
  clearContactErrors,
  recordContactError,
  settleLoginError,
  type LoginFailure,
} from '$lib/server/services/syncErrorService';
import {
  ensureTalentUser,
  TalentAccountError,
} from '$lib/server/services/talentAccount';
import {
  changeUserEmail,
  EmailChangeConflict,
} from '$lib/server/services/userEmail';
import {
  isShownInDevSpace,
  normalizeSfStatus,
} from '$lib/domain/sfMemberStatus';
import {
  defaultShownStatuses,
  recomputeShownInDevSpace,
  shownStatusesByEvent,
} from '$lib/server/services/devSpaceVisibility';
import { schoolYearOf } from '$lib/domain/schoolYear';
import { eventEndInstant, eventStartInstant } from '$lib/domain/event';
import { isCalendarDay, type DateKey } from '$lib/domain/planningTime';
import { upsertSchoolingYearRecord } from '$lib/server/services/schoolingService';
import type {
  WorkerEvent,
  WorkerSyncMode,
  WorkerTalent,
} from '$lib/validation/workerSync';

// Salesforce ships a binary gender ('m' | 'f'); map it onto the civilité enum
// the rest of the app uses. SF has no equivalent for 'autre', so it stays null.
function mapGender(gender: string | null | undefined): string | null {
  if (gender === 'm') return 'homme';
  if (gender === 'f') return 'femme';
  return null;
}

// Resolve every distinct SF-claimed UAI to a canonical School id once, up front.
// A cohort of ~200 talents shares far fewer schools, so this runs the lazy
// create/enrich (and its annuaire lookup) a single time per school instead of
// once per talent, and never re-hits the annuaire for a UAI twice in one sync.
async function resolveSchools(
  talents: { school?: string | null; school_uai?: string | null }[],
): Promise<Map<string, string | null>> {
  // First non-empty SF-sent name per UAI is the annuaire-down fallback.
  const fallbackByUai = new Map<string, string | null>();
  for (const t of talents) {
    const uai = t.school_uai?.trim();
    if (uai && !fallbackByUai.has(uai))
      fallbackByUai.set(uai, t.school ?? null);
  }
  const idByUai = new Map<string, string | null>();
  for (const [uai, fallback] of fallbackByUai) {
    idByUai.set(uai, await resolveSchoolByUai(uai, fallback));
  }
  return idByUai;
}

/**
 * Upsert the events of a whole run, campus by campus.
 *
 * One call for the entire whitelist, with the campus travelling per event
 * rather than in the path: the worker resolves a parent campaign into children
 * that may sit on different campuses, so a per-campus route made it group a
 * list it had no reason to group.
 *
 * An event whose campus does not resolve is SKIPPED and counted, never a
 * refusal for the batch. This used to return on the first bad row, which left
 * every event before it applied and every event after it not, with one error
 * string to explain the state. A campus nobody has armed in Jump is an ordinary
 * configuration gap and must not cost the other 250 events their sync, so the
 * names that did not resolve come back instead, for the run report to carry.
 *
 * That same resolution is the worker isolation: a campus with no
 * `externalName` matches nothing here, and `syncConfigService` never hands out
 * a source pointing at one in the first place.
 *
 * Never deletes. An event that vanishes from Salesforce keeps its Jump-side
 * configuration, its enrolments and its history. `Event.devActivatedAt` is not
 * touched either, so an event discovered under a whitelisted parent campaign
 * lands hidden until an admin activates it: automatic discovery is not
 * automatic publication.
 *
 * The two days are Salesforce's: the campaign's `StartDate` becomes `date` and
 * its `EndDate` becomes `endDate`, read in the campus timezone, and a campaign
 * with no `EndDate` is a single-day event. Nothing in Jump edits them, so a
 * wrong day is fixed in Salesforce and lands on the next pass. A NEW campaign
 * with no usable start day (none, or a value that is no calendar day) is
 * skipped like an unknown campus, and its id comes back in `undated`: `date`
 * is required, and the sync instant it used to fall back
 * to put the event on whatever day the worker happened to run.
 */
export async function syncEvents(events: WorkerEvent[]) {
  const wanted = [
    ...new Set(
      events.map((e) => e.campus_ext_name).filter((n) => n.length > 0),
    ),
  ];
  const campuses = await prisma.campus.findMany({
    where: { externalName: { in: wanted } },
    select: { id: true, externalName: true, timezone: true },
  });
  const campusByExternalName = new Map(
    campuses.map((c) => [c.externalName as string, c]),
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const unresolvedCampuses = new Set<string>();
  const undated: string[] = [];
  // Read lazily, once per push: most pushes create no event at all.
  let shownByDefault: string[] | undefined;

  for (const e of events) {
    const campus = campusByExternalName.get(e.campus_ext_name);
    if (!campus) {
      skipped++;
      // `campus_ext_name` is legitimately `""` when the campaign names no
      // campus, which is an ABSENT name rather than an unresolved one. Listing
      // it would put a blank entry in the report that reads as a lost value.
      if (e.campus_ext_name.length > 0)
        unresolvedCampuses.add(e.campus_ext_name);
      continue;
    }
    const campusId = campus.id;
    // `undefined` leaves the stored day alone and `null` clears it, which only
    // the end day can be: an event always has a start.
    const date =
      campaignDay(e.start_date, (day) =>
        eventStartInstant(day, campus.timezone),
      ) ?? undefined;
    const sentEnd = campaignDay(e.end_date, (day) =>
      eventEndInstant(day, campus.timezone),
    );

    const existing = await prisma.event.findUnique({
      where: { externalId: e.external_id },
    });
    // An end day before the start day is a typo in Salesforce, not a window:
    // stored, it made an event that is over before it begins, with no
    // émargement day. It reads as not sent, like a value that is no day.
    const start = date ?? existing?.date;
    const endDate = sentEnd && start && sentEnd < start ? undefined : sentEnd;

    if (!existing) {
      if (!date) {
        skipped++;
        undated.push(e.external_id);
        continue;
      }
      // Seed the per-event modules and the shown Salesforce statuses once, at
      // creation. After this the rows are Jump-owned: the update branch never
      // touches them, so the dev team's per-event config is never clobbered.
      // Everything else (start time, welcome, feedback form) stays unset until
      // an admin configures the event from the config wizard - a synced event
      // lands hidden.
      shownByDefault ??= await defaultShownStatuses();
      await prisma.event.create({
        data: {
          externalId: e.external_id,
          date,
          endDate,
          titre: e.title,
          campusId,
          modules: {
            create: defaultEventModules().map((moduleKey) => ({ moduleKey })),
          },
          shownStatuses: {
            create: shownByDefault.map((status) => ({ status })),
          },
        },
      });
      created++;
    } else if (
      existing.titre !== e.title ||
      existing.campusId !== campusId ||
      (date !== undefined && !sameInstant(existing.date, date)) ||
      (endDate !== undefined && !sameInstant(existing.endDate, endDate))
    ) {
      await prisma.event.update({
        where: { externalId: e.external_id },
        // An `undefined` day is no write at all for Prisma.
        data: { titre: e.title, campusId, date, endDate },
      });
      updated++;
    }
  }

  return {
    created,
    updated,
    skipped,
    unresolvedCampuses: [...unresolvedCampuses],
    undated,
  };
}

/**
 * A campaign day as the worker sent it, as the instant Jump stores. `null` =
 * Salesforce has none. `undefined` = not sent, which is also how a value that
 * is not a real calendar day reads (and, in `syncEvents`, an end day before
 * the start day): skipping one field beats refusing the run over it.
 */
function campaignDay(
  value: string | null | undefined,
  toInstant: (day: DateKey) => Date,
): Date | null | undefined {
  if (value === null) return null;
  return value !== undefined && isCalendarDay(value)
    ? toInstant(value)
    : undefined;
}

function sameInstant(a: Date | null, b: Date | null): boolean {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null);
}

/**
 * Drive a talent's login account toward Salesforce's address, and say what stood
 * in the way: the login error this pass leaves on the talent, or null when
 * nothing did.
 *
 * The eager-mint invariant (every Salesforce talent carries a `bauth_user`
 * minted from its Salesforce address) has to hold whether the talent was just
 * created or found without an account (a first mint that failed, or a reset),
 * so both branches of `syncTalents` come through here. A clean rename succeeds
 * silently. A rename onto an address an account already holds is healed only
 * in the safe orphan case (`autoResolveAuthIdentity`); anything else is left
 * to an admin, because Salesforce is an unreliable source and an inversion or
 * an exposure is never forced on its say-so.
 *
 * Never throws. A failure here is one talent's, and a throw would fail the
 * run, which the next tick replays onto the same talent forever: the rule the
 * nameless contact in `syncTalents` follows too.
 */
async function reconcileLoginIdentity(
  talent: { id: string; userId: string | null; linkedEmail: string | null },
  email: string | null,
): Promise<LoginFailure | null> {
  if (!email) return null;
  try {
    if (!talent.userId) await ensureTalentUser(talent.id);
    else if (email !== talent.linkedEmail)
      await changeUserEmail(talent.userId, email);
    return null;
  } catch (err) {
    if (err instanceof TalentAccountError && err.kind === 'identity_conflict')
      return { kind: 'ADDRESS_TAKEN', detail: null };
    if (err instanceof EmailChangeConflict) {
      try {
        const outcome = await autoResolveAuthIdentity(talent.id, 'sync');
        return outcome === 'skipped'
          ? { kind: 'ADDRESS_TAKEN', detail: null }
          : null;
      } catch (repairErr) {
        return { kind: 'LOGIN_FAILURE', detail: technicalCause(repairErr) };
      }
    }
    return { kind: 'LOGIN_FAILURE', detail: technicalCause(err) };
  }
}

function technicalCause(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Upsert talent identities and everything reconciled about them, for the whole
 * run at once.
 *
 * Deliberately knows nothing about events. It used to take one, because the
 * worker pushed a campaign's members and its enrolments in a single call, so
 * this function seeded talents AND wrote participations AND pruned. The worker
 * now dedupes talents across the whole whitelist and pushes them once, so a
 * talent attending two events is reconciled once instead of twice; enrolments
 * are `syncParticipations` below.
 *
 * Nothing is lost by dropping the event: `Talent` carries no campus column at
 * all, a talent reaches a campus through its participations, so identity never
 * needed the context the enrolment gave it.
 *
 * Never refuses the batch. A row it cannot use comes back in `invalid` with a
 * `Sync_Error` naming it; see the comment at the top of the loop for what
 * returning instead used to cost. A contact erased at their request comes back
 * in `erased`, with nothing written at all. The talent's login errors are
 * settled here too, on every talent the pass carries, so the queue says what
 * is still failing rather than what once did.
 */
export async function syncTalents(talents: WorkerTalent[]) {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let invalid = 0;
  let erased = 0;
  const currentSchoolYear = schoolYearOf(new Date(), 'Europe/Paris').label;
  const erasedIds = await erasedContactsAmong(
    talents.flatMap((t) => [t.external_id, ...(t.converted_lead_ids ?? [])]),
  );

  // Canonical School per distinct UAI, resolved once for the whole batch.
  const schoolIdByUai = await resolveSchools(talents);
  // Contacts this pass took in, whose contact error is now gone.
  const takenIn: string[] = [];

  for (const t of talents) {
    // A contact whose talent was erased at their request is never imported
    // again: that is what the erasure promised them. Checked before the name,
    // because a `Sync_Error` would store the very id and name the erasure
    // removed. Counted rather than refused, for the reason below: Salesforce
    // keeps the contact, so the worker keeps sending it.
    //
    // The bar is on the person, not on one of their ids: a talent erased while
    // keyed on a Lead comes back as the Contact that Lead was converted into,
    // so the bar follows it there (`carryErasureBar`).
    const converted = t.converted_lead_ids ?? [];
    const barredLeads = converted.filter((id) => erasedIds.has(id));
    if (erasedIds.has(t.external_id) || barredLeads.length > 0) {
      if (barredLeads.length > 0)
        await carryErasureBar(t.external_id, barredLeads);
      erased++;
      continue;
    }

    const email = t.email?.toLowerCase().trim() || null;
    // What a contact error names when Jump cannot take this one in.
    const contact = {
      externalId: t.external_id,
      contactName: `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || null,
      email,
    };

    // A contact with no name is SKIPPED and logged, never a refusal for the
    // batch, which is the rule `syncEvents` above states about an unresolved
    // campus. It matters more here, and this used to return.
    //
    // `Contact.FirstName` is optional in Salesforce, so this is ordinary data
    // and not a malformed payload. Returning abandoned the rest of the batch
    // mid-loop with everything before it already committed, answered 400, and
    // therefore closed the run in `error` - which leaves the watermark where it
    // was, by design. The next tick then replayed the identical window onto the
    // identical row. One nameless contact stopped every campaign from syncing,
    // permanently, and the refonte made that worse rather than better: the
    // worker now dedupes identities across the whole whitelist into one push,
    // so the blast radius is the entire perimeter instead of one campaign.
    //
    // Tightening `workerTalentSchema` to `.min(1)` instead would refuse the
    // whole page of 50 at the envelope, which is the same stall wearing a
    // louder error. The name is what the envelope deliberately leaves loose.
    //
    // A name of spaces is no name: it would create a talent nobody can find.
    if (!t.first_name?.trim() || !t.last_name?.trim()) {
      invalid++;
      // The talent simply never appears in Jump otherwise, and a silent
      // absence is the failure mode this whole surface is written against.
      // `Sync_Error` is where a person the sync could not reconcile goes, and
      // the fix is upstream: somebody completes the contact in Salesforce.
      await recordContactError('MISSING_NAME', contact);
      continue;
    }

    // One Salesforce person, one talent: fold the talents Jump made of the
    // Leads converted into this contact into the one it keeps, keyed on the
    // contact, before anything below looks it up by `external_id`. Skipped
    // and recorded like a nameless contact when more than one of them was
    // used, since only a person can say which one the student keeps.
    if ((await claimSalesforcePerson(t.external_id, converted)) === 'refused') {
      invalid++;
      await recordContactError('MERGE_REFUSED', {
        ...contact,
        convertedLeadIds: converted,
      });
      continue;
    }
    takenIn.push(t.external_id);

    // Store SF's phone in canonical E.164 so a bare "765719823" and a full
    // "+33765719823" land identically on both Talent and the mirror; keep the
    // raw value when it doesn't parse rather than drop it.
    const phone = normalizePhoneToE164(t.phone) ?? (t.phone?.trim() || null);
    // Drop unknown labels rather than poisoning the column with raw SF values.
    const niveau: Niveau | null = isNiveau(t.class_level)
      ? t.class_level
      : null;
    const civilite = mapGender(t.gender);
    // Canonical School for the SF-claimed lycée, resolved once for the batch above.
    const uai = t.school_uai?.trim();
    const sfSchoolId = uai ? (schoolIdByUai.get(uai) ?? null) : null;
    // Salesforce's claim as the mirror stores it: the one place its fields are
    // spelled, so a field added here is created, refreshed and compared alike.
    const claim = {
      nom: t.last_name,
      prenom: t.first_name,
      sfEmail: email,
      phone,
      civilite,
      niveau,
      sfSchoolId,
    } satisfies Prisma.TalentSfImportUncheckedCreateWithoutTalentInput;

    const existing = await prisma.talent.findUnique({
      where: { externalId: t.external_id },
      select: {
        id: true,
        userId: true,
        prenom: true,
        nom: true,
        // Linked login account email, to skip the reconcile when already aligned.
        user: { select: { email: true } },
        // The login error already stored, so a pass that finds nothing wrong
        // deletes it without a query when there is none.
        syncError: { select: { kind: true } },
        phone: true,
        civilite: true,
        niveau: true,
        schoolId: true,
        infoValidatedAt: true,
        highSchoolValidatedAt: true,
        // The current school year's ledger row, to decide below whether Jump's
        // belief about *this year* moved. Rides the lookup that already runs
        // per talent, so it costs no extra query.
        schoolingRecords: {
          where: { schoolYear: currentSchoolYear },
          take: 1,
          select: { niveau: true, schoolId: true },
        },
        sfImport: {
          select: {
            nom: true,
            prenom: true,
            sfEmail: true,
            phone: true,
            civilite: true,
            niveau: true,
            sfSchoolId: true,
          },
        },
      },
    });

    let talentId: string;

    if (!existing) {
      // The login error already stored: none for a talent seen for the first
      // time, the winner's when a concurrent pass created it first.
      let storedError: Sync_ErrorKind | null = null;
      // First sight: seed the Talent (Jump truth starts equal to SF) and create
      // its SF mirror in one shot. Before any onboarding confirmation, SF is the
      // only source, so seed and mirror are identical.
      try {
        // The Salesforce id only. This used to print the name, the email and
        // the phone of every talent created, which put a minor's personal data
        // in a pod log that outlives the request and that nothing anonymises.
        // The id is what somebody debugging actually follows, into Salesforce
        // and into `Talent.externalId` alike.
        console.log(`Creating new talent from Salesforce: ${t.external_id}`);
        const talent = await prisma.talent.create({
          data: {
            externalId: t.external_id,
            prenom: t.first_name,
            nom: t.last_name,
            phone,
            niveau,
            civilite,
            schoolId: sfSchoolId,
            xp: 0,
            eventsCount: 0,
            schoolingRecords: {
              create: {
                schoolYear: currentSchoolYear,
                niveau,
                schoolId: sfSchoolId,
                source: 'sync',
              },
            },
            sfImport: { create: claim },
          },
        });
        talentId = talent.id;
        created++;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          // Only `externalId` is unique on create now (Talent.email is gone): a
          // concurrent pass created the same SF record. Adopt the winner's
          // row and fall through rather than aborting: the rest of the batch
          // still has to be reconciled, and the enrolment is written by
          // `syncParticipations` against this same external id either way.
          const winner = await prisma.talent.findUnique({
            where: { externalId: t.external_id },
            select: { id: true, syncError: { select: { kind: true } } },
          });
          if (!winner) throw err;
          talentId = winner.id;
          storedError = winner.syncError?.kind ?? null;
          skipped++;
        } else {
          throw err;
        }
      }

      // Eager-mint the login account at import so `bauth_user.email` is the
      // identity from day one (same shape as the CSV campaign path), no window
      // where a Talent exists without an account. An address that is already
      // somebody else's can't be forced into a student login: the talent is
      // still imported, accountless, and the error says who holds it.
      // Emailless SF rows stay accountless.
      await settleLoginError(
        talentId,
        storedError,
        await reconcileLoginIdentity(
          { id: talentId, userId: null, linkedEmail: null },
          email,
        ),
      );
    } else {
      talentId = existing.id;

      // 1. Refresh the SF mirror to the latest claim. Skip the write when the
      //    payload is identical to the stored mirror: on the steady state
      //    (200 talents, ~0 changes / 30 min) this means near-zero writes.
      //    Indexing the selected mirror with every key of the claim makes a
      //    field missing from the select above a compile error.
      const m = existing.sfImport;
      const mirrorChanged =
        !m ||
        (Object.keys(claim) as (keyof typeof claim)[]).some(
          (k) => m[k] !== claim[k],
        );
      if (mirrorChanged) {
        await prisma.talentSfImport.upsert({
          where: { talentId },
          create: { talentId, ...claim },
          update: claim,
        });
      }

      // 2. Patch the Talent row under the no-clobber rule: SF only re-seeds a
      //    field while the talent hasn't confirmed it. Once confirmed, SF stops
      //    touching it and a divergence is left to surface as a conflict.
      //    `niveau` and `schoolId` are deliberately absent from this patch: they
      //    are the projection of Schooling_YearRecord, written only through
      //    schoolingService just below, so the ledger is the single write path
      //    for both columns here as it already is in onboarding and
      //    reconciliation.
      const patch: Prisma.TalentUncheckedUpdateInput = {};
      if (!existing.infoValidatedAt) {
        if (existing.prenom !== t.first_name) patch.prenom = t.first_name;
        if (existing.nom !== t.last_name) patch.nom = t.last_name;
        if (existing.phone !== phone) patch.phone = phone;
        if (existing.civilite !== civilite) patch.civilite = civilite;
      }

      // 3. Jump's belief about this talent's schooling *for the current school
      //    year*, under that same no-clobber rule: niveau is SF-owned
      //    (onboarding never sets it) but a blank/unknown SF value never wipes
      //    it, and SF re-seeds the school only until the talent confirms their
      //    own.
      const yearNiveau = niveau ?? existing.niveau;
      const yearSchoolId = existing.highSchoolValidatedAt
        ? existing.schoolId
        : sfSchoolId;

      // Gate the ledger write on whether the belief *for that year* moved, not
      // on whether the Talent projection changed. Those differ: a talent whose
      // level is unchanged year-over-year (a redoublant, or every talent on the
      // first sync after the 31 July cutover) still has a schooling fact for the
      // new year, and gating on the projection would drop it silently, leaving
      // the year permanently unrecorded while Talent.niveau kept projecting a
      // year that has no row.
      const yearRecord = existing.schoolingRecords[0];
      const schoolingChanged =
        !yearRecord ||
        yearRecord.niveau !== yearNiveau ||
        yearRecord.schoolId !== yearSchoolId;

      if (schoolingChanged) {
        await prisma.$transaction((tx) =>
          upsertSchoolingYearRecord(tx, {
            talentId,
            schoolYear: currentSchoolYear,
            niveau: yearNiveau,
            schoolId: yearSchoolId,
            source: 'sync',
          }),
        );
      }

      const hasPatch = Object.keys(patch).length > 0;
      if (hasPatch) {
        await prisma.talent.update({
          where: { externalId: t.external_id },
          data: patch,
        });
      }

      // Drive the login identity toward SF's claimed email, then settle the
      // talent's login error on what that found. An account gone missing on an
      // existing talent (a first mint that failed, or a reset) is minted again
      // here, which is the retry the create branch relies on.
      await settleLoginError(
        existing.id,
        existing.syncError?.kind ?? null,
        await reconcileLoginIdentity(
          {
            id: existing.id,
            userId: existing.userId,
            linkedEmail: existing.user?.email?.toLowerCase().trim() ?? null,
          },
          email,
        ),
      );
      if (mirrorChanged || hasPatch || schoolingChanged) updated++;
    }
  }

  await clearContactErrors(takenIn);
  return { created, updated, skipped, invalid, erased };
}

/** Which of these Salesforce ids belong to a contact erased at their request. */
async function erasedContactsAmong(externalIds: string[]) {
  const rows = await prisma.sync_ErasedContact.findMany({
    where: { externalId: { in: externalIds } },
    select: { externalId: true },
  });
  return new Set(rows.map((r) => r.externalId));
}

/**
 * Rekey the bar of an erased Lead onto the Contact it was converted into, as
 * `claimSalesforcePerson` rekeys a talent: one person, one row, on the id
 * Salesforce now sends. The enrolments push names the Contact, so a bar left on
 * the Lead would leave its roster unresolved, and an admin readmitting the
 * person copies the Contact's id out of Salesforce, not a Lead's.
 */
async function carryErasureBar(contactId: string, leadIds: string[]) {
  await prisma.$transaction([
    prisma.sync_ErasedContact.upsert({
      where: { externalId: contactId },
      create: { externalId: contactId },
      update: {},
    }),
    prisma.sync_ErasedContact.deleteMany({
      where: { externalId: { in: leadIds } },
    }),
  ]);
}

/**
 * Write one event's enrolments, and prune the ones that are gone.
 *
 * Split out of `syncTalents` because the worker split the two pushes: identities
 * are deduplicated across the whole run, enrolments are per event. The split is
 * also the honest shape, since `Participation` is what ties a talent to a
 * campus and `Talent` never did.
 *
 * **The prune runs in `full` only, and the mode is stated, never inferred.**
 * A full pass carries every member of the campaign, so an enrolment missing
 * from it is one that no longer exists. An incremental pass carries only the
 * campaigns Salesforce reports as touched, and removing a member from a
 * campaign moves no modstamp anywhere, so absence there means nothing at all.
 * The roster alone cannot tell the two apart, and reading the mode off whatever
 * run happens to be open would be shared mutable state on horizontally-scaled
 * pods. So it travels in the payload. That is also why deletions are caught by
 * the spaced full reconcile and by nothing else.
 *
 * An `external_id` Jump does not know is counted and skipped: the worker pushes
 * talents before enrolments and fails the run if that push fails, so an unknown
 * one is a contact the talents push skipped, for having no name or for a merge
 * it refused, which is already its own `Sync_Error` (`MISSING_NAME`,
 * `MERGE_REFUSED`). A talent whose login failed is still created, so its
 * enrolments resolve. A contact erased at their request is the exception: it
 * is known to be nobody Jump may hold, so it counts as resolved (`erased`), and
 * a roster carrying one still proves its deletions.
 *
 * **Nothing here refuses, and that is the rule this function was rebuilt on.**
 * Every answer but a malformed payload is a success, because a refusal fails
 * the call, the worker closes the run in error, and a failed run is replayed
 * identically at the next tick: a refusal that depends only on its input is
 * therefore a refusal forever, for every campaign of the run and not only for
 * the one it was about. That is how one campaign with one unresolvable member
 * stopped the whole sync on 2026-10-01. What a refusal used to protect is
 * protected by `pruneFromFullRoster` instead, which holds the removals it
 * cannot prove rather than failing the call.
 *
 * An event Jump does not know answers the same way: `syncEvents` skips one
 * whose campus does not resolve, and the worker still sends its roster.
 */
export async function syncParticipations(
  eventExternalId: string,
  statusByExternalId: Record<string, string>,
  mode: WorkerSyncMode,
) {
  const externalIds = Object.keys(statusByExternalId);

  const event = await prisma.event.findUnique({
    where: { externalId: eventExternalId },
    select: { id: true, campusId: true },
  });
  if (!event)
    return {
      upserted: 0,
      skipped: externalIds.length,
      removed: 0,
      held: false,
      eventUnknown: true,
    };

  const [known, erasedIds] = await Promise.all([
    prisma.talent.findMany({
      where: { externalId: { in: externalIds } },
      select: { id: true, externalId: true },
    }),
    erasedContactsAmong(externalIds),
  ]);
  // Read once per roster: what this event shows decides each row's projection,
  // written in the same statement as the status it derives from, and re-derived
  // for the whole event once the roster is written.
  const shown =
    (await shownStatusesByEvent([event.id])).get(event.id) ?? new Set();
  const talentIdByExternalId = new Map(
    known.map((t) => [t.externalId as string, t.id]),
  );

  let upserted = 0;
  let skipped = 0;
  let erased = 0;
  const presentTalentIds: string[] = [];

  for (const [externalId, rawStatus] of Object.entries(statusByExternalId)) {
    const talentId = talentIdByExternalId.get(externalId);
    if (!talentId) {
      if (erasedIds.has(externalId)) erased++;
      else skipped++;
      continue;
    }

    const sfMemberStatus = normalizeSfStatus(rawStatus);
    const shownInDevSpace = isShownInDevSpace(sfMemberStatus, shown);
    await prisma.participation.upsert({
      where: { talentId_eventId: { talentId, eventId: event.id } },
      create: {
        talentId,
        eventId: event.id,
        campusId: event.campusId,
        sfMemberStatus,
        shownInDevSpace,
      },
      update: { sfMemberStatus, shownInDevSpace },
    });
    presentTalentIds.push(talentId);
    upserted++;
  }
  // The policy above was read before the loop, so a change an admin commits
  // while the roster is being written would be overwritten on the rows still to
  // come. Re-derived once from the policy as it stands, which also catches the
  // members this pass did not send.
  if (upserted > 0) await recomputeShownInDevSpace(prisma, [event.id]);

  if (mode !== 'full')
    return { upserted, skipped, erased, removed: 0, held: false };

  const prune = await pruneFromFullRoster({
    eventId: event.id,
    presentTalentIds,
    sentCount: externalIds.length,
    resolvedCount: upserted + erased,
  });
  return { upserted, skipped, erased, ...prune };
}

/**
 * Delete the enrolments a full roster no longer mentions, but only when that
 * roster can prove it.
 *
 * Absence from a full roster means "gone" only when the roster is COMPLETE:
 * non-empty, and every member resolved to a talent Jump knows, or to a contact
 * erased at their request. An empty one
 * looks exactly like a truncated fetch upstream, and a member the talents push
 * skipped (a nameless contact) may be the very person whose enrolment would
 * go. So when the
 * roster is not complete and the prune would actually remove something, the
 * removals are recorded on `Sync_PruneHold` and nothing is deleted.
 *
 * A hold is lifted by the event itself, never by a clock. A later pass with a
 * complete roster prunes normally and deletes the row, which is the ordinary
 * outcome once the skipped member's contact is completed in Salesforce, which
 * also closes its `Sync_Error`. An admin who confirms
 * that a campaign really was emptied sets `releasedAt` (`ops_release_prune_hold`),
 * and the next full pass applies the removals if its fresh roster is still
 * empty: the deletion is still made by a full pass and by nothing else, and
 * only while Salesforce still reports the campaign empty.
 *
 * The enrolments of a talent erased at their request are never pruned. The
 * erasure keeps them as de-identified activity, and the person can never be
 * imported again (`Sync_ErasedContact`), so their absence from a roster
 * proves nothing. An erasure by the inactivity sweep is not one of them: it
 * bars nothing, since a talent who enrols again is the return Jump exists for,
 * and the sweep also takes a talent who simply never logged in, often while
 * still enrolled. Re-imported as a new talent with a new enrolment, the person
 * would sit on the event twice if the de-identified one were kept, so a full
 * roster prunes it as it always did.
 */
async function pruneFromFullRoster(roster: {
  eventId: string;
  presentTalentIds: string[];
  sentCount: number;
  resolvedCount: number;
}): Promise<{ removed: number; held: boolean }> {
  const { eventId, presentTalentIds, sentCount, resolvedCount } = roster;
  // `notIn: []` matches every enrolment of the event, which is the prune an
  // empty roster asks for and exactly why that case needs proving first.
  const absent = {
    eventId,
    talentId: { notIn: presentTalentIds },
    talent: { deletionRequests: { none: { status: 'fulfilled' } } },
  } satisfies Prisma.ParticipationWhereInput;
  const complete = sentCount > 0 && resolvedCount === sentCount;

  if (!complete) {
    const pendingRemovals = await prisma.participation.count({
      where: absent,
    });
    // A release confirms that the campaign is EMPTY in Salesforce, so only an
    // empty roster spends it. A roster with members is not covered by it,
    // whatever it holds: an unresolved member may be the very person whose
    // enrolment would go, and that hold lifts once their contact is completed.
    const released =
      pendingRemovals > 0 &&
      sentCount === 0 &&
      (
        await prisma.sync_PruneHold.findUnique({
          where: { eventId },
          select: { releasedAt: true },
        })
      )?.releasedAt != null;
    if (pendingRemovals > 0 && !released) {
      const counts = { pendingRemovals, sentCount, resolvedCount };
      const lastHeldAt = new Date();
      // Renewing a hold withdraws its release: the only renewal a release
      // survives to see is a roster that is no longer empty, which is exactly
      // what the release said it was.
      await prisma.sync_PruneHold.upsert({
        where: { eventId },
        create: { eventId, ...counts, lastHeldAt },
        update: { ...counts, lastHeldAt, releasedAt: null },
      });
      return { removed: 0, held: true };
    }
  }

  const { count: removed } = await prisma.participation.deleteMany({
    where: absent,
  });
  await prisma.sync_PruneHold.deleteMany({ where: { eventId } });
  return { removed, held: false };
}
