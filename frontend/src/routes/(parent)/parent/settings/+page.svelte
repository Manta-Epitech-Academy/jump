<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { ArrowLeft, User, Mail, Sun, Moon, SunMoon } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { fly } from 'svelte/transition';
  import ModeToggle from '$lib/components/ModeToggle.svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>Paramètres — Espace Parent</title>
</svelte:head>

<div
  class="flex min-h-screen flex-col items-center justify-center px-4 py-8 sm:py-12"
>
  <div class="w-full max-w-sm space-y-5">
    <!-- Header -->
    <header in:fly={{ y: -20, duration: 400, delay: 100 }}>
      <div class="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          href={resolve('/parent')}
          class="h-10 w-10 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <ArrowLeft class="h-5 w-5" />
          <span class="sr-only">Retour</span>
        </Button>
        <h1
          class="font-heading text-3xl tracking-tight text-slate-900 uppercase dark:text-white"
        >
          Paramètres<span class="text-epi-teal">_</span>
        </h1>
      </div>
    </header>

    <div class="space-y-4" in:fly={{ y: 20, duration: 400, delay: 200 }}>
      <!-- Profile Info (read-only) -->
      <div
        class="rounded-3xl bg-white p-5 shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
      >
        <h2
          class="mb-3 text-base font-bold tracking-widest text-slate-400 uppercase"
        >
          Mon compte
        </h2>
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/30"
            >
              <User class="h-4 w-4 text-epi-blue" />
            </div>
            <div class="min-w-0">
              <p class="text-[10px] font-bold text-slate-400 uppercase">Nom</p>
              <p
                class="truncate text-sm font-bold text-slate-800 dark:text-slate-200"
              >
                {data.parentName}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/30"
            >
              <Mail class="h-4 w-4 text-epi-blue" />
            </div>
            <div class="min-w-0">
              <p class="text-[10px] font-bold text-slate-400 uppercase">
                Email
              </p>
              <p
                class="truncate text-sm font-bold text-slate-800 dark:text-slate-200"
              >
                {data.email}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Appearance -->
      <div
        class="rounded-3xl bg-white p-5 shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
      >
        <h2
          class="mb-3 text-base font-bold tracking-widest text-slate-400 uppercase"
        >
          Apparence
        </h2>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 dark:bg-orange-950/30"
            >
              <Sun class="h-4 w-4 text-epi-orange dark:hidden" />
              <Moon class="hidden h-4 w-4 text-epi-orange dark:block" />
            </div>
            <span class="text-sm font-bold text-slate-700 dark:text-slate-300"
              >Thème sombre</span
            >
          </div>
          <ModeToggle />
        </div>
      </div>

      <!-- Logout -->
      <div
        class="rounded-3xl bg-white p-5 shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
      >
        <h2
          class="mb-3 text-base font-bold tracking-widest text-slate-400 uppercase"
        >
          Session
        </h2>
        <form action="{resolve('/logout')}?type=parent" method="POST">
          <Button
            type="submit"
            variant="ghost"
            class="h-11 w-full rounded-2xl border border-red-200 bg-red-50/80 tracking-normal text-red-500 normal-case transition-all hover:scale-[1.02] hover:border-red-300 hover:bg-red-100 active:scale-[0.98] dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400 dark:hover:border-red-800 dark:hover:bg-red-950/40"
          >
            Se déconnecter
          </Button>
        </form>
      </div>
    </div>
  </div>
</div>
