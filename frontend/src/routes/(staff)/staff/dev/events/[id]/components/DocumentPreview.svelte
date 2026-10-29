<script lang="ts">
  import { Skeleton } from '$lib/components/ui/skeleton';

  // A document's preview inside an action's tooltip: the image the server
  // rendered (`badges.png`, `diplomes.png`), and the line saying how many the
  // action will produce. Mounted only while the tooltip is open, so the image
  // is asked for on the first hover and not on every visit to the home. A
  // failed render keeps the line and drops the picture.
  let {
    src,
    alt,
    caption,
    aspectClass,
  }: {
    src: string;
    alt: string;
    caption: string;
    /** The document's shape, held while the image loads: `aspect-[3/2]`... */
    aspectClass: string;
  } = $props();

  let status = $state<'loading' | 'loaded' | 'failed'>('loading');
</script>

<div class="flex w-64 flex-col gap-2">
  {#if status !== 'failed'}
    <div
      class="relative overflow-hidden rounded-sm border bg-card {aspectClass}"
    >
      {#if status === 'loading'}
        <Skeleton class="absolute inset-0 rounded-none" />
      {/if}
      <img
        {src}
        {alt}
        class="relative size-full object-contain"
        onload={() => (status = 'loaded')}
        onerror={() => (status = 'failed')}
      />
    </div>
  {/if}
  <p class="epi-overline">{caption}</p>
</div>
