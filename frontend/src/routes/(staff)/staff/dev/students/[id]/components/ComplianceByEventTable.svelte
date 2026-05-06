<script lang="ts">
  import { resolve } from '$app/paths';
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import FileSignature from '@lucide/svelte/icons/file-signature';
  import * as Card from '$lib/components/ui/card';
  import { cn, formatDateFr } from '$lib/utils';

  type StageCompliance = {
    charteSigned: boolean;
    conventionSigned: boolean;
    imageRightsSigned: boolean;
  } | null;

  type Row = {
    id: string;
    bringPc: boolean | null;
    stageCompliance: StageCompliance;
    event: {
      id: string;
      titre: string;
      date: Date | string;
    };
  };

  let {
    participations,
    timezone,
  }: { participations: Row[]; timezone: string } = $props();

  type Tile = { label: string; ok: boolean };

  function tilesFor(p: Row): Tile[] {
    const sc = p.stageCompliance;
    return [
      { label: 'Convention', ok: !!sc?.conventionSigned },
      { label: 'Charte', ok: !!sc?.charteSigned },
      { label: 'Droit image', ok: !!sc?.imageRightsSigned },
      { label: 'PC apporté', ok: !!p.bringPc },
    ];
  }
</script>

<Card.Root class="rounded-sm border shadow-sm dark:shadow-none">
  <Card.Header class="border-b bg-muted/30 pt-4 pb-4">
    <Card.Title
      class="flex items-center gap-2 text-xs font-bold tracking-widest text-muted-foreground uppercase"
    >
      <FileSignature class="h-4 w-4 text-epi-blue" />
      Conformité administrative
    </Card.Title>
  </Card.Header>
  <Card.Content class="pt-5">
    <ul class="space-y-3">
      {#each participations as p (p.id)}
        {@const tiles = tilesFor(p)}
        <li
          class="flex flex-col gap-2 rounded-sm border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold uppercase">
              {p.event.titre}
            </p>
            <p class="text-xs text-muted-foreground">
              {formatDateFr(p.event.date, timezone)}
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            {#each tiles as tile (tile.label)}
              <span
                class={cn(
                  'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase',
                  tile.ok
                    ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-900/40 dark:bg-green-900/20 dark:text-green-300'
                    : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300',
                )}
              >
                {#if tile.ok}
                  <Check class="h-2.5 w-2.5" />
                {:else}
                  <X class="h-2.5 w-2.5" />
                {/if}
                {tile.label}
              </span>
            {/each}
            <a
              href={resolve(`/staff/dev/events/${p.event.id}/onboarding`)}
              class="ml-auto inline-flex items-center gap-1 text-[10px] font-bold tracking-widest text-epi-blue uppercase transition-colors hover:underline sm:ml-2"
              aria-label="Modifier sur l'onboarding"
            >
              Onboarding <ExternalLink class="h-2.5 w-2.5" />
            </a>
          </div>
        </li>
      {/each}
    </ul>
  </Card.Content>
</Card.Root>
