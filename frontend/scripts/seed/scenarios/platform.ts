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
          // Somebody who was given an account and never opened it. The members
          // page has to say so rather than showing a blank date.
          neverLoggedIn: staffIndex % 11 === 0,
        });
        staffIndex += 1;
      }
    }

    const admin = world.addStaff({
      prenom: 'Nadia',
      nom: 'Lemoine',
      role: 'admin',
      campus: null,
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
    for (const preset of EVENT_TEMPLATES) {
      const templateId = id('ect', preset.name);
      world.buffer.eventConfig_Template.push({
        id: templateId,
        name: preset.name,
        description: preset.description,
        cohortNoun: preset.cohortNoun,
        startMinutes: preset.startMinutes,
        closingTemplateId: preset.withClosingGrid
          ? preset.name === 'Coding Club'
            ? clubTemplateId
            : (world.stageTemplateId ?? null)
          : null,
        createdById: admin.id,
      });
      for (const moduleKey of preset.modules) {
        world.buffer.eventConfig_TemplateModule.push({ templateId, moduleKey });
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
        createdById: admin.userId,
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

    addMinigamePublications(world);
    addXpRewards(world, null);
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
