<!--
  The talent's settings, laid out as the 2027 mockup draws them: a menu of
  sections on the left (a row of tabs above on a phone) and the open section
  beside it, one at a time. A single column of every card stacked had become
  too narrow and too long to live with, and the menu is where the sections the
  mockup has and Jump does not yet (« Ma carte de membre », « Notifications »)
  will go.

  The open section is in the address (`?rubrique=`), so a link can open one
  and a reload keeps it. Without one, it is « Mon EpiDuck », unless a deletion
  request needs the talent's eye: then it is the section that shows it.

  The theme switch the page used to carry is gone: it sits in the header, on
  every page, as in the mockup.
-->
<script lang="ts">
  import type { PageData } from './$types';
  import { page } from '$app/state';
  import { enter } from '#lib/motion/index.ts';
  import TalentPageHeader from '#lib/components/talent/TalentPageHeader.svelte';
  import MascotSettingsCard from '#lib/components/mascot/MascotSettingsCard.svelte';
  import AccountSection from '#lib/components/talent/settings/AccountSection.svelte';
  import DocumentsSection from '#lib/components/talent/settings/DocumentsSection.svelte';
  import PrivacySection from '#lib/components/talent/settings/PrivacySection.svelte';

  let { data }: { data: PageData } = $props();

  type SectionKey = 'canard' | 'compte' | 'documents' | 'confidentialite';

  let sections = $derived(
    (
      [
        { key: 'canard', label: 'Mon EpiDuck' },
        { key: 'compte', label: 'Mon compte' },
        // Offered only when there is a signed document to show.
        data.documents.length > 0
          ? { key: 'documents', label: 'Mes documents' }
          : null,
        { key: 'confidentialite', label: 'Confidentialité' },
      ] satisfies ({ key: SectionKey; label: string } | null)[]
    ).filter((section) => section !== null),
  );

  let current = $derived.by((): SectionKey => {
    const asked = page.url.searchParams.get('rubrique');
    const found = sections.find((section) => section.key === asked);
    if (found) return found.key;
    return data.deletion ? 'confidentialite' : 'canard';
  });
</script>

<svelte:head>
  <title>Paramètres</title>
</svelte:head>

<TalentPageHeader title="Paramètres" />

<div
  class="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pt-2 pb-12 sm:flex-row sm:items-start sm:gap-6 md:px-8"
  in:enter
>
  <nav aria-label="Rubriques des paramètres" class="sm:w-48 sm:flex-none">
    <ul class="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:flex-col">
      {#each sections as section (section.key)}
        {@const open = section.key === current}
        <li class="flex-none">
          <a
            href="?rubrique={section.key}"
            data-sveltekit-noscroll
            data-sveltekit-replacestate
            aria-current={open ? 'page' : undefined}
            class="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors {open
              ? 'bg-primary font-semibold text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
          >
            {section.label}
            {#if section.key === 'confidentialite' && data.deletion}
              <span
                class="size-2 rounded-full bg-warning"
                aria-label="Une demande de suppression attend"
              ></span>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  <div class="min-w-0 flex-1">
    {#if current === 'canard'}
      <MascotSettingsCard form={data.mascotForm} />
    {:else if current === 'compte'}
      <AccountSection account={data.account} />
    {:else if current === 'documents'}
      <DocumentsSection documents={data.documents} />
    {:else}
      <PrivacySection
        usageAnalyticsOptedOut={data.usageAnalyticsOptedOut}
        deletion={data.deletion}
        student={data.talent}
        participationsCount={data.participationsCount}
      />
    {/if}
  </div>
</div>
