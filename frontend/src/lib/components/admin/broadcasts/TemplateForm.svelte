<script lang="ts">
  import type { SuperValidated } from 'sveltekit-superforms';
  import { superForm } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as Select from '$lib/components/ui/select';
  import VariablesPanel from './VariablesPanel.svelte';
  import {
    BROADCAST_CHANNELS,
    BROADCAST_CHANNEL_LABELS,
  } from '$lib/domain/broadcasts';
  import {
    SMS_SINGLE_SEGMENT_CHARS,
    SMS_BROADCAST_MAX_CHARS,
    SMS_MAX_SEGMENTS,
    estimateSmsLength,
    smsSegments,
  } from '$lib/domain/sms';
  import {
    substituteVariables,
    buildDemoContext,
  } from '$lib/domain/broadcastVariables';
  import { renderBroadcastMail } from '$lib/domain/broadcastMarkdown';
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

  // ── Test send ───────────────────────────────────────────────────────
  // Ships the *in-progress* draft (no save needed) to one recipient via the
  // /templates/test endpoint, rendered with demo variables. The field is an
  // email or a phone depending on the channel.
  // svelte-ignore state_referenced_locally
  let testRecipient = $state(userEmail);
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

  function insertVariable(token: string) {
    $form.body = ($form.body ?? '') + token;
  }

  const demoCtx = buildDemoContext();
  const previewSubject = $derived(
    $form.subject ? substituteVariables($form.subject, demoCtx) : '',
  );
  const previewBodyRaw = $derived(
    substituteVariables($form.body ?? '', demoCtx),
  );
  const previewMailHtml = $derived(
    $form.channel === 'mail' ? renderBroadcastMail(previewBodyRaw) : '',
  );

  const smsLength = $derived(
    $form.channel === 'sms' ? estimateSmsLength($form.body ?? '') : 0,
  );
  const smsSegmentCount = $derived(smsSegments(smsLength));
  // Multipart (>1 SMS) is allowed — it just costs more, so we warn. Over the
  // segment ceiling, the template can't be saved (see messageTemplateSchema).
  const smsMultipart = $derived(smsSegmentCount > 1);
  const smsOverCeiling = $derived(smsLength > SMS_BROADCAST_MAX_CHARS);
</script>

<form
  method="POST"
  action={formAction}
  use:enhance
  class="grid gap-6 lg:grid-cols-[1fr_280px]"
>
  <div class="space-y-6">
    <div class="grid gap-2">
      <Label for="name">Nom interne</Label>
      <Input id="name" name="name" bind:value={$form.name} required />
      {#if $errors.name}
        <p class="text-xs text-destructive">{$errors.name}</p>
      {/if}
    </div>

    <div class="grid gap-2">
      <Label for="channel">Canal</Label>
      <Select.Root
        type="single"
        value={$form.channel}
        onValueChange={(v) =>
          ($form.channel = v as (typeof BROADCAST_CHANNELS)[number])}
      >
        <Select.Trigger id="channel" class="w-full">
          {BROADCAST_CHANNEL_LABELS[$form.channel]}
        </Select.Trigger>
        <Select.Content>
          {#each BROADCAST_CHANNELS as channel (channel)}
            <Select.Item value={channel}>
              {BROADCAST_CHANNEL_LABELS[channel]}
            </Select.Item>
          {/each}
        </Select.Content>
      </Select.Root>
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

    <div class="grid gap-2">
      <div class="flex items-center justify-between">
        <Label for="body">Corps</Label>
        {#if $form.channel === 'sms'}
          <span
            class="text-xs {smsOverCeiling
              ? 'font-semibold text-destructive'
              : smsMultipart
                ? 'font-medium text-amber-600 dark:text-amber-500'
                : 'text-muted-foreground'}"
          >
            {smsLength} caractères · ≈ {smsSegmentCount} SMS
          </span>
        {/if}
      </div>
      <Textarea
        id="body"
        name="body"
        bind:value={$form.body}
        rows={$form.channel === 'sms' ? 4 : 16}
        class={$form.channel === 'mail' ? 'font-mono text-sm' : ''}
        placeholder={$form.channel === 'mail'
          ? 'Markdown. Titres avec #, gras **texte**, listes -, etc.\nPour un bouton centré : :button[Mon libellé](https://...)\nVariables {{prenom}}, {{event_name}}… (panneau à droite).'
          : 'Idéalement court : un seul SMS = 160 caractères.'}
      />
      {#if $errors.body}
        <p class="text-xs text-destructive">{$errors.body}</p>
      {/if}
      {#if $form.channel === 'sms'}
        {#if smsOverCeiling}
          <p class="text-xs font-medium text-destructive">
            Trop long : {SMS_MAX_SEGMENTS} SMS maximum par destinataire. Vous ne pourrez
            pas enregistrer ce modèle tant qu'il dépasse — raccourcissez le texte
            (ou retirez un lien).
          </p>
        {:else if smsMultipart}
          <p class="text-xs font-medium text-amber-600 dark:text-amber-500">
            Plus de {SMS_SINGLE_SEGMENT_CHARS} caractères : ce message partira en
            {smsSegmentCount}
            SMS par destinataire, et sera donc facturé {smsSegmentCount} fois par
            personne.
          </p>
        {:else}
          <p class="text-xs text-muted-foreground">
            Un SMS fait {SMS_SINGLE_SEGMENT_CHARS} caractères. Au-delà, le message
            est découpé en plusieurs SMS (facturés séparément). Chaque lien compte
            pour plus de caractères qu'à l'écran : il est rallongé automatiquement
            pour mesurer les clics.
          </p>
        {/if}
      {/if}
    </div>

    <details class="rounded-md border bg-muted/20 p-3 text-sm" open>
      <summary class="cursor-pointer font-medium"
        >Aperçu avec données fictives</summary
      >
      <div class="mt-3 space-y-2">
        {#if $form.channel === 'mail' && previewSubject}
          <p class="text-xs">
            <span class="font-semibold">Sujet : </span>{previewSubject}
          </p>
        {/if}
        {#if $form.channel === 'mail'}
          <div class="overflow-hidden rounded border">
            {@html previewMailHtml}
          </div>
        {:else}
          <pre
            class="rounded border bg-white p-3 text-xs whitespace-pre-wrap text-slate-800 dark:bg-slate-900 dark:text-slate-200">{previewBodyRaw}</pre>
        {/if}
      </div>
    </details>

    <div class="space-y-2 rounded-md border bg-muted/20 p-3">
      <Label for="testRecipient" class="text-sm font-medium">
        S'envoyer un test
      </Label>
      <p class="text-xs text-muted-foreground">
        Envoie ce brouillon (variables remplies par des valeurs fictives) à un
        {$form.channel === 'sms' ? 'numéro' : 'email'}, sans enregistrer le
        template.
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <Input
          id="testRecipient"
          type={$form.channel === 'sms' ? 'tel' : 'email'}
          bind:value={testRecipient}
          disabled={smsBlocked}
          placeholder={$form.channel === 'sms'
            ? 'ex : +33 6 12 34 56 78'
            : 'ex : prenom.nom@epitech.eu'}
          class="max-w-xs"
        />
        <Button
          type="button"
          variant="outline"
          onclick={sendTest}
          disabled={testDisabled}
        >
          {testing ? 'Envoi…' : 'Envoyer le test'}
        </Button>
      </div>
      {#if smsBlocked}
        <p class="text-xs text-destructive">
          SMS non configuré (<code>SMS_PROVIDER</code>) — test indisponible.
        </p>
      {/if}
    </div>

    <div class="flex items-center gap-3">
      <Button type="submit" disabled={$submitting}>{submitLabel}</Button>
    </div>
  </div>

  <aside class="space-y-4">
    <VariablesPanel onInsert={insertVariable} channel={$form.channel} />
  </aside>
</form>
