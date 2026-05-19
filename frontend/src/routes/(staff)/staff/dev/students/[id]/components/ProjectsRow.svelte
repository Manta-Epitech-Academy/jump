<script lang="ts">
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import ImageIcon from '@lucide/svelte/icons/image';
  import { formatDateFr, cn } from '$lib/utils';

  /**
   * Latest portfolio items deposited by the talent. Items always belong to an
   * event and may optionally cite an activity. Per the mockup, tiles are
   * solid brand-color squares cycling epi-blue / epi-black / epi-pink with
   * white text — punchy, no border, no shadow.
   */
  type Props = {
    items: {
      id: string;
      file: string | null;
      url: string | null;
      caption: string | null;
      createdAt: Date;
      event: { id: string; titre: string; date: Date };
      activity: { id: string; nom: string } | null;
    }[];
    timezone: string;
  };

  let { items, timezone }: Props = $props();

  // Three-tone brand cycle, mirrored from the mockup. Black sits in the
  // middle so the row reads as `BLUE / BLACK / PINK` rather than the two
  // hot colors next to each other.
  const TILE_COLORS = [
    'bg-epi-blue text-white',
    'bg-epi-dark text-white',
    'bg-epi-pink text-white',
  ];
</script>

{#if items.length === 0}
  <div class="rounded-sm border border-dashed bg-muted/20 p-6 text-center">
    <ImageIcon class="mx-auto h-7 w-7 text-muted-foreground/50" />
    <p
      class="mt-2 font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
    >
      &lt; Aucun livrable /&gt;
    </p>
    <p class="mt-1 text-xs text-muted-foreground/80">
      Les pièces déposées par le stagiaire apparaîtront ici.
    </p>
  </div>
{:else}
  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {#each items as item, i (item.id)}
      {@const href = item.url ?? item.file ?? null}
      {@const tone = TILE_COLORS[i % TILE_COLORS.length]}
      <a
        href={href ?? '#'}
        target={href ? '_blank' : undefined}
        rel={href ? 'noopener noreferrer' : undefined}
        class={cn(
          'group relative flex min-h-[110px] flex-col justify-between rounded-sm p-4 transition-transform',
          tone,
          href && 'hover:-translate-y-0.5 hover:shadow-md',
        )}
      >
        <header class="flex items-start justify-between gap-2">
          <p
            class="font-mono text-[10px] font-bold tracking-widest uppercase opacity-80"
          >
            {formatDateFr(item.createdAt, timezone)}
          </p>
          {#if href}
            <ExternalLink
              class="h-3.5 w-3.5 opacity-60 transition-opacity group-hover:opacity-100"
            />
          {/if}
        </header>
        <div class="space-y-1">
          <p
            class="line-clamp-2 text-[15px] leading-tight font-semibold break-words"
          >
            {item.caption ?? 'Sans titre'}
          </p>
          <p class="font-mono text-[10px] uppercase opacity-85">
            {item.event.titre}{#if item.activity}<span class="opacity-70">
                · {item.activity.nom}</span
              >{/if}
          </p>
        </div>
      </a>
    {/each}
  </div>
{/if}
