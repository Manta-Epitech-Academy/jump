<script lang="ts">
  import type { Question, AnswerValue } from '$lib/domain/feedbackForms/schema';
  import { cn } from '$lib/utils';

  interface Props {
    question: Question;
    onanswer: (v: AnswerValue) => void;
  }

  let { question, onanswer }: Props = $props();

  let selected = $state<Set<string>>(new Set());

  const allOptions = $derived([
    ...(question.options ?? []),
    ...(question.extraOptions ?? []),
  ]);

  const isMultiple = $derived(question.type === 'multiple');

  function toggle(opt: string) {
    if (!isMultiple) {
      onanswer(opt);
      return;
    }
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    selected = next;
  }

  function validate() {
    onanswer([...selected]);
  }
</script>

<div class="flex flex-wrap justify-end gap-2 px-4 pb-2">
  {#each allOptions as opt}
    <button
      type="button"
      class={cn(
        'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
        selected.has(opt)
          ? 'border-epi-blue bg-epi-blue text-white'
          : 'border-epi-blue text-epi-blue hover:bg-epi-blue/10',
      )}
      onclick={() => toggle(opt)}
    >
      {opt}
    </button>
  {/each}
</div>

{#if isMultiple}
  <div class="flex items-center justify-end gap-3 px-4 pb-2">
    <span class="text-xs text-muted-foreground">
      {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
      {#if question.minSelections}(min {question.minSelections}){/if}
    </span>
    <button
      type="button"
      class="rounded-full bg-epi-teal px-5 py-1.5 font-mono text-sm font-bold text-epi-blue uppercase transition-opacity disabled:opacity-40"
      disabled={question.minSelections !== undefined &&
        selected.size < question.minSelections}
      onclick={validate}
    >
      Valider
    </button>
  </div>
{/if}
