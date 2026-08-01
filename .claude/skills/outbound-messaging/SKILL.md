---
name: outbound-messaging
description: How Jump sends transactional email and SMS - the MAIL_PROVIDER / SMS_PROVIDER façades, and the dev-redirect system that keeps non-prod sends away from real recipients. Use when touching anything that sends mail or SMS (OTP, broadcasts, relances, parent/image-rights mails), when wiring or swapping a provider, when a send lands in the wrong inbox or reports `dev_redirect_dropped`, or when arming real sends from a non-prod environment.
---

# Outbound messaging (mail + SMS)

**The floor, always true:** mail and SMS are trapped unless `OUTBOUND_MODE=real`, which only prod
sets. Recipients are minors (RGPD). Never widen the gate to debug something.

## `MAIL_PROVIDER`

Picks the transactional mail backend. Lives behind a façade in `$lib/server/email/` — flipping the env swaps the active provider with no code change.

| Value              | Behavior                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| `resend` (default) | Send via the official Resend SDK. Batch cap = 100/call.                                                 |
| `mailjet`          | Send via Mailjet's REST v3.1 Send API (fetch, no SDK). Batch cap = 50/call (provider chunks transparently). |

`MAIL_FROM` is the sender address used regardless of provider; `RESEND_FROM_EMAIL` is kept as a fallback alias during the migration.

## Dev-redirect

Two concerns kept apart: the **gate** (`$lib/server/outbound.ts`) and the **destination** (`$lib/server/{email,sms}/dev-redirect.ts`).

- **The gate — `OUTBOUND_MODE` (`outboundTrapped()`).** One env var for **both** channels, **fail-safe**: only `OUTBOUND_MODE=real` reaches real recipients; anything else (unset, blank, typo) means `redirect` (trapped). So a forgotten var never mails/texts a minor — worst case is real users not getting mail, never the reverse. **Prod is the only place that sets `real`.** It's an env var, not a DB flag, on purpose: it's the one signal bound to the *environment* not the *data*, so it can't ride a `pg_dump` from prod into staging, and the running app can't flip it. (This replaced the old design where `EMAIL_DEV_RECIPIENTS`/`SMS_DEV_RECIPIENTS` each gated their own channel — set one, forget the other, and that channel quietly went live. Those vars are now pure fallback destinations, see below.)

- **The destination** — `resolveMailRouting` / `resolveSmsRouting` return a tagged `OutboundRouting` (`real` | `redirect` | `drop`), only consulted once trapped. Priority order:
  1. **`'bypass'`** (per-send `SendOptions.devRedirect`) → the real recipient. A single, explicit, human-typed **test-send** (the "Tester" button) — a real preview from dev/staging without a redeploy.
  2. **Armed real sends** (`$lib/server/armRealSends.ts`) → the real recipient. An **admin** (`realSendArmers` = `['admin']`) can **arm** real sends from the **settings dialog** (`StaffSettingsDialog`, opened from the admin profile dropdown — there is no standalone `/staff/settings` page; the route is action-only). While armed, every send *their own session* drives bypasses the trap. Gun safety: per-user (a signed cookie bound to their id — never another session or a cookieless background cron), auto-expiring (15 min), role-gated, loud (red banner via root layout, disarm button). Endpoint `POST /api/dev/real-sends`.
  3. **`string[]`** (per-send) → those addresses. Bulk broadcasts pass their **creator**'s configured list (or login email), resolved from the row so a worker-run send still lands with the right tester. (Bulk SMS has no such route — staff carry no phone — so it falls through to the env fallback.)
  4. **The acting staff member's personal list** — admins set their own dev-redirect emails + phones in the settings dialog (`StaffProfile.devRedirect{Emails,Phones}`). With no explicit control, the trap routes to the human driving the request (`requestContext.ts` `AsyncLocalStorage`, captured in `hooks.server.ts`): the **impersonator** when impersonating, else the logged-in staff. So an admin testing talent onboarding by impersonating gets the parent / image-rights mail in *their own* inbox.
  5. **The acting human's login email** (mail only) — default when no personal list is set.
  6. **The `*_DEV_RECIPIENTS` env fallback** — for sends with no request actor (cron jobs, anonymization, logged-out OTP).
  7. **`drop`** — trapped but none of the above resolved → the send is **suppressed**, surfaced as a permanent failure (`reason: 'dev_redirect_dropped'`), never leaked to the real recipient.

`SendOptions.devRedirect` is applied in the façade before the provider sees the payload, so it works uniformly across backends. **Recipients are minors (RGPD).** The gate (`OUTBOUND_MODE`) is the floor; set the `*_DEV_RECIPIENTS` fallbacks on any non-prod env that sends with no actor (cron/OTP) so those don't `drop`.

## `SMS_PROVIDER`

Picks the transactional SMS backend. Lives behind a façade in `$lib/server/sms/` (mirrors `$lib/server/email/`) — flipping the env swaps the active provider with no code change. Powers the SMS broadcast channel.

| Value           | Behavior                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `null` (default) | No provider wired. Sends fail loud and non-retryably, so an unconfigured prod surfaces "0 envoyés / N échecs" instead of a silent success. The relance UI disables the SMS channel and explains why. |
| `brevo`         | Brevo (ex-Sendinblue) transactional SMS via REST (fetch, no SDK). Requires `BREVO_API_KEY`. `SMS_SENDER` is the alphanumeric sender shown on the handset (Brevo caps it at 11 chars; default `Epitech`). |

`SMS_DEV_RECIPIENTS` is the SMS **fallback destination** (comma-separated; every listed number gets a copy), mirroring `EMAIL_DEV_RECIPIENTS`. It is **not** the gate — the gate is `OUTBOUND_MODE`, shared with mail (see the dev-redirect note above for the gate/destination split).

**SMS broadcasts.** SMS is a broadcast channel alongside mail (`services/broadcast/providers/sms.ts`). An SMS carries **no action link**: it names the recipient's own mailbox and tells them to check it. A recipient needs a usable phone (`noPhone` skip otherwise); numbers are normalized to Brevo's format by `$lib/domain/phone` → `toBrevoRecipient`. The onboarding relance escalation this channel was first built for is gone, so "relance" now survives only as broadcast-audience wording ("relancer les parents bloqués").
