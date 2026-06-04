<script lang="ts">
  import Mail from '@lucide/svelte/icons/mail';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import MailOpen from '@lucide/svelte/icons/mail-open';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import Clock from '@lucide/svelte/icons/clock';
  import EpiSection from '$lib/components/staff/EpiSection.svelte';
  import { Separator } from '$lib/components/ui/separator';
  import { formatDateFr } from '$lib/utils';
  import {
    isImageRightsCompliant,
    isRulesCompliant,
  } from '$lib/domain/stageCompliance';
  import {
    IMAGE_RIGHTS_STATUS_LABELS,
    type ImageRightsDecision,
  } from '$lib/domain/imageRights';
  import type { Communication } from '$lib/domain/communications';

  // The sticky synthesis rail: last connection, recent communications (one line
  // each), and the two stage documents (RI + DI) at a glance. Read-only — the
  // actions live in the todo list on the left.
  let {
    lastActiveAt,
    firstLoginAt,
    communications,
    parentRulesSignedAt,
    charteSigned,
    imageRightsDecision,
    timezone,
  }: {
    lastActiveAt: Date | string | null;
    firstLoginAt: Date | string | null;
    communications: Communication[];
    parentRulesSignedAt: Date | string | null;
    charteSigned: boolean | null | undefined;
    imageRightsDecision: ImageRightsDecision | null;
    timezone: string;
  } = $props();

  function relativeLabel(date: Date | string | null): string {
    if (!date) return 'Jamais';
    const diff = Date.now() - new Date(date).getTime();
    const day = 86_400_000;
    if (diff < day) return "Aujourd'hui";
    if (diff < 2 * day) return 'Hier';
    if (diff < 7 * day) return `Il y a ${Math.floor(diff / day)} j`;
    if (diff < 30 * day) return `Il y a ${Math.floor(diff / (7 * day))} sem`;
    if (diff < 365 * day) return `Il y a ${Math.floor(diff / (30 * day))} mois`;
    const years = Math.floor(diff / (365 * day));
    return `Il y a ${years} an${years > 1 ? 's' : ''}`;
  }

  // Show the template the message was sent from rather than its subject line.
  // Reminders (1:1 relances) carry no template, so they read as "Relance".
  function commLabel(c: Communication): string {
    if (c.kind === 'reminder') return 'Relance';
    return c.broadcast.templateName || c.broadcast.name || 'Communication';
  }

  // Open tracking only exists for broadcast emails (reminders/SMS carry none),
  // so the badge shows opened/not only there and stays silent otherwise.
  function openState(c: Communication): 'opened' | 'unopened' | null {
    if (c.kind !== 'broadcast' || c.channel !== 'mail') return null;
    return c.openedAt ? 'opened' : 'unopened';
  }

  const rulesOk = $derived(isRulesCompliant(parentRulesSignedAt, charteSigned));
  const imageOk = $derived(isImageRightsCompliant(imageRightsDecision));
  const imageLabel = $derived(
    IMAGE_RIGHTS_STATUS_LABELS[imageRightsDecision ?? 'undecided'],
  );
</script>

<EpiSection title="Synthèse" accent="blue">
  <div class="space-y-4">
    <!-- Connexion -->
    <section class="space-y-2">
      <h4
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Connexion
      </h4>
      <dl class="space-y-1.5 text-sm">
        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-muted-foreground">Dernière activité</dt>
          <dd class="font-mono text-xs font-bold">
            {relativeLabel(lastActiveAt)}
          </dd>
        </div>
        <div class="flex items-baseline justify-between gap-3">
          <dt class="text-muted-foreground">Première connexion</dt>
          <dd class="font-mono text-xs">
            {firstLoginAt ? formatDateFr(firstLoginAt, timezone) : 'Jamais'}
          </dd>
        </div>
      </dl>
    </section>

    <Separator />

    <!-- Communications -->
    <section class="space-y-2">
      <h4
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Dernières communications
      </h4>
      {#if communications.length === 0}
        <p class="text-sm text-muted-foreground italic">
          Aucune communication.
        </p>
      {:else}
        <ul class="space-y-1.5">
          {#each communications as c (c.id)}
            {@const open = openState(c)}
            <li class="flex items-center gap-2 text-sm">
              {#if c.channel === 'sms'}
                <MessageSquare
                  class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                />
              {:else}
                <Mail class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              {/if}
              <span class="min-w-0 flex-1 truncate">{commLabel(c)}</span>
              {#if open === 'opened'}
                <span
                  class="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] tracking-wide text-epi-teal-solid uppercase"
                >
                  <MailOpen class="h-3 w-3" />
                  Ouvert
                </span>
              {:else if open === 'unopened'}
                <span
                  class="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase"
                >
                  <Mail class="h-3 w-3" />
                  Non ouvert
                </span>
              {/if}
              <span
                class="shrink-0 font-mono text-[10px] text-muted-foreground"
              >
                {formatDateFr(c.sentAt, timezone)}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <Separator />

    <!-- Documents -->
    <section class="space-y-2">
      <h4
        class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        Documents
      </h4>
      <ul class="space-y-1.5 text-sm">
        <li class="flex items-center justify-between gap-3">
          <span class="text-muted-foreground">Règlement intérieur</span>
          {#if rulesOk}
            <span
              class="inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-widest text-epi-teal-solid uppercase"
            >
              <Check class="h-3 w-3" /> Signé
            </span>
          {:else}
            <span
              class="inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-widest text-destructive uppercase"
            >
              <Clock class="h-3 w-3" /> En attente
            </span>
          {/if}
        </li>
        <li class="flex items-center justify-between gap-3">
          <span class="text-muted-foreground">Droit à l'image</span>
          {#if imageOk}
            <span
              class="inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-widest uppercase {imageRightsDecision ===
              'refused'
                ? 'text-epi-orange'
                : 'text-epi-teal-solid'}"
            >
              {#if imageRightsDecision === 'refused'}
                <X class="h-3 w-3" />
              {:else}
                <Check class="h-3 w-3" />
              {/if}
              {imageLabel}
            </span>
          {:else}
            <span
              class="inline-flex items-center gap-1 font-mono text-[10px] font-bold tracking-widest text-destructive uppercase"
            >
              <Clock class="h-3 w-3" />
              {imageLabel}
            </span>
          {/if}
        </li>
      </ul>
    </section>
  </div>
</EpiSection>
