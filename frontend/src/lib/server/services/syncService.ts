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
// once per talent — and never re-hits the annuaire for a UAI twice in one sync.
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

export async function listCampuses() {
  return prisma.campus.findMany({
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

export async function syncEvents(
  campusExternalName: string,
  events: {
    external_id: string;
    title: string;
    date?: string;
  }[],
) {
  const campus = await prisma.campus.findUnique({
    where: { externalName: campusExternalName },
  });
  if (!campus) return { error: 'Campus not found' as const };

  let created = 0;
  let updated = 0;

  for (const e of events) {
    if (!e.external_id || !e.title)
      return { error: 'Each event must have external_id and title' as const };

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
          campusId: campus.id,
          planning: { create: {} },
          modules: {
            create: defaultEventModules().map((moduleKey) => ({ moduleKey })),
          },
        },
      });
      created++;
    } else if (
      existing.titre !== e.title ||
      existing.campusId !== campus.id ||
      (e.date && existing.date.getTime() !== new Date(e.date).getTime())
    ) {
      await prisma.event.update({
        where: { externalId: e.external_id },
        data: {
          titre: e.title,
          campusId: campus.id,
          date: e.date ? new Date(e.date) : existing.date,
        },
      });
      updated++;
    }
  }

  return { created, updated };
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

export async function syncTalents(
  eventExternalId: string,
  talents: {
    external_id: string;
    first_name: string;
    last_name: string;
    email?: string | null;
    phone?: string | null;
    gender?: string | null;
    school?: string | null;
    school_uai?: string | null;
    class_level?: string | null;
    status?: string | null;
  }[],
) {
  const event = await prisma.event.findUnique({
    where: { externalId: eventExternalId },
  });
  if (!event) return { error: 'Event not found' as const };

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const syncedTalentIds: string[] = [];
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
        eventExtId: eventExternalId,
        message: `Compte de connexion non créé pour "${loginEmail}" : ${
          err instanceof Error ? err.message : 'erreur inconnue'
        } — à arbitrer (Divergences Salesforce › Connexion) ou réessai au prochain sync.`,
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
        console.log(
          `Creating new talent: Name: ${t.first_name} ${t.last_name}, Email: ${email}, Phone: ${phone} ExId: ${t.external_id}`,
        );
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
          // Only `externalId` is unique on create now (Talent.email is gone) — a
          // concurrent pass created the same SF record. Adopt the winner's row
          // and fall through: the participation upsert below must still run
          // (and the id must land in `syncedTalentIds`), or the end-of-sync
          // prune would sweep the participation the other pass just created.
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
      // identity from day one (same shape as the CSV campaign path) — no window
      // where a Talent exists without an account. A parent/staff-owned email
      // can't be forced into a student login (`ensureTalentUser` throws); log it
      // and move on. The talent is still imported, just accountless until an
      // admin resolves the collision. Emailless SF rows stay accountless.
      if (email) await mintLoginIdentity(talentId, t, email);
    } else {
      talentId = existing.id;

      // 1. Refresh the SF mirror to the latest claim. Skip the write when the
      //    payload is identical to the stored mirror — on the steady state
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
      const patch: Prisma.TalentUncheckedUpdateInput = {};
      // niveau is SF-owned (onboarding never sets it) → always synced, but never
      // wiped by a blank/unknown SF value.
      if (niveau !== null && existing.niveau !== niveau) patch.niveau = niveau;
      if (!existing.infoValidatedAt) {
        if (existing.prenom !== t.first_name) patch.prenom = t.first_name;
        if (existing.nom !== t.last_name) patch.nom = t.last_name;
        if (existing.phone !== phone) patch.phone = phone;
        if (existing.civilite !== civilite) patch.civilite = civilite;
      }
      if (!existing.highSchoolValidatedAt && existing.schoolId !== sfSchoolId) {
        patch.schoolId = sfSchoolId;
      }

      const hasPatch = Object.keys(patch).length > 0;
      if (hasPatch) {
        if (patch.niveau !== undefined || patch.schoolId !== undefined) {
          await upsertSchoolingYearRecord(prisma, {
            talentId,
            schoolYear: currentSchoolYear,
            niveau:
              patch.niveau !== undefined
                ? (patch.niveau as string)
                : existing.niveau,
            schoolId:
              patch.schoolId !== undefined
                ? (patch.schoolId as string)
                : existing.schoolId,
            source: 'sync',
          });
        }
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
              eventExtId: eventExternalId,
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
                eventExtId: eventExternalId,
                message: `Divergence d'identité de connexion non auto-résoluble pour "${email}" — à arbitrer dans Divergences Salesforce › Connexion.`,
              });
            }
          }
        }
      }
      if (mirrorChanged || hasPatch) updated++;
    }

    const normalizedStatus = normalizeSfStatus(t.status);
    await prisma.participation.upsert({
      where: { talentId_eventId: { talentId, eventId: event.id } },
      create: {
        talentId,
        eventId: event.id,
        campusId: event.campusId!,
        sfMemberStatus: normalizedStatus,
      },
      update: { sfMemberStatus: normalizedStatus },
    });
    syncedTalentIds.push(talentId);
  }

  const { count: removed } = await prisma.participation.deleteMany({
    where: {
      eventId: event.id,
      talentId: { notIn: syncedTalentIds },
    },
  });

  return { created, updated, removed, skipped };
}
