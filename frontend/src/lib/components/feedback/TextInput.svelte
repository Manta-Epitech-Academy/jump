<script lang="ts">
  import type { Question, AnswerValue } from '$lib/domain/feedbackForms/schema';
  import { cn } from '$lib/utils';
  import Send from '@lucide/svelte/icons/send';

  interface Props {
    question: Question;
    onanswer: (v: AnswerValue) => boolean | Promise<boolean>;
  }

  let { question, onanswer }: Props = $props();
  let value = $state('');

  const isTextarea = $derived(question.type === 'textarea');
  const canSubmit = $derived(!question.required || value.trim().length > 0);

  async function submit() {
    if (!canSubmit) return;
    // Keep the typed text if the answer is rejected (e.g. invalid e-mail), so the
    // talent can fix it instead of retyping. Clear only once it is accepted.
    const accepted = await onanswer(value.trim());
    if (accepted) value = '';
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

<div class="flex items-end gap-2 border-t border-border bg-card px-4 py-3">
  {#if isTextarea}
    <textarea
      bind:value
      placeholder={question.placeholder ?? 'Ta réponse...'}
      rows={3}
      class="flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm transition-colors outline-none focus:border-epi-blue focus:ring-1 focus:ring-epi-blue"
      {onkeydown}
    ></textarea>
  {:else}
    <input
      type={inputKindMap[question.inputKind ?? 'text'] ?? 'text'}
      bind:value
      placeholder={question.placeholder ?? 'Ta réponse...'}
      class="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm transition-colors outline-none focus:border-epi-blue focus:ring-1 focus:ring-epi-blue"
      {onkeydown}
    />
  {/if}

  <!-- Actions kept as one bottom-anchored group: the row is `items-end` so the
       send button sits at the bottom of the (multi-line) field, and centring the
       pair here keeps "Passer" level with it instead of floating mid-height. -->
  <div class="flex shrink-0 items-center gap-2">
    {#if !question.required && value.trim().length === 0}
      <button
        type="button"
        class="cursor-pointer px-2 py-2 text-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
        onclick={() => onanswer('')}
      >
        Passer
      </button>
    {/if}

    <button
      type="button"
      class={cn(
        'flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-epi-tech text-epi-blue transition-opacity',
        !canSubmit && 'cursor-not-allowed opacity-40',
      )}
      disabled={!canSubmit}
      onclick={submit}
      aria-label="Envoyer ma réponse"
    >
      <Send size={18} />
    </button>
  </div>
</div>
