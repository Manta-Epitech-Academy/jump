<script lang="ts">
  import type { FormSchema, Answers } from '$lib/domain/feedbackForms/schema';
  import { Conversation } from '$lib/domain/feedbackForms/conversation.svelte';
  import ChatThread from './ChatThread.svelte';
  import QuickReplies from './QuickReplies.svelte';
  import ScaleRating from './ScaleRating.svelte';
  import TextInput from './TextInput.svelte';

  interface Props {
    form: FormSchema;
    prefill?: Answers;
    onSubmit: (answers: Answers) => Promise<void>;
  }

  let { form, prefill = {}, onSubmit }: Props = $props();

  const initialForm = form;
  const initialPrefill = prefill;
  const conv = new Conversation(initialForm, initialPrefill);
  let submitted = $state(false);

  $effect(() => {
    conv.start();
  });

  $effect(() => {
    if (conv.isDone && !submitted) {
      submitted = true;
      onSubmit(conv.answers);
    }
  });

  const showChoices = $derived(
    conv.status === 'awaiting' &&
      conv.current &&
      (conv.current.type === 'single' ||
        conv.current.type === 'multiple' ||
        conv.current.type === 'gate'),
  );

  const showScale = $derived(
    conv.status === 'awaiting' && conv.current?.type === 'scale',
  );

  const showText = $derived(
    conv.status === 'awaiting' &&
      conv.current &&
      (conv.current.type === 'text' || conv.current.type === 'textarea'),
  );
</script>

<div class="flex h-full flex-col bg-slate-50 dark:bg-slate-900">
  <!-- Header -->
  <div
    class="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
  >
    <div class="relative">
      <img
        src="/canard.png"
        alt="Bernard le canard"
        class="h-8 w-8 rounded-full object-cover"
      />
      <span
        class="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500 dark:border-slate-800"
      ></span>
    </div>
    <div class="flex flex-col">
      <span class="text-sm leading-tight font-semibold">Bernard le canard</span>
      <span class="text-xs text-muted-foreground">{form.title}</span>
    </div>
  </div>

  <!-- Chat thread -->
  <ChatThread messages={conv.messages} typing={conv.status === 'typing'} />

  <!-- Response dock: all answer inputs live here, flush at the bottom -->
  <div class="px-4 py-3">
    {#if conv.error}
      <p class="mb-2 text-center text-xs text-red-500">{conv.error}</p>
    {/if}

    {#if conv.isDone}
      <div class="flex flex-col items-center gap-3 py-3">
        <p class="text-center text-sm font-medium">Merci pour ton retour !</p>
        <a
          href="/"
          class="rounded-full bg-epi-blue px-6 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Retour a mon espace
        </a>
      </div>
    {:else if showChoices && conv.current}
      <QuickReplies question={conv.current} onanswer={(v) => conv.answer(v)} />
    {:else if showScale && conv.current?.options}
      <ScaleRating
        options={conv.current.options}
        onanswer={(value, display) => conv.answer(value, display)}
      />
      {#if conv.current.extraOptions?.length}
        <div class="mt-2 text-center">
          {#each conv.current.extraOptions as eo (eo)}
            <button
              type="button"
              class="text-xs text-muted-foreground underline underline-offset-2"
              onclick={() => conv.answer(eo)}>{eo}</button
            >
          {/each}
        </div>
      {/if}
    {:else if showText && conv.current}
      <TextInput question={conv.current} onanswer={(v) => conv.answer(v)} />
    {/if}
  </div>
</div>
