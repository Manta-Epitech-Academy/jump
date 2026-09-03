<script lang="ts">
  import { resolve } from '$app/paths';
  import { toast } from 'svelte-sonner';
  import type { Icon as IconType } from '@lucide/svelte';
  import Archive from '@lucide/svelte/icons/archive';
  import Award from '@lucide/svelte/icons/award';
  import IdCard from '@lucide/svelte/icons/id-card';
  import MessageSquare from '@lucide/svelte/icons/message-square';
  import MessageSquareText from '@lucide/svelte/icons/message-square-text';
  import Smile from '@lucide/svelte/icons/smile';
  import UserCheck from '@lucide/svelte/icons/user-check';
  import * as Dialog from '$lib/components/ui/dialog';
  import InfoTooltip from '$lib/components/ui/info-tooltip';
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import LoadingCeremony from '$lib/components/LoadingCeremony.svelte';
  import ProducerCard from '$lib/components/dev/exports/ProducerCard.svelte';
  import { downloadArtifact } from '$lib/components/staff/export/downloadArtifact';
  import { eventDisplayName } from '$lib/domain/event';
  import { cn } from '$lib/utils';
  import {
    EVENT_PRODUCERS,
    EVENT_PRODUCER_BASE_LABELS,
    EVENT_PRODUCER_DEFS,
    type EventProducerKey,
  } from '$lib/domain/eventModules';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  /**
   * Icons follow the SUBJECT, not the file format: a card is recognised by what
   * it is about, and the format already has its own tag. Four of them are the
   * ones the sidebar gives their surface, so a card and the page it produces
   * from read as the same thing.
   *
   * Colocated here rather than in the catalogue for the reason `SURFACE_ICONS`
   * is: Svelte components cannot sit in the domain layer.
   */
  const PRODUCER_ICONS: Record<EventProducerKey, typeof IconType> = {
    badges: IdCard,
    emargement_xlsx: UserCheck,
    bilan_xlsx: MessageSquareText,
    closings_xlsx: MessageSquare,
    closings_pdfs: Archive,
    diplomas: Award,
  };

  const eventName = $derived(eventDisplayName(data.event));

  let busy = $state<EventProducerKey | null>(null);
  let badgeModeOpen = $state(false);

  // Headcount for the ceremony copy. Known from the load here, unlike on the
  // Inscrits page where it had to be pulled out of the streamed cohort.
  const diplomaCount = $derived(data.counts.roster);
  // "Certificat", not "diplôme": that is what the document says on its face, and
  // it stays true whichever one the event issues.
  const diplomaCeremonyTitle = $derived(
    diplomaCount > 0
      ? `Génération de ${diplomaCount} certificat${diplomaCount > 1 ? 's' : ''}`
      : 'Génération des certificats',
  );

  // Rotating step lines for the ceremony epi-overline - kept true to what the PDF
  // render actually does (one page per inscrit, with the campus signatures).
  const DIPLOMA_CEREMONY_MESSAGES = [
    'Préparation des certificats…',
    'Mise en page de chaque certificat…',
    'Application des signatures…',
    'Presque prêt…',
  ];

  /**
   * Four distinct inks, reused in both illustration grids so the foldable
   * preview visibly mirrors the simple one (same inks, doubled and flipped).
   *
   * Brand inks through Tailwind classes rather than the four arbitrary hex
   * values this dialog carried on the Inscrits page: they were inline styles,
   * which the design contract forbids and `lint:design` cannot see, and they
   * told the reader nothing since the printed badge uses neither of them (its
   * accent is `epi-blue` and its image-rights marker is red). What the
   * illustration owes the reader is four telling-apart colours, which the
   * palette already has.
   */
  const BADGE_MODE_INKS = [
    'text-epi-blue',
    'text-epi-tech-ink',
    'text-epi-tomorrow-ink',
    'text-muted-foreground',
  ];

  const endpointOf = (key: EventProducerKey): string =>
    resolve(
      `/staff/dev/events/${data.event.id}/${EVENT_PRODUCER_DEFS[key].segment}`,
    );

  /**
   * The catalogue's `format` IS the extension for all three kinds. `variant`
   * names the one producer that takes an option: without it both badge layouts
   * land as the same filename, so generating one after the other leaves two
   * indistinguishable files in the download folder.
   */
  const filenameOf = (key: EventProducerKey, variant = ''): string => {
    const def = EVENT_PRODUCER_DEFS[key];
    return `${def.label}${variant} - ${eventName}.${def.format}`;
  };

  /**
   * Run a producer. The feedback is the caller's business (see
   * `downloadArtifact`): a toast for everything, plus a full-screen ceremony for
   * the certificates, whose render runs ~15s for a big cohort and used to leave
   * staff staring at a spinner, fearing it had hung - the actual reported
   * complaint. `query` carries the one producer that takes an option.
   */
  async function run(
    key: EventProducerKey,
    { query = '', variant = '' } = {},
  ): Promise<void> {
    if (busy) return;
    busy = key;
    const def = EVENT_PRODUCER_DEFS[key];
    // The ceremony owns the wait for the certificates, so no toast competes
    // with it; everything else is fast enough for a toast to be the whole story.
    const isCeremony = key === EVENT_PRODUCERS.DIPLOMAS;
    const toastId = isCeremony
      ? undefined
      : toast.loading(`Génération : ${def.label}…`);
    try {
      await downloadArtifact(
        `${endpointOf(key)}${query}`,
        filenameOf(key, variant),
      );
      if (toastId !== undefined) {
        toast.success('Fichier généré.', { id: toastId });
      } else {
        toast.success('Certificats générés.');
      }
    } catch (e) {
      console.error(`[exports] ${key} failed`, e);
      toast.error(`Échec de la génération : ${def.label}.`, { id: toastId });
    } finally {
      busy = null;
    }
  }

  function generateBadges(mode: 'simple' | 'foldable') {
    badgeModeOpen = false;
    void run(EVENT_PRODUCERS.BADGES, {
      query: `?mode=${mode}`,
      variant: mode === 'foldable' ? ' pliables' : '',
    });
  }
</script>

<svelte:head>
  <title>{eventName} · Exports</title>
</svelte:head>

<div class="space-y-6 pb-10">
  <PageHeader title="Exports" subtitle={eventName} />

  <!-- What is NOT here, said once. Three controls stay on their own page because
       they read what is on screen, and a reader who does not find them here has
       to be told where they went rather than left to hunt. -->
  <p class="flex items-center gap-1.5 text-sm text-muted-foreground">
    L'export filtré des inscrits et les QR codes restent sur leurs pages.
    <InfoTooltip
      text="L'export des inscrits suit les filtres et le tri que vous avez à l'écran, un QR code est celui du créneau affiché, et la synthèse PDF d'un closing s'ouvre depuis ce closing. Les déplacer ici leur ferait perdre ce à quoi ils se rapportent."
    />
  </p>

  <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {#each data.producers as key (key)}
      {@const def = EVENT_PRODUCER_DEFS[key]}
      {@const count = data.counts[def.base]}
      <ProducerCard
        {def}
        Icon={PRODUCER_ICONS[key]}
        countLabel={EVENT_PRODUCER_BASE_LABELS[def.base](count)}
        empty={count === 0}
        busy={busy === key}
        onrun={() =>
          key === EVENT_PRODUCERS.BADGES
            ? (badgeModeOpen = true)
            : void run(key)}
      />
    {/each}
  </div>
</div>

<Dialog.Root bind:open={badgeModeOpen}>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title>Mode d'impression</Dialog.Title>
      <Dialog.Description>
        Choisissez la mise en page des badges à générer.
      </Dialog.Description>
    </Dialog.Header>

    <div class="grid grid-cols-2 gap-4">
      <button
        type="button"
        onclick={() => generateBadges('simple')}
        class="flex cursor-pointer flex-col items-center gap-3 rounded-sm border p-4 text-center transition hover:border-epi-tech-ink hover:bg-epi-tech-ink/5"
      >
        <div class="grid grid-cols-2 gap-1 rounded-sm bg-muted/50 p-2">
          {#each BADGE_MODE_INKS as ink}
            <div
              class="flex items-center justify-center rounded bg-card py-1.5"
            >
              <Smile class={cn('h-5 w-5', ink)} />
            </div>
          {/each}
        </div>
        <div class="space-y-1">
          <div class="font-medium">Simple</div>
          <p class="text-xs text-muted-foreground">
            Conseillé d'imprimer chaque feuille en recto-verso.
          </p>
        </div>
      </button>

      <button
        type="button"
        onclick={() => generateBadges('foldable')}
        class="flex cursor-pointer flex-col items-center gap-3 rounded-sm border p-4 text-center transition hover:border-epi-tech-ink hover:bg-epi-tech-ink/5"
      >
        <div class="grid grid-cols-2 gap-1 rounded-sm bg-muted/50 p-2">
          {#each BADGE_MODE_INKS as ink}
            <div class="flex flex-col overflow-hidden rounded bg-card">
              <div class="flex items-center justify-center py-1">
                <Smile class={cn('h-4 w-4', ink)} />
              </div>
              <div
                class="flex items-center justify-center border-t border-dashed border-muted-foreground/40 py-1"
              >
                <Smile class={cn('h-4 w-4 rotate-180', ink)} />
              </div>
            </div>
          {/each}
        </div>
        <div class="space-y-1">
          <div class="font-medium">Recto-verso pliable</div>
          <p class="text-xs text-muted-foreground">
            Chaque badge dupliqué à l'envers, à plier en deux.
          </p>
        </div>
      </button>
    </div>
  </Dialog.Content>
</Dialog.Root>

<LoadingCeremony
  open={busy === EVENT_PRODUCERS.DIPLOMAS}
  title={diplomaCeremonyTitle}
  messages={DIPLOMA_CEREMONY_MESSAGES}
/>
