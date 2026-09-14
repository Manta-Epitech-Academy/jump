import { prisma } from '$lib/server/db';
import { Prisma } from '@prisma/client';
import { defaultEventModules } from '$lib/domain/eventModules';
import { isNiveau, type Niveau } from '$lib/domain/niveau';
import { normalizePhoneToE164 } from '$lib/domain/phone';
import { resolveSchoolByUai } from '$lib/server/services/schoolService';
import { autoResolveAuthIdentity } from '$lib/server/services/authIdentityRepairService';
import { ensureTalentUser } from '$lib/server/services/talentAccount';
import {
  changeUserEmail,
  EmailChangeConflict,
} from '$lib/server/services/userEmail';
import { normalizeSfStatus } from '$lib/domain/sfMemberStatus';
import { schoolYearOf } from '$lib/domain/schoolYear';
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
 */
export async function syncEvents(events: WorkerEvent[]) {
  const wanted = [
    ...new Set(
      events.map((e) => e.campus_ext_name).filter((n) => n.length > 0),
    ),
  ];
  const campuses = await prisma.campus.findMany({
    where: { externalName: { in: wanted } },
    select: { id: true, externalName: true },
  });
  const campusIdByExternalName = new Map(
    campuses.map((c) => [c.externalName as string, c.id]),
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const unresolvedCampuses = new Set<string>();

  for (const e of events) {
    const campusId = campusIdByExternalName.get(e.campus_ext_name);
    if (!campusId) {
      skipped++;
      unresolvedCampuses.add(e.campus_ext_name);
      continue;
    }

    const existing = await prisma.event.findUnique({
      where: { externalId: e.external_id },
    });

    if (!existing) {
      // Seed the per-event modules once, at creation. After this the rows are
      // Jump-owned: the update branch never touches them, so the dev team's
      // per-event surface config is never clobbered. Everything else (window,
      // welcome, feedback form) stays unset until an admin configures the event
      // from the config wizard - a synced event lands hidden and single-day.
      await prisma.event.create({
        data: {
          externalId: e.external_id,
          date: e.date ? new Date(e.date) : new Date(),
          titre: e.title,
          campusId,
          modules: {
            create: defaultEventModules().map((moduleKey) => ({ moduleKey })),
          },
        },
      });
      created++;
    } else if (
      existing.titre !== e.title ||
      existing.campusId !== campusId ||
      (e.date && existing.date.getTime() !== new Date(e.date).getTime())
    ) {
      await prisma.event.update({
        where: { externalId: e.external_id },
        data: {
          titre: e.title,
          campusId,
          date: e.date ? new Date(e.date) : existing.date,
        },
      });
      updated++;
    }
  }

  return {
    created,
    updated,
    skipped,
    unresolvedCampuses: [...unresolvedCampuses],
  };
}

async function logSyncError(params: {
  email: string;
  attemptedExtId: string;
  existingExtId: string | null;
  talentName: string;
  eventExtId: string | null;
  message: string;
}) {
  await prisma.syncError.upsert({
    where: {
      email_attemptedExtId: {
        email: params.email,
        attemptedExtId: params.attemptedExtId,
      },
    },
    update: {
      occurrenceCount: { increment: 1 },
      lastOccurredAt: new Date(),
      existingExtId: params.existingExtId,
      message: params.message,
      resolved: false,
      resolvedAt: null,
    },
    create: {
      errorType: 'DUPLICATE_EMAIL',
      email: params.email,
      attemptedExtId: params.attemptedExtId,
      existingExtId: params.existingExtId,
      talentName: params.talentName,
      eventExtId: params.eventExtId,
      message: params.message,
    },
  });
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
 */
export async function syncTalents(talents: WorkerTalent[]) {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const currentSchoolYear = schoolYearOf(new Date(), 'Europe/Paris').label;

  // Canonical School per distinct UAI, resolved once for the whole batch.
  const schoolIdByUai = await resolveSchools(talents);

  // Ensure the talent's login identity exists, logging a failure the way a
  // first-sight mint does. The eager-mint invariant (every SF talent carries a
  // bauth_user minted from its SF email) must hold whether we just created the
  // talent or found an existing one whose account went missing (a transient
  // first-sight failure, or a factory reset), so both branches funnel through
  // here rather than minting on first sight only.
  const mintLoginIdentity = async (
    talentId: string,
    sf: { external_id: string; first_name: string; last_name: string },
    loginEmail: string,
  ) => {
    try {
      await ensureTalentUser(talentId);
    } catch (err) {
      await logSyncError({
        email: loginEmail,
        attemptedExtId: sf.external_id,
        existingExtId: null,
        talentName: `${sf.first_name} ${sf.last_name}`,
        eventExtId: null,
        message: `Compte de connexion non créé pour "${loginEmail}" : ${
          err instanceof Error ? err.message : 'erreur inconnue'
        }. À arbitrer (Divergences Salesforce › Connexion) ou réessai au prochain sync.`,
      });
    }
  };

  for (const t of talents) {
    if (!t.external_id || !t.first_name || !t.last_name)
      return {
        error:
          'Each talent must have external_id, first_name and last_name' as const,
      };

    const email = t.email?.toLowerCase().trim() || null;
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

    const existing = await prisma.talent.findUnique({
      where: { externalId: t.external_id },
      select: {
        id: true,
        userId: true,
        prenom: true,
        nom: true,
        // Linked login account email, to skip the reconcile when already aligned.
        user: { select: { email: true } },
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
            sfImport: {
              create: {
                nom: t.last_name,
                prenom: t.first_name,
                sfEmail: email,
                phone,
                civilite,
                niveau,
                sfSchoolId,
              },
            },
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
            select: { id: true },
          });
          if (!winner) throw err;
          talentId = winner.id;
          skipped++;
        } else {
          throw err;
        }
      }

      // Eager-mint the login account at import so `bauth_user.email` is the
      // identity from day one (same shape as the CSV campaign path), no window
      // where a Talent exists without an account. A parent/staff-owned email
      // can't be forced into a student login (`ensureTalentUser` throws); log it
      // and move on. The talent is still imported, just accountless until an
      // admin resolves the collision. Emailless SF rows stay accountless.
      if (email) await mintLoginIdentity(talentId, t, email);
    } else {
      talentId = existing.id;

      // 1. Refresh the SF mirror to the latest claim. Skip the write when the
      //    payload is identical to the stored mirror: on the steady state
      //    (200 talents, ~0 changes / 30 min) this means near-zero writes.
      const m = existing.sfImport;
      const mirrorChanged =
        !m ||
        m.nom !== t.last_name ||
        m.prenom !== t.first_name ||
        m.sfEmail !== email ||
        m.phone !== phone ||
        m.civilite !== civilite ||
        m.niveau !== niveau ||
        m.sfSchoolId !== sfSchoolId;
      if (mirrorChanged) {
        await prisma.talentSfImport.upsert({
          where: { talentId },
          create: {
            talentId,
            nom: t.last_name,
            prenom: t.first_name,
            sfEmail: email,
            phone,
            civilite,
            niveau,
            sfSchoolId,
          },
          update: {
            nom: t.last_name,
            prenom: t.first_name,
            sfEmail: email,
            phone,
            civilite,
            niveau,
            sfSchoolId,
          },
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

      // Drive the login identity toward SF's claimed email through the single
      // write path. A clean rename succeeds silently; a collision (another
      // account holds it, or it's a parent/staff address) is auto-healed only for
      // the safe orphan case (repoint) and otherwise left as a conflict in
      // Divergences Salesforce › Connexion for an admin. SF is an unreliable
      // source, so inversions/exposures are never auto-forced.
      const linkedEmail = existing.user?.email?.toLowerCase().trim() ?? null;
      if (email && !existing.userId) {
        // The account went missing on an existing talent: a first-sight mint
        // that failed transiently, or a factory reset. Re-mint it so OTP login
        // works again. This is the "réessai au prochain sync" the create branch
        // promises when its own mint fails.
        await mintLoginIdentity(existing.id, t, email);
      } else if (existing.userId && email && email !== linkedEmail) {
        try {
          await changeUserEmail(existing.userId, email);
        } catch (err) {
          if (!(err instanceof EmailChangeConflict)) {
            await logSyncError({
              email,
              attemptedExtId: t.external_id,
              existingExtId: null,
              talentName: `${t.first_name} ${t.last_name}`,
              eventExtId: null,
              message: `Réconciliation de l'identité de connexion échouée pour "${email}" : ${err instanceof Error ? err.message : 'erreur inconnue'} (réessai au prochain sync).`,
            });
          } else {
            const outcome = await autoResolveAuthIdentity(existing.id, 'sync');
            if (outcome === 'skipped') {
              await logSyncError({
                email,
                attemptedExtId: t.external_id,
                existingExtId: null,
                talentName: `${t.first_name} ${t.last_name}`,
                eventExtId: null,
                message: `Divergence d'identité de connexion non auto-résoluble pour "${email}", à arbitrer dans Divergences Salesforce › Connexion.`,
              });
            }
          }
        }
      }
      if (mirrorChanged || hasPatch || schoolingChanged) updated++;
    }
  }

  return { created, updated, skipped };
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
 * talents before enrolments, so an unknown one means that talent failed to
 * reconcile, which is already its own SyncError.
 */
export async function syncParticipations(
  eventExternalId: string,
  statusByExternalId: Record<string, string>,
  mode: WorkerSyncMode,
) {
  const event = await prisma.event.findUnique({
    where: { externalId: eventExternalId },
    select: { id: true, campusId: true },
  });
  if (!event) return { error: 'Event not found' as const };

  const externalIds = Object.keys(statusByExternalId);
  const prunes = mode === 'full';

  // An empty full payload for an event that HAS enrolments is refused, never
  // applied. The prune below deletes every enrolment the payload does not
  // mention, so an empty one wipes a whole cohort, and a truncated or failed
  // fetch upstream arrives looking exactly like a legitimately empty campaign.
  //
  // Refused rather than logged-and-applied, and with no SyncError row: that
  // table is keyed on (email, attemptedExtId) and shaped around one person's
  // identity collision, so an event-level fact does not belong in it. The
  // refusal reaches a human the honest way instead, by failing the call, which
  // closes the run in error and leaves the watermark where it was.
  //
  // Emptying a campaign on purpose is therefore a deliberate act: it needs the
  // enrolments removed in Jump, not a silent sweep nobody asked for.
  if (prunes && externalIds.length === 0) {
    const enrolled = await prisma.participation.count({
      where: { eventId: event.id },
    });
    if (enrolled > 0) {
      return {
        error: `Refused: empty payload for "${eventExternalId}", which has ${enrolled} enrolment(s). Applying it would delete every one of them.`,
      };
    }
  }

  const known = await prisma.talent.findMany({
    where: { externalId: { in: externalIds } },
    select: { id: true, externalId: true },
  });
  const talentIdByExternalId = new Map(
    known.map((t) => [t.externalId as string, t.id]),
  );

  // The same refusal one step further in, and it is not the same case as an
  // empty payload: a roster full of ids Jump has never heard of means the
  // talents push failed or never happened, not that the campaign emptied. With
  // nothing resolved, `notIn: []` matches every row and the prune would take
  // the cohort.
  if (prunes && externalIds.length > 0 && talentIdByExternalId.size === 0) {
    return {
      error: `Refused: none of the ${externalIds.length} member(s) sent for "${eventExternalId}" exist in Jump, so the talents push did not land.`,
    };
  }

  let upserted = 0;
  let skipped = 0;
  const presentTalentIds: string[] = [];

  for (const [externalId, rawStatus] of Object.entries(statusByExternalId)) {
    const talentId = talentIdByExternalId.get(externalId);
    if (!talentId) {
      skipped++;
      continue;
    }

    const sfMemberStatus = normalizeSfStatus(rawStatus);
    await prisma.participation.upsert({
      where: { talentId_eventId: { talentId, eventId: event.id } },
      create: {
        talentId,
        eventId: event.id,
        campusId: event.campusId,
        sfMemberStatus,
      },
      update: { sfMemberStatus },
    });
    presentTalentIds.push(talentId);
    upserted++;
  }

  let removed = 0;
  if (prunes) {
    ({ count: removed } = await prisma.participation.deleteMany({
      where: { eventId: event.id, talentId: { notIn: presentTalentIds } },
    }));
  }

  return { upserted, skipped, removed };
}
