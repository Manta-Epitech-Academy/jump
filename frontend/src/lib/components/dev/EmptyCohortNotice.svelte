<script lang="ts">
  import Users from '@lucide/svelte/icons/users';
  import ResultsNotice from '$lib/components/staff/ResultsNotice.svelte';
  import { cohortNounForms } from '$lib/domain/event';

  // What every page of an event says while it has no one in the dev space: the
  // home, Inscrits, Closings, Émargement and Feedback. The same state was
  // worded four ways on four of them, and Feedback said « Aucun résultat » as
  // if a filter had matched nothing.
  //
  // Nobody adds a talent here: the cohort comes from Salesforce, so the notice
  // says when it will appear rather than offering an action. "Here", not "in
  // Jump": Jump also holds enrolments the dev space does not show.
  let { cohortNoun }: { cohortNoun: string | null } = $props();

  const noun = $derived(cohortNounForms(cohortNoun));
</script>

<ResultsNotice
  icon={Users}
  title={`Aucun ${noun.singular} inscrit`}
  description={`Les ${noun.plural} s'affichent ici dès qu'ils sont marqués prêts dans Salesforce.`}
/>
