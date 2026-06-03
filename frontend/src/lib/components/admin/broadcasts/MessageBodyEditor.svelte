<script lang="ts">
  import { tick } from 'svelte';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
  import { Button } from '$lib/components/ui/button';
  import Bold from '@lucide/svelte/icons/bold';
  import Italic from '@lucide/svelte/icons/italic';
  import Heading from '@lucide/svelte/icons/heading';
  import List from '@lucide/svelte/icons/list';
  import Link from '@lucide/svelte/icons/link';
  import Minus from '@lucide/svelte/icons/minus';
  import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';
  import Braces from '@lucide/svelte/icons/braces';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import { BROADCAST_VARIABLES } from '$lib/domain/broadcasts';
  import {
    SMS_SINGLE_SEGMENT_CHARS,
    SMS_BROADCAST_MAX_CHARS,
    SMS_MAX_SEGMENTS,
    estimateSmsLength,
    smsSegments,
  } from '$lib/domain/sms';
  import { cn } from '$lib/utils';

  type Props = {
    /** Bindable markdown/plain body. Optional so callers whose form field is
     *  `string | undefined` (the composer's per-send override) can bind it. */
    value?: string;
    channel: 'mail' | 'sms';
    id?: string;
    label?: string;
    placeholder?: string;
  };

  let {
    value = $bindable(''),
    channel,
    id = 'body',
    label = 'Corps',
    placeholder,
  }: Props = $props();

  let ta = $state<HTMLTextAreaElement | null>(null);

  const recipientVars = BROADCAST_VARIABLES.filter((v) => !v.contextual);
  const contextVars = BROADCAST_VARIABLES.filter((v) => v.contextual);

  // Insert `before`+`after` around the current selection (or at the caret when
  // nothing is selected), then restore focus + a sensible caret. This is the
  // fix for the old behaviour that always appended snippets to the very end of
  // the body regardless of where the cursor was.
  async function surround(before: string, after = '') {
    const el = ta;
    const cur = value ?? '';
    if (!el) {
      value = cur + before + after;
      return;
    }
    const start = el.selectionStart ?? cur.length;
    const end = el.selectionEnd ?? cur.length;
    const selected = cur.slice(start, end);
    value = cur.slice(0, start) + before + selected + after + cur.slice(end);
    await tick();
    el.focus();
    // No selection → drop the caret between the wrappers so the user types
    // inside it. With a selection → place it just after the inserted block.
    const caret = selected
      ? start + before.length + selected.length + after.length
      : start + before.length;
    el.setSelectionRange(caret, caret);
  }

  type Fmt = {
    label: string;
    icon: typeof Bold;
    before: string;
    after?: string;
  };
  // Mail-only formatting. SMS is plain text (markdown isn't rendered), so it
  // gets the variable inserter only.
  const formats: Fmt[] = [
    { label: 'Gras', icon: Bold, before: '**', after: '**' },
    { label: 'Italique', icon: Italic, before: '*', after: '*' },
    { label: 'Titre', icon: Heading, before: '\n\n## ', after: '\n\n' },
    { label: 'Liste', icon: List, before: '\n\n- ', after: '\n' },
    { label: 'Lien', icon: Link, before: '[', after: '](https://)' },
    {
      label: 'Bouton',
      icon: MousePointerClick,
      before: '\n\n:button[',
      after: '](https://jump.epiboost.fr/...)\n\n',
    },
    { label: 'Séparateur', icon: Minus, before: '\n\n---\n\n' },
  ];

  const smsLength = $derived(
    channel === 'sms' ? estimateSmsLength(value ?? '') : 0,
  );
  const smsSegmentCount = $derived(smsSegments(smsLength));
  const smsMultipart = $derived(smsSegmentCount > 1);
  const smsOverCeiling = $derived(smsLength > SMS_BROADCAST_MAX_CHARS);
</script>

{#snippet variableItem(v: (typeof BROADCAST_VARIABLES)[number])}
  <DropdownMenu.Item
    onSelect={() => surround(v.token)}
    class="flex-col items-start gap-0.5 py-1.5"
  >
    <code class="font-mono text-xs text-epi-pink">{v.token}</code>
    <span class="text-xs whitespace-normal text-muted-foreground"
      >{v.label}</span
    >
  </DropdownMenu.Item>
{/snippet}

<div class="grid gap-2">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <Label for={id}>{label}</Label>
    {#if channel === 'sms'}
      <span
        class={cn(
          'text-xs',
          smsOverCeiling
            ? 'font-semibold text-destructive'
            : smsMultipart
              ? 'font-medium text-epi-orange'
              : 'text-muted-foreground',
        )}
      >
        {smsLength} caractères · ≈ {smsSegmentCount} SMS
      </span>
    {/if}
  </div>

  <!-- Toolbar -->
  <div
    class="flex flex-wrap items-center gap-1 rounded-sm border bg-muted/40 p-1"
  >
    {#if channel === 'mail'}
      {#each formats as f (f.label)}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          title={f.label}
          aria-label={f.label}
          onclick={() => surround(f.before, f.after)}
        >
          <f.icon class="h-3.5 w-3.5" />
        </Button>
      {/each}
      <div class="mx-1 h-5 w-px bg-border"></div>
    {/if}

    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            type="button"
            variant="ghost"
            size="sm"
            class="h-7 gap-1 px-2 text-xs"
          >
            <Braces class="h-3.5 w-3.5" /> Variable
            <ChevronDown class="h-3 w-3 opacity-60" />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="max-h-96 w-80 overflow-y-auto">
        <DropdownMenu.Label class="text-[10px] tracking-widest uppercase">
          Destinataire
        </DropdownMenu.Label>
        {#each recipientVars as v (v.key)}
          {@render variableItem(v)}
        {/each}
        <DropdownMenu.Separator />
        <DropdownMenu.Label class="text-[10px] tracking-widest uppercase">
          Contexte d'envoi
        </DropdownMenu.Label>
        {#each contextVars as v (v.key)}
          {@render variableItem(v)}
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>

  <Textarea
    {id}
    bind:ref={ta}
    bind:value
    rows={channel === 'sms' ? 5 : 16}
    class={channel === 'mail' ? 'font-mono text-sm' : ''}
    placeholder={placeholder ??
      (channel === 'mail'
        ? 'Markdown : # titres, **gras**, listes -, :button[…](…). Insère des variables avec le bouton ci-dessus.'
        : 'Court de préférence : un seul SMS = 160 caractères.')}
  />

  {#if channel === 'sms'}
    {#if smsOverCeiling}
      <p class="text-xs font-medium text-destructive">
        Trop long : {SMS_MAX_SEGMENTS} SMS maximum par destinataire. Raccourcissez
        le texte (ou retirez un lien) pour pouvoir envoyer.
      </p>
    {:else if smsMultipart}
      <p class="text-xs font-medium text-epi-orange">
        Plus de {SMS_SINGLE_SEGMENT_CHARS} caractères : ce message partira en {smsSegmentCount}
        SMS par destinataire, et sera donc facturé {smsSegmentCount} fois par personne.
      </p>
    {:else}
      <p class="text-xs text-muted-foreground">
        Un SMS = {SMS_SINGLE_SEGMENT_CHARS} caractères. Chaque lien est rallongé automatiquement
        pour mesurer les clics, et compte donc pour plus que sa longueur à l'écran.
      </p>
    {/if}
  {/if}
</div>
