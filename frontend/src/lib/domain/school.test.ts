import { describe, it, expect } from 'vitest';
import { departementOf } from './school';

describe('departementOf', () => {
  it('reads the two leading digits of a metropolitan code', () => {
    expect(departementOf('59000')).toBe('59');
    expect(departementOf('06600')).toBe('06');
  });

  it('reads three digits overseas, where the département is three long', () => {
    expect(departementOf('97400')).toBe('974');
    expect(departementOf('98800')).toBe('988');
  });

  // 2A / 2B is not derivable from a postal code without a commune table, and a
  // plausible guess in a figure somebody quotes is worse than a coarse truth.
  it('reports Corsica as one département rather than guessing 2A or 2B', () => {
    expect(departementOf('20000')).toBe('20');
    expect(departementOf('20600')).toBe('20');
  });

  it('tolerates spacing, since annuaire codes are not always clean', () => {
    expect(departementOf('59 000')).toBe('59');
  });

  it('answers null when there is nothing usable, never a partial guess', () => {
    expect(departementOf(null)).toBeNull();
    expect(departementOf(undefined)).toBeNull();
    expect(departementOf('')).toBeNull();
    expect(departementOf('59')).toBeNull();
    expect(departementOf('inconnu')).toBeNull();
  });
});
