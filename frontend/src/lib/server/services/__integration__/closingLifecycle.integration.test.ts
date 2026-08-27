import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '$lib/server/db';
import { scopedPrisma } from '$lib/server/db/scoped';
import { assertTestDatabase } from './testDatabase';
import {
  CLOSING_QUESTION_KEYS,
  gridQuestions,
  recordSynthesisSections,
  RETIRED_SECTION_TITLE,
} from '$lib/domain/closing';
import { closingAnswersIssues } from '$lib/validation/closings';
import { resolveClosingGridById } from '$lib/server/closingTemplates';
import { persistClosing } from '$lib/server/services/closingService';
import { anonymizeTalent } from '$lib/server/services/anonymizationService';
import {
  writeClosingQuestion,
  writeClosingTemplate,
} from '$lib/server/adminApi/writes/closings';
import { OperationRefusedError } from '$lib/server/adminApi/errors';
import { getTalentJourney } from '$lib/server/services/talentJourneyService';

/**
 * The closing invariants that only a real database can prove.
 *
 * Four of them are things that fail SILENTLY if they regress, which is why they
 * are asserted here rather than trusted: campus scoping (a delegate with no
 * extension handler is simply unscoped), the erasure (a dropped `deleteMany`
 * leaves a minor's prose behind), the structural-edit lock (a kind change under
 * recorded answers makes them unreadable), and the bank keys the school-year
 * review names, whose absence reads to a national director exactly like "nobody
 * answered".
 */

const stamp = Date.now();
const ids: Record<string, string> = {};

async function campusWith(name: string) {
  return prisma.campus.create({
    data: { name: `${name}-${stamp}`, timezone: 'Europe/Paris' },
  });
}

beforeAll(async () => {
  assertTestDatabase();

  const [paris, lyon] = await Promise.all([
    campusWith('ClosingParis'),
    campusWith('ClosingLyon'),
  ]);
  ids.campus = paris.id;
  ids.otherCampus = lyon.id;

  const template = await prisma.closing_Template.create({
    data: {
      key: `lifecycle-${stamp}`,
      label: 'Grille test',
      sections: { create: { position: 0, title: 'Retour' } },
    },
    select: { id: true, sections: { select: { id: true } } },
  });
  ids.template = template.id;

  const choice = await prisma.closing_Question.create({
    data: {
      key: `lifecycle-choice-${stamp}`,
      label: 'Vers quels métiers tu te projettes ?',
      kind: 'multi',
      notePlaceholder: 'Une nuance…',
      options: {
        create: [
          { position: 0, value: 'dev', label: 'Dev', icon: 'dev' },
          { position: 1, value: 'cyber', label: 'Cyber', icon: 'cyber' },
        ],
      },
    },
    select: { id: true, options: { select: { id: true, value: true } } },
  });
  ids.choice = choice.id;
  ids.dev = choice.options.find((o) => o.value === 'dev')!.id;
  ids.cyber = choice.options.find((o) => o.value === 'cyber')!.id;

  await prisma.closing_TemplateQuestion.create({
    data: {
      templateId: template.id,
      sectionId: template.sections[0].id,
      questionId: choice.id,
      position: 0,
      withNote: true,
    },
  });

  const event = await prisma.event.create({
    data: {
      titre: `ClosingEvent-${stamp}`,
      date: new Date('2026-03-02T09:00:00Z'),
      campusId: paris.id,
      closingTemplateId: template.id,
    },
  });
  ids.event = event.id;

  const staff = await prisma.bauth_user.create({
    data: {
      name: 'Closing Staff',
      email: `closing.staff.${stamp}@epitech.eu`,
      staffProfile: { create: { staffRole: 'dev', campusId: paris.id } },
    },
    select: { id: true, staffProfile: { select: { id: true } } },
  });
  ids.staffUser = staff.id;
  ids.staff = staff.staffProfile!.id;

  const talent = await prisma.talent.create({
    data: { nom: 'Closing', prenom: `Test${stamp}` },
  });
  ids.talent = talent.id;

  const participation = await prisma.participation.create({
    data: { talentId: talent.id, eventId: event.id, campusId: paris.id },
  });
  ids.participation = participation.id;
});

afterAll(async () => {
  // Ordered teardown; the test database is disposable, so a failure here is
  // noise rather than a signal.
  try {
    await prisma.closing_Record.deleteMany({ where: { talentId: ids.talent } });
    await prisma.participation.deleteMany({ where: { id: ids.participation } });
    await prisma.talent.deleteMany({ where: { id: ids.talent } });
    await prisma.event.deleteMany({ where: { id: ids.event } });
    await prisma.closing_TemplateQuestion.deleteMany({
      where: { templateId: ids.template },
    });
    await prisma.closing_Template.deleteMany({ where: { id: ids.template } });
    await prisma.closing_Question.deleteMany({
      where: { id: { in: [ids.choice, ids.rating].filter(Boolean) } },
    });
    await prisma.bauth_user.deleteMany({ where: { id: ids.staffUser } });
    await prisma.campus.deleteMany({
      where: { id: { in: [ids.campus, ids.otherCampus] } },
    });
  } catch {
    // ignore - the test database is disposable
  }
});

async function conduct(
  mode: 'start' | 'save' | 'close',
  answers: Record<
    string,
    {
      selectedIds: string[];
      ratingValue: number | null;
      freeText: string;
      note: string;
    }
  >,
) {
  const grid = await resolveClosingGridById(ids.template);
  await persistClosing({
    participationId: ids.participation,
    talentId: ids.talent,
    campusId: ids.campus,
    staffId: ids.staff,
    templateId: ids.template,
    grid: grid!,
    form: {
      participationId: ids.participation,
      answers,
      recommendation: 'bon_profil',
      verdictNote: 'Bon échange.',
    },
    mode,
  });
}

const answer = (
  over: Partial<{ selectedIds: string[]; note: string }> = {},
) => ({
  selectedIds: [],
  ratingValue: null,
  freeText: '',
  note: '',
  ...over,
});

describe('conducting a closing', () => {
  it('should write the picked options and the team note, then reconcile a cleared answer away', async () => {
    // Arrange + Act: two picks and a note.
    await conduct('start', {
      [ids.choice]: answer({
        selectedIds: [ids.dev, ids.cyber],
        note: 'Hésite entre les deux.',
      }),
    });

    // Assert
    let record = await prisma.closing_Record.findUniqueOrThrow({
      where: { participationId: ids.participation },
      include: { answers: { include: { selectedOptions: true } } },
    });
    expect(record.status).toBe('in_progress');
    expect(record.answers).toHaveLength(1);
    expect(record.answers[0].selectedOptions).toHaveLength(2);
    expect(record.answers[0].note).toBe('Hésite entre les deux.');

    // Act: the staff member clears the question entirely. The payload is always
    // the WHOLE form, so an emptied answer is an instruction to remove the row,
    // not an omission to ignore.
    await conduct('save', { [ids.choice]: answer() });

    record = await prisma.closing_Record.findUniqueOrThrow({
      where: { participationId: ids.participation },
      include: { answers: { include: { selectedOptions: true } } },
    });
    expect(record.answers).toHaveLength(0);
  });

  it('should refuse every later write once the closing is finalised', async () => {
    await conduct('close', {
      [ids.choice]: answer({ selectedIds: [ids.dev] }),
    });
    const record = await prisma.closing_Record.findUniqueOrThrow({
      where: { participationId: ids.participation },
      select: { status: true },
    });
    expect(record.status).toBe('done');
    // The lock itself lives in the route, which refuses before reaching the
    // service; what this pins is that clôture is recorded as terminal state,
    // which is what that guard reads.
  });
});

describe('campus scoping', () => {
  it('should hide a closing from another campus scoped client', async () => {
    // A delegate with no entry in the scoped extension is simply UNSCOPED: no
    // error, just every campus' rows. So this asserts the guard exists at all.
    const own = scopedPrisma(ids.campus);
    const other = scopedPrisma(ids.otherCampus);

    await expect(
      own.closing_Record.count({ where: { talentId: ids.talent } }),
    ).resolves.toBe(1);
    await expect(
      other.closing_Record.count({ where: { talentId: ids.talent } }),
    ).resolves.toBe(0);
  });
});

describe('the bank keys the school-year review names', () => {
  it('should still exist in the seeded bank', async () => {
    // `voiceOf` addresses these two by key. A key that quietly stopped existing
    // would reach a national director as "la question n'est posée par aucune
    // grille", which reads exactly like "personne n'a répondu".
    const keys = Object.values(CLOSING_QUESTION_KEYS);
    const found = await prisma.closing_Question.findMany({
      where: { key: { in: keys } },
      select: { key: true },
    });
    expect(found.map((q) => q.key).sort()).toEqual([...keys].sort());
  });
});

describe('the structural-edit lock', () => {
  it('should refuse an unknown valence rather than store a token nothing renders', async () => {
    await expect(
      writeClosingQuestion({
        questionKey: `lock-tone-${stamp}`,
        label: 'Question test',
        kind: 'single',
        options: [{ value: 'a', label: 'A', tone: 'chartreuse' }],
      }),
    ).rejects.toBeInstanceOf(OperationRefusedError);
  });

  it('should refuse a kind change once students have answered, but allow a reword', async () => {
    // Arrange: the seeded question already carries an answer from the first test.
    await expect(
      writeClosingQuestion({
        questionKey: `lifecycle-choice-${stamp}`,
        label: 'Vers quels métiers tu te projettes ?',
        kind: 'text',
      }),
    ).rejects.toBeInstanceOf(OperationRefusedError);

    // Wording stays editable on purpose, so a typo can be corrected on documents
    // already rendered.
    const outcome = await writeClosingQuestion({
      questionKey: `lifecycle-choice-${stamp}`,
      label: 'Vers quels métiers te projettes-tu ?',
    });
    expect(outcome.applied).toBe(true);
    const q = await prisma.closing_Question.findUniqueOrThrow({
      where: { key: `lifecycle-choice-${stamp}` },
      select: { label: true, kind: true },
    });
    expect(q.label).toBe('Vers quels métiers te projettes-tu ?');
    expect(q.kind).toBe('multi');
  });

  it('should refuse dropping an option students have already chosen', async () => {
    await expect(
      writeClosingQuestion({
        questionKey: `lifecycle-choice-${stamp}`,
        label: 'Vers quels métiers te projettes-tu ?',
        options: [{ value: 'cyber', label: 'Cyber', icon: 'cyber' }],
      }),
    ).rejects.toBeInstanceOf(OperationRefusedError);
  });

  it('should refuse a barème that no longer contains a note already given', async () => {
    // Arrange: a rating question answered 4 on 5. The same lock as the two
    // above, on the one field of a rating that carries meaning - and the
    // consequence is not only an unreadable answer: a 4 outside its own scale is
    // refused by the conduct form on every autosave, so the closing holding it
    // can no longer be saved or clôturé.
    const key = `lock-rating-${stamp}`;
    const label = 'Satisfaction globale';
    await writeClosingQuestion({
      questionKey: key,
      label,
      kind: 'rating',
      max: 5,
    });
    const question = await prisma.closing_Question.findUniqueOrThrow({
      where: { key },
      select: { id: true },
    });
    ids.rating = question.id;
    const record = await prisma.closing_Record.findUniqueOrThrow({
      where: { participationId: ids.participation },
      select: { id: true },
    });
    await prisma.closing_Answer.create({
      data: { recordId: record.id, questionId: question.id, ratingValue: 4 },
    });

    // Act + Assert: 4 out of 5 must not become 4 out of 3.
    await expect(
      writeClosingQuestion({ questionKey: key, label, max: 3 }),
    ).rejects.toBeInstanceOf(OperationRefusedError);

    // Widening it is not a structural change, and neither is a floor that still
    // contains what was given.
    const raised = await writeClosingQuestion({
      questionKey: key,
      label,
      max: 10,
    });
    expect(raised.applied).toBe(true);
  });
});

describe('RGPD erasure', () => {
  it('should take the closing, its answers and its option rows with the talent', async () => {
    const before = await prisma.closing_Answer.count({
      where: { record: { talentId: ids.talent } },
    });
    expect(before).toBeGreaterThan(0);

    await prisma.$transaction(async (tx) => {
      await anonymizeTalent(tx, ids.talent);
    });

    await expect(
      prisma.closing_Record.count({ where: { talentId: ids.talent } }),
    ).resolves.toBe(0);
    // The answers and their option rows cascade from the record; asserted rather
    // than assumed, since the erasure only deletes the record itself.
    await expect(
      prisma.closing_Answer.count({
        where: { record: { talentId: ids.talent } },
      }),
    ).resolves.toBe(0);
  });
});

describe('a second grid over the same bank', () => {
  it('should compose and resolve with no migration', async () => {
    // The claim the refactor makes, against a real database this time: a new
    // closing is a composition over questions that already exist.
    const second = await prisma.closing_Template.create({
      data: {
        key: `second-${stamp}`,
        label: 'Closing court',
        sections: { create: { position: 0, title: 'Retour' } },
      },
      select: { id: true, sections: { select: { id: true } } },
    });
    await prisma.closing_TemplateQuestion.create({
      data: {
        templateId: second.id,
        sectionId: second.sections[0].id,
        questionId: ids.choice,
        position: 0,
        labelOverride: "Et après l'après-midi, tu te projettes où ?",
        withNote: false,
      },
    });

    const grid = await resolveClosingGridById(second.id);
    const [q] = grid!.sections[0].questions;
    // Same bank row as the first grid, so one distribution spans both.
    expect(q.id).toBe(ids.choice);
    expect(q.label).toBe("Et après l'après-midi, tu te projettes où ?");
    expect(q.note).toBeNull();

    await prisma.closing_TemplateQuestion.deleteMany({
      where: { templateId: second.id },
    });
    await prisma.closing_Template.delete({ where: { id: second.id } });
  });
});

/**
 * Composing a grid is the one write that replaces a whole composition, and
 * nothing used to check what it was replacing. Two authors working an hour apart
 * on the same grid is not hypothetical: it happened on the recette database, and
 * the second write would have carried a seven-minute-old read back over the
 * first with only the audit row to say so.
 */
describe('composing a grid under the two-step contract', () => {
  const key = `twostep-${stamp}`;
  const compose = (title: string, digest?: string) =>
    writeClosingTemplate({
      templateKey: key,
      label: 'Grille à deux temps',
      sections: [
        {
          title,
          questions: [{ questionKey: `lifecycle-choice-${stamp}` }],
        },
      ],
      planDigest: digest,
    });

  afterAll(async () => {
    await prisma.closing_TemplateQuestion.deleteMany({
      where: { template: { key } },
    });
    await prisma.closing_TemplateSection.deleteMany({
      where: { template: { key } },
    });
    await prisma.closing_Template.deleteMany({ where: { key } });
  });

  it('writes nothing on a dry run, and shows what it would replace', async () => {
    const outcome = await compose('Retour');

    expect(outcome.applied).toBe(false);
    if (outcome.applied) return;
    expect(outcome.planDigest).toMatch(/^[0-9a-f]{16}$/);
    // A grid that does not exist yet replaces nothing, and the plan says so
    // rather than inventing an empty composition.
    expect((outcome.plan as { replaces: unknown }).replaces).toBeNull();
    await expect(
      prisma.closing_Template.findUnique({ where: { key } }),
    ).resolves.toBeNull();
  });

  it('applies with the digest the dry run returned', async () => {
    const dry = await compose('Retour');
    if (dry.applied) throw new Error('expected a dry run');

    const applied = await compose('Retour', dry.planDigest);

    expect(applied.applied).toBe(true);
    const stored = await prisma.closing_Template.findUnique({
      where: { key },
      select: { sections: { select: { title: true } } },
    });
    expect(stored?.sections.map((s) => s.title)).toEqual(['Retour']);
  });

  it('refuses a digest taken before somebody else recomposed the grid', async () => {
    const dry = await compose('Retour');
    if (dry.applied) throw new Error('expected a dry run');

    // The other author, between the two calls.
    const theirs = await compose('Leur section');
    if (theirs.applied) throw new Error('expected a dry run');
    await compose('Leur section', theirs.planDigest);

    await expect(compose('Retour', dry.planDigest)).rejects.toThrow(
      /empreinte/,
    );
    const stored = await prisma.closing_Template.findUnique({
      where: { key },
      select: { sections: { select: { title: true } } },
    });
    // Theirs stands: the stale write is refused, never merged or overwritten.
    expect(stored?.sections.map((s) => s.title)).toEqual(['Leur section']);
  });
});

describe("the talent's journey", () => {
  /**
   * A closing is conducted at the END of an event, so it is finalised while the
   * event still has days to run (a stage) or the same afternoon (a Coding Club).
   * The block this replaced listed past events only, and inheriting that rule
   * would hide the team's verdict for exactly as long as it is the freshest
   * thing anybody knows about the talent - with the fiche rendering perfectly
   * and simply not mentioning it.
   */
  it('carries a closing conducted on an event that is still running', async () => {
    const now = new Date();
    const startedYesterday = new Date(now.getTime() - 24 * 3600 * 1000);
    const endsNextWeek = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    const event = await prisma.event.create({
      data: {
        titre: `ClosingOngoing-${stamp}`,
        date: startedYesterday,
        endDate: endsNextWeek,
        campusId: ids.campus,
        closingTemplateId: ids.template,
      },
    });
    const talent = await prisma.talent.create({
      data: { nom: 'Ongoing', prenom: `Test${stamp}` },
    });
    const participation = await prisma.participation.create({
      data: { talentId: talent.id, eventId: event.id, campusId: ids.campus },
    });
    await prisma.closing_Record.create({
      data: {
        participationId: participation.id,
        talentId: talent.id,
        staffId: ids.staff,
        campusId: ids.campus,
        templateId: ids.template,
        status: 'done',
        conductedAt: now,
        recommendation: 'bon_profil',
        verdictNote: 'À relancer pour la JPO.',
      },
    });

    const journey = await getTalentJourney(talent.id, 'Europe/Paris');

    expect(journey.entries).toHaveLength(1);
    expect(journey.closingCount).toBe(1);
    expect(journey.entries[0].closing).toMatchObject({
      status: 'done',
      recommendation: 'bon_profil',
      verdictNote: 'À relancer pour la JPO.',
    });
    // Presence is read off the Salesforce status and only means anything once
    // the event is over: on a running one `READY` says "confirmed", not "absent".
    expect(journey.entries[0].presence).toBeNull();

    await prisma.closing_Record.deleteMany({ where: { talentId: talent.id } });
    await prisma.participation.deleteMany({ where: { id: participation.id } });
    await prisma.talent.delete({ where: { id: talent.id } });
    await prisma.event.delete({ where: { id: event.id } });
  });

  it('leaves out an event that is still to come and has no closing', async () => {
    const nextMonth = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const event = await prisma.event.create({
      data: {
        titre: `ClosingFuture-${stamp}`,
        date: nextMonth,
        campusId: ids.campus,
      },
    });
    const talent = await prisma.talent.create({
      data: { nom: 'Future', prenom: `Test${stamp}` },
    });
    const participation = await prisma.participation.create({
      data: { talentId: talent.id, eventId: event.id, campusId: ids.campus },
    });

    const journey = await getTalentJourney(talent.id, 'Europe/Paris');
    expect(journey.entries).toHaveLength(0);

    await prisma.participation.deleteMany({ where: { id: participation.id } });
    await prisma.talent.delete({ where: { id: talent.id } });
    await prisma.event.delete({ where: { id: event.id } });
  });
});

describe('a question dropped from a grid', () => {
  // Its own fixtures: this walks a composition CHANGING, which the shared grid
  // above must not see.
  const own: Record<string, string> = {};

  beforeAll(async () => {
    const kept = await prisma.closing_Question.create({
      data: {
        key: `dropped-kept-${stamp}`,
        label: 'Ça t’a donné envie ?',
        kind: 'single',
        options: { create: [{ position: 0, value: 'oui', label: 'Oui' }] },
      },
      select: { id: true, options: { select: { id: true } } },
    });
    own.kept = kept.id;
    own.keptOption = kept.options[0].id;

    const doomed = await prisma.closing_Question.create({
      data: {
        key: `dropped-doomed-${stamp}`,
        label: 'Quels autres métiers (hors tech) t’intéressent ?',
        kind: 'multi',
        notePlaceholder: 'Une nuance…',
        options: { create: [{ position: 0, value: 'droit', label: 'Droit' }] },
      },
      select: { id: true, options: { select: { id: true } } },
    });
    own.doomed = doomed.id;
    own.doomedOption = doomed.options[0].id;

    const template = await prisma.closing_Template.create({
      data: {
        key: `dropped-${stamp}`,
        label: 'Grille qui perd une question',
        sections: { create: { position: 0, title: 'Retour' } },
      },
      select: { id: true, sections: { select: { id: true } } },
    });
    own.template = template.id;

    await prisma.closing_TemplateQuestion.createMany({
      data: [
        {
          templateId: template.id,
          sectionId: template.sections[0].id,
          questionId: kept.id,
          position: 0,
          withNote: false,
        },
        {
          templateId: template.id,
          sectionId: template.sections[0].id,
          questionId: doomed.id,
          position: 1,
          withNote: true,
        },
      ],
    });

    const event = await prisma.event.create({
      data: {
        titre: `DroppedEvent-${stamp}`,
        date: new Date('2026-03-02T09:00:00Z'),
        campusId: ids.campus,
        closingTemplateId: template.id,
      },
    });
    own.event = event.id;

    const talent = await prisma.talent.create({
      data: { nom: 'Dropped', prenom: `Test${stamp}` },
    });
    own.talent = talent.id;

    const participation = await prisma.participation.create({
      data: { talentId: talent.id, eventId: event.id, campusId: ids.campus },
    });
    own.participation = participation.id;
  });

  afterAll(async () => {
    try {
      await prisma.closing_Record.deleteMany({
        where: { talentId: own.talent },
      });
      await prisma.participation.deleteMany({
        where: { id: own.participation },
      });
      await prisma.talent.deleteMany({ where: { id: own.talent } });
      await prisma.event.deleteMany({ where: { id: own.event } });
      await prisma.closing_TemplateQuestion.deleteMany({
        where: { templateId: own.template },
      });
      await prisma.closing_Template.deleteMany({ where: { id: own.template } });
      await prisma.closing_Question.deleteMany({
        where: { id: { in: [own.kept, own.doomed] } },
      });
    } catch {
      // ignore - the test database is disposable
    }
  });

  async function save(
    answers: Record<
      string,
      {
        selectedIds: string[];
        ratingValue: number | null;
        freeText: string;
        note: string;
      }
    >,
    mode: 'start' | 'save' = 'save',
  ) {
    const grid = await resolveClosingGridById(own.template);
    await persistClosing({
      participationId: own.participation,
      talentId: own.talent,
      campusId: ids.campus,
      staffId: ids.staff,
      templateId: own.template,
      grid: grid!,
      form: {
        participationId: own.participation,
        answers,
        recommendation: 'bon_profil',
        verdictNote: '',
      },
      mode,
    });
  }

  it('should survive every later autosave, and be read back under its own heading', async () => {
    // Arrange: a closing answers both questions, one of them with a team note.
    await save(
      {
        [own.kept]: answer({ selectedIds: [own.keptOption] }),
        [own.doomed]: answer({
          selectedIds: [own.doomedOption],
          note: 'Hésite avec une prépa.',
        }),
      },
      'start',
    );

    // Act: the team re-composes the grid over the API and stops asking one
    // question. Nothing touches the answers, which is the point of pointing them
    // at the bank question rather than at the composition row.
    await prisma.closing_TemplateQuestion.deleteMany({
      where: { templateId: own.template, questionId: own.doomed },
    });

    // The conduct page now posts only what the grid asks: an answer to a
    // question it does not ask is refused by `closingAnswersIssues` before the
    // action ever persists, so it is never in the payload.
    await save({ [own.kept]: answer({ selectedIds: [own.keptOption] }) });

    // Assert: the answer is still there. `notIn(keep)` used to delete it here,
    // which lost a real conversation the moment somebody edited a grid.
    const record = await prisma.closing_Record.findUniqueOrThrow({
      where: { participationId: own.participation },
      select: {
        answers: {
          select: {
            questionId: true,
            note: true,
            selectedOptions: { select: { optionId: true } },
          },
        },
      },
    });
    const orphan = record.answers.find((a) => a.questionId === own.doomed);
    expect(orphan).toBeDefined();
    expect(orphan!.note).toBe('Hésite avec une prépa.');
    expect(orphan!.selectedOptions.map((s) => s.optionId)).toEqual([
      own.doomedOption,
    ]);

    // And it is reachable: the grid no longer carries it, so the synthesis has
    // to add the section itself or the answer renders nowhere at all.
    const grid = await resolveClosingGridById(own.template);
    expect(gridQuestions(grid!).map((q) => q.id)).not.toContain(own.doomed);

    const bankRow = await prisma.closing_Question.findUniqueOrThrow({
      where: { id: own.doomed },
      select: {
        id: true,
        key: true,
        label: true,
        hint: true,
        kind: true,
        max: true,
        maxLength: true,
        placeholder: true,
        notePlaceholder: true,
        testimonial: true,
        options: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            value: true,
            label: true,
            tone: true,
            icon: true,
          },
        },
      },
    });
    const sections = recordSynthesisSections(grid!, [bankRow]);
    const last = sections[sections.length - 1];
    expect(last.title).toBe(RETIRED_SECTION_TITLE);
    expect(last.questions.map((q) => q.id)).toEqual([own.doomed]);
  });

  it('should still clear an answer the grid does ask', async () => {
    // The other half of the same delete: narrowing it to the grid's questions
    // must not stop a staff member un-picking something.
    await save({ [own.kept]: answer({ selectedIds: [] }) });

    const record = await prisma.closing_Record.findUniqueOrThrow({
      where: { participationId: own.participation },
      select: { answers: { select: { questionId: true } } },
    });
    const asked = record.answers.map((a) => a.questionId);
    expect(asked).not.toContain(own.kept);
    expect(asked).toContain(own.doomed);
  });
});

describe('a note whose grid stopped inviting one', () => {
  // The sibling of the describe above, one field down. A composition can stop
  // asking a question, and it can keep asking it while withdrawing the note
  // under it - `write_closing_template` does the second whenever a grid is
  // replayed without `withNote`, which defaults to false. Both must leave what
  // was recorded exactly where it is.
  const own: Record<string, string> = {};

  beforeAll(async () => {
    const question = await prisma.closing_Question.create({
      data: {
        key: `noted-${stamp}`,
        label: 'Ça t’a donné envie ?',
        kind: 'single',
        notePlaceholder: 'Une nuance…',
        options: { create: [{ position: 0, value: 'oui', label: 'Oui' }] },
      },
      select: { id: true, options: { select: { id: true } } },
    });
    own.question = question.id;
    own.option = question.options[0].id;

    const template = await prisma.closing_Template.create({
      data: {
        key: `noted-${stamp}`,
        label: 'Grille qui retire sa note',
        sections: { create: { position: 0, title: 'Retour' } },
      },
      select: { id: true, sections: { select: { id: true } } },
    });
    own.template = template.id;

    await prisma.closing_TemplateQuestion.create({
      data: {
        templateId: template.id,
        sectionId: template.sections[0].id,
        questionId: question.id,
        position: 0,
        withNote: true,
      },
    });

    const event = await prisma.event.create({
      data: {
        titre: `NotedEvent-${stamp}`,
        date: new Date('2026-03-02T09:00:00Z'),
        campusId: ids.campus,
        closingTemplateId: template.id,
      },
    });
    own.event = event.id;

    const talent = await prisma.talent.create({
      data: { nom: 'Noted', prenom: `Test${stamp}` },
    });
    own.talent = talent.id;

    const participation = await prisma.participation.create({
      data: { talentId: talent.id, eventId: event.id, campusId: ids.campus },
    });
    own.participation = participation.id;
  });

  afterAll(async () => {
    try {
      await prisma.closing_Record.deleteMany({
        where: { talentId: own.talent },
      });
      await prisma.participation.deleteMany({
        where: { id: own.participation },
      });
      await prisma.talent.deleteMany({ where: { id: own.talent } });
      await prisma.event.deleteMany({ where: { id: own.event } });
      await prisma.closing_TemplateQuestion.deleteMany({
        where: { templateId: own.template },
      });
      await prisma.closing_Template.deleteMany({ where: { id: own.template } });
      await prisma.closing_Question.deleteMany({ where: { id: own.question } });
    } catch {
      // ignore - the test database is disposable
    }
  });

  /** The whole form, as the conduct page posts it back: what the load prefilled
   *  from the record, note included. */
  function payload(
    over: Partial<{ selectedIds: string[]; note: string }> = {},
  ) {
    return {
      participationId: own.participation,
      answers: { [own.question]: answer(over) },
      recommendation: 'bon_profil' as const,
      verdictNote: '',
    };
  }

  async function save(
    form: ReturnType<typeof payload>,
    mode: 'start' | 'save' = 'save',
  ) {
    const grid = await resolveClosingGridById(own.template);
    // Exactly what the action does before persisting: a refusal here is a 400
    // the staff member cannot get past, which is the failure this covers.
    expect(closingAnswersIssues(form, grid!)).toEqual([]);
    await persistClosing({
      participationId: own.participation,
      talentId: own.talent,
      campusId: ids.campus,
      staffId: ids.staff,
      templateId: own.template,
      grid: grid!,
      form,
      mode,
    });
  }

  const storedNote = async () => {
    const record = await prisma.closing_Record.findUniqueOrThrow({
      where: { participationId: own.participation },
      select: {
        answers: {
          select: {
            questionId: true,
            note: true,
            selectedOptions: { select: { optionId: true } },
          },
        },
      },
    });
    return record.answers.find((a) => a.questionId === own.question) ?? null;
  };

  it('should keep saving, and keep the note, once the grid withdraws it', async () => {
    // Arrange: the team writes a note while the grid still invites one.
    await save(
      payload({ selectedIds: [own.option], note: 'Hésite avec une prépa.' }),
      'start',
    );

    // Act: the grid is recomposed and stops offering a note under that question.
    await prisma.closing_TemplateQuestion.updateMany({
      where: { templateId: own.template, questionId: own.question },
      data: { withNote: false },
    });

    // The page posts the whole form back on the next autosave, note and all.
    // This used to be refused ("n'attend pas de note dans cette grille"), so
    // every later save failed and the closing could never be clôturé.
    await save(
      payload({ selectedIds: [own.option], note: 'Hésite avec une prépa.' }),
    );

    // Assert: still there, untouched. A composition says whether a note may be
    // ENTERED, never whether one exists.
    expect((await storedNote())?.note).toBe('Hésite avec une prépa.');
  });

  it('should leave the row alone when only the note is left on it', async () => {
    // The staff member un-picks the answer. The structured half goes, but the
    // note is not this grid's to remove, so the row stays rather than being
    // reconciled away with it.
    await save(payload({ selectedIds: [], note: 'Hésite avec une prépa.' }));

    const row = await storedNote();
    expect(row?.note).toBe('Hésite avec une prépa.');
    expect(row?.selectedOptions).toEqual([]);
  });
});
