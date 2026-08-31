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
  addBroadcast,
  addFeedbackSubmission,
} from '../factories/communications';
import {
  addClosingReset,
  addDeletionRequests,
  addIdentityRepair,
  addSyncErrors,
  addUsage,
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
    addUsage(world, {
      staff: world.staff.slice(0, 6),
      campus,
      event,
      // Above the five-actor floor on purpose, so the coverage matrix has at
      // least one cell it does NOT have to mask. A dataset producing only
      // masked cells cannot tell a working mask from a broken query.
      talentCount: 8,
    });

    // Campaigns, in every status and both channels. The partially failed one is
    // the row somebody has to act on, and it only exists if it is seeded.
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
        status: 'queued',
        campus,
        event,
        createdBy: team[0],
        recipients: audience.slice(0, 8),
        sourceFilter: 'not_opened',
      });
      addBroadcast(world, {
        key: 'note-interne-equipe',
        name: 'Note interne à l’équipe',
        channel: 'mail',
        audience: 'dev',
        status: 'failed',
        campus,
        createdBy: team[0],
        recipients: [],
      });
      addBroadcast(world, {
        key: 'note-referents',
        name: 'Note aux référents',
        channel: 'mail',
        audience: 'superdev',
        status: 'sending',
        campus,
        createdBy: team[0],
        recipients: [],
      });
      // The other two retarget filters. A campaign built on « ceux qui ont
      // ouvert » selects nobody unless opened rows exist upstream, which the
      // first send is what produces.
      addBroadcast(world, {
        key: 'relance-ouvreurs',
        name: 'Relance des ouvreurs',
        channel: 'mail',
        audience: 'talent',
        status: 'queued',
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
        status: 'queued',
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
    addDeletionRequests(world, rng.sample(world.talents, 4));
    if (team[0]) {
      addClosingReset(world, rng.pick(world.talents), team[0]);
      addIdentityRepair(world, rng.pick(world.talents), team[0]);
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
      ],
    });
  },
};
