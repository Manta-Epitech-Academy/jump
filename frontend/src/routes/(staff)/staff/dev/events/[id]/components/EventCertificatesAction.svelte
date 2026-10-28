<script lang="ts">
  import { resolve } from '$app/paths';
  import { toast } from 'svelte-sonner';
  import Award from '@lucide/svelte/icons/award';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import LoadingCeremony from '$lib/components/LoadingCeremony.svelte';
  import { ACTION_TILE_CLASS } from '$lib/components/events/actionTile';
  import DocumentPreview from './DocumentPreview.svelte';

  // « Générer certificats »: whichever certificate the event issues, one page
  // per inscrit (`diplomes.pdf`). The tooltip previews this event's own page,
  // rendered by the same engine for a placeholder name.
  let {
    eventId,
    eventName,
    label,
    count,
  }: {
    eventId: string;
    /** The event's display name, for the download's filename. */
    eventName: string;
    /** The certificate's name (« Certificat de stage »), for the filename. */
    label: string;
    /** How many pages the document will hold: the inscrits the dev space shows. */
    count: number;
  } = $props();

  let generating = $state(false);

  // "Certificat", not "diplôme": that is what the document says on its face, and
  // it stays true whichever one the event issues.
  const ceremonyTitle = $derived(
    count > 0
      ? `Génération de ${count} certificat${count > 1 ? 's' : ''}`
      : 'Génération des certificats',
  );

  // Rotating step lines for the ceremony epi-overline - kept true to what the PDF
  // render actually does (one page per inscrit, with the campus signatures).
  const CEREMONY_MESSAGES = [
    'Préparation des certificats…',
    'Mise en page de chaque certificat…',
    'Application des signatures…',
    'Presque prêt…',
  ];

  // The render runs ~15s for a big cohort and used to leave staff staring at a
  // bare spinner, fearing it had hung (the actual reported complaint). Instead of
  // a toast a full-screen LoadingCeremony holds the whole wait. It owns a
  // minimum display beat, so small campuses (~1s render) still get the full
  // moment instead of a flash, while big cohorts simply stay up the natural
  // render time.
  async function generate() {
    if (generating) return;
    generating = true;
    try {
      // Unique query param + no-store: the PDF is regenerated from live DB
      // (signatory role/image can change), so it must never be served from a
      // cache. `?t=` gives every request a fresh key so Cloudflare's
      // cache-by-extension on `.pdf` can't return a stale edge copy; `no-store`
      // bypasses the browser's own HTTP cache.
      const res = await fetch(
        `${resolve(`/staff/dev/events/${eventId}/diplomes.pdf`)}?t=${Date.now()}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`Certificates failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${label} - ${eventName}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('generate certificates', e);
      toast.error('Échec de la génération des certificats.');
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
        onclick={generate}
        disabled={generating}
      >
        {#if generating}
          <LoaderCircle class="animate-spin" />
          Génération…
        {:else}
          <Award />
          Générer certificats
        {/if}
      </Button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content>
    <DocumentPreview
      src={resolve(`/staff/dev/events/${eventId}/diplomes.png`)}
      alt={`Aperçu : ${label}`}
      aspectClass="aspect-[1.414/1]"
      caption={`Aperçu · ${count} ${count > 1 ? 'certificats' : 'certificat'} à générer`}
    />
  </Tooltip.Content>
</Tooltip.Root>

<LoadingCeremony
  open={generating}
  title={ceremonyTitle}
  messages={CEREMONY_MESSAGES}
/>
