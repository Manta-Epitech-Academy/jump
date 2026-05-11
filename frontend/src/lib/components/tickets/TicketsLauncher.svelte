<script lang="ts">
  import LifeBuoy from '@lucide/svelte/icons/life-buoy';
  import { resolve } from '$app/paths';

  let {
    basePath,
    unreadCount = 0,
  }: {
    basePath: '/staff/dev' | '/staff/pedago';
    unreadCount?: number;
  } = $props();
</script>

<a
  href={resolve(`${basePath}/tickets` as any)}
  class="fixed right-4 bottom-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-epi-pink text-white shadow-lg transition-transform hover:scale-105"
  aria-label="Voir mes tickets"
>
  <LifeBuoy class="h-6 w-6" />
  {#if unreadCount > 0}
    <span
      class="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-epi-blue px-1.5 text-[10px] font-bold text-white ring-2 ring-background"
    >
      {unreadCount}
    </span>
  {/if}
</a>
