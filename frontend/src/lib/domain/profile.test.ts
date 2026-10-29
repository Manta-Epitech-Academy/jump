import { describe, expect, it } from 'vitest';
import { formatPeerName } from './profile';

describe('formatPeerName', () => {
  // The name other talents read on a board or a workshop ticket, so it is
  // normalised like every given name staff see, whatever casing it arrived in.
  it('shows the first name as staff surfaces do', () => {
    expect(formatPeerName('MARIE-ÈVE', 'dupont')).toBe('Marie-Ève D.');
  });

  it('takes a whole character as the initial', () => {
    // `charAt(0)` took half of this letter and shipped a lone surrogate.
    expect(formatPeerName('Ada', '𝒜rnaud')).toBe('Ada 𝒜.');
  });
});
