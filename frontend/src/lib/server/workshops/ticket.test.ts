import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  WORKSHOP_TICKET_TTL_SECONDS,
  mintWorkshopTicket,
  verifyWorkshopTicket,
  workshopAudience,
  workshopDisplayName,
  workshopKeys,
} from './ticket';

/**
 * The half of a frozen contract Jump owns, tested against the rules the plugin
 * applies on the other side.
 *
 * `verifyWorkshopTicket` is the plugin's logic written in TypeScript: nothing in
 * the application calls it, and it exists so the two implementations can be read
 * against each other and so this half is testable while the plugin is being
 * built. Every refusal below is one the plugin has to make too.
 */

const SECRET = 'a-shared-secret-for-this-environment';
const SLUG = 'pacman-ia';
const KID = 'jump-test';
const NOW = new Date('2026-09-15T12:00:00Z');

const mint = (
  overrides: Partial<Parameters<typeof mintWorkshopTicket>[0]> = {},
) =>
  mintWorkshopTicket({
    talentId: 'sd_tal_paris_0001',
    displayName: 'Camille D.',
    slug: SLUG,
    kid: KID,
    secret: SECRET,
    now: NOW,
    ...overrides,
  });

const verify = (
  token: string,
  overrides: { secret?: string; slug?: string; kid?: string; now?: Date } = {},
) =>
  verifyWorkshopTicket(token, {
    secret: SECRET,
    slug: SLUG,
    kid: KID,
    now: NOW,
    ...overrides,
  });

describe('the entry ticket', () => {
  it('carries the claims the plugin reads, and verifies against them', () => {
    const claims = verify(mint());
    expect(claims).not.toBeNull();
    expect(claims?.sub).toBe('sd_tal_paris_0001');
    expect(claims?.name).toBe('Camille D.');
    expect(claims?.aud).toBe(workshopAudience(SLUG));
    expect(claims?.iss).toBe('jump');
    expect(claims?.kid).toBe(KID);
    expect(claims?.exp).toBe(claims!.iat + WORKSHOP_TICKET_TTL_SECONDS);
  });

  it('gives every ticket its own jti, so single use can be enforced', () => {
    // The plugin burns it through the cache's SETNX. Two tickets sharing one
    // would make the second entry look like a replay of the first.
    expect(mint().split('.')[0]).not.toBe(mint().split('.')[0]);
  });

  it('expires', () => {
    const token = mint();
    const justInside = new Date(
      NOW.getTime() + (WORKSHOP_TICKET_TTL_SECONDS - 1) * 1000,
    );
    const justOutside = new Date(
      NOW.getTime() + (WORKSHOP_TICKET_TTL_SECONDS + 1) * 1000,
    );
    expect(verify(token, { now: justInside })).not.toBeNull();
    expect(verify(token, { now: justOutside })).toBeNull();
  });

  it('refuses a lifetime longer than the ceiling, whatever the token claims', () => {
    // A bug on the Jump side must not be able to hand out a bearer valid for a
    // month, which CTFd has no way to revoke: the ceiling is applied to what the
    // token says about itself, not only to the clock.
    const { ticketKey } = workshopKeys(SECRET);
    const iat = Math.floor(NOW.getTime() / 1000);
    const claims = {
      kid: KID,
      sub: 'sd_tal_paris_0001',
      name: 'Camille D.',
      aud: workshopAudience(SLUG),
      iss: 'jump',
      iat,
      exp: iat + 30 * 24 * 3600,
      jti: 'forged-but-correctly-signed',
    };
    const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString(
      'base64url',
    );
    const signature = createHmac('sha256', ticketKey)
      .update(payload)
      .digest('base64url');
    expect(verify(`${payload}.${signature}`)).toBeNull();
  });

  it('refuses a ticket minted for another instance', () => {
    expect(verify(mint(), { slug: 'discover-linux' })).toBeNull();
  });

  it('refuses a tampered payload', () => {
    const [payload, signature] = mint().split('.');
    const claims = JSON.parse(
      Buffer.from(payload!, 'base64url').toString('utf8'),
    );
    claims.sub = 'sd_tal_paris_0002';
    const forged = Buffer.from(JSON.stringify(claims), 'utf8').toString(
      'base64url',
    );
    expect(verify(`${forged}.${signature}`)).toBeNull();
    expect(verify(`${payload}.${signature}xx`)).toBeNull();
  });

  it('refuses an unknown kid before looking at the signature', () => {
    // The plugin selects its verifying key with the kid and takes the callback
    // origin from that key's own configuration. Falling back to "the only secret
    // configured" would turn a single-origin instance into an oracle the day a
    // second origin is added.
    expect(verify(mint({ kid: 'jump-somebody-elses' }))).toBeNull();
  });

  it('refuses a ticket signed with another environment secret', () => {
    expect(verify(mint({ secret: 'some-other-secret' }))).toBeNull();
  });
});

describe('the derived keys', () => {
  it('are different from each other and from the secret', () => {
    // A leak in one direction must not be a forging capability in the other.
    const { ticketKey, callbackKey } = workshopKeys(SECRET);
    expect(ticketKey).not.toBe(callbackKey);
    expect(ticketKey).not.toBe(SECRET);
  });

  it('are the lowercase hex digest, which is the frozen contract', () => {
    // The plugin's `derived_key` returns `hexdigest().encode()` and uses that
    // ASCII string as the key of the next HMAC. Raw bytes and their hex spelling
    // are different keys: this assertion is what stops the two halves drifting
    // into refusing every ticket with nothing to say why.
    const { ticketKey, callbackKey } = workshopKeys(SECRET);
    expect(ticketKey).toMatch(/^[0-9a-f]{64}$/);
    expect(callbackKey).toMatch(/^[0-9a-f]{64}$/);
    expect(ticketKey).toBe(
      createHmac('sha256', SECRET).update('jump/ticket').digest('hex'),
    );
    expect(callbackKey).toBe(
      createHmac('sha256', SECRET).update('jump/callback').digest('hex'),
    );
  });

  it('derive the same key from the same secret, run after run', () => {
    expect(workshopKeys(SECRET).ticketKey).toBe(workshopKeys(SECRET).ticketKey);
  });
});

describe('the display name', () => {
  it('is a first name and an initial, never the full name', () => {
    // The deployed scoreboards are public and these are minors on a third-party
    // host, so what leaves Jump is the least that lets a student find their row.
    expect(workshopDisplayName('Camille', 'Deschamps')).toBe('Camille D.');
    expect(workshopDisplayName('Camille', null)).toBe('Camille');
  });

  it('never exceeds what CTFd can store', () => {
    expect(workshopDisplayName('x'.repeat(200), 'Deschamps')).toHaveLength(128);
  });

  it('falls back rather than sending an empty name', () => {
    expect(workshopDisplayName(null, null)).toBe('Talent');
  });
});
