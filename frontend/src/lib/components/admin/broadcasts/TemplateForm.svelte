<script lang="ts">
  import type { SuperValidated } from 'sveltekit-superforms';
  import { superForm } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import PhoneInput from '$lib/components/ui/phone-input/PhoneInput.svelte';
  import { Label } from '$lib/components/ui/label';
  import Send from '@lucide/svelte/icons/send';
  import SegmentedFilter from '$lib/components/staff/SegmentedFilter.svelte';
  import MessageBodyEditor from './MessageBodyEditor.svelte';
  import MessagePreview from './MessagePreview.svelte';
  import { BROADCAST_CHANNEL_LABELS } from '$lib/domain/broadcasts';
  import type { MessageTemplateForm } from '$lib/validation/broadcasts';

  type Props = {
    data: SuperValidated<MessageTemplateForm>;
    submitLabel: string;
    formAction?: string;
    /** Whether the Brevo SMS backend is configured (gates the SMS test). */
    smsEnabled?: boolean;
    /** Sender's address, prefilled as the default mail test recipient. */
    userEmail?: string;
  };

  let {
    data,
    submitLabel,
    formAction,
    smsEnabled = false,
    userEmail = '',
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  const { form, errors, enhance, submitting } = superForm(data, {
    dataType: 'json',
    resetForm: false,
    validationMethod: 'onsubmit',
  });

  const channelOptions = [
    { value: 'mail', label: BROADCAST_CHANNEL_LABELS.mail },
    { value: 'sms', label: BROADCAST_CHANNEL_LABELS.sms },
  ];

  // ── Test send ───────────────────────────────────────────────────────
  // Ships the *in-progress* draft (no save) to one recipient, rendered with
  // demo variables. Email/phone kept in separate fields so a channel toggle
  // never leaks one channel's value into the other's input.
  // svelte-ignore state_referenced_locally
  let testEmail = $state(userEmail);
  let testPhone = $state('');
  const testRecipient = $derived(
    $form.channel === 'sms' ? testPhone : testEmail,
  );
  let testing = $state(false);
  const smsBlocked = $derived($form.channel === 'sms' && !smsEnabled);
  const testDisabled = $derived(
    testing ||
      smsBlocked ||
      !($form.body ?? '').trim() ||
      !testRecipient.trim(),
  );

  async function sendTest() {
    testing = true;
    try {
      const res = await fetch('/staff/admin/broadcasts/templates/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          channel: $form.channel,
          subject: $form.subject ?? null,
          body: $form.body ?? '',
          to: testRecipient.trim(),
        }),
      });
      const result = (await res.json()) as { ok: boolean; message?: string };
      if (result.ok) toast.success(`Test envoyé à ${testRecipient.trim()}.`);
      else toast.error(result.message ?? "Échec de l'envoi.");
    } catch {
      toast.error('Erreur réseau.');
    } finally {
      testing = false;
    }
  }
</script>

<form
  method="POST"
  action={formAction}
  use:enhance
  class="grid gap-6 lg:grid-cols-[1fr_380px]"
>
  <div class="space-y-5">
    <div class="grid gap-2">
      <Label for="name">Nom interne</Label>
      <Input id="name" name="name" bind:value={$form.name} required />
      <p class="text-xs text-muted-foreground">
        Repère ce modèle dans la liste : non visible par le destinataire.
      </p>
      {#if $errors.name}
        <p class="text-xs text-destructive">{$errors.name}</p>
      {/if}
    </div>

    <div class="grid gap-2">
      <Label>Canal</Label>
      <SegmentedFilter
        options={channelOptions}
        value={$form.channel}
        onChange={(v) => ($form.channel = v as 'mail' | 'sms')}
        ariaLabel="Canal du modèle"
      />
      {#if $errors.channel}
        <p class="text-xs text-destructive">{$errors.channel}</p>
      {/if}
    </div>

    {#if $form.channel === 'mail'}
      <div class="grid gap-2">
        <Label for="subject">Sujet</Label>
        <Input
          id="subject"
          name="subject"
          bind:value={$form.subject}
          placeholder="Ex : Invitation Coding Club n°{'{{event_name}}'}"
        />
        {#if $errors.subject}
          <p class="text-xs text-destructive">{$errors.subject}</p>
        {/if}
      </div>
    {/if}

    <MessageBodyEditor bind:value={$form.body} channel={$form.channel} />
    {#if $errors.body}
      <p class="text-xs text-destructive">{$errors.body}</p>
    {/if}

    <div class="flex items-center gap-3 pt-1">
      <Button type="submit" disabled={$submitting}>{submitLabel}</Button>
    </div>
  </div>

  <aside class="space-y-4 lg:sticky lg:top-4 lg:self-start">
    <div class="rounded-sm border bg-card p-4">
      <h3 class="mb-3 epi-overline text-muted-foreground">Aperçu</h3>
      <MessagePreview
        channel={$form.channel}
        subject={$form.subject}
        body={$form.body ?? ''}
      />
    </div>

    <div class="space-y-2 rounded-sm border bg-muted/20 p-4">
      <Label for="testRecipient" class="text-sm font-medium">
        S'envoyer un test
      </Label>
      <p class="text-xs text-muted-foreground">
        Envoie ce brouillon (variables fictives) à un {$form.channel === 'sms'
          ? 'numéro'
          : 'email'}, sans enregistrer.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        {#if $form.channel === 'sms'}
          <div class="w-full">
            <PhoneInput
              id="testRecipient"
              bind:value={testPhone}
              disabled={smsBlocked}
              placeholder="06 12 34 56 78"
            />
          </div>
        {:else}
          <Input
            id="testRecipient"
            type="email"
            bind:value={testEmail}
            placeholder="ex : prenom.nom@epitech.eu"
            class="flex-1"
          />
        {/if}
        <Button
          type="button"
          variant="outline"
          onclick={sendTest}
          disabled={testDisabled}
        >
          <Send class="mr-1 h-3.5 w-3.5" />
          {testing ? 'Envoi…' : 'Tester'}
        </Button>
      </div>
      {#if smsBlocked}
        <p class="text-xs text-destructive">
          SMS non configuré (<code>SMS_PROVIDER</code>) : test indisponible.
        </p>
      {/if}
    </div>
  </aside>
</form>
