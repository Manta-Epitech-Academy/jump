# Cahier des charges — Mini-jeux (`minigames`)

> Statut : draft v1 — issu de `game.txt` + clarifications du 2026-05-06.
> Application externe associée : `jump-games` (cf. son `INTEGRATION.md`).

---

## 1. Contexte & objectif

Rendre la plateforme Jump plus ludique en proposant aux talents un **mini-jeu du jour** publié automatiquement. L'application `jump-games` (déployée séparément) embarque les jeux ; `jump` orchestre publication, éligibilité, historique et classements.

Bénéfices ciblés :
- Augmenter la rétention quotidienne des talents.
- Récompenser la présence (lien avec l'émargement).
- Donner aux péda et admins un outil d'animation.

---

## 2. Architecture (rappel)

```
┌────────┐  1. mint JWT          ┌─────────────┐
│  jump  │ ────────────────────► │  jump-games │
│        │  2. iframe ?token=…   │   (iframe)  │
│        │  3. POST callback     │             │
│        │ ◄──────────────────── │             │
└────────┘                       └─────────────┘
```

- **Iframe** : `jump-games` embarqué dans une page Jump.
- **Auth iframe** : JWT HS256 court (5 min, single-use via `jti`).
- **Callback** : `jump-games` POST le résultat signé HMAC-SHA256.
- Toute la logique anti-triche est côté `jump-games`. Jump fait confiance au callback **après vérif HMAC**.

Détails techniques (claims, format HMAC, headers) : voir `jump-games/INTEGRATION.md`.

---

## 3. Modèle de données

### 3.1 `MinigameConfig`

Définition admin d'un jeu disponible.

| Champ         | Type        | Description                                                |
|---------------|-------------|------------------------------------------------------------|
| `game`        | string (PK) | Identifiant aligné avec `jump-games` (`minesweeper`, `tango`) |
| `levelCount`  | int         | Nombre de niveaux dispos (saisi admin)                     |
| `weight`      | int         | Poids pour le tirage pondéré (≥ 1)                         |
| `scoringType` | enum        | `SCORE` (tri desc) \| `CHRONO` (tri asc)                   |
| `enabled`     | bool        | Désactiver sans supprimer                                  |

### 3.2 `MinigamePublication`

Niveau actif courant + historique.

| Champ          | Type        | Description                                              |
|----------------|-------------|----------------------------------------------------------|
| `id`           | uuid (PK)   |                                                          |
| `game`         | string      | FK logique → `MinigameConfig.game`                       |
| `level`        | int         | ∈ `1..config.levelCount` au moment du tirage             |
| `publishedAt`  | timestamp   | Quand la publication devient active                      |
| `forcedById`   | userId?     | Renseigné si publication forcée par un admin             |

La publication "active" = la plus récente par `publishedAt`.

### 3.3 `MinigameAttempt`

Une ligne par (talent, publication).

| Champ           | Type        | Description                                            |
|-----------------|-------------|--------------------------------------------------------|
| `id`            | uuid (PK)   |                                                        |
| `talentId`      | string (FK) |                                                        |
| `publicationId` | uuid (FK)   |                                                        |
| `eventId`       | string (FK) | Event du talent au mint (denormalisé pour le leaderboard) |
| `status`        | enum        | `PENDING` (JWT minté), `DONE`, `INVALID`               |
| `score`         | int?        | `null` si non applicable                               |
| `chrono`        | int?        | Millisecondes (renseigné au callback)                  |
| `valid`         | bool?       | Renseigné au callback                                  |
| `startedAt`     | timestamp   | Mint du JWT                                            |
| `finishedAt`    | timestamp?  | Réception du callback                                  |
| `jti`           | string      | UUID du JWT (clé d'idempotence)                        |

Contraintes :
- **Unique** `(talentId, publicationId)` → tentative unique.
- **Unique** `jti` → idempotence callback.

### 3.4 `EventMinigameSettings`

| Champ        | Type        | Description                            |
|--------------|-------------|----------------------------------------|
| `eventId`    | string (PK) | FK → `Event`                           |
| `enabled`    | bool        | Toggle péda                            |
| `updatedById`| userId?     |                                        |
| `updatedAt`  | timestamp   |                                        |

Absence de ligne = `enabled = false` (default off).

---

## 4. Règles métier

### 4.1 Éligibilité talent (mint du JWT)

Toutes les conditions doivent être vraies :

1. Le `Talent` est rattaché à un `Event` courant.
2. Le flag campus `minigames` est actif sur le campus de l'event.
3. `EventMinigameSettings.enabled = true` pour cet event.
4. Il existe **au moins un émargement passé** sur cet event (sinon → bloqué).
5. Sur l'**émargement passé le plus proche** auquel ce talent était attendu, il est marqué `présent`.
6. Le talent n'a pas déjà de `MinigameAttempt` sur la publication active (`PENDING`, `DONE` ou `INVALID`).
7. Une publication active existe.

Échec → message UI explicite (cf. §5.1).

### 4.2 Cron de publication

Job journalier (1 publication / jour, fenêtre configurable).

Algorithme :
1. Lister les `MinigameConfig` avec `enabled = true` ET `levelCount > 0`.
2. Récupérer la publication active.
3. **Exclure** son `game` de la liste.
4. Tirage **pondéré** sur les restants (par `weight`).
5. Tirage uniforme d'un `level` ∈ `1..config.levelCount`.
6. Insère `MinigamePublication` avec `publishedAt = now`.

Cas limites :
- Si ≤ 1 config dispo après exclusion → log warning, **ne publie pas**.
- Si aucune publication active n'existe encore → step 3 sautée.

### 4.3 Publication forcée (admin)

Crée une `MinigamePublication` avec `forcedById`. Pas de contrainte d'unicité quotidienne (un admin peut surclasser le cron). La nouvelle devient automatiquement active.

### 4.4 Tentative unique

**Une partie = une partie.** Le callback de `jump-games` clôt la tentative quel que soit le résultat (`valid=true`, `valid=false`, annulation). Aucun replay sur la même publication, même après un `INVALID`.

### 4.5 Idempotence du callback

Clé : `jti`. Si une `MinigameAttempt` existe déjà avec ce `jti` et `status ∈ {DONE, INVALID}`, retourner `200 {ok: true}` sans rien modifier.

### 4.6 Leaderboard

- Scope : tous les `MinigameAttempt` avec `status = DONE`, `valid = true`, `eventId = currentEvent`, `publicationId = active`.
- Tri : selon `scoringType` du `MinigameConfig` du jeu :
  - `SCORE` → `score DESC, chrono ASC` (tie-break)
  - `CHRONO` → `chrono ASC`
- Affichage : pseudo / prénom du talent + score et/ou chrono. Highlight du talent courant.

---

## 5. Interfaces utilisateur

### 5.1 Talent — Dashboard

Sous la card XP, **card "Mini-jeu du jour"** :

| État                                   | Affichage                                                                            |
|----------------------------------------|--------------------------------------------------------------------------------------|
| Flag campus off                        | Card masquée                                                                         |
| Toggle event off                       | Card masquée                                                                         |
| Pas d'émargement passé                 | "Le mini-jeu se débloque au premier émargement"                                      |
| Absent au dernier émargement           | "Tu dois être présent à l'émargement pour jouer"                                     |
| Aucune publication active              | Card masquée (ou "Bientôt disponible…")                                              |
| Éligible, pas encore joué              | Nom du jeu + niveau + bouton **Jouer**                                               |
| Tentative `PENDING` (JWT minté)         | "Reprendre la partie" → ré-affiche l'iframe (nouveau JWT)                            |
| Tentative `DONE` ou `INVALID`           | Score / chrono + bouton **Voir le classement**                                       |

### 5.2 Talent — Page de jeu

Route : `(talent)/minigames/[publicationId]`.
Mint JWT côté serveur dans le `+page.server.ts`, passe le token au client, affiche l'iframe.

```html
<iframe
  src="{JUMP_GAMES_URL}/?token={token}"
  sandbox="allow-scripts allow-same-origin"
  referrerpolicy="no-referrer"
  allow="fullscreen"
  style="width:100%;height:720px;border:0;"
/>
```

Si l'utilisateur recharge → le `+page.server.ts` mint un nouveau JWT (sauf si la tentative est déjà `DONE`/`INVALID`, auquel cas redirect vers le dashboard).

### 5.3 Talent — Leaderboard

Modale ou page (à arbitrer). Liste des participants de l'event ayant joué la publication active, triée selon `scoringType`.

### 5.4 Péda — `/staff/pedago/events/[id]/minigames`

- Toggle "Activer les mini-jeux pour cet event" (group `pedaMember`).
- Leaderboard de la publication active.
- Historique des publications passées de l'event (avec leaderboards correspondants).

### 5.5 Admin — `/staff/admin/minigames`

Onglets :
1. **Jeux** : CRUD `MinigameConfig` (nom, levelCount, weight, scoringType, enabled).
2. **Publications** : historique chronologique. Par publication : jeu, level, `publishedAt`, nb tentatives `DONE`, score moyen, chrono moyen, forcée par.
3. **Forcer** : sélecteur jeu + level → crée une publication immédiate.

Group `admin` requis.

---

## 6. Endpoints

| Méthode | Path                                                  | Auth         | Rôle                                                |
|---------|-------------------------------------------------------|--------------|-----------------------------------------------------|
| POST    | `/api/minigames/mint`                                 | talent       | Vérifie l'éligibilité, crée `MinigameAttempt PENDING`, renvoie le JWT |
| POST    | `/api/minigames/callback`                             | HMAC         | Vérifie signature, met à jour la tentative         |
| GET     | `/api/minigames/leaderboard?publicationId=…`          | talent/péda  | Leaderboard scopé event                             |
| POST    | `/staff/pedago/events/[id]/minigames` (form action)   | `pedaMember` | Toggle event                                        |
| POST    | `/api/jobs/publish-minigame`                          | `Bearer CRON_SECRET` | Cron de publication                          |
| POST    | `/staff/admin/minigames` (form action `?/forcePublish`) | `admin`    | Forcer une publication                              |
| CRUD    | `/staff/admin/minigames/games`                        | `admin`      | Gestion `MinigameConfig`                            |

---

## 7. Configuration & secrets

`.env` à compléter :

```
JUMP_GAMES_URL=https://games.jump.example
JUMP_GAMES_SECRET=<32 bytes b64>
```

`JUMP_GAMES_SECRET` est utilisé à la fois pour signer le JWT (jump → jump-games)
et vérifier la signature HMAC du callback (jump-games → jump). Côté `jump-games`,
configurer la même valeur pour `JWT_INTRA_SECRET` et `CALLBACK_SECRET`.

L'issuer (`intra`) et l'audience (`jump-games`) sont hardcodés dans le code
comme constantes du protocole — pas configurables.

`CRON_SECRET` (déjà existant) sert pour le job de publication.

À communiquer à l'équipe `jump-games` :
- `INTRA_ORIGIN` (CSP frame-ancestors) — scheme + host + port pour prod, staging et previews.
- `INTRA_CALLBACK_URL` (URL publique de l'endpoint callback).

---

## 8. Feature flag

Nouveau flag dans `src/lib/domain/featureFlags.ts` :

```ts
minigames: {
  key: 'minigames',
  kind: 'capability',
  defaultEnabled: false,
}
```

Override par campus via la table `CampusFeatureFlag` existante. Toutes les pages/routes minigames passent par `requireFlag(locals, 'minigames')`.

---

## 9. Sécurité

- `JUMP_GAMES_SECRET` côté **serveur uniquement**.
- Mint JWT uniquement après validation complète de §4.1.
- Vérification du callback :
  - lecture du **raw body**,
  - timing-safe compare (`crypto.timingSafeEqual`),
  - fenêtre de fraîcheur 5 min sur `X-Timestamp`.
- Iframe : `sandbox="allow-scripts allow-same-origin"`, `referrerpolicy="no-referrer"`. Pas de `allow-top-navigation`.
- `playerId` du JWT = `Talent.id` (pas l'email, pas le nom).
- Idempotence callback via `jti` unique.
- Aucune nouvelle PII collectée → conforme RGPD (mineurs sur la plateforme).

---

## 10. Hors-scope v1

- Notification push / email lors d'une nouvelle publication.
- Historique perso des tentatives du talent (au-delà de la publication active).
- Classement inter-events.
- Récompenses XP pour la performance en mini-jeu (la table le permet pour une v2).
- Replay / multi-essais.

---

## 11. Risques & dépendances

| Risque                                       | Mitigation                                              |
|----------------------------------------------|---------------------------------------------------------|
| `jump-games` indispo                         | UI d'erreur explicite ("Mini-jeu indisponible")         |
| CSP `frame-ancestors` mal configurée         | Coordonner ops dès la mise en preview                   |
| ≤ 2 jeux configurés                          | Alternance stricte forcée, poids sans effet (acceptable) |
| Callback perdu (timeout réseau)              | Retry 3× côté `jump-games` + idempotence sur `jti`      |
| Talent ferme l'onglet                        | `valid: false` au callback, tentative consommée         |

---

## 12. Hors-scope technique mais à valider avant impl

- [ ] Modèle exact de l'**émargement** dans le schema actuel (TimeSlot ? Activity ? Présence dénormalisée ?). Conditionne la requête d'éligibilité §4.1.
- [ ] Fenêtre exacte du cron : 1 / jour ? Heure de publication ? À confirmer avec produit.
- [ ] Ergonomie de la card XP : modale vs page dédiée pour l'iframe.

---

_Référence externe : `/Users/eliot/WebstormProjects/jump-games/INTEGRATION.md`._
