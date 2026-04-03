<script lang="ts">
  import type { PageData } from './$types';
  import { pbUrl } from '$lib/pocketbase';
  import { Badge } from '$lib/components/ui/badge';
  import {
    Trophy,
    Rocket,
    Link as LinkIcon,
    Calendar,
    Image as ImageIcon,
    Target,
  } from '@lucide/svelte';
  import { resolve } from '$app/paths';

  let { data }: { data: PageData } = $props();
  let student = $derived(data.student);
  let items = $derived(data.portfolioItems);
  let topThemes = $derived(data.topThemes);

  import { THEME_TIER_CEILING } from '$lib/utils';

  let levelLabel = $derived(
    student.level === 'Expert'
      ? 'Expert ✦'
      : student.level === 'Apprentice'
        ? 'Apprenti'
        : 'Novice',
  );
</script>

<div
  class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
>
  <!-- Background effects -->
  <div
    class="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(var(--color-slate-200)_1px,transparent_1px)] bg-size-[32px_32px] opacity-50 dark:bg-[radial-gradient(var(--color-slate-800)_1px,transparent_1px)]"
  ></div>

  <div class="relative z-10 mx-auto max-w-3xl px-4 py-8 sm:py-12">
    <!-- Header Card -->
    <div
      class="relative overflow-hidden rounded-3xl border-t-4 border-t-epi-blue bg-white p-6 text-center shadow-xl shadow-slate-200/50 sm:p-8 dark:bg-slate-900 dark:shadow-none"
    >
      <div
        class="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-epi-teal/10 blur-2xl dark:bg-epi-teal/20"
      ></div>
      <div
        class="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-epi-blue/10 blur-2xl dark:bg-epi-blue/20"
      ></div>

      <div
        class="relative z-10 mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-epi-blue text-white shadow-lg shadow-epi-blue/20"
      >
        <Rocket class="h-10 w-10" />
      </div>

      <h1
        class="relative z-10 mb-2 font-heading text-4xl tracking-tight uppercase sm:text-5xl"
      >
        {student.prenom} <span class="text-epi-blue">{student.nomInitial}</span>
      </h1>

      <div class="relative z-10 mb-6 flex flex-wrap justify-center gap-2">
        <Badge
          variant="secondary"
          class="bg-slate-100 px-3 py-1 text-xs font-bold tracking-wider text-slate-600 uppercase dark:bg-slate-800 dark:text-slate-300"
        >
          {student.niveau}
        </Badge>
        <Badge
          variant="outline"
          class="border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black tracking-widest text-orange-600 uppercase dark:border-orange-900/50 dark:bg-orange-900/20 dark:text-orange-400"
        >
          {levelLabel}
        </Badge>
      </div>

      <div class="relative z-10 mx-auto grid max-w-sm grid-cols-2 gap-4">
        <div
          class="flex flex-col items-center justify-center rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/50"
        >
          <Trophy class="mb-2 h-6 w-6 text-epi-orange" />
          <span class="text-3xl font-black">{student.xp}</span>
          <span
            class="text-[10px] font-bold tracking-widest text-slate-500 uppercase"
            >XP Total</span
          >
        </div>
        <div
          class="flex flex-col items-center justify-center rounded-2xl bg-slate-50 p-4 dark:bg-slate-950/50"
        >
          <Calendar class="mb-2 h-6 w-6 text-epi-teal" />
          <span class="text-3xl font-black">{student.events_count}</span>
          <span
            class="text-[10px] font-bold tracking-widest text-slate-500 uppercase"
            >Événements</span
          >
        </div>
      </div>
    </div>

    <!-- Specialties Radar Section -->
    {#if topThemes.length > 0}
      <div class="mt-10">
        <h2
          class="mb-6 flex items-center gap-2 font-heading text-2xl tracking-wide uppercase"
        >
          <Target class="h-6 w-6 text-teal-600 dark:text-epi-teal" />
          Arbre de Compétences<span class="text-epi-teal">_</span>
        </h2>

        <div
          class="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900"
        >
          <div class="grid gap-6 sm:grid-cols-2">
            {#each topThemes as theme}
              <div class="space-y-2">
                <div
                  class="flex justify-between text-sm font-bold text-slate-700 dark:text-slate-300"
                >
                  <span class="truncate pr-2">{theme.name}</span>
                  <span class="shrink-0 text-teal-700 dark:text-epi-teal"
                    >{theme.label}</span
                  >
                </div>
                <div
                  class="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                  role="progressbar"
                  aria-valuenow={Math.min(theme.count, THEME_TIER_CEILING)}
                  aria-valuemin={0}
                  aria-valuemax={THEME_TIER_CEILING}
                  aria-label="{theme.name} : {theme.label}"
                >
                  <div
                    class="h-full rounded-full bg-teal-500 transition-all duration-1000 ease-out dark:bg-epi-teal"
                    style="width: {Math.min(
                      (theme.count / THEME_TIER_CEILING) * 100,
                      100,
                    )}%"
                  ></div>
                </div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}

    <!-- Portfolio Section -->
    <div class="mt-10">
      <h2
        class="mb-6 flex items-center gap-2 font-heading text-2xl tracking-wide uppercase"
      >
        <ImageIcon class="h-6 w-6 text-purple-500" />
        Créations & Portfolio<span class="text-epi-pink">_</span>
      </h2>

      {#if items.length === 0}
        <div
          class="rounded-3xl border-2 border-dashed border-slate-200 bg-white/50 py-12 text-center dark:border-slate-800 dark:bg-slate-900/50"
        >
          <p class="font-medium text-slate-500">
            Ce profil est encore en construction.
          </p>
        </div>
      {:else}
        <div class="columns-1 gap-6 space-y-6 sm:columns-2">
          {#each items as item}
            <div
              class="group break-inside-avoid overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-900"
            >
              {#if item.file}
                <a
                  href={`${pbUrl}/api/files/${item.collectionId}/${item.id}/${item.file}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="block w-full overflow-hidden bg-slate-100 dark:bg-slate-950"
                  title="Ouvrir l'image"
                >
                  <img
                    src={`${pbUrl}/api/files/${item.collectionId}/${item.id}/${item.file}?thumb=600x0`}
                    alt={item.caption || 'Portfolio item'}
                    class="w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                </a>
              {:else if item.url}
                <div
                  class="flex aspect-video flex-col items-center justify-center bg-purple-50 p-8 dark:bg-purple-900/20"
                >
                  <LinkIcon class="mb-3 h-10 w-10 text-purple-400" />
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="line-clamp-2 text-center text-sm font-bold break-all text-purple-600 hover:underline"
                  >
                    {item.url}
                  </a>
                </div>
              {/if}

              <div class="p-4">
                {#if item.caption}
                  <p
                    class="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    {item.caption}
                  </p>
                {/if}
                <div
                  class="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold tracking-wider text-slate-500 uppercase dark:bg-slate-800 dark:text-slate-400"
                >
                  <Calendar class="h-3 w-3" />
                  {item.eventName}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <div class="mt-12 text-center">
      <a
        href={resolve('/')}
        class="inline-flex items-center gap-2 text-xs font-bold tracking-widest text-slate-400 uppercase transition-colors hover:text-epi-blue"
      >
        Propulsé par Epitech TekCamp
      </a>
    </div>
  </div>
</div>
