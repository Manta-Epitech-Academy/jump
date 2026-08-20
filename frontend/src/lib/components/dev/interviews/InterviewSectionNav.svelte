<script lang="ts">
  import { INTERVIEW_SECTIONS, VERDICT_SECTION } from '$lib/domain/interview';
  import { cn } from '$lib/utils';

  // Right-rail companion to InterviewFlow while an interview is in progress: a
  // light jump-to nav over the flow's local step cursor (bound, so a click here
  // is the same as paging with Suivant/Précédent). Deliberately minimal: no
  // numbers, no progress counts, no cover entry (Précédent from the first
  // section reaches it), so it never competes with the question on the left.
  let { step = $bindable() }: { step: number } = $props();

  const rows = [
    ...INTERVIEW_SECTIONS.map((s, i) => ({ step: i + 1, title: s.title })),
    {
      step: INTERVIEW_SECTIONS.length + 1,
      title: VERDICT_SECTION.title,
    },
  ];
</script>

<nav
  class="rounded-sm border bg-card p-2"
  aria-label="Aller à une section de l'entretien"
>
  {#each rows as row (row.step)}
    <button
      type="button"
      aria-current={step === row.step ? 'step' : undefined}
      onclick={() => (step = row.step)}
      class={cn(
        'block w-full cursor-pointer rounded-sm px-2.5 py-1.5 text-left text-sm transition-colors',
        step === row.step
          ? 'bg-epi-blue/10 font-semibold text-epi-blue'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {row.title}
    </button>
  {/each}
</nav>
