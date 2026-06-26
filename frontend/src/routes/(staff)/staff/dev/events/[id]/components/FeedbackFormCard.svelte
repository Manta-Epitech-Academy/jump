<script lang="ts">
  import { untrack } from 'svelte';
  import { superForm, type SuperValidated } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import { onErrorToast } from '$lib/utils/formErrors';
  import * as Card from '$lib/components/ui/card';
  import * as Select from '$lib/components/ui/select';
  import { Button } from '$lib/components/ui/button';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import MessageSquare from '@lucide/svelte/icons/message-square';

  type FormData = { feedbackFormId: string };

  let {
    data,
    options,
    defaultFormTitle,
    isLead,
  }: {
    data: SuperValidated<FormData>;
    /** Published, answerable forms the event can use. */
    options: { value: string; label: string }[];
    /** Title of the form resolved by the event type default, if any. */
    defaultFormTitle: string | null;
    isLead: boolean;
  } = $props();

  const { form, enhance, delayed } = superForm(
    untrack(() => data),
    {
      id: 'event-feedback-form',
      resetForm: false,
      onResult: ({ result }) => {
        if (result.type === 'success') {
          toast.success(result.data?.form?.message ?? 'Formulaire enregistré.');
        } else if (result.type === 'failure') {
          toast.error(result.data?.form?.message ?? 'Action impossible.');
        }
      },
      onError: onErrorToast(),
    },
  );

  // '' (use the type default) maps to a sentinel because bits-ui Select needs a
  // non-empty value; mapped back on change.
  const DEFAULT = 'default';
  const defaultLabel = $derived(
    defaultFormTitle
      ? `Par défaut (${defaultFormTitle})`
      : 'Par défaut (aucun formulaire pour ce type)',
  );
  const triggerLabel = $derived(
    $form.feedbackFormId
      ? (options.find((o) => o.value === $form.feedbackFormId)?.label ??
          'Formulaire inconnu')
      : defaultLabel,
  );
</script>

<Card.Root class="rounded-sm">
  <Card.Header>
    <Card.Title class="flex items-center gap-2 text-base">
      <MessageSquare class="h-4 w-4" /> Formulaire de feedback
    </Card.Title>
    <Card.Description>
      Le formulaire proposé aux talents de cet événement (onglet Feedback, QR,
      export). Laissez « Par défaut » pour utiliser le formulaire du type
      d'événement.
    </Card.Description>
  </Card.Header>
  <form method="POST" action="?/setEventFeedbackForm" use:enhance>
    <Card.Content class="flex flex-wrap items-center gap-3">
      <input type="hidden" name="feedbackFormId" value={$form.feedbackFormId} />
      <Select.Root
        type="single"
        value={$form.feedbackFormId || DEFAULT}
        onValueChange={(v) => ($form.feedbackFormId = v === DEFAULT ? '' : v)}
        disabled={!isLead}
      >
        <Select.Trigger class="h-9 w-full max-w-md rounded-sm sm:w-80">
          {triggerLabel}
        </Select.Trigger>
        <Select.Content>
          <Select.Item value={DEFAULT}>{defaultLabel}</Select.Item>
          {#each options as opt (opt.value)}
            <Select.Item value={opt.value}>{opt.label}</Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
      {#if isLead}
        <Button type="submit" size="sm" disabled={$delayed}>
          {#if $delayed}
            <LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> Enregistrement...
          {:else}
            Enregistrer
          {/if}
        </Button>
      {/if}
    </Card.Content>
  </form>
</Card.Root>
