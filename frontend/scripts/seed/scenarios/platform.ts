/**
 * The base every other scenario stands on: campuses, schools, the staff roster,
 * the composed Coding Club grid, event presets, signatories, the minigame
 * rotation and the reward catalogue.
 *
 * It runs first and it is the only scenario other scenarios may assume.
 */

import type { StaffRole } from '@prisma/client';
import { CAMPUSES } from '../catalog/campuses';
import { SCHOOLS, tailSchools } from '../catalog/schools';
import { STAFF_PRENOMS, NOMS } from '../catalog/people';
import {
  EVENT_TEMPLATES,
  SIGNATORY_ROLES,
  XP_REWARDS,
} from '../catalog/platform';
import {
  BROADCAST_TEMPLATE_DEFAULTS,
  EMAIL_TEMPLATE_DEFAULTS,
} from '../catalog/interestsAndTemplates';
import {
  CLUB_TEMPLATE,
  RETIRED_QUESTION,
  STAGE_TEMPLATE_KEY,
} from '../catalog/closings';
import { FEEDBACK_FORM_SLUGS } from '../catalog/feedbackForms';
import { EVENT_MODULES } from '../../../src/lib/domain/eventModules';
import { addMinigamePublications, addXpRewards } from '../factories/engagement';
import { addAdminApiTokens, addInvitations } from '../factories/operations';
import { id, seq } from '../ids';
import type { Scenario } from './types';

export const platform: Scenario = {
  name: 'plateforme',
  summary:
    'Campus, lycées, équipe, grilles de closing, présets, catalogue de récompenses.',
  run(world) {
    const { profile, rng, clock } = world.ctx;

    for (const spec of CAMPUSES.slice(0, profile.campuses))
      world.addCampus(spec);
    for (const school of SCHOOLS) world.addSchool(school);
    // The tail. Roughly one school per six talents, which is the ratio
    // production shows (891 schools for 5394 talents).
    for (const school of tailSchools(
      Math.max(0, Math.round(profile.talents / 6) - SCHOOLS.length),
    )) {
      world.addSchool(school);
    }

    // The roster. Production is 133 dev, 5 admin and zero superdev - the role
    // exists only in the enum. One superdev is seeded anyway: it is invitable,
    // so it is reachable, and a permission group nobody holds is a group nobody
    // ever tests.
    const campuses = [...world.campuses.values()];
    let staffIndex = 0;
    for (const campus of campuses) {
      // Moulins has a single staff member in production. Reproducing that is
      // the point of having Moulins at all: it is the campus where a screen
      // assuming several colleagues falls over.
      const headcount = campus.name === 'Moulins' ? 1 : rng.int(2, 4);
      for (let i = 0; i < headcount; i += 1) {
        const role: StaffRole =
          i === 0 && campus.name === 'Lyon' ? 'superdev' : 'dev';
        world.addStaff({
          prenom: STAFF_PRENOMS[staffIndex % STAFF_PRENOMS.length]!,
          nom: NOMS[(staffIndex * 3) % NOMS.length]!,
          role,
          campus,
          // The four tiers spread over the roster by position, so the three
          // buckets `ops_staff_activity` counts and the empty-window state the
          // members dialog renders all have somebody in them whatever the
          // profile's headcount. One in eleven was given an account and never
          // opened it; one in seven has stopped coming; a third come rarely.
          activity:
            staffIndex % 11 === 0
              ? 'never'
              : staffIndex % 7 === 3
                ? 'lapsed'
                : staffIndex % 3 === 1
                  ? 'occasional'
                  : 'active',
          // Roughly a third of the team has already pulled the exports at least
          // once, so both the first-run and the incremental path are present.
          hasExported: staffIndex % 3 === 0,
        });
        staffIndex += 1;
      }
    }

    const admin = world.addStaff({
      prenom: 'Nadia',
      nom: 'Lemoine',
      role: 'admin',
      campus: null,
      hasExported: true,
    });
    world.addStaff({
      prenom: 'Marc',
      nom: 'Vasseur',
      role: 'admin',
      campus: null,
    });

    for (const campus of campuses) {
      for (const [index, role] of SIGNATORY_ROLES.entries()) {
        // Only the largest campuses carry the second signature, which is how
        // production looks: 18 signatories across 15 campuses.
        if (index > 0 && campus.name !== 'Paris' && campus.name !== 'Lyon')
          continue;
        world.buffer.signatory.push({
          id: id('sig', campus.name, seq(index, 2)),
          campusId: campus.id,
          name: `${STAFF_PRENOMS[index % STAFF_PRENOMS.length]} ${NOMS[index % NOMS.length]}`,
          role,
          signatureKey: `signatures/${campus.name.toLowerCase()}-${index}.png`,
          contentType: 'image/png',
          position: index,
        });
      }
    }

    // One signature that belongs to no campus: the national one, used where a
    // document is issued by the school rather than by a site. `campusId` is
    // nullable for exactly that, and a dataset attaching every signature to a
    // campus never renders the « tous les campus » case.
    world.buffer.signatory.push({
      id: id('sig', 'national'),
      campusId: null,
      name: `${STAFF_PRENOMS[0]} ${NOMS[2]}`,
      role: SIGNATORY_ROLES[0]!,
      signatureKey: 'signatures/national.png',
      contentType: 'image/png',
      position: 0,
    });

    // The Coding Club grid, composed from the bank the migration carries. One
    // grid proves nothing: a shared bank only earns its keep when the same
    // question is asked by two formats, which is what makes a distribution
    // spanning both legitimate.
    const clubTemplateId = id('clt', CLUB_TEMPLATE.key);
    world.buffer.closing_Template.push({
      id: clubTemplateId,
      key: CLUB_TEMPLATE.key,
      label: CLUB_TEMPLATE.label,
    });
    for (const [sectionIndex, section] of CLUB_TEMPLATE.sections.entries()) {
      const sectionId = id('cls', CLUB_TEMPLATE.key, seq(sectionIndex, 2));
      world.buffer.closing_TemplateSection.push({
        id: sectionId,
        templateId: clubTemplateId,
        position: sectionIndex,
        synthesisPosition: section.synthesisPosition,
        title: section.title,
      });
      for (const [questionIndex, question] of section.questions.entries()) {
        const bankQuestion = world.bank.get(question.questionKey);
        if (!bankQuestion) continue;
        world.buffer.closing_TemplateQuestion.push({
          id: id('ctq', CLUB_TEMPLATE.key, question.questionKey),
          templateId: clubTemplateId,
          sectionId,
          questionId: bankQuestion.id,
          position: questionIndex,
          labelOverride: question.labelOverride ?? null,
          withNote: question.withNote ?? false,
        });
      }
    }

    // A retired bank question, composed into no grid. Answers recorded against
    // it still resolve, which is the whole reason a « Questions retirées »
    // heading exists, and it has nothing to render without this.
    const retiredId = id('clq', RETIRED_QUESTION.key);
    world.buffer.closing_Question.push({
      id: retiredId,
      key: RETIRED_QUESTION.key,
      label: RETIRED_QUESTION.label,
      kind: RETIRED_QUESTION.kind,
      retiredAt: clock.days(-90),
    });
    const retiredOptionIds: string[] = [];
    for (const [index, option] of RETIRED_QUESTION.options.entries()) {
      const optionId = id('clo', RETIRED_QUESTION.key, option.value);
      retiredOptionIds.push(optionId);
      world.buffer.closing_Option.push({
        id: optionId,
        questionId: retiredId,
        position: index,
        value: option.value,
        label: option.label,
      });
    }
    world.bank.set(RETIRED_QUESTION.key, {
      id: retiredId,
      key: RETIRED_QUESTION.key,
      kind: RETIRED_QUESTION.kind,
      max: null,
      optionIds: retiredOptionIds,
    });

    // The presets the config wizard applies. A preset is a point-in-time copy:
    // applying one writes modules onto the event and leaves no live link.
    //
    // All three typed FKs are carried, not just the grid. A preset that declares
    // « closings et diplôme » and hands the applied event a null certificate is
    // the exact failure `EventConfig_Template.diplomaTemplateId` was added to
    // prevent, and it left the wizard's own apply path with no example.
    const stageFormId =
      world.feedbackForms.get(FEEDBACK_FORM_SLUGS[0] ?? '')?.id ?? null;
    for (const preset of EVENT_TEMPLATES) {
      const templateId = id('ect', preset.name);
      // The bare preset is the one worth holding: a preset is allowed to carry
      // nothing but its modules, its author can have left since, and the wizard
      // has to render all of that. Every field being filled on every row is what
      // hid the « aucune description » and « ancien membre » cases.
      const bare = preset.name === 'Portes ouvertes';
      world.buffer.eventConfig_Template.push({
        id: templateId,
        name: preset.name,
        description: bare ? null : preset.description,
        cohortNoun: bare ? null : preset.cohortNoun,
        publicName: bare ? null : `${preset.name} Epitech`,
        startMinutes: preset.startMinutes,
        closingTemplateId: preset.withClosingGrid
          ? preset.name === 'Coding Club'
            ? clubTemplateId
            : (world.stageTemplateId ?? null)
          : null,
        feedbackFormId: preset.withFeedbackForm ? stageFormId : null,
        diplomaTemplateId: preset.withDiploma ? world.diplomaTemplateId : null,
        createdById: bare ? null : admin.id,
      });
      for (const moduleKey of preset.modules) {
        world.buffer.eventConfig_TemplateModule.push({
          templateId,
          moduleKey,
          // The settings bag, carried by the preset and copied onto an event
          // when it is applied. It was null on every row, so the per-module Zod
          // schema that validates it had nothing to validate anywhere in the
          // dataset, on either side of the copy.
          //
          // On the stage preset only, and with the key the schema actually
          // declares. It was `showParentContact`, which Zod strips, so the copy
          // path was being exercised with a bag that arrived empty on the other
          // side - the one outcome that proves nothing. And the option is not
          // format-neutral: chasing dossiers is what a stage does, which is why
          // production carries it on stages and on nothing else.
          settings:
            moduleKey === EVENT_MODULES.INSCRITS &&
            preset.name === 'Stage de seconde'
              ? { showStatutColumn: true }
              : undefined,
        });
      }
    }

    // The message templates. `--catalog-only` writes these through the
    // catalogue's own create-only path, which is what a populated database
    // needs; a full generation owns them like everything else, so they carry
    // seed ids and are removed by the same wipe.
    for (const template of EMAIL_TEMPLATE_DEFAULTS) {
      const templateId = id('mst', template.actionKey);
      world.buffer.messageTemplate.push({
        id: templateId,
        name: template.name,
        channel: 'mail',
        subject: template.subject,
        body: template.body,
        // The first one was written by somebody who has left. `SetNull`, not
        // RESTRICT: a template outlives its author, and its author has to stay
        // deletable.
        createdById:
          template.actionKey === EMAIL_TEMPLATE_DEFAULTS[0]?.actionKey
            ? null
            : admin.userId,
      });
      world.buffer.emailActionMapping.push({
        actionKey: template.actionKey,
        templateId,
      });
    }
    for (const template of BROADCAST_TEMPLATE_DEFAULTS) {
      const templateId = id('mst', template.seedKey);
      world.buffer.messageTemplate.push({
        id: templateId,
        seedKey: template.seedKey,
        name: template.name,
        channel: template.channel,
        subject: template.subject,
        body: template.body,
        createdById: admin.userId,
      });
      world.broadcastTemplates.push({
        id: templateId,
        channel: template.channel,
      });
    }

    addMinigamePublications(world, admin);
    addXpRewards(world, campuses[0]?.id ?? null);
    addAdminApiTokens(world, admin);
    if (campuses[0]) addInvitations(world, campuses[0], admin);

    world.ctx.manifest.push({
      scenario: platform.name,
      summary: platform.summary,
      covers: [
        `${profile.campuses} campus, du plus gros (Paris) au plus petit (Moulins, 1 membre d'équipe)`,
        `${world.schools.size} lycées et collèges, dont une longue traîne à un seul élève`,
        "un superdev, deux admins, un membre qui ne s'est jamais connecté",
        `la grille « ${CLUB_TEMPLATE.label} » composée sur la banque, à côté de « ${STAGE_TEMPLATE_KEY} »`,
        'une question de banque retirée, dont les réponses restent lisibles',
        `${EVENT_TEMPLATES.length} présets de configuration, ${XP_REWARDS.length} récompenses XP`,
        'trois jetons API admin : core, leadership, et un révoqué',
      ],
      accounts: [
        { role: 'admin', email: admin.email, note: 'espace /staff/admin' },
        {
          role: 'superdev',
          email:
            world.staff.find((member) => member.role === 'superdev')?.email ??
            '-',
          note: 'espace /staff/dev, seul superdev du jeu de données',
        },
      ],
    });
  },
};
