# JARGON.md — Vocabulaire partagé de Jump

Ce fichier est la source de vérité pour les termes qui ont un sens précis dans
le contexte de Jump. Un même mot peut désigner des choses différentes selon le
contexte (Salesforce, l'app, l'UI staff, l'UI talent) : on le lève ici pour
éviter les quiproquos dans le code, les issues, et les conversations avec le PO.

Règle : si un terme est ambigu, on vient l'ajouter ici avant de l'utiliser dans
une PR ou une story.

---

## Personnes

| Terme dans Jump       | Ce que ça désigne                                                                                  | Terme Salesforce           | Terme Auth / DB             |
| --------------------- | -------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------- |
| **Talent**            | Un lycéen suivi par Epitech Academy (prospect ou inscrit à un événement)                           | `Contact`                  | `Talent` (modèle Prisma)    |
| **Stagiaire**         | Un talent inscrit à un stage (événement de type stage). Terme UI staff dev uniquement.             | `CampaignMember`           | --                           |
| **Participant**       | Terme générique pour un talent inscrit à n'importe quel type d'événement. Valeur par défaut de `cohortNoun`. | `CampaignMember`  | --                           |
| **Staff**             | Membre de l'équipe Epitech qui utilise `/staff/`. Regroupe tous les rôles staff.                   | --                          | `StaffProfile`              |
| **Dev** (rôle)        | **Pas un développeur logiciel.** Rôle Business Development / Admissions / Talent Acquisition. Accède à `/staff/dev/`. | -- | `StaffRole.dev` / `StaffRole.superdev` |
| **Pedago** (rôle)    | Equipe pédagogique. Accède à `/staff/pedago/`. Deux niveaux : `peda` (lead) et `manta` (terrain). | -- | `StaffRole.peda` / `StaffRole.manta` |
| **Admin**             | Staff avec accès global au système. Accède à `/staff/admin/`.                                      | --                          | `StaffRole.admin`           |
| **Parent**            | Tuteur légal d'un talent. Accède à l'app via un lien dédié (pas un espace staff) pour co-signer le règlement et statuer sur le droit à l'image. | -- | champs `parentEmail`, `parentPhone` sur `Talent` |

---

## Événements

| Terme dans Jump       | Ce que ça désigne                                                                                  | Terme Salesforce           |
| --------------------- | -------------------------------------------------------------------------------------------------- | -------------------------- |
| **Événement**         | Une occurrence d'une action Epitech Academy (stage, coding club, journée portes ouvertes…). Entité centrale de Jump. | `Campaign` |
| **Stage**             | Événement de plusieurs semaines. La cohorte s'appelle « stagiaires ».                             | `Campaign` de type stage   |
| **Coding Club**       | Événement d'une journée, récurrent. La cohorte s'appelle « participants ».                        | `Campaign` de type club    |
| **Activation dev**    | Le fait qu'un admin a rendu un événement visible dans l'espace dev (`devActivatedAt` non null). Distinct de la visibilité talent. | — |
| **Public name**       | Le nom « propre » d'un événement (ex : « Stage Web Été 2026 »), distinct du titre Salesforce brut. Champ `Event.publicName`. | — |
| **Cohorte**           | L'ensemble des talents inscrits à un événement, filtrés selon les statuts visibles.               | Les `CampaignMember` de la `Campaign` |

---

## Statuts Salesforce

Ces valeurs arrivent du worker de sync et sont stockées dans `Participation.sfMemberStatus`.
On ne les expose **jamais** telles quelles dans l'UI : on les mappe en libellés français.

| Valeur Salesforce  | Sémantique métier                                                     | Affiché dans Jump                                    |
| ------------------ | --------------------------------------------------------------------- | ---------------------------------------------------- |
| `READY`            | Le talent a confirmé sa venue                                         | Visible dans l'espace dev. Pour un événement passé : « Absent » (était prêt, n'est pas venu) |
| `MEET`             | Le talent a assisté à l'événement                                     | Visible dans l'espace dev. Pour un événement passé : « Présent » |
| `CONNECTED`        | Le talent a cliqué sur le lien Salesforce mais n'a pas confirmé       | **Non visible** dans l'espace dev. Stocké en DB pour debug. |
| `DESISTED`         | Le talent s'est désisté explicitement                                 | **Non visible** dans l'espace dev. Stocké en DB pour debug. |
| `null` (legacy)    | Ligne synchronisée avant l'ajout du champ `sfMemberStatus`            | Traitée comme visible (comportement antérieur préservé) |

Source de vérité code : `frontend/src/lib/domain/sfMemberStatus.ts`.

---

## Participation vs Présence

Ces deux concepts sont distincts et ne doivent pas être confondus dans le code
ou les conversations.

| Terme              | Ce que ça désigne                                                                                  | Source de données          |
| ------------------ | -------------------------------------------------------------------------------------------------- | -------------------------- |
| **Participation**  | Le fait qu'un talent est inscrit à un événement (vient de Salesforce via le worker). Entité `Participation` en DB. | Sync Salesforce (worker) |
| **Présence SF**    | Pour un événement *passé* : déduite du `sfMemberStatus` (`MEET` = présent, `READY` = absent). Pas de saisie Jump. | `Participation.sfMemberStatus` |
| **Émargement**     | Le suivi de présence en temps réel pendant l'événement, saisi par le staff dans Jump. Entité `EventPresence`. Indépendant des statuts SF. | Saisie staff dans Jump |

---

## Espaces et audiences

| Espace             | Route              | Audience                     | Ton de la copie UI              |
| ------------------ | ------------------ | ---------------------------- | ------------------------------- |
| **Dev**            | `/staff/dev/`      | Staff dev / superdev          | `vous`, sobre, fonctionnel      |
| **Pedago**         | `/staff/pedago/`   | Staff peda / manta            | `vous`, pédagogique             |
| **Admin**          | `/staff/admin/`    | Staff admin                   | `vous`, stats, pratique         |
| **Talent**         | `(talent)/`        | Lycéens                       | `tu`, chaleureux, ludique       |
| **Parent (lien)**  | liens dédiés       | Tuteurs légaux (pas un espace staff) | `vous`, formel, rassurant |

---

## Termes à ne pas confondre

| ❌ Ne pas dire                  | ✅ Dire à la place                          | Pourquoi                                                         |
| ------------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| « Dev » pour un développeur     | « Développeur » ou son prénom               | « Dev » désigne le rôle Business Dev dans Jump                   |
| « Participant » pour un stagiaire spécifique | Le `cohortNoun` de l'événement | Le nom de la cohorte dépend du type d'événement et est configurable |
| « Statut » tout seul            | « Statut SF » ou « statut de dossier »      | Deux statuts coexistent : le statut Salesforce et le statut de complétion du dossier talent (règlement, droit à l'image) |
| « Synchronisation » sans contexte | « Sync Salesforce » ou « sync worker »    | Il y a plusieurs types de sync (talents, events, campus)         |
| « Pedago » pour l'espace        | « Espace pedago » ou « `/staff/pedago/` »   | Pedago est aussi le nom d'un rôle (`peda`) - préciser le contexte |
