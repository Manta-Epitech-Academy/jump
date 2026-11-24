<script lang="ts">
  import { isHttpError } from '@sveltejs/kit';
  import { toast } from 'svelte-sonner';
  import TalentPageHeader from '#lib/components/talent/TalentPageHeader.svelte';
  import TalentFooter from '#lib/components/talent/TalentFooter.svelte';
  import ChatScreen from '#lib/components/feedback/ChatScreen.svelte';
  import type { Answers } from '#lib/domain/feedbackForms/schema.ts';
  import { mascotLookOf } from '#lib/domain/mascot.ts';
  import { useMascot } from '#lib/components/mascot/mascotController.svelte.ts';
  import { submitFeedback } from './feedback.remote.ts';

  let { data } = $props();
  const mascot = useMascot();

  async function handleSubmit(answers: Answers) {
    try {
      await submitFeedback({
        eventId: data.eventId,
        formId: data.formId,
        answers,
      });
      // Thanked once the answers are kept, never over a failure (#540).
      mascot()?.react({
        moment: 'feedbackDone',
        tokens: { evenement: data.eventName },
      });
    } catch (e) {
      // A refusal carries its own French message (`Réponses invalides : …`);
      // anything else is ours, and says only that it failed.
      toast.error(
        isHttpError(e) && e.status < 500
          ? e.body.message
          : "Erreur lors de l'enregistrement. Réessaie.",
      );
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
      class="flex h-full flex-col overflow-hidden sm:rounded-xl sm:shadow-raised dark:sm:shadow-none"
    >
      <ChatScreen
        form={data.formSchema}
        onSubmit={handleSubmit}
        identity={data.identity}
        audience="authenticated"
        mascot={data.talent ? mascotLookOf(data.talent) : undefined}
      />
    </div>
  </div>

  <TalentFooter class="shrink-0" />
</div>
