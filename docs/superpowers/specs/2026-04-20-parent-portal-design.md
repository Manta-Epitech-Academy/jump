# Vue Parent — Design Spec

## Objectif

Créer un portail parent léger permettant aux parents de suivre l'avancée de leur(s) enfant(s) sur la plateforme Jump. Vue minimaliste, centrée sur les informations essentielles : présence, événements, et statut administratif.

## Authentification

- Login par **Email OTP** (même mécanisme que les talents via BetterAuth)
- Page `/parent/login` : champ email → code 6 chiffres → session
- Le parent doit déjà exister en base (`bauth_user` avec `role: 'parent'`, créé lors de l'onboarding de l'enfant)
- Si l'email ne correspond à aucun compte parent → message d'erreur (pas de création de compte)
- Après login → redirection vers `/parent` (dashboard)

## Architecture des routes

Route group `(parent)/` au même niveau que `(talent)/` et `(staff)/` :

```
(parent)/
├── login/                  ← OTP email (bypass guard)
├── +layout.server.ts       ← guard role='parent', bypass sur /parent/login
├── +page.svelte            ← dashboard multi-enfants
└── enfant/
    └── [talentId]/
        └── +page.svelte    ← détail d'un enfant
```

### Guard

- Le layout server vérifie `user.role === 'parent'` sur toutes les routes sauf `/parent/login`
- Si non authentifié ou rôle incorrect → redirection vers `/parent/login`

## Dashboard multi-enfants (`/parent`)

### En-tête
- "Bonjour [prénom du parent]"
- Bouton déconnexion

### Liste des enfants (cards)

Chaque card affiche :
- **Prénom + Nom** de l'enfant
- **Nombre d'événements** suivis (ex: "12 événements suivis")
- **Prochain événement** prévu (nom + date) ou "Aucun événement prévu"
- **Statut droit à l'image** : badge vert "Signé" ou badge orange "À signer" (cliquable → lance le flow de signature)

Clic sur la card → `/parent/enfant/[talentId]`

### Données serveur

```
Talent.findMany({
  where: { parentEmail: user.email },
  include: participations count + prochain événement
})
```

Si un seul enfant : on affiche quand même le dashboard (pas de redirection automatique).

## Détail d'un enfant (`/parent/enfant/[talentId]`)

### En-tête
- Prénom + Nom de l'enfant
- Bouton retour vers le dashboard

### Statut droit à l'image
- Si non signé : bandeau visible avec bouton "Signer maintenant"
- Intègre le flow de signature existant (`/parent/sign/`) directement dans la page

### Prochain événement
- Card avec nom et date de l'événement

### Historique des événements
- Liste chronologique (plus récent en haut)
- Chaque élément affiche :
  - Nom de l'événement
  - Date
  - Statut présence (Présent / Absent)
- **Accordion** : au clic, déploie la liste des activités réalisées (nom + type)

### Sécurité
- Le `+page.server.ts` vérifie que le `talentId` correspond à un enfant du parent connecté (`Talent.parentEmail === user.email`)
- Sinon → 403 ou redirection dashboard

## Lien parent-enfant

- Basé sur `Talent.parentEmail` matchant `user.email` du parent
- Pas de table de relation dédiée — le lien est implicite via l'email
- Un parent avec N enfants = N `Talent` ayant le même `parentEmail`

## Ce qui n'est PAS inclus

- XP / niveaux / progression gamifiée
- Badges
- Thèmes / compétences
- Portfolio
- Modification des informations de l'enfant
