import { describe, it, expect } from 'vitest';
import {
  formIntegrityProblems,
  referenceProblems,
  structuralChanges,
  type AuthoredForm,
  type AuthoredQuestion,
} from './authoring';

/**
 * The line a feedback form's structural lock draws, and the rules a whole form
 * must satisfy before anybody can answer it.
 *
 * `structuralChanges` is what stands between a form that already has responses
 * and an edit that would make those responses say something else, so each kind
 * of change is asserted on its own: one that slipped through as "wording" would
 * not fail anywhere, it would silently corrupt the statistics of that form.
 */

const question = (over: Partial<AuthoredQuestion> = {}): AuthoredQuestion => ({
  key: 'avis',
  prompt: 'Ton avis ?',
  type: 'single',
  required: true,
  identityField: null,
  inputKind: null,
  minSelections: null,
  maxSelections: null,
  placeholder: null,
  options: [
    { optionId: 'o1', label: 'Oui', kind: 'choice', reaction: null },
    { optionId: 'o2', label: 'Non', kind: 'choice', reaction: null },
  ],
  ...over,
});

const form = (over: Partial<AuthoredForm> = {}): AuthoredForm => ({
  title: 'Bilan',
  intro: null,
  outro: null,
  personaName: null,
  status: 'draft',
  allowsAuthenticatedAccess: true,
  allowsPublicAccess: false,
  dashboardNudge: false,
  questions: [question()],
  sections: [
    {
      sectionId: 's1',
      title: 'Ton stage',
      intro: null,
      questions: [question({ key: 'note', type: 'text', options: [] })],
    },
  ],
  ...over,
});

describe('structuralChanges', () => {
  it('finds nothing to refuse in wording and form settings', () => {
    const before = form();
    const after = form({
      title: 'Bilan renommé',
      intro: 'Salut {prenom}',
      status: 'published',
      allowsPublicAccess: true,
      questions: [
        question({
          prompt: 'Ton avis, franchement ?',
          placeholder: 'Écris ici',
          options: [
            { optionId: 'o1', label: 'Oui !', kind: 'choice', reaction: 'Top' },
            { optionId: 'o2', label: 'Non', kind: 'choice', reaction: null },
          ],
        }),
      ],
      sections: [
        { ...before.sections[0], title: 'Ta semaine', intro: 'On parle stage' },
      ],
    });
    expect(structuralChanges(before, after)).toEqual([]);
  });

  it('refuses every field that changes what an answer means', () => {
    const before = form();
    const after = form({
      questions: [
        question({
          type: 'multiple',
          required: false,
          minSelections: 1,
          maxSelections: 2,
        }),
      ],
    });
    expect(structuralChanges(before, after)).toEqual([
      'question « avis » : type modifié',
      'question « avis » : required modifié',
      'question « avis » : minSelections modifié',
      'question « avis » : maxSelections modifié',
    ]);
  });

  it('reads a renamed key as one question removed and another added', () => {
    const changes = structuralChanges(
      form(),
      form({ questions: [question({ key: 'avis_global' })] }),
    );
    expect(changes).toContain('question « avis_global » ajoutée');
    expect(changes).toContain('question « avis » retirée');
  });

  it('refuses adding, removing and reordering options, matched by id', () => {
    const [yes, no] = question().options;
    expect(
      structuralChanges(
        form(),
        form({ questions: [question({ options: [no, yes] })] }),
      ),
    ).toEqual(['ordre des options de « avis » modifié']);

    expect(
      structuralChanges(
        form(),
        form({
          questions: [
            question({
              options: [
                yes,
                {
                  optionId: null,
                  label: 'Bof',
                  kind: 'choice',
                  reaction: null,
                },
              ],
            }),
          ],
        }),
      ),
    ).toEqual([
      'option « Bof » ajoutée à « avis »',
      'option « Non » retirée de « avis »',
    ]);
  });

  it('refuses an option changing kind', () => {
    const [yes, no] = question().options;
    expect(
      structuralChanges(
        form(),
        form({
          questions: [question({ options: [yes, { ...no, kind: 'extra' }] })],
        }),
      ),
    ).toEqual(['option « Non » de « avis » : kind modifié']);
  });

  it('refuses moving a question between sections and reordering sections', () => {
    const before = form({
      sections: [
        { ...form().sections[0] },
        { sectionId: 's2', title: 'Après', intro: null, questions: [] },
      ],
    });
    const moved = form({
      sections: [
        { ...before.sections[0], questions: [] },
        { ...before.sections[1], questions: before.sections[0].questions },
      ],
    });
    expect(structuralChanges(before, moved)).toEqual([
      'question « note » déplacée dans une autre section',
    ]);

    const reordered = form({
      sections: [before.sections[1], before.sections[0]],
    });
    expect(structuralChanges(before, reordered)).toContain(
      'ordre des sections modifié',
    );
  });

  it('refuses adding and removing a section', () => {
    expect(
      structuralChanges(
        form(),
        form({
          sections: [
            ...form().sections,
            { sectionId: null, title: 'Nouvelle', intro: null, questions: [] },
          ],
        }),
      ),
    ).toEqual(['section « Nouvelle » ajoutée']);
    expect(structuralChanges(form(), form({ sections: [] }))).toEqual([
      'section « Ton stage » retirée',
      'question « note » retirée',
    ]);
  });
});

describe('formIntegrityProblems', () => {
  it('accepts a sound form', () => {
    expect(formIntegrityProblems(form())).toEqual([]);
  });

  it('refuses a choice question nobody could answer', () => {
    expect(
      formIntegrityProblems(form({ questions: [question({ options: [] })] })),
    ).toEqual([
      '« avis » est une question à choix sans aucune option : personne ne pourrait y répondre.',
    ]);
  });

  it('refuses options on a free-text question and extra options off a scale', () => {
    const [yes] = question().options;
    expect(
      formIntegrityProblems(
        form({
          questions: [
            question({ type: 'text', options: [yes] }),
            question({
              key: 'choix',
              options: [
                yes,
                { ...yes, optionId: null, label: 'NSP', kind: 'extra' },
              ],
            }),
          ],
        }),
      ),
    ).toEqual([
      "« avis » est une question à réponse libre (text) : elle ne prend pas d'options.",
      "« choix » : une option hors échelle (« extra ») n'existe que sur une question de type scale.",
    ]);
  });

  it('refuses two options reading the same, since answers resolve by label', () => {
    const [yes] = question().options;
    expect(
      formIntegrityProblems(
        form({
          questions: [question({ options: [yes, { ...yes, optionId: 'o9' }] })],
        }),
      ),
    ).toEqual(["« avis » propose deux fois l'option « Oui »."]);
  });

  it('refuses a duplicated key and a duplicated identity field', () => {
    const email = question({
      key: 'email',
      type: 'text',
      identityField: 'email',
      options: [],
    });
    const problems = formIntegrityProblems(
      form({ questions: [email, { ...email }] }),
    );
    expect(problems).toContain(
      'La clé « email » est utilisée par deux questions.',
    );
    expect(
      problems.some((p) => p.startsWith('Deux questions collectent')),
    ).toBe(true);
  });

  it('refuses an identity question of a type that cannot hold it', () => {
    expect(
      formIntegrityProblems(
        form({ questions: [question({ identityField: 'email' })] }),
      ),
    ).toEqual([
      '« avis » collecte email et doit donc être de type text, pas single.',
    ]);
  });

  it('refuses a dashboard nudge towards a form connected talents cannot open', () => {
    expect(
      formIntegrityProblems(
        form({ dashboardNudge: true, allowsAuthenticatedAccess: false }),
      ),
    ).toHaveLength(1);
  });

  it('refuses a published public form that asks no e-mail, and lets a draft be', () => {
    const open = { allowsPublicAccess: true };
    expect(formIntegrityProblems(form({ ...open, status: 'draft' }))).toEqual(
      [],
    );
    expect(
      formIntegrityProblems(form({ ...open, status: 'published' })),
    ).toHaveLength(1);

    const withEmail = form({
      ...open,
      status: 'published',
      sections: [
        {
          ...form().sections[0],
          questions: [
            question({
              key: 'email',
              type: 'text',
              identityField: 'email',
              options: [],
            }),
          ],
        },
      ],
    });
    expect(formIntegrityProblems(withEmail)).toEqual([]);
  });
});

describe('referenceProblems', () => {
  it('accepts ids taken from the form being replaced', () => {
    expect(referenceProblems(form(), form())).toEqual([]);
  });

  it('refuses any id on a form being created', () => {
    expect(referenceProblems(null, form())).toHaveLength(3);
  });

  it("refuses an option id that belongs to another question's options", () => {
    const before = form({
      questions: [
        question(),
        question({
          key: 'autre',
          options: [
            {
              optionId: 'o7',
              label: 'Peut-être',
              kind: 'choice',
              reaction: null,
            },
          ],
        }),
      ],
    });
    const after = form({
      questions: [
        question({
          options: [
            {
              optionId: 'o7',
              label: 'Peut-être',
              kind: 'choice',
              reaction: null,
            },
          ],
        }),
      ],
    });
    expect(referenceProblems(before, after)).toHaveLength(1);
  });

  it('refuses an id given twice', () => {
    const [yes] = question().options;
    expect(
      referenceProblems(
        form(),
        form({ questions: [question({ options: [yes, yes] })] }),
      ),
    ).toEqual(["L'identifiant d'option « o1 » est donné deux fois."]);
  });
});
