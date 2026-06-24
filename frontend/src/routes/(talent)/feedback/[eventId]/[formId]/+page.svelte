<script lang="ts">
  import { toast } from 'svelte-sonner';
  import TalentPageHeader from '$lib/components/talent/TalentPageHeader.svelte';
  import TalentFooter from '$lib/components/talent/TalentFooter.svelte';
  import ChatScreen from '$lib/components/feedback/ChatScreen.svelte';
  import type { Answers } from '$lib/domain/feedbackForms/schema';

  let { data } = $props();

  let submitted = $state(false);
  let submitting = $state(false);

  async function handleSubmit(answers: Answers) {
    if (submitting || submitted) return;
    submitting = true;
    try {
      const res = await fetch(`/api/feedback/${data.eventId}/${data.formId}`, {
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
          : "Erreur lors de l'enregistrement. Reessaie.",
      );
    } finally {
      submitting = false;
    }
  }
</script>

<svelte:head>
  <title>Feedback - {data.formSchema.title}</title>
</svelte:head>

<!-- Full-height app shell: header + footer are shrink-0, the chat pane flexes to
     fill and scrolls internally (no page scroll, no fixed-height hack). Full-bleed
     on mobile; framed card from sm up. -->
<div class="flex h-dvh flex-col overflow-hidden">
  <TalentPageHeader title="Feedback" backHref="/" />

  <div class="mx-auto min-h-0 w-full max-w-4xl flex-1 sm:px-4 sm:py-6">
    <div
      class="flex h-full flex-col overflow-hidden sm:rounded-2xl sm:shadow-xl sm:shadow-slate-200/50 dark:sm:shadow-none"
    >
      <ChatScreen
        form={data.formSchema}
        onSubmit={handleSubmit}
        identity={data.identity}
        audience="authenticated"
      />
    </div>
  </div>

  <TalentFooter class="shrink-0" />
</div>
