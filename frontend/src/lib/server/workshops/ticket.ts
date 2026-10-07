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
 * Changing anything in it means changing both halves. The one addition so far,
 * the four session claims, was made so that either half could ship first: the
 * plugin reads claims with `.get` and lets an unknown one through, and accepts a
 * ticket that carries none of the four.
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

/** The widest session or campus key the plugin stores: a cuid with room to spare. */
const SESSION_KEY_MAX = 64;

/** The widest session or campus label the plugin stores. */
const SESSION_LABEL_MAX = 128;

/**
 * The Jump session a talent enters an activity under: the event their
 * participation was pinned to on first entry, and that event's campus.
 *
 * The plugin keeps each session to itself (its `audience.py`): an instance
 * serves several events over its life, reused by a campus from one request to
 * the next, shared by a season's camps, or kept up for a flagship subject, and
 * a talent is ranked among the people of their own event only. The campus is
 * for the plugin's staff pages. The labels are what the staff read there: an
 * event name and a campus name, nothing about the talent.
 */
export type WorkshopSession = {
  id: string;
  label: string;
  campusId: string;
  campusLabel: string;
};

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
  /**
   * The session, as four flat strings rather than an object so the plugin
   * checks each with the same one-line test as every other claim. All four or
   * none: Jump always sends them, and a ticket from before they existed carries
   * none, which the plugin accepts and files under no session.
   */
  session?: string;
  session_label?: string;
  campus?: string;
  campus_label?: string;
};

const SESSION_CLAIMS = [
  ['session', SESSION_KEY_MAX],
  ['session_label', SESSION_LABEL_MAX],
  ['campus', SESSION_KEY_MAX],
  ['campus_label', SESSION_LABEL_MAX],
] as const;

/**
 * Two keys from one secret, so compromising one direction is not a forging
 * capability in the other: a leaked callback key cannot mint an entry ticket.
 *
 * Each is the LOWERCASE HEX DIGEST AS AN ASCII STRING, not the raw bytes, and
 * that is part of the frozen contract rather than an implementation detail: the
 * plugin's `derived_key` returns `hexdigest().encode()` and uses it as the key of
 * the next HMAC. Raw bytes and their hex spelling are different keys and produce
 * different signatures, so getting this wrong refuses every ticket and every
 * callback with nothing to say why.
 */
export function workshopKeys(secret: string): {
  ticketKey: string;
  callbackKey: string;
} {
  return {
    ticketKey: createHmac('sha256', secret).update('jump/ticket').digest('hex'),
    callbackKey: createHmac('sha256', secret)
      .update('jump/callback')
      .digest('hex'),
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

function sign(payload: string, ticketKey: string): string {
  return b64url(createHmac('sha256', ticketKey).update(payload).digest());
}

export function mintWorkshopTicket(input: {
  talentId: string;
  displayName: string;
  slug: string;
  kid: string;
  secret: string;
  session: WorkshopSession;
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
    session: input.session.id,
    session_label: input.session.label.slice(0, SESSION_LABEL_MAX),
    campus: input.session.campusId,
    campus_label: input.session.campusLabel.slice(0, SESSION_LABEL_MAX),
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

  // All four session claims or none of them, each a non-empty string within
  // what the plugin stores. A partial set is refused rather than half-filed: an
  // account in a session with no campus would vanish from every staff filter.
  const present = SESSION_CLAIMS.filter(([key]) => claims[key] !== undefined);
  if (present.length !== 0 && present.length !== SESSION_CLAIMS.length)
    return null;
  for (const [key, max] of present) {
    const value = claims[key];
    if (typeof value !== 'string' || value.length === 0 || value.length > max)
      return null;
  }

  return claims;
}
