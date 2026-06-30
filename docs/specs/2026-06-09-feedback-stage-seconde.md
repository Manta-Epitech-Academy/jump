# Feedback stage de seconde - UX conversationnelle

## Contexte

Les talents (lyceens) effectuent un stage de seconde sur deux semaines. A la fin de chaque semaine (vendredi 17h), on leur propose un questionnaire de feedback sous forme de **conversation style chat** : un bot ("Bernard le canard") pose les questions une par une, le talent repond via des chips cliquables, des echelles, ou du texte libre.

Le concept a ete prototype dans une app standalone (`feedback-forms.tgz`). Ce spec decrit son integration dans Jump.

## Scope

- Feature specifique au `stage_seconde` (gate par le feature flag existant)
- **2 formulaires** : `w1` (bilan semaine 1) et `w2` (bilan semaine 2)
- Un seul feedback par formulaire par talent par event
- Declenchement automatique le vendredi a 17h (timezone campus) : semaine 1 = premier vendredi, semaine 2 = deuxieme vendredi
- **Non bloquant** : bandeau persistant fortement recommande, mais le talent peut continuer a naviguer
- Questions d'identite (campus, nom, prenom, tel, email) pre-remplies depuis le profil talent et sautees automatiquement
- Resultats consultables par les admins

## UX conversationnelle

Le questionnaire se deroule comme une discussion :
- Le bot pose les questions une a une avec un indicateur de frappe
- Le talent repond via des **chips cliquables** (choix unique/multiple), des **echelles** (Passionnant ... Pas interessant), ou des **champs texte**
- Chaque reponse apparait comme une bulle utilisateur
- En-tetes de section affiches comme messages systeme
- Ecran de remerciement a la fin

### Types de questions

| Type | UI |
|------|-----|
| `single` | Chips, clic = reponse immediate |
| `multiple` | Chips a bascule + compteur + bouton Valider |
| `scale` | Chips ordonnees (meilleur au moins bon) + options hors echelle optionnelles |
| `text` | Champ une ligne (email/tel/nom) |
| `textarea` | Champ multiligne |
| `gate` | Question d'aiguillage, non stockee |

### Identite / pre-remplissage

Les questions d'identite (campus, civilite, nom, prenom, telephone, email) sont marquees `identity: true`. Comme le talent est authentifie dans Jump, ces valeurs sont pre-remplies depuis son profil et les questions sont **sautees automatiquement**. Si une valeur manque, la question est posee mais skippable.

## Formulaires

Definis en JSON (editables sans toucher au code). Deux formulaires :

### W1 - Bilan 1ere semaine (15 questions)

1. Gate coordonnees (skippable)
2-7. Identite (pre-remplies depuis le profil talent)
8. Specialites de Premiere (multiple, 3 choix)
9. Avis conferences semaine 1 (echelle)
10. Avis atelier Product Designer (echelle + "pas tout compris")
11. Piste d'orientation post-bac (single)
12. Interet Coding Club vacances (echelle)
13. Appetence domaines tech (multiple)
14. Influenceurs suivis (texte libre)
15. Reseaux sociaux utilises (multiple) + classement preferes (textarea)

### W2 - Bilan 2eme semaine (17 questions)

1. Gate coordonnees (skippable)
2-7. Identite (pre-remplies)
8. Avis conferences semaine 2 (echelle)
9-12. Avis par atelier de la semaine : Prompt Engineer, Python Developer, OSINT Investigator, Business Developer (echelle + "pas tout compris")
13. Piste d'orientation post-bac (single)
14. Invitation conferences Epitech (single, optionnel)
15. Interet ateliers vacances (echelle)
16. Domaines qui attirent le plus (multiple, max 3)
17. Recommandation du stage (echelle)
18. Ameliorations suggerees (textarea, optionnel)

## Modele de donnees

### Table `FeedbackSubmission`

```prisma
model FeedbackSubmission {
  id        String   @id @default(cuid())
  eventId   String
  talentId  String
  formId    String   // "w1" ou "w2"
  answers   Json     // Record<string, string | string[]>
  createdAt DateTime @default(now())

  event  Event  @relation(fields: [eventId], references: [id])
  talent Talent @relation(fields: [talentId], references: [id])

  @@unique([eventId, talentId, formId])
}
```

- `answers` est un champ JSON qui stocke les reponses sous forme `{ questionId: valeur }`. Flexible : ajouter/modifier des questions dans le JSON ne necessite pas de migration.
- Contrainte unique `[eventId, talentId, formId]` : un seul feedback par formulaire par talent par event.
- Le `talentId` est stocke pour savoir qui a repondu (bandeau) et permettre le pre-remplissage des questions d'identite. L'anonymisation dans le dashboard admin est une couche de presentation.

## Declenchement cote talent

### Calcul du moment d'ouverture

A partir de `Event.date` (debut du stage) et `Campus.timezone` :
- **W1** : premier vendredi >= date de debut, a 17h00 heure locale
- **W2** : deuxieme vendredi >= date de debut, a 17h00 heure locale

Calcul pur, pas de champ supplementaire sur Event.

### Comportement

1. Tant qu'on n'a pas atteint le vendredi 17h : rien ne change
2. Une fois passe : **bandeau persistant** en haut du dashboard talent
   - Texte : "Ton avis compte ! Donne ton feedback sur ta [1ere/2eme] semaine de stage."
   - Bouton : "C'est parti !" vers `(talent)/feedback/[eventId]/[formId]`
3. **Non bloquant** : le talent peut fermer le bandeau ou continuer a naviguer, mais le bandeau reapparait a chaque visite tant que le feedback n'est pas soumis
4. Apres soumission : ecran de remerciement avec mascotte (canard), puis retour au dashboard, bandeau disparait

### Conditions d'affichage du bandeau

- Event de type `stage_seconde`
- Feature flag `stage_seconde` actif
- Le talent a une participation active sur cet event
- Date actuelle >= vendredi 17h correspondant (S1 ou S2)
- Pas de `FeedbackSubmission` existant pour ce talent/event/formId

## Page feedback talent

**Route :** `(talent)/feedback/[eventId]/[formId]/+page.svelte`

- Charge le schema JSON du formulaire (`w1.json` ou `w2.json`)
- Pre-remplit les questions d'identite depuis le profil talent (campus, civilite, nom, prenom, telephone, email)
- Affiche la conversation via le composant `ChatScreen`
- A la soumission : `POST` qui cree un `FeedbackSubmission` avec les reponses en JSON
- Ecran de remerciement avec le canard mascotte
- Tutoiement (audience talent)

## Dashboard admin

**Route :** `(staff)/staff/admin/events/[eventId]/feedback/+page.svelte`

### KPIs

- Nombre de reponses / nombre total de participants, par formulaire (w1/w2)
- Taux de reponse en %

### Par question

- Pour les questions `single`/`scale` : distribution des reponses en barres horizontales
- Pour les questions `multiple` : comptage par option
- Pour les questions `text`/`textarea` : liste des reponses libres

### Export

Bouton export CSV/XLSX :
- Une ligne par submission
- Colonnes = les questionIds du formulaire
- Option anonymise (sans talentId/nom) ou nominatif

### Acces

Reserve aux admins (`requireStaffGroup` ou guard equivalent sur le role admin).
Vouvoiement (audience staff).
