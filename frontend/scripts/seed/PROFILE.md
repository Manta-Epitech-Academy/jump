# Profil des données de production

Relevé unique du **2026-08-29**, en agrégats seulement : aucune ligne, aucune donnée
personnelle n'a été lue, et rien de nominatif ne figure ici. Il porte sur un
**instantané de production restauré**, pas sur la production interrogée en direct.

**Tout ce qui vient du worker Salesforce est arrêté au 2026-07-09** : la
synchronisation a été mise en pause pour l'été, faute d'activité sur les campus.
`AppSetting['sync.last']` le date précisément, et les dernières lignes créées le
confirment (`Event` le 08/07, `Talent` et `Participation` le 09/07), là où ce que
l'application écrit elle-même va jusqu'au 28/08 (`EventPresence`,
`Onboarding_Record`, `Closing_Record`). Il manque donc sept semaines
d'inscriptions aux volumes. Pour un profil de **formes et de proportions**, ça ne
change rien, et ce n'est pas une raison de re-relever.

**Cet accès est refermé.** Ce fichier est la référence durable : il remplace toute
nouvelle lecture de la base de production. Un chiffre qui manque ici se demande,
il ne se re-relève pas.

Trois exceptions, datées et signalées sur place : la couverture des closings par
format et le taux de connexion d'une cohorte de stage ont été relevés le
**2026-09-03**, la ventilation du stage de seconde par campus le **2026-09-06**,
sur le même instantané restauré, parce que le générateur en dépendait et qu'ils
manquaient. Les trois blocs disent d'où ils viennent et ce qui prouve qu'il
s'agit bien du même jeu de données.

Il existe pour une raison précise : le générateur de `scripts/seed/` ne doit pas
inventer des proportions. Chaque distribution qu'il applique vient d'une ligne de
ce document, et chaque écart délibéré (les états rares, sur-représentés exprès)
se mesure contre elle.

---

## Comment lire ce fichier

Deux propriétés se tiennent séparément, et les confondre est l'erreur qui produit
soit un jeu de données joli et inutile, soit un jeu complet et irréaliste.

- **Le volume** fait que les écrans, les exports et les requêtes se comportent
  comme en vrai. Il suit ces chiffres.
- **La couverture** fait qu'aucune branche du code n'a zéro ligne. Elle va
  délibérément contre ces chiffres : la production compte 3 dossiers bloqués en
  cours de route sur 887, le générateur en pose un par étape.

---

## Volumétrie

| Table                 | Lignes | Table                     | Lignes |
| --------------------- | ------ | ------------------------- | ------ |
| EventPresence         | 27 167 | Onboarding_Record         | 887    |
| Closing_AnswerOption  | 19 980 | ImageRightsDecisionRecord | 850    |
| Closing_Answer        | 18 587 | Event                     | 292    |
| Feedback_Answer       | 11 937 | Note_TalentNote           | 235    |
| Feedback_AnswerOption | 11 148 | Planning_Slot             | 220    |
| Participation         | 7 638  | SyncError                 | 142    |
| XpGrant               | 7 379  | StaffProfile              | 138    |
| bauth_user            | 6 330  | EventConfig_Module        | 130    |
| Talent                | 5 394  | MinigamePublication       | 72     |
| TalentSfImport        | 5 377  | Closing_Option            | 52     |
| Schooling_YearRecord  | 5 198  | Broadcast                 | 42     |
| MinigameAttempt       | 4 481  | Interest                  | 34     |
| TalentInterest        | 4 154  | Campus                    | 15     |
| OnboardingPdfJob      | 2 424  | Closing_Question          | 12     |
| BroadcastRecipient    | 2 306  | Feedback_Form             | 4      |
| Closing_Record        | 1 694  | Closing_Template          | 2      |
| Feedback_Submission   | 942    | Diploma_Template          | 2      |
| School                | 891    |                           |        |

`Usage_FeatureUse` n'y figure pas, et son absence est un chiffre en soi : la
production ne porte pas cette table. Le tableau a un temps annoncé 65 lignes
pour elle, relevées le lendemain de sa création sur le dump restauré en local,
c'est-à-dire une journée de navigation d'un développeur. Calibrer le générateur
là-dessus, c'eût été le calibrer sur rien. Sa volumétrie se mesurera quand la
fonctionnalité aura tourné en production, et la règle du fichier vaut d'ici là :
un chiffre qui manque se demande, il ne se devine pas.

## Campus

Quinze, et très inégaux. Ce déséquilibre n'est pas cosmétique : c'est lui qui fait
mordre le plancher de cellule des statistiques d'usage sur les petits campus, et
c'est lui qui donne du sens aux comparaisons inter-campus. Un jeu de données à
quinze campus égaux serait aussi faux qu'un jeu mono-campus.

| Campus      | Événements | Inscriptions | Talents | Staff |
| ----------- | ---------- | ------------ | ------- | ----- |
| Paris       | 38         | 1 372        | 1 051   | 7     |
| La Réunion  | 33         | 407          | 261     | 8     |
| Strasbourg  | 25         | 480          | 313     | 18    |
| Nice        | 23         | 433          | 313     | 11    |
| Bordeaux    | 23         | 354          | 320     | 14    |
| Toulouse    | 20         | 404          | 300     | 12    |
| Rennes      | 18         | 475          | 327     | 4     |
| Lille       | 18         | 556          | 409     | 4     |
| Lyon        | 18         | 679          | 472     | 13    |
| Marseille   | 17         | 944          | 563     | 7     |
| Mulhouse    | 15         | 291          | 188     | 4     |
| Nantes      | 15         | 506          | 360     | 12    |
| Nancy       | 12         | 223          | 143     | 9     |
| Montpellier | 11         | 464          | 261     | 9     |
| Moulins     | 6          | 50           | 47      | 1     |

## Événements

- 292 au total : 277 en 2025-2026, 15 en 2026-2027.
- Activés côté dev : 50 (37 passés, 13 à venir). Sur l'année en cours : 35 sur 277.
- `publicName` : 58 sur 277 en 2025-2026, 15 sur 15 en 2026-2027.
- `startMinutes` : 7 seulement. `endDate` : 36 sur 277.
- `feedbackFormId` : 17 puis 14. `closingTemplateId` : 33. `diplomaTemplateId` : 8.
  `cohortNoun` : 17 puis 14.
- `externalId` (Salesforce) : 292 sur 292. Tout événement vient du CRM.
- Durée : 276 événements de 0 à 3 jours, 16 de 11 à 14 jours (les stages).

**L'état majoritaire d'un événement est « synchronisé et rien d'autre »** : 235 sur
292 n'ont aucun module configuré. Un générateur qui configure tout ce qu'il crée
produit un monde que personne n'a jamais vu.

## Le stage de seconde, par campus

Relevé le **2026-09-06**, sur le même instantané restauré, parce que le
générateur en avait besoin et que seul l'agrégat figurait ici. Deuxième
addition postérieure au relevé du 29/08 ; `Event` totalise toujours 292 lignes,
`Participation` 7 638 et `EventPresence` 27 167, donc les trois lectures portent
bien sur les mêmes données.

**C'est un événement national, pas un gros événement.** Les quinze campus
portent chacun le leur, tous du **14 au 26 juin 2026**, à la journée près, tous
activés côté dev, tous avec une grille de closing et un formulaire de bilan,
tous avec `cohortNoun` à `stagiaire`. Aucun autre format ne se comporte comme
ça.

| Campus      | Inscrits  | Présences  | Closings  | Bilans  | Modules | Créneaux |
| ----------- | --------- | ---------- | --------- | ------- | ------- | -------- |
| Paris       | 247       | 0          | 229       | 0       | 2       | 0        |
| Bordeaux    | 158       | 0          | 132       | 0       | 2       | 0        |
| Nantes      | 145       | 2 900      | 145       | 114     | 4       | 39       |
| Toulouse    | 140       | 2 731      | 137       | 105     | 4       | 0        |
| Marseille   | 129       | 0          | 121       | 0       | 2       | 0        |
| Lyon        | 127       | 2 527      | 127       | 113     | 4       | 50       |
| Rennes      | 120       | 0          | **0**     | 0       | 2       | 0        |
| Strasbourg  | 108       | 1 434      | 99        | 40      | 4       | 36       |
| Nice        | 106       | 0          | 96        | 0       | 2       | 0        |
| Montpellier | 95        | 1 308      | 95        | 74      | 4       | 40       |
| Nancy       | 84        | 1 676      | 84        | 73      | 4       | 34       |
| Mulhouse    | 81        | 1          | 75        | 0       | 3       | 0        |
| La Réunion  | 43        | 830        | 42        | 33      | 4       | 0        |
| Moulins     | 31        | 0          | 19        | 0       | 2       | 0        |
| Lille       | **26**    | 2 364      | 11        | **82**  | 4       | 21       |
| **Total**   | **1 640** | **15 771** | **1 412** | **634** |         | **220**  |

**Deux régimes, pas une moyenne.** Huit campus ont fait tourner l'événement dans
Jump : émargement, planning, bilan, diplôme, notes, campagnes, quatre modules.
Les sept autres s'en sont servis pour la liste des inscrits et pour conduire
leurs closings, deux modules, pas une ligne de présence. Et la profondeur ne
suit pas la taille : **le plus gros stage de tous, Paris et ses 247 inscrits,
est l'un de ceux que personne n'a émargés.**

Ce que ces quinze lignes pèsent dans le reste du fichier : **58 % de
`EventPresence`, 83 % de `Closing_Record`, 67 % de `Feedback_Submission`**, la
totalité des six plannings, et 4 459 des 4 481 parties de minijeux. Un
générateur qui n'en produit qu'un ne produit pas seulement un événement de
moins.

Le détail qui va avec :

- `startMinutes` : 7 sur 15 (570 pour cinq campus, 540 pour deux) - ce sont les
  7 des 7 que le fichier compte sur toute la plateforme.
- `diplomaTemplateId` : les 8 instrumentés, et eux seuls.
- Taux de bilan, sur les sept dont la liste n'a pas bougé : 37 à 89 %,
  **médiane 78**.
- **Rennes nomme une grille et n'a conduit aucun closing.** C'est le trou de
  configuration, pas un vrai zéro : la couverture ne doit pas compter ses 120
  inscrits au dénominateur.
- **Lille a plus de bilans que d'inscrits** (82 contre 26) et 2 364 présences
  pour 26 lignes d'inscription. La liste a été élaguée après coup par une
  synchronisation : `syncTalents` supprime toute participation absente du
  payload, et c'est exactement pour ça que le closing, la présence et le bilan
  ne dépendent pas de `Participation`. Un taux dont le dénominateur est les
  inscriptions peut donc légitimement dépasser 100 %.
- Mulhouse porte 3 modules et **une** ligne de présence : quelqu'un a ouvert
  l'écran d'émargement, coché une personne, et n'y est jamais revenu.

## Inscriptions

- Par événement : min 1, p25 10, **p50 23**, p75 39, p90 66, **max 247**, moyenne 30.
- **41 événements ont zéro inscrit**, soit 14 %.
- `sfMemberStatus` : **NULL sur 100 % des 7 638 lignes**, et ce n'est pas une
  propriété de la production. La migration qui ajoute la colonne date du 21
  juillet, la dernière sync du 9 : aucune n'a eu lieu depuis qu'elle existe, donc
  les `NULL` sont arithmétiquement obligatoires. Le générateur ne reproduit
  délibérément pas ce chiffre - voir `World.enrol` et le scénario
  `statuts-salesforce`.
- Par talent : 0 pour 81, 1 pour 3 665, 2 pour 1 243, 3 pour 276, 4 et plus pour
  129 (jusqu'à 11).
- Au moins un talent est inscrit sur deux campus.

**La cohorte à 200 est la queue de distribution, pas la norme.** Elle existe, elle
compte, et c'est elle qui dimensionne les écrans, mais l'événement médian en compte 23. C'est la longue traîne qui produit les états vides et bizarres.

## Talents (5 394)

Niveau : 2nde 55,7 %, 1ere 16,1 %, terminale 14,0 %, 3eme 4,4 %, absent 3,9 %,
bac_1 1,3 %, bac_2 1,0 %, bac_3 1,0 %, 4eme 0,8 %, bac_5 0,6 %, autre 0,5 %,
bac_4 0,3 %, wac 0,1 %, 5eme 0,1 %, 6eme 2 lignes.

Remplissage :

| Colonne                  | Renseignée | Part       |
| ------------------------ | ---------- | ---------- |
| `userId`                 | 5 324      | 98,7 %     |
| `externalId`             | 5 393      | ~100 %     |
| `phone`                  | 5 249      | 97,3 %     |
| **`firstLoginAt`**       | **869**    | **16,1 %** |
| `schoolId`               | 2 349      | 43,5 %     |
| `highSchoolNameManual`   | 57         | 1,1 %      |
| `parentEmail`            | 867        | 16,1 %     |
| `parent2Email`           | 255        | 4,7 %      |
| `charterAcceptedAt`      | 866        | 16,1 %     |
| `welcomeSeenAt`          | 863        | 16,0 %     |
| `processingCompletedAt`  | 860        | 15,9 %     |
| `rulesSignedAt`          | 860        | 15,9 %     |
| `parentRulesSignedAt`    | 798        | 14,8 %     |
| `imageRightsDecidedAt`   | 831        | 15,4 %     |
| `onboardingSchoolYear`   | 869        | 16,1 %     |
| `interestsFreeText`      | 409        | 7,6 %      |
| `setupDescription`       | 356        | 6,6 %      |
| `usageAnalyticsOptOutAt` | 0          | 0 %        |

**84 % des talents ne se sont jamais connectés.** L'état dominant, de très loin,
c'est « importé du CRM, jamais ouvert ». Un jeu de données où tout le monde a un
dossier complet ne ressemble à rien.

Cas limites comptés : 70 talents sans compte de connexion, 56 talents dont le lycée
est validé mais dont aucune école n'est résolue.

XP : min 0, p25 0, p50 0, p75 200, p95 1 767, max 9 190. **3 902 talents à zéro**
(72 %). `eventsCount` : 0 pour 2 112, 1 pour 2 429, 2 pour 682, 3 et plus pour 171.

## Inscription (onboarding)

- Dossiers : 869 en 2025-2026, 18 en 2026-2027.
- 2025-2026 : 866 terminés, 866 règlements signés, 804 co-signés par un responsable,
  831 décisions de droit à l'image, 866 PDF de règlement, 717 PDF de droit à l'image,
  une seule version de règlement.
- 2026-2027 : 18 dossiers, 18 terminés, 1 seul PDF rendu.
- **Étapes bloquées, tous dossiers confondus : 2 aux informations, 1 au lycée, 0
  ailleurs, 884 terminés.**
- Intérêts : 738 talents en ont 5, 93 en ont 4, 22 en ont 3, 13 en ont 2.

Une fois commencé, le parcours se termine. Les états intermédiaires sont donc
quasi absents de la production, et ce sont précisément eux qu'il faut
sur-représenter : ils portent les bugs que personne ne voit.

Sur la cohorte de stage (relevé du 2026-09-03, même instantané) : **765 des
1 640 inscriptions se sont connectées (47 %), et 759 de ces 765 ont terminé leur
dossier (99 %)**. Le filtre, c'est la première connexion, pas l'abandon en cours
de route. Le générateur reproduit fidèlement le second chiffre et pas le
premier : voir le commentaire dans `scenarios/stage.ts`, qui dit lequel des deux
il tord et pourquoi.

## Droit à l'image (850 décisions)

| Année     | Décision | Source           | Nombre |
| --------- | -------- | ---------------- | ------ |
| 2025-2026 | accepted | parent_portal    | 723    |
| 2025-2026 | refused  | parent_portal    | 108    |
| 2025-2026 | accepted | staff_correction | 1      |
| 2026-2027 | accepted | staff_correction | 12     |
| 2026-2027 | refused  | staff_correction | 6      |

13 % de refus. Les interdictions permanentes sont un volume réel, pas un cas d'école.

## Closings (1 694)

- Statut : 1 657 terminés, 37 en cours.
- Verdict : bon_profil 34,7 %, tres_compatible 24,0 %, indecis 23,1 %,
  pas_interesse 14,2 %, **absent 4,0 % (67)**.
- 25 événements en portent, 2 grilles. Par événement : min 1, p50 43, max 229.
- `verdictNote` renseigné sur 1 364 (80 %). Aucun `staffId` nul.
- Grilles : l'une 4 sections et 12 questions, l'autre 3 sections et 7 questions.
- Banque : 12 questions (5 multi, 5 single, 1 texte, 1 note).
- Réponses : **7 635 notes d'équipe, 1 540 verbatims d'élèves, 1 661 notes chiffrées.**

### Couverture, par format

Relevé le **2026-09-03**, sur le même instantané restauré, parce que le
générateur en avait besoin et que le chiffre manquait ici. `Closing_Record`
totalise toujours 1 694 lignes sur 25 événements, donc les deux lectures portent
bien sur les mêmes données. La ventilation par campus de ces closings est dans
« Le stage de seconde, par campus », relevée trois jours plus tard.

| Format           | Inscriptions | Closings | Part      |
| ---------------- | ------------ | -------- | --------- |
| Stage de seconde | 1 640        | 1 412    | **86 %**  |
| Tout le reste    | 5 998        | 282      | **4,7 %** |

Deux régimes, et pas une moyenne. Un stage, c'est deux semaines qui finissent par
un entretien : les 14 stages qui portent des closings couvrent de 42 à 100 % de
leur liste, médiane 93. Les 11 autres événements qui en portent tiennent entre 68
et 79 %. Et les 267 restants n'en ont aucun. **Sur un événement qui conduit des
closings, l'absence de closing est l'exception** - c'est l'inverse de ce qu'un
taux global laisse croire.

## Présence (27 167)

- Statut : présent 22 036 (81 %), absent 4 458 (16 %), excusé 577 (2 %),
  en retard 96 (0,4 %).
- Créneau : matin 13 730, après-midi 13 437.
- Source : **système 11 396, QR 9 401, manuelle 6 370.**
- 229 événements, 299 couples (événement, jour). Par événement : min 1, p50 46,
  **max 2 900**.

C'est la table volumineuse, et de loin. Tout ce qui pagine, exporte ou agrège la
présence doit être jugé à cette échelle.

## XP (7 379 attributions)

| Source                | Lignes | Somme     | Min | Max   |
| --------------------- | ------ | --------- | --- | ----- |
| minigame              | 2 954  | 147 700   | 50  | 50    |
| reward                | 2 008  | 1 186 671 | 0   | 1 800 |
| minigame_rank         | 1 472  | 105 415   | 10  | 100   |
| onboarding            | 866    | 173 200   | 200 | 200   |
| onboarding_early_bird | 79     | 5 800     | 50  | 200   |

## Modules d'événement

`inscrits` 48, `emargement` 38, `closings` 33, `bilan` 11. Nombre de modules par
événement configuré : 1 pour 10 événements, 2 pour 32, 3 pour 4, 4 pour 11.
Soit 57 événements configurés sur 292.

## Écoles (891)

- 891 avec identifiant UAI, 874 avec ville et code INSEE.
- Talents par école : **432 écoles n'en ont qu'un**, 145 en ont 2, 101 en ont 3,
  43 en ont 4, 45 en ont 5, puis une longue traîne jusqu'à 11 et plus. 20 écoles
  n'ont aucun talent.
- Parcours scolaires : 5 198 lignes, toutes sur 2025-2026, toutes de source `sync`,
  2 349 avec école, 5 186 avec niveau.

## Staff (138)

- **133 `dev`, 5 `admin`, aucun `superdev`.**
- 130 comptes dev ont une première connexion et une activité récente.
- Aucune redirection de courriel de développement configurée.
- 12 invitations en attente, 18 signataires couvrant les 15 campus.

## Le reste

- **Bilan** : 4 formulaires (4/21, 3/20, 11/18 et 11/18 sections et questions), et
  **un seul a des réponses** : 942 soumissions, dont 308 publiques non appariées et
  634 authentifiées appariées.
- **Notes d'équipe** : 235 sur 196 talents, dont 197 rattachées à un événement et à
  un créneau de présence. La note naît donc de l'émargement.
- **Planning** : 6 événements seulement en ont un, de 21 à 50 créneaux chacun.
  Types : atelier 101, pause 50, conférence 41, spécial 20, organisation 8.
- **Campagnes** : 42, dominées par le SMS (23 envoyées, 2 partiellement en échec)
  devant le courriel (17). Audience : talent 29, parent 12, dev 1. 2 306
  destinataires, 2 échecs. Ventilation : 1 939 talents, 365 parents, 2 staff.
- **Rendus PDF** : 2 390 réussis, 34 en attente.
- **Erreurs de synchronisation** : 142 lignes, **un seul type**, `DUPLICATE_EMAIL`,
  36 résolues, et une occurrence répétée 11 357 fois.
- **Minijeux** : 64 publications utilisées, 668 talents, 2 954 parties terminées,
  1 077 en attente, 450 invalides.
- **États rares** : 1 demande de suppression, 3 réinitialisations de closing,
  9 réparations d'identité. Aucune incohérence grille/module, aucun désalignement
  de campus entre une inscription et son événement.
