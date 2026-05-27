# Rapport d'audit securite -- Jump (Epitech Academy)

**Date :** 2026-05-27
**Auditeur :** Claude Code (security-audit skill + plugins Trail of Bits)
**Scope :** `frontend/` -- audit complet OWASP Top 10
**Stack :** SvelteKit 2, Prisma 7, BetterAuth, PostgreSQL
**Contexte :** Production -- plateforme interne, donnees d'eleves mineurs (RGPD)

---

## Resume executif

L'application presente une architecture de securite mature : isolation multi-tenant via `scopedPrisma`, guards de route centralises, sanitisation HTML systematique (DOMPurify), headers de securite complets, et zero SQL brut. Les vulnerabilites identifiees sont des oublis localises (endpoints qui contournent le scoping campus, absence de rate limiting sur l'OTP) plutot que des failles systemiques. La priorite absolue est le rate limiting OTP (comptes d'eleves mineurs) et la completion du service d'anonymisation (conformite RGPD).

---

## Resultats

### CRITIQUE -- Corriger immediatement

| # | Vulnerabilite | OWASP | CWE | Fichier:ligne | Impact | Fix recommande |
|---|---|---|---|---|---|---|
| C1 | **Pas de rate limiting sur la verification OTP** | A07 | CWE-307 | `src/routes/(talent)/login/+page.server.ts:47,102` | OTP 6 chiffres = 1M combinaisons. Sans throttle, brute-force possible en minutes. Takeover de comptes d'eleves mineurs. | Ajouter rate limiting (5 tentatives/IP/10min) via middleware ou `@upstash/ratelimit`. Le `allowedAttempts` BetterAuth est par-OTP, pas par-IP. |
| C2 | **Fastlogin JWT sans usage unique ni revocation** | A07 | CWE-307 | `src/routes/fastlogin/+server.ts:22` | Tokens valides 60 jours, pas de nonce en base. Un lien intercepte (email forwarde, logs, referrer) donne un acces persistant. | Ajouter un `jti` en base, revoquer a la premiere utilisation. Reduire le TTL a 7-14 jours. |
| C3 | **Anonymisation RGPD incomplete** | A01 | CWE-212 | `src/lib/server/services/anonymizationService.ts:32-47` | Champs oublies : `civilite`, `parentNom/Prenom`, `parent2*`, `highSchoolNameManual`, `schoolId`, `freeText`, `setupDescription`. La ligne `TalentSfImport` n'est pas supprimee. Non-conformite Art. 17 RGPD. | Ajouter tous les champs PII a l'anonymisation + supprimer `TalentSfImport` et `TalentInterest` associes. |

### HAUTE -- Corriger avant prochaine mise en production

| # | Vulnerabilite | OWASP | CWE | Fichier:ligne | Impact | Fix recommande |
|---|---|---|---|---|---|---|
| H1 | **IDOR sur `/api/diploma` -- pas de scoping campus** | A01 | CWE-639 | `src/routes/api/diploma/+server.ts:20` | Tout staff authentifie peut generer le diplome d'un eleve de n'importe quel campus en devinant un `participationId`. Fuite PII mineurs. | Ajouter `where: { campusId: getCampusId(locals) }` ou utiliser `scopedPrisma`. |
| H2 | **Comparaison de tokens vulnerables au timing attack** | A07 | CWE-208 | `src/routes/api/jobs/anonymize/+server.ts:11` + 6 autres endpoints API | Les 7 endpoints worker/cron comparent `CRON_SECRET`/`WORKER_API_TOKEN` avec `!==`. Le codebase a deja `timingSafeEqual` dans `hmac.ts`. | Remplacer par comparaison constante : `import { timingSafeEqual } from 'node:crypto'`. |
| H3 | **IDOR sur `/api/avatars/[userId]`** | A01 | CWE-639 | `src/routes/api/avatars/[userId]/+server.ts:11` | Tout utilisateur authentifie accede a l'avatar de n'importe quel autre utilisateur via un `userId` arbitraire. | Restreindre : verifier `params.userId === locals.user.id` ou role staff du meme campus. |
| H4 | **Upload fichiers sans sanitisation de nom ni allowlist de type** | A05 | CWE-434 | `src/routes/(staff)/staff/admin/files/+page.server.ts:36` | Le `file.name` original est utilise tel quel dans la cle S3. Peut contenir `../`, null bytes, noms tres longs. Aucune restriction de type MIME. | Sanitiser : `file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)`. Ajouter allowlist (PDF, images, CSV). |
| H5 | **Messages d'erreur internes leakes aux clients** | A05 | CWE-209 | `src/routes/api/subjects/import/+server.ts:37` + 2 autres | `err.message` (paths, erreurs DB) renvoye en reponse HTTP. | Toujours renvoyer `throw error(500, 'Internal Server Error')`. Logger le detail cote serveur uniquement. |

### MOYENNE -- A planifier

| # | Vulnerabilite | OWASP | CWE | Fichier:ligne | Impact | Fix recommande |
|---|---|---|---|---|---|---|
| M1 | **ODSQL injection dans `searchAnnuaire`** | A03 | CWE-943 | `src/lib/server/annuaire.ts:48` | Echappement par backslash invalide en ODSQL (qui utilise le doublage `''`). Contournement du filtre `type_etablissement="Lycee"`. | Remplacer `replace(/'/g, "\\'")` par `replace(/'/g, "''")`. Ajouter validation longueur. |
| M2 | **ODSQL injection dans `fetchSchoolByUai`** | A03 | CWE-943 | `src/lib/server/annuaire.ts:92` | Guillemets doubles non echappes dans une clause entre `"`. Un UAI forge peut injecter des operateurs ODSQL. | Echapper `"` : `replace(/"/g, '""')`. Ajouter regex Zod : `z.string().regex(/^[0-9]{7}[A-Z]$/)`. |
| M3 | **CSP `script-src 'unsafe-inline'`** | A05 | CWE-16 | `src/hooks.server.ts:32` | Neutralise la protection CSP contre XSS. Justifie par Umami mais affaiblit la defense en profondeur. | Migrer vers nonces CSP via `kit.csp`. Si Umami l'exige, isoler `unsafe-inline` aux pages qui le chargent. |
| M4 | **Directives CSP manquantes** | A05 | CWE-1021 | `src/hooks.server.ts:30-39` | Pas de `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Vecteurs Flash/base-tag/form hijacking ouverts. | Ajouter les 3 directives au header CSP. |
| M5 | **Pas d'audit trail pour les mutations admin** | A09 | CWE-778 | `src/routes/(staff)/staff/admin/users/+page.server.ts` | Changements de role, suppressions, invitations sans trace. Non-conformite RGPD pour donnees de mineurs. | Creer table `AuditLog` + service avec `actorId`, `action`, `targetId`, `timestamp`. |
| M6 | **OTP stocke en clair** | A02 | CWE-256 | `src/lib/server/auth.ts:66` | `resendStrategy: 'reuse'` necessite un OTP non-hashe. Un acces DB expose les OTP actifs. | Documenter le risque. Evaluer `storeOTP: 'hashed'` si la UX le permet. Nettoyer agressivement les OTP expires. |
| M7 | **Endpoint `/api/lycees` sans authentification** | A01 | CWE-306 | `src/routes/api/lycees/+server.ts:5` | Proxy ouvert vers l'API gouvernementale. Risque de scraping/abus, rate-limiting de l'API externe. | Ajouter `if (!locals.user) return json([], { status: 401 })`. |
| M8 | **`JSON.parse` sans validation sur import/templates** | A08 | CWE-502 | `src/routes/(staff)/staff/dev/events/import/+page.server.ts:62` | Cast `as ImportAction[]` sans validation runtime. JSON malformed = 500 avec stack trace. | Wrapper dans try/catch + valider avec un schema Zod. |
| M9 | **`{@html description}` sans sanitisation dans EmptyState** | A03 | CWE-79 | `src/lib/components/EmptyState.svelte:47` | Actuellement appele avec du texte hardcode, mais l'interface accepte n'importe quel string. XSS latent. | Remplacer par `{description}` (plain text) ou ajouter `DOMPurify.sanitize()`. |

### BASSE / Informationnel

| # | Observation | OWASP | Fichier:ligne | Recommandation |
|---|---|---|---|---|
| B1 | **Impersonation admin dure 1h** | A07 | `src/lib/server/auth.ts:45` | Reduire a 15-30min. Ajouter indicateur UI et warning d'expiration. |
| B2 | **Session de 14 jours** | A07 | `src/lib/server/auth.ts:85` | Envisager 7 jours ou idle timeout pour une app gerant des mineurs. |
| B3 | **`robots.txt` autorise tout le crawling** | A05 | `frontend/static/robots.txt:2` | Plateforme interne : `Disallow: /` pour bloquer l'indexation. |
| B4 | **Erreur silencieuse sur `lastActiveAt`** | A09 | `src/hooks.server.ts:182` | `.catch(() => {})` masque les pannes DB. Logger en warn. |
| B5 | **Docker runtime copie tout `node_modules`** | A06 | `frontend/Dockerfile:56` | Utiliser `bun install --production` pour le stage runtime. |
| B6 | **`style-src 'unsafe-inline'`** | A05 | `src/hooks.server.ts:33` | Risque faible (exfiltration CSS). Acceptable avec Tailwind. |
| B7 | **Preview broadcast sans auth explicite** | A01 | `src/routes/(staff)/staff/admin/broadcasts/new/preview/+server.ts:28` | Le hook guard protege la route, mais defense en profondeur : ajouter un check `locals.staffProfile` explicite. |
| B8 | **Action `download` asymetrique** | A01 | `src/routes/(staff)/staff/admin/files/+page.server.ts:77` | `upload`/`delete` verifient `staffProfile`, `download` non. Ajouter le meme check par coherence. |

---

## Dependances et CVE

```
$ bun audit
0 vulnerabilites connues
```

Aucune CVE identifiee dans l'arbre de dependances actuel. Les overrides dans `package.json` pinnent proactivement les dependances transitives.

---

## Points positifs

| Pratique | Detail |
|----------|--------|
| **Zero SQL brut** | Aucun `$queryRaw`/`$executeRaw`. Toutes les requetes passent par les builders type-safe Prisma. |
| **Isolation multi-tenant** | `scopedPrisma()` injecte/verifie `campusId` sur toutes les operations CRUD des modeles principaux. |
| **Guards centralises** | `applyRouteGuards()` + `STAFF_GROUPS` + `requireStaffGroup()` : architecture RBAC coherente et maintenable. |
| **Sanitisation HTML systematique** | Chaque `{@html}` precede de `DOMPurify.sanitize()`. `broadcastMarkdown.ts` bloque en plus les `javascript:` URIs. |
| **Headers de securite complets** | HSTS (1 an + includeSubDomains), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy. |
| **HMAC timing-safe + anti-replay** | Callback minigame : HMAC-SHA256, fenetre 300s, `timingSafeEqual`. |
| **Separation audience JWT** | Tokens fastlogin talent vs parent : audiences distinctes (`jump:fastlogin` vs `jump:parent_fastlogin`). |
| **Ownership checks talent** | `assertStudentOwns()` verifie la propriete des ressources avant modification. |
| **Ownership parent-enfant** | Routes parent verifient `child.parentEmail === locals.user.email`. |
| **Role refresh par requete** | `hooks.server.ts` relit le role depuis la DB a chaque requete, empechant l'escalade via session perimee. |
| **Fail-closed sur tokens absents** | `if (!cronSecret \|\| token !== cronSecret)` rejette quand l'env var n'est pas definie. |
| **Validation Zod + Superforms** | Validation server-side systematique sur les formulaires structures. |
| **Pas d'eval/exec** | Aucun `eval()`, `new Function()`, `child_process` avec input utilisateur. |
| **Pas de SSRF** | Tous les fetches serveur pointent vers des URLs hardcodees. |
| **Zero secrets dans l'historique git** | `git log --all -p -- '*.env' '*.key' '*.pem'` : propre. |
| **Sanitisation noms fichiers PDF** | `Content-Disposition` : `replace(/[^a-zA-Z0-9]/g, '')` sur les noms d'eleves. |

---

## Score global : 7.0 / 10

| Categorie OWASP | Note | Justification |
|---|---|---|
| A01 Broken Access Control | 6/10 | Bon systeme RBAC + scopedPrisma, mais IDOR confirmes sur diploma et avatars |
| A02 Cryptographic Failures | 8/10 | Secrets bien geres, HMAC correct. OTP plaintext est un compromis documente |
| A03 Injection | 8/10 | Zero SQL brut, DOMPurify partout. ODSQL injection mineure sur l'annuaire |
| A04 Insecure Design | 5/10 | Pas de rate limiting sur OTP ni fastlogin -- critique pour des comptes de mineurs |
| A05 Security Misconfiguration | 7/10 | Headers solides. CSP affaibli par unsafe-inline. robots.txt trop permissif |
| A06 Vulnerable Components | 9/10 | Zero CVE, overrides proactifs, image Docker avec apk upgrade |
| A07 Auth Failures | 6/10 | BetterAuth bien configure, mais OTP brute-force et fastlogin sans revocation |
| A08 Software & Data Integrity | 7/10 | HMAC sur webhooks. JSON.parse sans validation sur quelques endpoints |
| A09 Logging & Monitoring | 5/10 | Pas d'audit trail admin, erreurs silencieuses, PII dans les logs |
| A10 SSRF | 10/10 | Aucun fetch vers des URLs utilisateur |

---

## Prochaines etapes

| Priorite | Action | Effort | Finding |
|---|---|---|---|
| 1 | Rate limiting OTP + fastlogin | 1-2j | C1, C2 |
| 2 | Completer l'anonymisation RGPD | 0.5j | C3 |
| 3 | Corriger IDOR diploma + avatars | 0.5j | H1, H3 |
| 4 | `timingSafeEqual` sur les 7 endpoints API | 0.5j | H2 |
| 5 | Sanitiser uploads + allowlist types | 0.5j | H4 |
| 6 | Corriger echappement ODSQL annuaire | 0.5j | M1, M2 |
| 7 | Ajouter directives CSP manquantes | 0.5j | M4 |
| 8 | Auth sur `/api/lycees` | 15min | M7 |
| 9 | Audit trail admin | 2-3j | M5 |
| 10 | Evaluer migration CSP nonces | 1j | M3 |

---

## Avertissement

Ce rapport a ete genere par un outil automatise (Claude Code avec le skill security-audit et les plugins Trail of Bits) et constitue une aide a l'audit, pas un audit professionnel certifie. Les findings doivent etre relus et valides par un developpeur ou un expert securite avant toute action corrective. Certains resultats peuvent etre des faux positifs ou ne pas s'appliquer a votre contexte specifique. Ne transmettez pas ce rapport tel quel a une equipe technique sans l'avoir prealablement verifie.
