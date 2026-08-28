import { describe, expect, it } from 'vitest';
import { guardiansOf, type GuardianColumns } from './contact';

const EMPTY: GuardianColumns = {
  parentCivilite: null,
  parentPrenom: null,
  parentNom: null,
  parentEmail: null,
  parentPhone: null,
  parent2Civilite: null,
  parent2Prenom: null,
  parent2Nom: null,
  parent2Email: null,
  parent2Phone: null,
};

describe('guardiansOf', () => {
  it('returns both guardians in priority order', () => {
    const out = guardiansOf({
      ...EMPTY,
      parentPrenom: 'Marie',
      parentNom: 'Dupont',
      parent2Prenom: 'Jean',
      parent2Nom: 'Dupont',
    });
    expect(out.map((g) => g.prenom)).toEqual(['Marie', 'Jean']);
  });

  it('keeps the given name and the surname apart', () => {
    const [guardian] = guardiansOf({
      ...EMPTY,
      parentCivilite: 'femme',
      parentPrenom: 'Marie',
      parentNom: 'Dupont',
      parentEmail: 'marie@example.org',
      parentPhone: '+33600000000',
    });
    expect(guardian).toEqual({
      civilite: 'femme',
      prenom: 'Marie',
      nom: 'Dupont',
      email: 'marie@example.org',
      phone: '+33600000000',
    });
  });

  it('drops a guardian with no identity and no way to reach them', () => {
    expect(guardiansOf(EMPTY)).toEqual([]);
    expect(guardiansOf({ ...EMPTY, parent2Civilite: 'homme' })).toEqual([]);
  });

  it('keeps a guardian known only by an address', () => {
    const out = guardiansOf({ ...EMPTY, parent2Email: 'tuteur@example.org' });
    expect(out).toHaveLength(1);
    expect(out[0].email).toBe('tuteur@example.org');
  });
});
