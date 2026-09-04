/**
 * The queues, the audit trail and the campaigns.
 *
 * Every screen here has an empty state and a full state, and only the full one
 * is ever wrong in an interesting way. An admin queue that is always empty in
 * development is a queue whose ordering, its counters and its bulk actions have
 * never run against anything.
 *
 * `demo` skips it. A dataset being shown to somebody should not open on a list
 * of unresolved failures.
 */

import { FEEDBACK_FORM_SLUGS } from '../catalog/feedbackForms';
import {
  addAdminFiles,
  addImpersonationAudit,
  addWelcomePages,
} from '../factories/adminContent';
import {
  addBroadcast,
  addFeedbackSubmission,
} from '../factories/communications';
import {
  addClosingReset,
  addDeletionRequests,
  addIdentityRepair,
  addSyncErrors,
  addUsage,
  foldUsageMonthly,
} from '../factories/operations';
import type { Scenario } from './types';

export const operations: Scenario = {
  name: 'files-operationnelles',
  summary:
    'Erreurs de synchronisation, demandes RGPD, campagnes, audit, adoption.',
  run(world) {
    const { profile, rng } = world.ctx;
    const campus = [...world.campuses.values()][0]!;
    const team = world.staffFor(campus.id);
    const event =
      world.events.find((candidate) => candidate.campusId === campus.id) ??
      world.events[0]!;
    const roster = world.roster.get(event.id) ?? [];

    // Adoption figures are seeded in every profile: they carry no failure and
    // an empty usage table reads as "nobody uses the product", which is the one
    // wrong answer that makes somebody delete a feature that is in use.
    //
    // Every campus and every member, not a slice of six: the coverage matrix is
    // a campus-by-feature grid and a dataset touching one campus renders it as a
    // single populated column beside empty ones, which reads as a broken query.
    addUsage(world, {
      staff: world.staff,
      campuses: [...world.campuses.values()],
      events: world.events,
      // Above the five-actor floor on purpose, on the one feature `addUsage`
      // places on the heaviest campus - see its own comment. A dataset
      // producing only masked cells cannot tell a working mask from a broken
      // query.
      talentCount: 8,
    });
    // Folded after the raw rows exist, in the order `usage/rollup.ts` folds then
    // purges: two stores that disagree about a month they both cover is the
    // defect this dataset has to be able to show.
    foldUsageMonthly(world);

    // The admin space's stored content, in every profile: none of it carries a
    // failure, and all four tables render an untested screen as a tidy empty
    // state rather than as a gap.
    const admin =
      world.staff.find((member) => member.role === 'admin') ?? world.staff[0];
    if (admin) {
      addAdminFiles(world, admin);
      addWelcomePages(world, {
        events: world.events.filter(
          (candidate) => candidate.date > world.ctx.clock.today,
        ),
        author: admin,
      });
      addImpersonationAudit(world, {
        admin,
        staffTarget: world.staff[1] ?? admin,
        talentUserId: world.talents.find((t) => t.userId)?.userId ?? null,
      });
    }

    // Campaigns, in every TERMINAL status and both channels. The partially
    // failed one is the row somebody has to act on, and it only exists if it is
    // seeded.
    //
    // `queued` and `sending` are deliberately absent, and that absence is the
    // broadcast worker's isolation, exactly as an empty `Campus.externalName` is
    // the Salesforce worker's: a row in either status is work the cron claims and
    // sends. Four used to be seeded here. See `assert/inertness.ts`.
    if (team[0] && roster.length > 0) {
      const audience = roster.slice(0, Math.min(30, roster.length));
      addBroadcast(world, {
        key: 'relance-dossier',
        name: 'Relance dossier incomplet',
        channel: 'mail',
        audience: 'talent',
        status: 'sent',
        campus,
        event,
        createdBy: team[0],
        recipients: audience,
        filters: { dossierIncomplet: true, niveaux: ['2nde'] },
      });
      addBroadcast(world, {
        key: 'rappel-veille-sms',
        name: 'Rappel la veille',
        channel: 'sms',
        audience: 'talent',
        status: 'partial_failed',
        campus,
        event,
        createdBy: team[0],
        recipients: audience,
        failures: 2,
      });
      addBroadcast(world, {
        key: 'info-parents',
        name: 'Information aux responsables légaux',
        channel: 'mail',
        audience: 'parent',
        status: 'sent',
        campus,
        event,
        createdBy: team[0],
        // The guardians the dossiers actually declared, which is the audience
        // the app's own recipient builder resolves. Taking the first ten of the
        // roster made the campaign's size an accident of enrolment order: on a
        // cohort where the first few have no dossier, it silently shrank.
        recipients: audience
          .filter((talent) => talent.parentEmail !== null)
          .slice(0, 10),
      });
      // A retarget, which is the only thing `sourceFilter` is for: it selects on
      // who opened the previous send, so opened rows have to exist upstream.
      addBroadcast(world, {
        key: 'relance-non-ouvreurs',
        name: 'Relance des non-ouvreurs',
        channel: 'mail',
        audience: 'talent',
        status: 'sent',
        campus,
        event,
        createdBy: team[0],
        recipients: audience.slice(0, 8),
        sourceFilter: 'not_opened',
        sourceBroadcastKey: 'relance-dossier',
      });
      addBroadcast(world, {
        key: 'note-interne-equipe',
        name: 'Note interne à l’équipe',
        channel: 'mail',
        audience: 'dev',
        status: 'failed',
        // Every recipient failed at once, which is what a `failed` campaign is.
        // A per-address message would be nonsense on a roomful of @epitech.eu
        // addresses, so this one fails the way a whole batch actually does.
        failureMessage: 'Fournisseur indisponible (502)',
        campus,
        // Nobody: the member who sent it has left, and the campaign history
        // survives them rather than blocking their deletion.
        createdBy: null,
        recipients: [],
        staffRecipients: team,
      });
      addBroadcast(world, {
        key: 'note-referents',
        name: 'Note aux référents',
        channel: 'mail',
        audience: 'superdev',
        status: 'sent',
        campus,
        createdBy: team[0],
        recipients: [],
        staffRecipients: world.staff.filter(
          (member) => member.role === 'superdev',
        ),
      });
      // The other two retarget filters. A campaign built on « ceux qui ont
      // ouvert » selects nobody unless opened rows exist upstream, which the
      // first send is what produces.
      addBroadcast(world, {
        key: 'relance-ouvreurs',
        name: 'Relance des ouvreurs',
        channel: 'mail',
        audience: 'talent',
        status: 'sent',
        campus,
        event,
        createdBy: team[0],
        recipients: audience.slice(0, 6),
        sourceFilter: 'opened',
      });
      addBroadcast(world, {
        key: 'relance-tous',
        name: 'Relance de toute la cohorte',
        channel: 'sms',
        audience: 'talent',
        status: 'sent',
        campus,
        event,
        createdBy: team[0],
        recipients: audience.slice(0, 6),
        sourceFilter: 'all',
      });
    }

    // A second form with a couple of answers, so nothing assumes one form.
    const secondForm = FEEDBACK_FORM_SLUGS[1];
    if (secondForm) {
      for (let i = 0; i < 3; i += 1) {
        addFeedbackSubmission(world, { formSlug: secondForm, index: 2000 + i });
      }
    }

    if (!profile.includeMessyStates) {
      world.ctx.manifest.push({
        scenario: operations.name,
        summary:
          'Campagnes et adoption seulement : ce profil écarte les états en échec.',
        campus: campus.name,
        covers: [
          'campagnes mail et SMS',
          'chiffres d’adoption au-dessus du plancher de masquage',
          'bibliothèque de fichiers, pages d’accueil et audit d’impersonation',
        ],
      });
      return;
    }

    // A manual XP correction. It is the one grant source with no automatic
    // producer, so nothing else in the dataset would ever create one, and the
    // adjustment path on the talent fiche would have no example.
    if (world.talents.length > 0) {
      world.grantXp({
        talent: world.talents[0]!,
        source: 'admin_adjustment',
        sourceId: null,
        amount: -50,
      });
    }

    addSyncErrors(
      world,
      rng.sample(world.talents, Math.min(12, world.talents.length)),
    );
    if (team[0]) {
      const deletionTalents = rng.sample(world.talents, 4);
      addDeletionRequests(world, deletionTalents, team[0].userId);
      addClosingReset(world, rng.sample(world.talents, 3), team[0]);
      // The PENDING request's talent (index 0, see `addDeletionRequests`),
      // so fulfilling this exact request in the admin UI has an
      // `AuthIdentityRepair` row to actually observe `anonymizeTalent`
      // scrub - independent draws almost never coincide.
      addIdentityRepair(world, deletionTalents[0]!, team[0]);
    }

    world.ctx.manifest.push({
      scenario: operations.name,
      summary: operations.summary,
      campus: campus.name,
      covers: [
        'une douzaine d’erreurs de synchronisation, dont une répétée 11 357 fois',
        'une demande de suppression RGPD dans chacun de ses quatre états',
        'une réinitialisation de closing et une réparation d’identité, avec leur trace',
        'cinq campagnes : mail et SMS, envoyée, partiellement en échec, en file, en échec',
        'des relances ciblées sur les ouvreurs, les non-ouvreurs et toute la cohorte',
        'une correction XP manuelle, négative',
        'des chiffres d’adoption au-dessus du plancher de masquage à cinq acteurs',
        'l’adoption sur ~80 % du catalogue de fonctionnalités, le reste laissé sans usage pour que les « écarts d’adoption » aient un sens',
        'le cube mensuel d’usage, dont un mois au-delà de la fenêtre de rétention',
        'trois fichiers dans la bibliothèque partagée, dont un déposé par un membre parti',
        'deux pages d’accueil rédigées, une image utilisée et une orpheline',
        'deux impersonations tracées, dont une jamais quittée',
      ],
    });
  },
};
