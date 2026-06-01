# Load testing — k6

Tests de montée en charge ciblant **preprod** (ou localhost).

## ⚠️ Pré-requis serveur

**Tout passe par l'API, à distance.** Aucun accès DB depuis la machine qui lance les tests : seed, manifest, cleanup et login se font via des endpoints `/api/test/*` gardés par `LOAD_TEST_SECRET`, qui font le travail DB sur l'environnement cible lui-même.

| Endpoint | Rôle |
|---|---|
| `POST /api/test/login-as` | forge une session BetterAuth pour un user existant (insert direct `bauth_session`, bypass OTP, cookie signé `better-call`) |
| `POST /api/test/seed-talents` | crée N talents jetables `@loadtest.invalid` (body `{count, start}`) |
| `GET  /api/test/manifest` | renvoie le pool que k6 échantillonne (talents, staff, events, …) |
| `POST /api/test/cleanup` | cascade-delete tous les `@loadtest.invalid` |

Les quatre sont **inactifs tant que `LOAD_TEST_SECRET` n'est pas défini côté serveur** (réponse 404 sinon), et exigent un bearer correct (401 sinon). C'est du **code applicatif** : il doit être déployé sur la cible (comme login-as). Un 404 sur seed/manifest = endpoints pas encore déployés.

```
# .env preprod uniquement — JAMAIS en prod
LOAD_TEST_SECRET=<token long aléatoire, openssl rand -hex 32>
```

## Layout

```
load/
├── README.md
├── run.sh                             ← launcher générique (list/seed/manifest/cleanup/<scenario>)
├── stress-2k.sh                       ← launcher dédié au flood 2000 users (seed→manifest→stress)
├── data.json                          ← écrit par `run.sh manifest` (GET /api/test/manifest), lu par les scénarios
└── k6/
    ├── lib/
    │   ├── auth.js                    ← loginAs() helper (avec retry)
    │   └── manifest.js                ← charge data.json + sampler round-robin
    └── scenarios/
        ├── smoke.js                   ← sanity check (3 VUs)
        ├── talent-home.js             ← GET / (200 talents)
        ├── cohort-view.js             ← /staff/dev/.../inscrits (50 staff)
        ├── minigame-leaderboard.js
        ├── admin-talents.js           ← /staff/admin/talents
        ├── signature-burst.js         ← signRules → OnboardingPdfJob
        ├── cockpit-presence.js        ← togglePresent
        ├── mixed.js                   ← talent reads + staff reads + cockpit writes
        └── stress-2k.js               ← 2000 users : storm d'inscription (1 signRules/talent) + contention staff répétée

frontend/src/routes/api/test/          ← endpoints serveur (login-as, seed-talents, manifest, cleanup)
frontend/src/lib/server/services/loadTestService.ts   ← logique DB partagée par ces endpoints
```

Les seuls outils requis côté machine : **k6** et **curl** (plus `python3` pour l'affichage des compteurs du manifest, optionnel).

## Workflow type

`BASE_URL` + `LOAD_TEST_SECRET` se lisent depuis le `.env` racine ; surcharge possible en CLI. Tout passe par `load/run.sh`.

### 1. Installer k6

```sh
brew install k6
```

### 2. Générer le manifest (snapshot des données de la cible)

```sh
BASE_URL=https://jump-preprod.epiboost.eu ./load/run.sh manifest
# SAMPLE=100 ./load/run.sh manifest   # pool plus large
```

`GET /api/test/manifest` côté serveur, écrit dans `load/data.json`. Comme le manifest vient de la cible, il reflète toujours la **même** base que k6 va taper — pas de désync local/preprod. À re-générer quand les fixtures changent.

### 3. (Optionnel — pour signature-burst / stress-2k) Seed le pool de talents jetables

```sh
COUNT=500 ./load/run.sh seed   # POST /api/test/seed-talents (chunké) + refresh manifest
```

Les talents seedés ont **tous les gates onboarding set sauf `rulesSignedAt`** — chaque signature les pousse à 100% mais peut être ré-amorcée par re-seed (idempotent).

### 4. Lancer un scénario

```sh
BASE_URL=https://jump-preprod.epiboost.eu ./load/run.sh talent-home
```

(`smoke` exige en plus `LOGIN_EMAIL=...`.)

### 5. Cleanup

```sh
./load/run.sh cleanup
```

`POST /api/test/cleanup` : supprime tous les `bauth_user` en `@loadtest.invalid` (cascade sur Talent, sessions, XpGrants, OnboardingPdfJobs).

### Raccourci : le flood 2000 users

```sh
BASE_URL=https://jump-preprod.epiboost.eu VUS=2000 HOLD=5m ./load/stress-2k.sh
```

Enchaîne seed → manifest → run, tout à distance. Le seed **réinitialise** l'état de signature : chaque VU signe donc une fois pour de vrai (et pas un simple rebond du guard d'onboarding). `./load/stress-2k.sh help` pour les options.

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
| `stress-2k.js` | 0→2000 VUs + 50 staff | `signRules` (1×/talent) + `togglePresent` | Storm d'inscription : `signRules` est terminal (1 signature par talent, puis lectures dashboard) ; staff répète `togglePresent` sur des lignes partagées. ⚠ `togglePresent` mute de **vraies** participations (pool manifest), non annulées par `cleanup`. Lancer via `stress-2k.sh`. |

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

**Queue PDF:** pas de drain manuel. `signRules` lance `void runOnboardingPdfJob` en fire-and-forget (Puppeteer sur le pod), donc la queue se vide d'elle-même pendant le run. Les jobs en **échec** se relancent depuis `/staff/admin/onboarding-pdfs`.

**Reset rapide entre runs de signature-burst** (sans cleanup complet):

```sh
COUNT=500 ./load/run.sh seed   # idempotent : remet rulesSignedAt à null + refresh manifest
```

**Stress max (trouver le breaking point):**

```sh
VUS=2000 HOLD=10m ./load/stress-2k.sh           # le scénario dédié
k6 run --vus 500 --duration 5m load/k6/scenarios/talent-home.js   # ou override un profil simple
```

## Sécurité

- `LOAD_TEST_SECRET` = "login as anyone" tant qu'il est actif. À **désactiver** côté serveur entre campagnes de test.
- Talents seedés taggés `@loadtest.invalid` → faciles à purger.
- Ne **jamais** activer `LOAD_TEST_SECRET` en production.
