<script lang="ts">
  import type { SuperValidated } from 'sveltekit-superforms';
  import { superForm } from 'sveltekit-superforms';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import VariablesPanel from './VariablesPanel.svelte';
  import {
    BROADCAST_CHANNELS,
    BROADCAST_CHANNEL_LABELS,
    SMS_MAX_LENGTH,
    estimateSmsLength,
  } from '$lib/domain/broadcasts';
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
    onDelete?: () => void;
  };

  let { data, submitLabel, formAction, onDelete }: Props = $props();

  // svelte-ignore state_referenced_locally
  const { form, errors, enhance, submitting } = superForm(data, {
    dataType: 'json',
    resetForm: false,
    validationMethod: 'onsubmit',
  });

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
  const smsOverLimit = $derived(smsLength > SMS_MAX_LENGTH);
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
      <select
        id="channel"
        name="channel"
        bind:value={$form.channel}
        class="h-9 rounded-md border border-input bg-background px-3 text-sm"
      >
        {#each BROADCAST_CHANNELS as channel}
          <option value={channel}>{BROADCAST_CHANNEL_LABELS[channel]}</option>
        {/each}
      </select>
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
            class="text-xs {smsOverLimit
              ? 'font-semibold text-destructive'
              : 'text-muted-foreground'}"
          >
            ~{smsLength} / {SMS_MAX_LENGTH} car. (liens trackés inclus)
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
          : 'Texte simple. 160 caractères max après ajout des liens trackés.'}
      />
      {#if $errors.body}
        <p class="text-xs text-destructive">{$errors.body}</p>
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

    <div class="flex items-center gap-3">
      <Button type="submit" disabled={$submitting}>{submitLabel}</Button>
      {#if onDelete}
        <Button
          type="button"
          variant="destructive"
          onclick={onDelete}
          disabled={$submitting}
        >
          Supprimer
        </Button>
      {/if}
    </div>
  </div>

  <aside class="space-y-4">
    <VariablesPanel onInsert={insertVariable} channel={$form.channel} />
  </aside>
</form>
