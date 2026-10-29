### Context

Le calendrier du campus grise les vacances scolaires à partir d'une copie des dates du ministère (`frontend/src/lib/domain/schoolHolidays.data.ts`). Le workflow mensuel `school-holidays.yml` a trouvé que cette copie ne correspond plus au jeu de données `fr-en-calendrier-scolaire` : une nouvelle année est publiée, ou des dates ont été corrigées. Chaque passage du workflow qui le constate est lié ci-dessous.

### User Stories

**En tant que membre de l'équipe dev**, je veux que le calendrier du campus grise les vacances scolaires telles que le ministère les publie, pour placer un événement en connaissant les vacances de l'académie du campus.

### Acceptance Criteria

- **AC1** : étant donné le fichier régénéré par `bun scripts/fetch-school-holidays.ts` (depuis `frontend/`) et fusionné, quand le workflow repasse, alors il n'ouvre ni ne commente aucune issue.
- **AC2** : étant donné une année que le ministère a publiée, quand un membre de l'équipe dev ouvre le calendrier de cette année, alors la légende affiche « Vacances & jours fériés ».

### Out of scope

- Les jours fériés : ils sont calculés, aucun fichier à mettre à jour.
