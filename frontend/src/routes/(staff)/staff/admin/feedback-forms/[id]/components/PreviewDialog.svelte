<script lang="ts">
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import ChatScreen from '$lib/components/feedback/ChatScreen.svelte';
  import type { PreviewAudience } from '$lib/domain/feedbackForms/projectToSchema';
  import type {
    FormSchema,
    IdentityContext,
  } from '$lib/domain/feedbackForms/schema';

  let {
    open = $bindable(false),
    audience = $bindable<PreviewAudience>('public'),
    schema,
    identity = {},
  }: {
    open: boolean;
    audience?: PreviewAudience;
    schema: FormSchema;
    identity?: IdentityContext;
  } = $props();

  // The dialog unmounts its content on close, so every open already replays the
  // conversation from the top against the current draft. `run` is bumped only by
  // "Redémarrer", to remount without closing.
  let run = $state(0);

  // Switch between the two answering experiences: a connected talent never sees
  // identity questions (Jump fills them), a public respondent is asked them.
  const AUDIENCES: { value: PreviewAudience; label: string }[] = [
    { value: 'authenticated', label: 'Talent connecté' },
    { value: 'public', label: 'Répondant public' },
  ];

  const hasQuestions = $derived(schema.questions.length > 0);
  // The preview never persists: swallow the chat's terminal submit.
  const noop = async () => {};
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="gap-0 overflow-hidden p-0 sm:max-w-md">
    <Dialog.Header
      class="flex flex-row flex-wrap items-center gap-2 space-y-0 border-b bg-muted/40 px-4 py-2 pr-12 text-left"
    >
      <div class="mr-auto flex flex-col">
        <Dialog.Title class="text-sm font-semibold">Aperçu</Dialog.Title>
        <Dialog.Description class="text-[11px]">
          Les réponses ne sont pas enregistrées.
        </Dialog.Description>
      </div>
      <!-- Audience switch: shows how the same form differs for a connected talent
           (identity questions hidden, copy pré-remplie) vs a public respondent. -->
      <div class="flex items-center rounded-sm border p-0.5">
        {#each AUDIENCES as a (a.value)}
          <button
            type="button"
            class="cursor-pointer rounded-sm px-2 py-1 text-xs font-medium transition-colors {audience ===
            a.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'}"
            onclick={() => (audience = a.value)}
          >
            {a.label}
          </button>
        {/each}
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
        {#key `${run}-${audience}`}
          <ChatScreen form={schema} onSubmit={noop} {identity} />
        {/key}
      </div>
    {:else}
      <p class="px-4 py-16 text-center text-sm text-muted-foreground">
        Ajoutez au moins une question pour prévisualiser le formulaire.
      </p>
    {/if}
  </Dialog.Content>
</Dialog.Root>
