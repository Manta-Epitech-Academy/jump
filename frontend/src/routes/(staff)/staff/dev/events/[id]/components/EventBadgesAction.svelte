<script lang="ts">
  import { resolve } from '$app/paths';
  import { toast } from 'svelte-sonner';
  import IdCard from '@lucide/svelte/icons/id-card';
  import Smile from '@lucide/svelte/icons/smile';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { Button } from '$lib/components/ui/button';
  import * as Dialog from '$lib/components/ui/dialog';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import { ACTION_TILE_CLASS } from '$lib/components/events/actionTile';
  import DocumentPreview from './DocumentPreview.svelte';

  // « Générer badges »: the printed name badges of every inscrit of the event
  // (`badges.pdf`), nothing to do with the badges of a talent's parcours. The
  // tooltip previews one badge as it prints; the dialog picks the layout.
  let {
    eventId,
    eventName,
    count,
  }: {
    eventId: string;
    /** The event's display name, for the download's filename. */
    eventName: string;
    /** How many badges the sheet will hold: the inscrits the dev space shows. */
    count: number;
  } = $props();

  let modeOpen = $state(false);
  let generating = $state(false);

  // Four distinct colours, reused in both illustration grids so the foldable
  // preview visibly mirrors the simple one (same colours, doubled and flipped).
  const BADGE_MODE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];

  // The endpoint builds the PDF server-side from all participations; `mode`
  // picks the simple or foldable layout.
  async function generate(mode: 'simple' | 'foldable') {
    if (generating) return;
    modeOpen = false;
    generating = true;

    const toastId = toast.loading('Génération des badges…');
    try {
      // `&t=` defeats Cloudflare's cache-by-extension on `.pdf`, `no-store`
      // the browser cache.
      const res = await fetch(
        `${resolve(`/staff/dev/events/${eventId}/badges.pdf`)}?mode=${mode}&t=${Date.now()}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`Badges failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Badges${mode === 'foldable' ? ' pliables' : ''} - ${eventName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Badges générés.', { id: toastId });
    } catch (e) {
      console.error('generate badges', e);
      toast.error('Échec de la génération des badges.', { id: toastId });
    } finally {
      generating = false;
    }
  }
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="outline"
        class={ACTION_TILE_CLASS}
        onclick={() => (modeOpen = true)}
        disabled={generating}
      >
        {#if generating}
          <LoaderCircle class="animate-spin" />
          Génération…
        {:else}
          <IdCard />
          Générer badges
        {/if}
      </Button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content>
    <DocumentPreview
      src={resolve(`/staff/dev/events/${eventId}/badges.png`)}
      alt="Aperçu d'un badge"
      aspectClass="aspect-[99/63]"
      caption={`Aperçu · ${count} ${count > 1 ? 'badges' : 'badge'} à générer`}
    />
  </Tooltip.Content>
</Tooltip.Root>

<Dialog.Root bind:open={modeOpen}>
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
        onclick={() => generate('simple')}
        class="flex cursor-pointer flex-col items-center gap-3 rounded-sm border p-4 text-center transition hover:border-epi-tech-ink hover:bg-epi-tech-ink/5"
      >
        <div class="grid grid-cols-2 gap-1 rounded-sm bg-muted/50 p-2">
          {#each BADGE_MODE_COLORS as c}
            <div
              class="flex items-center justify-center rounded bg-card py-1.5"
            >
              <Smile class="h-5 w-5" style="color: {c}" />
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
        onclick={() => generate('foldable')}
        class="flex cursor-pointer flex-col items-center gap-3 rounded-sm border p-4 text-center transition hover:border-epi-tech-ink hover:bg-epi-tech-ink/5"
      >
        <div class="grid grid-cols-2 gap-1 rounded-sm bg-muted/50 p-2">
          {#each BADGE_MODE_COLORS as c}
            <div class="flex flex-col overflow-hidden rounded bg-card">
              <div class="flex items-center justify-center py-1">
                <Smile class="h-4 w-4" style="color: {c}" />
              </div>
              <div
                class="flex items-center justify-center border-t border-dashed border-muted-foreground/40 py-1"
              >
                <Smile class="h-4 w-4 rotate-180" style="color: {c}" />
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
