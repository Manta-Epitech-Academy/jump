# Load testing — k6

Tests de montée en charge ciblant **preprod** (ou localhost).

## ⚠️ Pré-requis serveur

L'endpoint `POST /api/test/login-as` (qui forge des sessions BetterAuth pour les VUs k6) n'est actif **que si `LOAD_TEST_SECRET` est défini côté serveur**. Sans elle, l'endpoint répond 404.

```
# .env preprod uniquement — JAMAIS en prod
LOAD_TEST_SECRET=<token long aléatoire, openssl rand -hex 32>
```

L'endpoint insère directement dans `bauth_session` (bypass total de l'OTP) et signe le cookie au format `better-call` — aucune contention à grande échelle.

## Layout

```
load/
├── README.md
├── data.json                          ← généré par manifest.ts, lu par tous les scénarios
└── k6/
    ├── lib/
    │   ├── auth.js                    ← loginAs() helper
    │   └── manifest.js                ← charge data.json + sampler round-robin
    └── scenarios/
        ├── smoke.js                   ← sanity check (3 VUs)
        ├── talent-home.js             ← GET / (200 talents)
        ├── cohort-view.js             ← /staff/dev/.../inscrits (50 staff)
        ├── minigame-leaderboard.js
        ├── admin-talents.js           ← /staff/admin/talents
        ├── signature-burst.js         ← signRules → OnboardingPdfJob
        ├── cockpit-presence.js        ← togglePresent
        └── mixed.js                   ← talent reads + staff reads + cockpit writes

frontend/scripts/load-test/            ← Bun + Prisma (conventionnellement avec les autres scripts DB du projet)
├── manifest.ts                        ← fetch preprod data → load/data.json
├── seed-load-talents.ts               ← crée N talents @loadtest.invalid pour les writes
└── cleanup.ts                         ← supprime tout ce que les seeds ont créé
```

## Workflow type

### 1. Installer k6

```sh
brew install k6
```

### 2. Générer le manifest (snapshot des données preprod)

```sh
bun --env-file=../.env scripts/load-test/manifest.ts   # from frontend/
# SAMPLE=100 bun --env-file=../.env scripts/load-test/manifest.ts   # from frontend/   # pool plus large
```

Affiche les compteurs de ce qui a été récupéré (talents, staff par role, events, activités, participations, publications). À re-générer chaque fois que les fixtures preprod changent.

### 3. (Optionnel — pour signature-burst) Seed le pool de talents jetables

```sh
COUNT=500 bun --env-file=../.env scripts/load-test/seed-load-talents.ts   # from frontend/
bun --env-file=../.env scripts/load-test/manifest.ts   # from frontend/   # rafraîchit data.json pour inclure le pool seedé
```

Les talents seedés ont **tous les gates onboarding set sauf `rulesSignedAt`** — chaque signature les pousse à 100% mais peut être ré-amorcée par re-seed (idempotent).

### 4. Lancer un scénario

```sh
k6 run \
  -e BASE_URL=http://localhost:5173 \
  -e LOAD_TEST_SECRET=$LOAD_TEST_SECRET \
  load/k6/scenarios/talent-home.js
```

### 5. Cleanup

```sh
bun --env-file=../.env scripts/load-test/cleanup.ts   # from frontend/
```

Supprime tous les `bauth_user` en `@loadtest.invalid` (cascade sur Talent, sessions, XpGrants, OnboardingPdfJobs).

## Scénarios

| Scénario | Profil charge | Endpoint principal | Notes |
|---|---|---|---|
| `smoke.js` | 3 VUs, 9 iter | `/` | Sanity check. Exige `LOGIN_EMAIL=...`. |
| `talent-home.js` | 0→200 VUs en 3min | `GET /` | Hotspot: queries multiples (planning, minigame eligibility, etc.). |
| `cohort-view.js` | 0→50 VUs | `/staff/dev/.../inscrits` | Page la plus lourde (~200 students × interests × school joins). |
| `minigame-leaderboard.js` | 0→150 VUs | `/minigames/[id]/leaderboard` | Sollicité après chaque play. |
| `admin-talents.js` | 20 VUs, 1min | `/staff/admin/talents?page=N` | Listing global (pas de scope campus). |
| `signature-burst.js` | 50 VUs × `COUNT` iter | `POST /onboarding?/signRules` | Stresse la queue PDF. Requiert pool seedé. |
| `cockpit-presence.js` | 10 VUs, 1min | `POST .../togglePresent` | Mutation présence + recompute XP. |
| `mixed.js` | 3 scénarios concurrents | mix lectures+écritures | Ratio ~70%/30%, le plus proche du réel. |

Tous (sauf `smoke`) utilisent `data.json` — pas de variables d'env à passer.

## Métriques & observation

k6 sort un résumé à la fin (p50/p95/p99, RPS, error rate). Les `thresholds` font échouer le run si dépassés.

Pour pousser vers Grafana:

```sh
k6 run --out experimental-prometheus-rw=http://localhost:9090/api/v1/write ...
```

**À surveiller côté preprod pendant un test:**

- **Postgres** — `pg_stat_statements`, slow queries, contention sur `bauth_session`.
- **App container** — CPU/mem, GC pauses.
- **Browser pool (Puppeteer)** — capé à 5 concurrents; saturation visible via les logs `[onboarding-pdf-job]`.
- **OnboardingPdfJob queue** — `/staff/admin/onboarding-pdfs` montre la taille en temps réel.
- **Garage S3** — espace disque sur preprod (chaque signature = 1 PDF de quelques KB).
- **Mailjet/Resend** — vérifier que `EMAIL_DEV_RECIPIENTS` est set (sinon les parents seedés reçoivent de vrais mails).

## Quelques recettes utiles

**Drainer la queue PDF après signature-burst:**

```sh
curl -X POST $BASE_URL/api/jobs/onboarding-pdfs \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Reset rapide entre runs de signature-burst** (sans cleanup complet):

```sh
bun --env-file=../.env scripts/load-test/seed-load-talents.ts   # from frontend/   # idempotent, remet rulesSignedAt à null
bun --env-file=../.env scripts/load-test/manifest.ts   # from frontend/
```

**Stress max (trouver le breaking point):**

```sh
# Override le profil avec --vus + --duration
k6 run --vus 500 --duration 5m load/k6/scenarios/talent-home.js
```

## Sécurité

- `LOAD_TEST_SECRET` = "login as anyone" tant qu'il est actif. À **désactiver** côté serveur entre campagnes de test.
- Talents seedés taggés `@loadtest.invalid` → faciles à purger.
- Ne **jamais** activer `LOAD_TEST_SECRET` en production.
