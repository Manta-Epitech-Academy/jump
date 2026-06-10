<script lang="ts">
  import type { Question, AnswerValue } from '$lib/domain/feedbackForms/schema';
  import { cn } from '$lib/utils';
  import Send from '@lucide/svelte/icons/send';

  interface Props {
    question: Question;
    onanswer: (v: AnswerValue) => void;
  }

  let { question, onanswer }: Props = $props();
  let value = $state('');

  const isTextarea = $derived(question.type === 'textarea');
  const canSubmit = $derived(!question.required || value.trim().length > 0);

  function submit() {
    if (!canSubmit) return;
    onanswer(value.trim());
    value = '';
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      if (isTextarea && e.shiftKey) return; // allow newline
      if (!isTextarea || !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    }
  }

  const inputKindMap: Record<string, string> = {
    email: 'email',
    tel: 'tel',
    name: 'text',
    text: 'text',
  };
</script>

<div
  class="flex items-end gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
>
  {#if isTextarea}
    <textarea
      bind:value
      placeholder={question.placeholder ?? 'Ta réponse...'}
      rows={3}
      class="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-colors outline-none focus:border-epi-blue focus:ring-1 focus:ring-epi-blue dark:border-slate-700 dark:bg-slate-900"
      {onkeydown}
    ></textarea>
  {:else}
    <input
      type={inputKindMap[question.inputKind ?? 'text'] ?? 'text'}
      bind:value
      placeholder={question.placeholder ?? 'Ta réponse...'}
      class="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm transition-colors outline-none focus:border-epi-blue focus:ring-1 focus:ring-epi-blue dark:border-slate-700 dark:bg-slate-900"
      {onkeydown}
    />
  {/if}

  <button
    type="button"
    class={cn(
      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-epi-teal text-epi-blue transition-opacity',
      !canSubmit && 'cursor-not-allowed opacity-40',
    )}
    disabled={!canSubmit}
    onclick={submit}
  >
    <Send size={18} />
  </button>
</div>
