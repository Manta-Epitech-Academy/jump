<script lang="ts">
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import { fly } from 'svelte/transition';
  import { ArrowLeft, Trash2, User, Mail, Sun, Moon } from '@lucide/svelte';
  import ModeToggle from '$lib/components/ModeToggle.svelte';

  let { data }: { data: PageData } = $props();

  let student = $derived(data.studentProfile);
  let deleteDialogOpen = $state(false);
  let deleting = $state(false);
</script>

<svelte:head>
  <title>Paramètres</title>
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
          href={resolve('/camper')}
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
                {student?.prenom}
                {student?.nom}
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
                {data.user?.email}
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

      <!-- Danger Zone -->
      <div
        class="rounded-3xl border border-red-100 bg-white p-5 shadow-xl shadow-slate-200/50 dark:border-red-950/40 dark:bg-slate-900 dark:shadow-none"
      >
        <h2
          class="mb-1 text-base font-bold tracking-widest text-red-400 uppercase dark:text-red-500/70"
        >
          Zone de danger
        </h2>
        <p class="mb-4 text-xs leading-relaxed text-slate-400">
          La suppression de ton compte est définitive. Toutes tes données seront
          perdues.
        </p>
        <Button
          variant="ghost"
          class="h-11 w-full rounded-2xl border border-red-200 bg-red-50/80 tracking-normal text-red-500 normal-case transition-all hover:scale-[1.02] hover:border-red-300 hover:bg-red-100 active:scale-[0.98] dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400 dark:hover:border-red-800 dark:hover:bg-red-950/40"
          onclick={() => (deleteDialogOpen = true)}
        >
          <Trash2 class="mr-2 inline h-4 w-4" />
          Supprimer mon compte
        </Button>
      </div>
    </div>
  </div>
</div>

<AlertDialog.Root bind:open={deleteDialogOpen}>
  <AlertDialog.Content
    class="fixed top-[50%] left-[50%] z-50 w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] rounded-3xl border-0 bg-white p-8 shadow-2xl shadow-slate-300/50 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 dark:bg-slate-900 dark:shadow-none"
  >
    <div class="flex flex-col items-center text-center">
      <div
        class="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/30"
      >
        <Trash2 class="h-7 w-7 text-red-500" />
      </div>
      <AlertDialog.Title
        class="font-heading text-xl tracking-tight text-slate-900 uppercase dark:text-white"
      >
        Supprimer mon compte
      </AlertDialog.Title>
      <AlertDialog.Description
        class="mt-3 text-sm leading-relaxed text-slate-500"
      >
        Cette action est <strong class="text-slate-700 dark:text-slate-300"
          >définitive et irréversible</strong
        >. Ton profil, tes participations, ta progression et ton portfolio
        seront supprimés de manière permanente.
      </AlertDialog.Description>
    </div>
    <div class="mt-6 flex flex-col gap-3">
      <form
        action="?/deleteAccount"
        method="POST"
        use:enhance={() => {
          deleting = true;
          return async ({ update }) => {
            await update();
            deleting = false;
          };
        }}
      >
        <Button
          type="submit"
          disabled={deleting}
          class="h-12 w-full rounded-2xl bg-red-500 tracking-normal text-white normal-case shadow-lg shadow-red-500/20 transition-all hover:scale-[1.02] hover:bg-red-600 active:scale-[0.98]"
        >
          {#if deleting}
            Suppression en cours…
          {:else}
            Supprimer définitivement
          {/if}
        </Button>
      </form>
      <AlertDialog.Cancel
        class="h-12 w-full rounded-2xl border border-slate-200 bg-transparent text-sm font-bold text-slate-600 transition-all hover:bg-slate-50 active:scale-[0.98] dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Annuler
      </AlertDialog.Cancel>
    </div>
  </AlertDialog.Content>
</AlertDialog.Root>
