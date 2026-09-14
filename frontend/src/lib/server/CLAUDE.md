# Key Server Services

- **`auth.ts`**: BetterAuth config (Prisma adapter, Microsoft OAuth, email OTP, admin plugin with impersonation)
- **`adminApi/`**: curated admin API: token auth (tier + write capability), quotas, audit log with before/after, operation catalogue, write implementations, two-step plan digest, MCP server (see above)
- **`services/adminStats/`**: the curated aggregates (cohort profile, school reach and lycée churn, attendance, the cross-campus comparison, closing insights and testimonials, feedback results, engagement, onboarding funnel and velocity, compliance, the operational queues, configuration state, the school-year review), each figure carrying its definition
- **`services/adminDigest.ts`**: weekly French digest to every admin-role login, built on `adminStats/`
- **`services/staffAdminService.ts`**: staff roster writes for `/staff/admin/users` (the role change moves `StaffProfile.staffRole` + `bauth_user.role` in one transaction)
- **`services/syncErrorService.ts`**: admin remediation of sync errors, including the extId rebind and its refusal branches
- **`services/onboardingService.ts`**: the onboarding transactions: parent-1 account provisioning, interest swap, rules signature (timestamps + XP facts + PDF job)
- **`infra/documentRenderer.ts`** - the one browser-render path: PDFs for what gets printed, PNGs for what gets looked at, both over the same page setup so a preview cannot disagree with the document it previews. Owns the page lifecycle and turns off **both script execution and the network**, so no caller can render a stored design with either switched off by forgetting to switch it on; no template wants page JS anyway (a QR code arrives as a data URI its caller built). Fonts therefore carry their own bytes (`templates/fonts.ts`, `@font-face` built from the `@fontsource` packages with `?inline`)
- **`services/diplomaGenerator.ts`** - certificates: takes the design off a `Diploma_Template` row, substitutes the `{placeholders}`, and renders one page per recipient
- **`services/syncService.ts`**: Salesforce worker sync → seeds `Talent` + upserts the `TalentSfImport` mirror (no-clobber; see Salesforce reconciliation)
- **`services/reconciliationService.ts`**: computes `Talent` ↔ `TalentSfImport` conflicts; accept/reject + CSV for `/staff/admin/sf-conflicts`
- **`services/schoolService.ts`** / **`annuaire.ts`**: lazy `School` resolution from UAI via the éducation-nationale annuaire
- **`services/anonymizationService.ts`**: RGPD anonymization job
- **`infra/browserPool.ts`**: pooled Puppeteer instances (max 5 concurrent, 60s idle timeout)
- **`usage/record.ts`**: the one usage recorder: fire-and-forget, server-only, composes the dedupe key, honours a talent's objection, and refuses rather than guesses when the salt is unset
- **`usage/rollup.ts`**: folds the monthly cube then purges the raw window, in that order
- **`services/adminStats/featureUsage.ts`** / **`staffActivity.ts`**: feature adoption per campus, and whether the team logs in at all
- **`usage/memberActivity.ts`**: the one named-member read, for the dialog on `/staff/admin/users`. Deliberately not an operation: `ops_staff_activity` answers the same question in counts with no names, and a named-member read reachable with a token would put per-employee behaviour behind a credential minted for figures
- **`db/scoped.ts`**: campus-scoped DB query helpers

---

Ce fichier porte la doctrine d'une surface. Les règles qui valent partout (philosophie, commandes, espaces, conventions, contraintes) vivent dans [`AGENTS.md`](../../../../AGENTS.md) à la racine du dépôt, qui nomme ce fichier.
