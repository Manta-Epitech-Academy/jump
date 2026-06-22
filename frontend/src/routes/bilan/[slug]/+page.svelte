<script lang="ts">
  import { toast } from 'svelte-sonner';
  import EpitechLogo from '$lib/components/layout/EpitechLogo.svelte';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import ChatScreen from '$lib/components/feedback/ChatScreen.svelte';
  import type { Answers } from '$lib/domain/feedbackForms/schema';

  let { data } = $props();

  let submitted = $state(false);
  let submitting = $state(false);

  async function handleSubmit(answers: Answers) {
    if (submitting || submitted) return;
    submitting = true;
    try {
      const res = await fetch(`/api/bilan/${data.slug}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? 'Erreur serveur');
      }
      submitted = true;
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Erreur lors de l'enregistrement. Réessaie.",
      );
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>{data.formSchema.title}</title>
</svelte:head>

<!-- Full-height app shell: the chat pane flexes to fill and scrolls internally.
     Full-bleed on mobile; framed card from sm up. -->
<div class="flex h-dvh flex-col overflow-hidden">
  <header class="shrink-0">
    <div
      class="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-4 md:px-8"
    >
      <EpitechLogo class="h-8 w-auto" />
      <ModeToggle />
    </div>
  </header>

  <div class="mx-auto min-h-0 w-full max-w-4xl flex-1 sm:px-4 sm:py-6">
    <div
      class="flex h-full flex-col overflow-hidden sm:rounded-2xl sm:shadow-xl sm:shadow-slate-200/50 dark:sm:shadow-none"
    >
      <ChatScreen form={data.formSchema} prefill={{}} onSubmit={handleSubmit} />
    </div>
  </div>
</div>
