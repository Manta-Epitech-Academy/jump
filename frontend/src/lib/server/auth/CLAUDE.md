# Auth and role gating

## Auth System

Uses **BetterAuth** (`src/lib/server/auth.ts`) with two methods:

- **Microsoft OAuth** for staff and admins (must be `@epitech.eu`)
- **Email OTP** (6-digit, sent via Resend) for students and parents

**The two doors are disjoint, and that is now enforced rather than described.**
It was not for a long time: the role filter lived in the `/login` page action,
and BetterAuth's own routes are mounted **under** it (`/api/auth/*`, which
`guards.ts` treats as public), so a code request followed by a code sign-in on a
staff address minted a full staff session - the Azure tenant restriction and its
MFA bypassed, against a code stored in plaintext, on an `admin` account that
carries impersonation of every talent. `disableSignUp: true` only ever stopped
account creation.

- **`resolveOtpIdentity`** (`server/auth/otpAudience.ts`) is the one answer to
  "may this address use the OTP door", read by the gate, by the server-side mint
  path and by the `/login` action, so the page and the routes underneath it
  cannot drift apart again. It is a **positive allowlist and staff-deny comes
  first**: a `StaffProfile` **or** a staff `bauth_user.role` refuses. Both halves
  earn their place - the profile is the truth about what someone can do, the
  column is what BetterAuth's admin plugin gates impersonation on, and testing
  `talent` first (as the action did) admits the row carrying both that bad
  Salesforce data produces.
- **`emailOtpAudienceGate`** (`server/auth/emailOtpAudienceGate.ts`) is a
  BetterAuth `before` hook over every path carrying `email-otp`, so an endpoint a
  future release adds is covered on arrival, inside the `/email-otp/` prefix or
  beside it (two of today's nine already are). It is **not** a check inside
  `sendVerificationOTP`, and that is the load-bearing part: the send endpoint
  writes the `bauth_verification` row **before** it looks the user up, and awaits
  the callback through `runInBackgroundOrAwait`, which swallows the rejection and
  still answers `200`. Refusing in the callback leaves a live code behind under
  the refused address. A `before` hook also covers `auth.api.*`, since both
  surfaces reach the endpoint through the same dispatcher.
- **A refusal discloses nothing, because it is not an answer of ours.** The hook
  substitutes an address BetterAuth has never seen (`.invalid`, one per request)
  and lets the plugin's own unknown-address path reply: `200 {success:true}` on
  the emitting routes under `disableSignUp`, `INVALID_OTP` on the consuming
  ones. Reproducing those two responses instead is the shape that shipped and
  had to be replaced, and the reason is the one a `before` hook cannot avoid: it
  runs ahead of body validation, so it would also have to answer for every
  request the endpoint rejects before its user lookup (`{email}` with no `type`,
  or `type: 'change-email'`), where a 400 for an eligible address against a 200
  for every other one discloses on an unauthenticated route precisely the bit
  the silent success exists to hide. Substituting keeps validation, error
  shapes and timing upstream where they belong; the parity is asserted per
  route, per malformed body, in `emailOtpAudience.integration.test.ts`.
- **The plugin's two server-only endpoints carry no path**, so a matcher cannot
  see them. `server/auth/otpSession.ts` owns both halves of the credential
  (`mintSigninOtp`, `establishOtpSession`) and checks the audience itself.
- **Opening a staff session locally, without Azure:** `POST /api/test/login-as`
  with `Authorization: Bearer $LOAD_TEST_SECRET`, then paste the returned cookie
  into the browser. No new mechanism and nothing to arm in production: the
  endpoint exists for the load-test driver, 404s unless `LOAD_TEST_SECRET` is set
  server-side, and `tests/e2e/auth.setup.ts` already mints every role's session
  through it for the same reason ("staff authenticate through Microsoft OAuth and
  talents through an emailed OTP, neither of which a headless run can walk").
  The OTP door used to be what stood in for this; it is not a substitute for a
  door being open in production.

Route guards in `src/lib/server/auth/guards.ts` enforce role-based access. Session data is loaded in `hooks.server.ts` into `event.locals` (user, session, staffProfile, talent).

Staff are routed by `StaffProfile.staffRole` (Prisma `StaffRole` enum: `admin`, `superdev`, `dev`). After login, staff redirect to their role-specific space. Guards block cross-space access and redirect to correct space. Role-to-path mapping lives in `src/lib/domain/staff.ts` (`getStaffRoleRedirectPath`).

| StaffRole         | Space                                |
| ----------------- | ------------------------------------ |
| `admin`           | `/staff/admin/`                      |
| `superdev`, `dev` | `/staff/dev/`                        |
| `null`            | blocked, shown "contact admin" error |

Client-side auth at `src/lib/auth-client.ts` (browser-side BetterAuth).

## Role gating

Inside a workspace, role-based gating goes through **one table** of named role groups in `src/lib/domain/permissions.ts`:

| Group            | Roles             | Use for                                                  |
| ---------------- | ----------------- | -------------------------------------------------------- |
| `devMember`      | `superdev`, `dev` | Dev workspace daily ops (participants, closings, update) |
| `realSendArmers` | `admin`           | Arming real outbound sends / login-redirect pin          |

- **Client:** `const canEdit = $derived(can('devMember', page.data.staffProfile?.staffRole))`, then apply one of the UI patterns below. Import: `$lib/domain/permissions`.
- **Server:** `requireStaffGroup(locals, 'devMember')`. Import: `$lib/server/auth/guards`. Call it in every mutating action, or at the top of a `load` to gate a whole route.

**There is no superdev-only group today.** `superdev` and `dev` are permission-identical; the only thing the enum still separates is which roles a superdev may invite (`INVITABLE_STAFF_ROLES`, a catalogue, not a gate). Add a group back to `STAFF_GROUPS` the day a lead-only action exists. Never inline a `['superdev']` array at a call site.

**UI pattern rule: pick one per site, do not mix:**

| Pattern           | When                                                     |
| ----------------- | -------------------------------------------------------- |
| Hide              | Nav entries to restricted destinations (sidebar, menus)  |
| Disable + tooltip | Mutating controls visible on shared screens              |
| Redirect / 403    | Direct URL access, via `requireStaffGroup` in the `load` |

---

Ce fichier porte la doctrine d'une surface. Les règles qui valent partout (philosophie, commandes, espaces, conventions, contraintes) vivent dans [`AGENTS.md`](../../../../../AGENTS.md) à la racine du dépôt, qui nomme ce fichier.
