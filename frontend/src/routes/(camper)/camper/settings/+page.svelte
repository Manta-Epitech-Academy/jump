<script lang="ts">
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import { fly } from 'svelte/transition';
  import {
    ArrowLeft,
    Trash2,
    User,
    Mail,
    Sun,
    Moon,
    Unlink,
  } from '@lucide/svelte';
  import ModeToggle from '$lib/components/ModeToggle.svelte';

  let { data }: { data: PageData } = $props();

  let student = $derived(data.talent);
  let deleteDialogOpen = $state(false);
  let deleting = $state(false);
  let unlinkingDiscord = $state(false);
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

      <!-- Discord -->
      <div
        class="rounded-3xl bg-white p-5 shadow-xl shadow-slate-200/50 dark:bg-slate-900 dark:shadow-none"
      >
        <h2
          class="mb-3 text-base font-bold tracking-widest text-slate-400 uppercase"
        >
          Discord
        </h2>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/30"
            >
              <svg
                class="h-4 w-4 text-indigo-600 dark:text-indigo-400"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"
                />
              </svg>
            </div>
            {#if student?.discordId}
              <div class="min-w-0">
                <p class="text-[10px] font-bold text-slate-400 uppercase">
                  Compte lié
                </p>
                <p class="text-sm font-bold text-teal-600 dark:text-epi-teal">
                  Connecté
                </p>
              </div>
            {:else}
              <span class="text-sm font-bold text-slate-700 dark:text-slate-300"
                >Non connecté</span
              >
            {/if}
          </div>
          {#if student?.discordId}
            <form
              action="?/unlinkDiscord"
              method="POST"
              use:enhance={() => {
                unlinkingDiscord = true;
                return async ({ update }) => {
                  await update();
                  unlinkingDiscord = false;
                };
              }}
            >
              <button
                type="submit"
                disabled={unlinkingDiscord}
                class="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50/80 px-3 py-2 text-xs font-bold text-red-500 transition-all hover:border-red-300 hover:bg-red-100 active:scale-[0.98] disabled:opacity-50 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400 dark:hover:border-red-800 dark:hover:bg-red-950/40"
              >
                <Unlink class="h-3.5 w-3.5" />
                {unlinkingDiscord ? 'Déconnexion...' : 'Déconnecter Discord'}
              </button>
            </form>
          {:else}
            <a
              href={resolve('/camper/discord')}
              class="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition-all hover:scale-[1.02] hover:bg-indigo-700 active:scale-[0.98] dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              Connecter
            </a>
          {/if}
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
