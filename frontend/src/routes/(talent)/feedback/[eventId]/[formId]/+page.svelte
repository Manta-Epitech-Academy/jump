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
      const res = await fetch('', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error('Erreur serveur');
      submitted = true;
    } catch {
      toast.error("Erreur lors de l'enregistrement. Reessaie.");
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

  <div class="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-6">
    <div
      class="flex flex-1 flex-col overflow-hidden rounded-3xl bg-white shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
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
