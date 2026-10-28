<script lang="ts">
  import { onImageBroken } from '$lib/actions/onImageBroken';
  import TitleCursor from '$lib/components/layout/TitleCursor.svelte';
  import { Button } from '$lib/components/ui/button';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import Play from '@lucide/svelte/icons/play';
  import Terminal from '@lucide/svelte/icons/terminal';
  import {
    WORKSHOP_LEVEL_LABELS,
    type CatalogueSubject,
  } from '$lib/domain/workshopCatalogue';

  // One subject of the dev space's catalogue, as the 2027 mockup draws it: a
  // brand card with the blueprint grid, its picture, its name, its domains and
  // level, its tagline, its notions, and how a manta supervises it: the code
  // of the instance serving it, and the page of that instance that takes it.
  // Square like every staff card, and blue
  // whatever the level: DESIGN.md keeps magenta for the admin space, and white
  // text on it fails contrast.
  //
  // Only a complete subject reaches it (`catalogueGaps`), so every field but the
  // notions is there. The picture can still fail to load (its stored object gone,
  // or a database seeded with no bucket to put the bytes in), and then a brand
  // tile takes its place so the cards stay aligned.
  //
  // The link is the translucent `overlay` button rather than the mockup's white
  // one: DESIGN.md gives an action on a brand-blue surface that fill alone.
  let { subject }: { subject: CatalogueSubject } = $props();

  let broken = $state(false);
</script>

<article
  class="on-dark relative flex flex-col gap-3 overflow-hidden rounded-sm bg-epi-blue p-5 text-white"
>
  <div
    class="pointer-events-none absolute inset-0 blueprint-grid-inverse"
    aria-hidden="true"
  ></div>

  <div class="relative flex items-center gap-4">
    {#if broken}
      <span
        class="flex size-16 shrink-0 items-center justify-center border border-white/25 bg-white/10"
        aria-hidden="true"
      >
        <Terminal class="size-6 text-white" />
      </span>
    {:else}
      <img
        src={subject.thumbnail.url}
        alt=""
        width={subject.thumbnail.width}
        height={subject.thumbnail.height}
        loading="lazy"
        decoding="async"
        use:onImageBroken={() => (broken = true)}
        class="size-16 shrink-0 border border-white/25 bg-white/10 object-cover"
      />
    {/if}
    <div class="flex min-w-0 flex-col gap-2">
      <h2 class="font-heading text-display-s break-words uppercase">
        {subject.label}<TitleCursor />
      </h2>
      <ul class="flex flex-wrap gap-1" aria-label="Domaines et niveau">
        {#each subject.domains as domain (domain.key)}
          <li class="rounded-full bg-white/20 px-2 py-0.5 epi-chip">
            {domain.label}
          </li>
        {/each}
        <li class="rounded-full border border-white/40 px-2 py-0.5 epi-chip">
          {WORKSHOP_LEVEL_LABELS[subject.level]}
        </li>
      </ul>
    </div>
  </div>

  <p class="relative flex-1 text-sm leading-relaxed text-white/90">
    {subject.tagline}
  </p>

  {#if subject.notions.length > 0}
    <p class="relative text-xs leading-relaxed text-white/80">
      <span class="font-bold text-white">Notions :</span>
      {subject.notions.join(', ')}
    </p>
  {/if}

  {#if subject.supervisor}
    <div class="relative flex flex-col gap-1.5 border-t border-white/20 pt-3">
      <span class="epi-overline text-white/80">Code superviseur</span>
      <!-- The code is what a manta comes to read, so it is never cut: the
           button wraps under it before the field gets too narrow. -->
      <div class="flex flex-wrap items-stretch gap-2">
        <div
          class="flex min-h-9 flex-[1_1_12rem] items-center justify-between gap-2 rounded-sm bg-epi-dark px-2.5"
        >
          <span
            class="font-mono text-xs font-bold break-all text-epi-tech select-all"
          >
            {subject.supervisor.code}
          </span>
          <CopyButton
            value={subject.supervisor.code}
            label="Copier le code superviseur"
            class="text-white/70 hover:bg-white/10 hover:text-white"
          />
        </div>
        <Button
          href={subject.supervisor.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="overlay"
          size="sm"
          class="h-auto min-h-9 grow"
        >
          <Play class="size-3 fill-current" aria-hidden="true" />
          Accéder au sujet
        </Button>
      </div>
    </div>
  {/if}
</article>
