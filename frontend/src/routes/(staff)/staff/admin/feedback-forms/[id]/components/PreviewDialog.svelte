<script lang="ts">
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import ChatScreen from '$lib/components/feedback/ChatScreen.svelte';
  import type { FormSchema } from '$lib/domain/feedbackForms/schema';

  let {
    open = $bindable(false),
    schema,
  }: { open: boolean; schema: FormSchema } = $props();

  // The dialog unmounts its content on close, so every open already replays the
  // conversation from the top against the current draft. `run` is bumped only by
  // "Redémarrer", to remount without closing.
  let run = $state(0);

  const hasQuestions = $derived(schema.questions.length > 0);
  // The preview never persists: swallow the chat's terminal submit.
  const noop = async () => {};
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-md">
    <Dialog.Header
      class="flex flex-row items-center gap-3 space-y-0 border-b bg-muted/40 px-4 py-2 pr-12 text-left"
    >
      <div class="flex flex-col">
        <Dialog.Title class="text-sm font-semibold">Aperçu</Dialog.Title>
        <Dialog.Description class="text-[11px]">
          Les réponses ne sont pas enregistrées.
        </Dialog.Description>
      </div>
      <Button
        variant="outline"
        size="sm"
        class="h-7 rounded-sm"
        onclick={() => run++}
        disabled={!hasQuestions}
      >
        <RotateCcw class="mr-1.5 h-3.5 w-3.5" /> Redémarrer
      </Button>
    </Dialog.Header>

    {#if hasQuestions}
      <div class="h-[72vh]">
        {#key run}
          <ChatScreen form={schema} onSubmit={noop} />
        {/key}
      </div>
    {:else}
      <p class="px-4 py-16 text-center text-sm text-muted-foreground">
        Ajoutez au moins une question pour prévisualiser le formulaire.
      </p>
    {/if}
  </Dialog.Content>
</Dialog.Root>
