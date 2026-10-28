import { describe, it, expect } from 'vitest';
import { isCrossSiteWrite } from './crossSite';

const ORIGIN = 'https://jump.epiboost.fr';

function request(method: string, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/staff/admin/broadcasts/templates/test`, {
    method,
    headers,
  });
}

describe('isCrossSiteWrite', () => {
  it('refuses a write a browser sent from a sibling host or another site', () => {
    for (const site of ['same-site', 'cross-site']) {
      expect(
        isCrossSiteWrite(request('POST', { 'sec-fetch-site': site }), ORIGIN),
      ).toBe(true);
    }
    expect(
      isCrossSiteWrite(
        request('DELETE', { 'sec-fetch-site': 'same-site' }),
        ORIGIN,
      ),
    ).toBe(true);
  });

  it("believes Sec-Fetch-Site over an Origin that looks like Jump's", () => {
    expect(
      isCrossSiteWrite(
        request('POST', { 'sec-fetch-site': 'same-site', origin: ORIGIN }),
        ORIGIN,
      ),
    ).toBe(true);
  });

  it('lets a write from Jump itself, or typed by the user, through', () => {
    for (const site of ['same-origin', 'none']) {
      expect(
        isCrossSiteWrite(request('POST', { 'sec-fetch-site': site }), ORIGIN),
      ).toBe(false);
    }
  });

  it('falls back to Origin for a browser that sends no Sec-Fetch-Site', () => {
    expect(
      isCrossSiteWrite(
        request('POST', { origin: 'https://halloween2026.epiboost.fr' }),
        ORIGIN,
      ),
    ).toBe(true);
    expect(isCrossSiteWrite(request('POST', { origin: 'null' }), ORIGIN)).toBe(
      true,
    );
    expect(isCrossSiteWrite(request('POST', { origin: ORIGIN }), ORIGIN)).toBe(
      false,
    );
  });

  it('lets a server caller through: no browser, no ambient cookie to forge', () => {
    expect(isCrossSiteWrite(request('POST'), ORIGIN)).toBe(false);
  });

  it('never refuses a safe method, so links into Jump keep working', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(
        isCrossSiteWrite(
          request(method, { 'sec-fetch-site': 'cross-site' }),
          ORIGIN,
        ),
      ).toBe(false);
    }
  });
});
