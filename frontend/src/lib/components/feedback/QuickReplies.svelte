<script lang="ts">
  import type { Question, AnswerValue } from '$lib/domain/feedbackForms/schema';
  import { typesetChat } from '$lib/domain/feedbackForms/schema';
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
  const min = $derived(question.minSelections);
  const max = $derived(question.maxSelections);

  // At the cap, unselected chips are disabled rather than erroring on submit:
  // the limit is felt while choosing (mirrors the onboarding interests step),
  // not sprung at validation. The user deselects to swap, so the cap stays
  // visible instead of silently evicting an earlier pick.
  const atMax = $derived(
    isMultiple && max !== undefined && selected.size >= max,
  );
  const canValidate = $derived(min === undefined || selected.size >= min);

  function toggle(opt: string) {
    if (!isMultiple) {
      onanswer(opt);
      return;
    }
    const next = new Set(selected);
    if (next.has(opt)) next.delete(opt);
    else if (max === undefined || next.size < max) next.add(opt);
    selected = next;
  }

  function validate() {
    if (!canValidate) return;
    onanswer([...selected]);
  }
</script>

<div class="flex flex-wrap justify-end gap-2 px-4 pb-2">
  {#each allOptions as opt}
    {@const isSelected = selected.has(opt)}
    {@const locked = isMultiple && !isSelected && atMax}
    <button
      type="button"
      disabled={locked}
      class={cn(
        'cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        isSelected
          ? 'border-epi-blue bg-epi-blue text-white'
          : 'border-epi-blue text-epi-blue hover:bg-epi-blue/10',
      )}
      onclick={() => toggle(opt)}
    >
      {typesetChat(opt)}
    </button>
  {/each}
</div>

{#if isMultiple}
  <div class="flex items-center justify-end gap-3 px-4 pb-2">
    <span
      class={cn(
        'text-xs',
        atMax ? 'font-medium text-epi-blue' : 'text-muted-foreground',
      )}
    >
      {selected.size}{#if max !== undefined}/{max}{/if} sélectionné{selected.size >
      1
        ? 's'
        : ''}{#if min}
        (min {min}){/if}
    </span>
    <button
      type="button"
      class="cursor-pointer rounded-full bg-epi-tech px-5 py-1.5 font-mono text-sm font-bold text-epi-blue uppercase transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      disabled={!canValidate}
      onclick={validate}
    >
      Valider
    </button>
  </div>
{/if}
