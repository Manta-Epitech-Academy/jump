<script lang="ts">
  import { toast } from 'svelte-sonner';
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

<ChatScreen
  form={data.formSchema}
  prefill={data.prefill}
  onSubmit={handleSubmit}
/>
