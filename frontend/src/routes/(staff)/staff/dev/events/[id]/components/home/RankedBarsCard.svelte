<script lang="ts">
  import type { HomeBar, HomeLink } from '$lib/domain/eventHome';
  import { cn } from '$lib/utils';
  import HomeCard from './HomeCard.svelte';

  // The most carried values of a facet (lycées, tech interests), each a bar
  // against the longest, each opening the list filtered on it.
  let {
    title,
    bars,
    empty,
    hrefOf,
  }: {
    title: string;
    bars: HomeBar[];
    empty?: string | null;
    hrefOf: (link: HomeLink) => string | null;
  } = $props();
</script>

<HomeCard {title} {empty}>
  <ul class="flex flex-col gap-1">
    {#each bars as bar (bar.key)}
      {@const href = hrefOf(bar.link)}
      <li>
        <svelte:element
          this={href ? 'a' : 'div'}
          {href}
          class={cn(
            'flex flex-col gap-1.5 rounded-sm px-1.5 py-1.5',
            href && 'cursor-pointer transition-colors hover:bg-accent',
          )}
        >
          <span class="flex items-baseline justify-between gap-3 text-sm">
            <span class="min-w-0 truncate font-medium">{bar.label}</span>
            <span class="shrink-0 text-xs text-muted-foreground">
              <span class="font-semibold text-foreground">{bar.count}</span>
              · {bar.share}
            </span>
          </span>
          <span class="h-1.5 rounded-full bg-muted" aria-hidden="true">
            <!-- The width is the data's, so it rides a custom property. -->
            <span
              class="block h-full w-[var(--bar)] rounded-full bg-epi-blue"
              style:--bar={`${bar.widthPct}%`}
            ></span>
          </span>
        </svelte:element>
      </li>
    {/each}
  </ul>
</HomeCard>
