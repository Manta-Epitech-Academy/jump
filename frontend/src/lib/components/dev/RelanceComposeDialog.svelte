<script lang="ts">
  import { tick, untrack } from 'svelte';
  import Send from '@lucide/svelte/icons/send';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import Mail from '@lucide/svelte/icons/mail';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import {
    superForm,
    type Infer,
    type SuperValidated,
  } from 'sveltekit-superforms';
  import { toast } from 'svelte-sonner';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import { cn } from '$lib/utils';
  import {
    applyPlaceholders,
    relanceVarsFor,
    RELANCE_SKIP_LABELS,
    RELANCE_SMS_BODY_MAX,
    type RelanceChannel,
    type RelanceSkipReason,
    type RelanceType,
    type RelanceVar,
  } from '$lib/domain/relance';
  import {
    RELANCE_SMS_DEFAULTS,
    type RelanceTemplate,
  } from '$lib/domain/relanceTemplates';
  import {
    RELANCE_BODY_MAX,
    RELANCE_SUBJECT_MAX,
    type sendRelanceSchema,
  } from '$lib/validation/reminders';

  type RelanceForm = SuperValidated<Infer<typeof sendRelanceSchema>>;

  /** A recipient can be ineligible for one channel but not the other. */
  export type RecipientSkip = {
    email?: RelanceSkipReason;
    sms?: RelanceSkipReason;
  };

  export type ComposeRecipient = {
    id: string;
    label: string;
    willSkip: RecipientSkip;
  };

  let {
    open = $bindable(false),
    type,
    recipients,
    formAction,
    initialForm,
    defaultTemplate,
    hasMapping = true,
    smsEnabled = false,
    previewVars = {},
    onSent,
  }: {
    open?: boolean;
    type: RelanceType;
    recipients: ComposeRecipient[];
    formAction: string;
    initialForm: RelanceForm;
    defaultTemplate: RelanceTemplate;
    /**
     * Whether an EmailActionMapping exists for this relance type. When
     * false, the email channel shows a blocking warning and disables send —
     * `sendRelances` would skip every recipient with `noTemplate`.
     */
    hasMapping?: boolean;
    /**
     * Whether a real SMS backend is configured (`SMS_PROVIDER`). When false,
     * the SMS channel shows a blocking warning and disables send — every
     * recipient would otherwise fail at the (null) provider.
     */
    smsEnabled?: boolean;
    /** First-recipient values to render the live preview. */
    previewVars?: Partial<Record<RelanceVar, string>>;
    onSent?: () => void;
  } = $props();

  let channel = $state<RelanceChannel>('email');
  let subject = $state('');
  let body = $state('');

  const isSms = $derived(channel === 'sms');

  function bodyDefaultFor(c: RelanceChannel): string {
    return c === 'sms' ? RELANCE_SMS_DEFAULTS[type] : defaultTemplate.body;
  }

  function applyChannel(next: RelanceChannel) {
    channel = next;
    subject = next === 'sms' ? '' : defaultTemplate.subject;
    body = bodyDefaultFor(next);
  }

  // Reset to the (possibly fresh) defaults every time the dialog opens. The
  // channel always opens on email — SMS is a deliberate escalation choice.
  $effect(() => {
    if (open) applyChannel('email');
  });

  const { enhance, delayed } = superForm(
    untrack(() => initialForm),
    {
      resetForm: false,
      onResult: ({ result }) => {
        if (result.type === 'success') {
          toast.success(result.data?.form?.message || 'Relances envoyées');
          open = false;
          onSent?.();
        } else if (result.type === 'failure' && result.data?.form?.message) {
          toast.error(result.data.form.message);
        }
      },
    },
  );

  const skipOf = (r: ComposeRecipient): RelanceSkipReason | undefined =>
    isSms ? r.willSkip.sms : r.willSkip.email;
  const eligible = $derived(recipients.filter((r) => !skipOf(r)));
  const skipped = $derived(recipients.filter((r) => skipOf(r)));
  const previewSubject = $derived(applyPlaceholders(subject, previewVars));
  const previewBody = $derived(applyPlaceholders(body, previewVars));
  const previewParagraphs = $derived(
    previewBody
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean),
  );

  // Rough GSM-7 segment estimate: a single SMS holds 160 chars, multi-part
  // messages 153 each. Accented chars would force UCS-2 (70/segment) but the
  // default body is ASCII; staff see the count drift if they paste accents.
  const smsSegments = $derived(
    body.length === 0
      ? 0
      : body.length <= 160
        ? 1
        : Math.ceil(body.length / 153),
  );

  const channelBlocked = $derived(isSms ? !smsEnabled : !hasMapping);

  const sendDisabled = $derived(
    $delayed ||
      channelBlocked ||
      eligible.length === 0 ||
      body.trim().length === 0 ||
      (isSms
        ? body.length > RELANCE_SMS_BODY_MAX
        : subject.trim().length === 0),
  );

  const availableVars = $derived(relanceVarsFor(type, channel));

  function reset() {
    applyChannel(channel);
  }

  // DOM refs for cursor-aware variable insertion. The dialog's variable
  // chips insert `{{var}}` at the caret of whichever field was focused
  // last; if neither has been touched yet, body is the natural default.
  let subjectEl = $state<HTMLInputElement | null>(null);
  let bodyEl = $state<HTMLTextAreaElement | null>(null);
  let activeField = $state<'subject' | 'body'>('body');

  async function insertVariable(name: string) {
    const token = `{{${name}}}`;
    // SMS has no subject field — always target the body there.
    const isSubject = !isSms && activeField === 'subject';
    const el: HTMLInputElement | HTMLTextAreaElement | null = isSubject
      ? subjectEl
      : bodyEl;
    const current = isSubject ? subject : body;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);

    if (isSubject) subject = next;
    else body = next;

    // Wait for Svelte to flush the new value back into the DOM, then
    // restore focus + caret right after the inserted token.
    await tick();
    if (el) {
      el.focus();
      const caret = start + token.length;
      el.setSelectionRange(caret, caret);
    }
  }

  const channelTabs: {
    value: RelanceChannel;
    label: string;
    icon: typeof Mail;
  }[] = [
    { value: 'email', label: 'Email', icon: Mail },
    { value: 'sms', label: 'SMS', icon: MessageSquare },
  ];
</script>

<Dialog.Root
  {open}
  onOpenChange={(o) => {
    open = o;
  }}
>
  <Dialog.Content class="sm:max-w-2xl">
    <form method="POST" action={formAction} use:enhance>
      <Dialog.Header>
        <Dialog.Title class="font-heading text-xl tracking-wide uppercase">
          Relance · {type === 'student' ? 'étudiants' : 'parents'}
          <span class="font-mono text-sm font-normal text-muted-foreground">
            ({eligible.length} destinataire{eligible.length > 1 ? 's' : ''})
          </span>
        </Dialog.Title>
        <Dialog.Description>
          {#if isSms}
            Le SMS rappelle de consulter la boîte mail — sans lien. Escalade à
            réserver aux destinataires déjà relancés par email.
          {:else}
            Le modèle est pré-rempli ; modifie l'objet ou le corps avant
            d'envoyer si besoin. Les variables seront remplacées pour chaque
            destinataire.
          {/if}
        </Dialog.Description>
      </Dialog.Header>

      <div class="mt-4 space-y-4">
        <!-- Channel toggle -->
        <div
          class="flex w-fit gap-1 rounded-sm border border-border bg-muted/30 p-1"
        >
          {#each channelTabs as tab (tab.value)}
            {@const active = channel === tab.value}
            <button
              type="button"
              onclick={() => applyChannel(tab.value)}
              class={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-bold tracking-widest uppercase transition-colors',
                active
                  ? 'bg-epi-blue text-white'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={active}
            >
              <tab.icon class="h-3.5 w-3.5" />
              {tab.label}
            </button>
          {/each}
        </div>

        {#if channelBlocked}
          <div
            class="flex items-start gap-3 rounded-md border-2 border-destructive bg-destructive/10 p-3 text-sm"
            role="alert"
          >
            <AlertTriangle class="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div class="space-y-1">
              <p class="font-bold tracking-tight text-destructive uppercase">
                {isSms ? 'SMS non configuré' : 'Template non configuré'}
              </p>
              {#if isSms}
                <p class="text-xs">
                  Aucun fournisseur SMS n'est configuré (<code
                    >SMS_PROVIDER</code
                  >). Le bouton d'envoi est désactivé. Renseigne le fournisseur
                  Brevo côté serveur avant d'envoyer un SMS.
                </p>
              {:else}
                <p class="text-xs">
                  Aucun template n'est associé à l'action <code
                    >relance_{type}</code
                  >. Le bouton d'envoi est désactivé. Configure un template dans
                  <strong>Admin → Mails transactionnels</strong> avant de pouvoir
                  envoyer cette relance.
                </p>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Recipients -->
        <section class="space-y-1.5">
          <Label
            class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
          >
            Destinataires
          </Label>
          <div
            class="flex flex-wrap gap-1.5 rounded-sm border border-border bg-muted/30 px-3 py-2 text-xs"
          >
            {#each recipients as r (r.id)}
              {@const skip = skipOf(r)}
              <span
                class="inline-flex items-center gap-1 rounded-sm bg-card px-1.5 py-0.5 font-medium"
                class:opacity-50={skip}
                class:line-through={skip}
                title={skip ? RELANCE_SKIP_LABELS[skip] : undefined}
              >
                {r.label}
              </span>
            {/each}
          </div>
          {#if skipped.length > 0}
            <p
              class="flex items-center gap-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-400"
            >
              <AlertTriangle class="h-3.5 w-3.5 shrink-0" />
              <span>
                <span class="font-bold">{skipped.length}</span>
                destinataire{skipped.length > 1 ? 's' : ''} ignoré{skipped.length >
                1
                  ? 's'
                  : ''} ({[
                  ...new Set(
                    skipped.map((s) => RELANCE_SKIP_LABELS[skipOf(s)!]),
                  ),
                ].join(', ')}).
              </span>
            </p>
          {/if}
        </section>

        <!-- Subject (email only) -->
        {#if !isSms}
          <section class="space-y-1.5">
            <Label
              for="relance-subject"
              class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
            >
              Objet
            </Label>
            <Input
              id="relance-subject"
              name="subject"
              bind:value={subject}
              bind:ref={subjectEl}
              onfocus={() => (activeField = 'subject')}
              maxlength={RELANCE_SUBJECT_MAX}
              required
              class="rounded-sm"
            />
          </section>
        {/if}

        <!-- Body -->
        <section class="space-y-1.5">
          <div class="flex items-baseline justify-between">
            <Label
              for="relance-body"
              class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
            >
              {isSms ? 'Message SMS' : 'Corps du message'}
            </Label>
            {#if isSms}
              <span
                class={cn(
                  'font-mono text-[10px] tabular-nums',
                  body.length > RELANCE_SMS_BODY_MAX
                    ? 'text-destructive'
                    : 'text-muted-foreground',
                )}
              >
                {body.length}/{RELANCE_SMS_BODY_MAX} · {smsSegments} SMS
              </span>
            {/if}
          </div>
          <Textarea
            id="relance-body"
            name="body"
            bind:value={body}
            bind:ref={bodyEl}
            onfocus={() => (activeField = 'body')}
            maxlength={isSms ? RELANCE_SMS_BODY_MAX : RELANCE_BODY_MAX}
            required
            class="min-h-32 rounded-sm font-mono text-xs leading-relaxed"
          />
          <div
            class="flex flex-wrap items-center gap-1 font-mono text-[10px] text-muted-foreground"
          >
            <span>Variables :</span>
            {#each availableVars as v (v)}
              <button
                type="button"
                onclick={() => insertVariable(v)}
                onmousedown={(e) => e.preventDefault()}
                class="cursor-pointer rounded-sm border border-border bg-muted/40 px-1.5 py-0.5 transition-colors hover:border-epi-blue/60 hover:bg-epi-blue/10 hover:text-epi-blue"
                aria-label={`Insérer la variable ${v}`}
              >
                {`{{${v}}}`}
              </button>
            {/each}
          </div>
        </section>

        <!-- Preview -->
        <section class="space-y-1.5">
          <Label
            class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
          >
            Aperçu
          </Label>
          {#if isSms}
            <div
              class="rounded-sm border border-border bg-muted/20 p-4 text-sm shadow-inner"
            >
              <div
                class="max-w-sm rounded-2xl rounded-bl-sm bg-epi-blue px-3 py-2 text-sm whitespace-pre-line text-white"
              >
                {previewBody}
              </div>
              <p class="mt-2 text-[10px] text-muted-foreground italic">
                SMS sans lien — l'expéditeur affiché est le nom court configuré
                côté serveur.
              </p>
            </div>
          {:else}
            <div
              class="rounded-sm border border-border bg-muted/20 p-4 text-sm shadow-inner"
            >
              <p class="text-[11px] font-bold text-muted-foreground">
                Objet : <span class="text-foreground">{previewSubject}</span>
              </p>
              <div
                class="mt-3 rounded-sm border-t-4 border-t-epi-teal bg-card p-4 text-sm leading-relaxed"
              >
                {#each previewParagraphs as para (para)}
                  <p class="mb-3 whitespace-pre-line">{para}</p>
                {/each}
                <p class="text-[10px] text-muted-foreground italic">
                  Rendu approximatif — les boutons <code>:button[…](…)</code> et le
                  style branding apparaîtront dans l'email final.
                </p>
              </div>
            </div>
          {/if}
        </section>

        <!-- Hidden form fields -->
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="channel" value={channel} />
        {#each eligible as r (r.id)}
          <input type="hidden" name="talentIds" value={r.id} />
        {/each}
      </div>

      <Dialog.Footer class="mt-5 sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onclick={reset}
          class="text-xs"
        >
          <RotateCcw class="mr-1.5 h-3 w-3" />
          Réinitialiser
        </Button>
        <div class="flex items-center gap-2">
          <Button type="button" variant="ghost" onclick={() => (open = false)}>
            Annuler
          </Button>
          <Button type="submit" disabled={sendDisabled}>
            {#if $delayed}
              <LoaderCircle class="mr-2 h-4 w-4 animate-spin" />
              Envoi…
            {:else}
              <Send class="mr-2 h-3.5 w-3.5" />
              {isSms ? 'Envoyer le SMS' : 'Envoyer'}
            {/if}
          </Button>
        </div>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
