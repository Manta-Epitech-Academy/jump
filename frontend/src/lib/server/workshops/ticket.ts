/**
 * The short-lived signed ticket Jump hands a talent to enter a CTFd activity.
 *
 * NOT A JWT, and for a checked reason rather than a taste: there is no JWT
 * library in the CTFd image and none can be added without editing `CTFd/`, since
 * the loop installing a plugin's `requirements.txt` runs at BUILD time on the
 * `./CTFd` context while the workshop plugin arrives at RUN time through a bind
 * mount. So the format is a compact token with a fixed algorithm, verified on the
 * other side with the standard library's `hmac` and `hmac.compare_digest`:
 *
 *     b64url(json(claims)) + "." + b64url(hmac_sha256(ticketKey, part1))
 *
 * A happy consequence: a token with a fixed algorithm carries no `alg` header, so
 * the whole "alg: none" / "RS256 against HS256" class of flaws does not exist here
 * instead of being defended against.
 *
 * THE FORMAT IS A FROZEN CONTRACT shared with `kevin-cazal/workshop_platform`.
 * Changing anything in it means changing both halves.
 *
 * SINGLE USE IS ENFORCED IN THE PLUGIN, by burning the `jti` through the cache's
 * SETNX. Jump storing it would buy nothing, because Jump cannot observe the
 * redemption. What Jump owes is the 120 s expiry, because the token lands in the
 * nginx and gunicorn access logs. There is deliberately no table here.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/** Every ticket Jump mints lives this long, and the plugin refuses a longer one. */
export const WORKSHOP_TICKET_TTL_SECONDS = 120;

/** What the plugin compares `iss` against. */
const WORKSHOP_TICKET_ISSUER = 'jump';

/**
 * The widest name CTFd will hold: `Users.name` is a varchar(128).
 */
const DISPLAY_NAME_MAX = 128;

export type WorkshopTicketClaims = {
  /** Which Jump environment minted it. The plugin selects a key with it, and takes the callback origin from THAT key's configuration, never from the token. */
  kid: string;
  sub: string;
  name: string;
  aud: string;
  iss: typeof WORKSHOP_TICKET_ISSUER;
  iat: number;
  exp: number;
  jti: string;
};

/**
 * Two keys from one secret, so compromising one direction is not a forging
 * capability in the other: a leaked callback key cannot mint an entry ticket.
 */
export function workshopKeys(secret: string): {
  ticketKey: Buffer;
  callbackKey: Buffer;
} {
  return {
    ticketKey: createHmac('sha256', secret).update('jump/ticket').digest(),
    callbackKey: createHmac('sha256', secret).update('jump/callback').digest(),
  };
}

/**
 * First name plus an initial, never the full name.
 *
 * The deployed scoreboards are public and these are minors on a third-party host,
 * so what leaves Jump is the least that still lets a student recognise their own
 * row.
 */
export function workshopDisplayName(
  prenom: string | null | undefined,
  nom: string | null | undefined,
): string {
  const first = (prenom ?? '').trim();
  const initial = (nom ?? '').trim().charAt(0).toUpperCase();
  const composed = initial ? `${first} ${initial}.` : first;
  return (composed.trim() || 'Talent').slice(0, DISPLAY_NAME_MAX);
}

/** The audience a ticket names, which is the instance slug the plugin holds. */
export function workshopAudience(slug: string): string {
  return `workshop:${slug}`;
}

function b64url(input: Buffer): string {
  return input.toString('base64url');
}

function sign(payload: string, ticketKey: Buffer): string {
  return b64url(createHmac('sha256', ticketKey).update(payload).digest());
}

export function mintWorkshopTicket(input: {
  talentId: string;
  displayName: string;
  slug: string;
  kid: string;
  secret: string;
  /** Injected by the test; production always mints from the clock. */
  now?: Date;
}): string {
  const iat = Math.floor((input.now?.getTime() ?? Date.now()) / 1000);
  const claims: WorkshopTicketClaims = {
    kid: input.kid,
    sub: input.talentId,
    name: input.displayName.slice(0, DISPLAY_NAME_MAX),
    aud: workshopAudience(input.slug),
    iss: WORKSHOP_TICKET_ISSUER,
    iat,
    exp: iat + WORKSHOP_TICKET_TTL_SECONDS,
    jti: randomUUID(),
  };
  const payload = b64url(Buffer.from(JSON.stringify(claims), 'utf8'));
  const { ticketKey } = workshopKeys(input.secret);
  return `${payload}.${sign(payload, ticketKey)}`;
}

/**
 * The plugin's side of the contract, in TypeScript.
 *
 * It exists so this half is testable on its own while the plugin is being built,
 * and so the two implementations can be read against each other. Nothing in the
 * application calls it: Jump mints, CTFd verifies.
 *
 * The order matters and mirrors what the plugin does: the `kid` is refused BEFORE
 * any cryptographic decision, and never falls back to "the only configured
 * secret" when there happens to be one, which would turn a single-origin instance
 * into an oracle the day a second origin is added.
 */
export function verifyWorkshopTicket(
  token: string,
  options: { secret: string; slug: string; kid: string; now?: Date },
): WorkshopTicketClaims | null {
  const [payload, signature, ...rest] = token.split('.');
  if (!payload || !signature || rest.length > 0) return null;

  let claims: WorkshopTicketClaims;
  try {
    claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as WorkshopTicketClaims;
  } catch {
    return null;
  }
  if (typeof claims?.kid !== 'string' || claims.kid !== options.kid)
    return null;

  const { ticketKey } = workshopKeys(options.secret);
  const expected = Buffer.from(sign(payload, ticketKey));
  const received = Buffer.from(signature);
  if (expected.length !== received.length) return null;
  if (!timingSafeEqual(expected, received)) return null;

  if (claims.iss !== WORKSHOP_TICKET_ISSUER) return null;
  if (claims.aud !== workshopAudience(options.slug)) return null;
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) return null;
  if (typeof claims.jti !== 'string' || claims.jti.length === 0) return null;
  if (!Number.isFinite(claims.iat) || !Number.isFinite(claims.exp)) return null;

  const now = Math.floor((options.now?.getTime() ?? Date.now()) / 1000);
  if (claims.exp <= now) return null;
  // A clock 30 s ahead is a clock; a ticket minted in the future is not.
  if (claims.iat > now + 30) return null;
  // Whatever the token claims: a bug on the Jump side must not be able to hand
  // out a bearer valid for a month that CTFd has no way to revoke.
  if (claims.exp - claims.iat > WORKSHOP_TICKET_TTL_SECONDS) return null;

  return claims;
}
