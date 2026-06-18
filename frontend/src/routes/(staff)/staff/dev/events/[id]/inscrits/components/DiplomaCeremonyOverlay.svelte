<script lang="ts">
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';

  // Full-screen "ceremony" shown while the bulk diploma sheet renders. The export
  // runs once per stage (clôture), takes ~15s on a big cohort, and used to leave
  // staff staring at a bare spinner wondering if it had hung. This turns the wait
  // into a small moment: an affectionate equipe in-joke about Édouard, le maître
  // de stage, qui veille au grain sur Salesforce.
  //
  // The three image montages live in static/easter-eggs/edouard/ as 1.png / 2.png
  // / 3.png. Until they are added, `onerror` hides the broken <img> and the copy
  // still reads cleanly on its own.
  let { open, count, city }: { open: boolean; count: number; city: string } =
    $props();

  type Variant = {
    img: string;
    text: (count: number, city: string) => string;
    attribution?: string;
  };

  const VARIANTS: Variant[] = [
    {
      img: '/easter-eggs/edouard/1.png',
      text: () =>
        'Vos données Salesforce sont impeccables. Édouard est fier de vous.',
    },
    {
      img: '/easter-eggs/edouard/2.png',
      text: () => "« Une donnée bien renseignée, c'est une vie qu'on change. »",
      attribution: 'Édouard, probablement',
    },
    {
      img: '/easter-eggs/edouard/3.png',
      text: (n, c) =>
        `Édouard relit personnellement les ${n} diplôme${n > 1 ? 's' : ''}${
          c ? ` du campus de ${c}` : ''
        }.`,
    },
  ];

  // The montage is picked once per page session, not re-rolled on each open: a dev
  // generates diplomas once per stage, so re-rolling per click buys nothing, and
  // the variety that matters lives across devs/campuses, not within one session.
  let index = $state(0);

  onMount(() => {
    index = Math.floor(Math.random() * VARIANTS.length);

    // Warm the browser cache for the chosen montage so it is already decoded when
    // the overlay opens, instead of fetching only when the <img> first renders
    // (which made it pop in mid-ceremony). Deferred to idle so this eager fetch
    // never competes with the page's first paint or the streamed cohort load.
    const preload = () => {
      const img = new Image();
      img.src = VARIANTS[index].img;
    };
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(preload);
      return () => cancelIdleCallback(id);
    }
    const id = setTimeout(preload, 200);
    return () => clearTimeout(id);
  });

  const variant = $derived(VARIANTS[index]);

  // Hide the <img> if the montage file is not present yet, so the copy stands on
  // its own instead of showing a broken-image icon.
  function hideBrokenImage(event: Event) {
    (event.currentTarget as HTMLImageElement).style.display = 'none';
  }
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/95 px-6 text-center backdrop-blur-sm lg:gap-8"
    transition:fade={{ duration: 200 }}
    role="status"
    aria-live="polite"
  >
    <img
      src={variant.img}
      alt="Édouard"
      class="max-h-80 max-w-sm rounded-sm object-contain shadow-lg lg:max-h-[30rem] lg:max-w-xl"
      onerror={hideBrokenImage}
    />
    <div class="space-y-1 lg:space-y-2">
      <p
        class="max-w-xl text-lg font-medium text-foreground lg:max-w-2xl lg:text-2xl"
      >
        {variant.text(count, city)}
      </p>
      {#if variant.attribution}
        <p class="text-sm text-muted-foreground italic lg:text-lg">
          {variant.attribution}
        </p>
      {/if}
    </div>
    <div
      class="flex items-center gap-2 text-sm text-muted-foreground lg:text-base"
    >
      <LoaderCircle class="h-4 w-4 animate-spin lg:h-5 lg:w-5" />
      Génération des diplômes en cours…
    </div>
  </div>
{/if}
