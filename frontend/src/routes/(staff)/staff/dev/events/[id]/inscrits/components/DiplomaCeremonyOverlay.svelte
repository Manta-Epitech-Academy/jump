<script lang="ts">
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

  // Pick a fresh variant each time the overlay opens, so devs across the campuses
  // de France compare which one they got. Math.random in an effect (not render)
  // keeps the pick stable for the whole showing.
  let index = $state(0);
  $effect(() => {
    if (open) index = Math.floor(Math.random() * VARIANTS.length);
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
