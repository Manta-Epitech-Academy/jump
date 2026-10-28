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
  // notions is there, its instance's supervisor code included. The picture can
  // still fail to load (its stored object gone, or a database seeded with no
  // bucket to put the bytes in), and then a brand tile takes its place so the
  // cards stay aligned.
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

  <div class="relative flex flex-col gap-1.5 border-t border-white/20 pt-3">
    <span class="epi-overline text-white/80">Code superviseur</span>
    <!-- One line, as the mockup draws it: the code is copied, not read, so it
         may be cut, and the whole field is the copy control, its tooltip the
         whole code. -->
    <div class="flex items-stretch gap-2">
      <CopyButton
        value={subject.supervisor.code}
        label={`Copier ${subject.supervisor.code}`}
        class="min-h-9 min-w-0 flex-1 rounded-sm bg-epi-dark px-2.5 text-white/70 hover:bg-epi-dark/80 hover:text-white"
      >
        <span class="truncate font-mono text-xs font-bold text-epi-tech">
          {subject.supervisor.code}
        </span>
      </CopyButton>
      <Button
        href={subject.supervisor.joinUrl}
        target="_blank"
        rel="noopener noreferrer"
        variant="inverse"
        size="sm"
        class="min-h-9 shrink-0"
      >
        <Play class="size-3 fill-current" aria-hidden="true" />
        Accéder au sujet
      </Button>
    </div>
  </div>
</article>
