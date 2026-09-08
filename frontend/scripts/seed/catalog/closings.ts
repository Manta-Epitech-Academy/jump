/**
 * Closing grids.
 *
 * The bank and the `clt_stage_seconde` grid are NOT created here: a migration
 * carries them, `migrate deploy` runs before this generator, and the rule is
 * that a grid is composed over the API rather than written into a migration. The
 * seed reads what is already there and composes on top of it, which is the same
 * thing `write_closing_template` does.
 *
 * Two additions, each earning its place:
 *
 * The Coding Club grid, because one grid proves nothing. The whole point of a
 * global question bank is that the same question asked at a stage and at a club
 * is ONE row, so a distribution can span both formats. With a single grid in the
 * dataset, every cross-format figure reads as if it worked.
 *
 * And one retired question, because dropping a question from a grid must never
 * hide the answers already recorded against it. Screens render those under a
 * « Questions retirées » heading, and that heading has no data to render unless
 * the dataset deliberately contains this case.
 */

/** Keys the migration puts in the bank. Composed against, never redefined. */
export const BANK_KEYS = {
  discoveryChannel: 'discovery_channel',
  motivation: 'motivation',
  specialties: 'specialties',
  orientationTalk: 'orientation_talk',
  passionateTeacher: 'passionate_teacher',
  techProjection: 'tech_projection',
  otherJobs: 'other_jobs',
  infoSources: 'info_sources',
  wantsMore: 'wants_more',
  satisfaction: 'satisfaction',
  oneSentence: 'one_sentence',
  nextYearEvents: 'next_year_events',
} as const;

/**
 * The grid key, which is not the row id: the migration writes id
 * `clt_stage_seconde` and key `stage_seconde`. Looking one up by the other is a
 * silent miss, so the lookup is by key and the runner refuses when it finds
 * nothing rather than writing a dangling reference.
 */
export const STAGE_TEMPLATE_KEY = 'stage_seconde';
export const CLUB_TEMPLATE_KEY = 'coding_club';

export type TemplateQuestionSpec = {
  readonly questionKey: string;
  /**
   * The grid reads a bank question aloud in its own words. Every figure keeps
   * the bank's label, so the wording can fit the format while the number stays
   * comparable - which is the one thing an override must never change.
   */
  readonly labelOverride?: string;
  readonly withNote?: boolean;
};

export type TemplateSectionSpec = {
  readonly title: string;
  readonly synthesisPosition: number | null;
  readonly questions: readonly TemplateQuestionSpec[];
};

/**
 * Three sections, seven questions: the shape of the second grid in production.
 * A club closing runs five minutes, so it asks less and notes less.
 */
export const CLUB_TEMPLATE: {
  readonly key: string;
  readonly label: string;
  readonly sections: readonly TemplateSectionSpec[];
} = {
  key: CLUB_TEMPLATE_KEY,
  label: 'Coding Club',
  sections: [
    {
      title: 'Venue',
      synthesisPosition: 1,
      questions: [
        {
          questionKey: BANK_KEYS.discoveryChannel,
          labelOverride: 'Comment as-tu connu le Coding Club ?',
        },
        { questionKey: BANK_KEYS.motivation, withNote: true },
      ],
    },
    {
      title: 'Orientation',
      synthesisPosition: 2,
      questions: [
        { questionKey: BANK_KEYS.techProjection, withNote: true },
        { questionKey: BANK_KEYS.otherJobs },
        { questionKey: BANK_KEYS.wantsMore },
      ],
    },
    {
      title: 'Retour sur la séance',
      synthesisPosition: 0,
      questions: [
        {
          questionKey: BANK_KEYS.satisfaction,
          labelOverride: 'Satisfaction globale de la séance',
        },
        { questionKey: BANK_KEYS.oneSentence },
      ],
    },
  ],
};

/**
 * The bank keys the club grid composes, in order, read off the grid rather than
 * listed a second time.
 *
 * Both scenarios that conduct a club closing need this list, and it was written
 * out by hand in one of them. A hand-copied list is not a shortcut here: a
 * record answering a question its own grid does not compose is precisely the
 * « Questions retirées » state, which the dataset places DELIBERATELY on one
 * record - so a second one arriving by accident would be indistinguishable from
 * the intended case.
 */
export const CLUB_TEMPLATE_QUESTION_KEYS: readonly string[] =
  CLUB_TEMPLATE.sections.flatMap((section) =>
    section.questions.map((question) => question.questionKey),
  );

/**
 * The bank keys the stage grid composes, in the order it asks them.
 *
 * The rule above applies unchanged, and for the same reason: a record answering
 * a question its own grid does not compose is the « Questions retirées » state,
 * placed DELIBERATELY on one record, so a second one arriving by accident would
 * be indistinguishable from the intended case.
 *
 * What does NOT carry over is where the list comes from, and assuming it does is
 * the mistake to avoid. Its neighbour is DERIVED from `CLUB_TEMPLATE`, a spec
 * this file owns. The stage grid is composed by a migration
 * (`20260826120000_add_closing_model`), so there is no spec here to read it off:
 * this list is hand-kept against that SQL, and it is checked by the closings the
 * stage conducts rather than by a type.
 *
 * It sits in the catalogue rather than in `scenarios/stage.ts`, where it began,
 * because a second scenario needs it: the Coding Club carries the one session
 * that was retargeted away from this grid, and a scenario must not import from
 * another scenario to get at it.
 */
export const STAGE_TEMPLATE_QUESTION_KEYS: readonly string[] = [
  BANK_KEYS.discoveryChannel,
  BANK_KEYS.motivation,
  BANK_KEYS.specialties,
  BANK_KEYS.orientationTalk,
  BANK_KEYS.passionateTeacher,
  BANK_KEYS.techProjection,
  BANK_KEYS.otherJobs,
  BANK_KEYS.infoSources,
  BANK_KEYS.wantsMore,
  BANK_KEYS.satisfaction,
  BANK_KEYS.oneSentence,
  BANK_KEYS.nextYearEvents,
];

/**
 * A question that was asked, was answered, and has since been retired. It is
 * composed into no grid: its answers are only reachable through the records that
 * already carry them, which is exactly the state the « Questions retirées »
 * rendering exists for.
 */
export const RETIRED_QUESTION = {
  key: 'former_school_project',
  label: 'As-tu déjà mené un projet numérique au lycée ?',
  kind: 'single' as const,
  options: [
    { value: 'oui_encadre', label: 'Oui, encadré par un enseignant' },
    { value: 'oui_perso', label: 'Oui, de mon côté' },
    { value: 'non', label: 'Non' },
  ],
};
