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

<div class="flex min-h-dvh flex-col">
  <TalentPageHeader title="Feedback" backHref="/" />

  <div
    class="mx-auto w-full max-w-4xl px-4 py-6"
    style="height: calc(100dvh - 10rem);"
  >
    <div
      class="flex h-full flex-col overflow-hidden rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none"
    >
      <ChatScreen
        form={data.formSchema}
        prefill={data.prefill}
        onSubmit={handleSubmit}
      />
    </div>
  </div>

  <TalentFooter />
</div>
