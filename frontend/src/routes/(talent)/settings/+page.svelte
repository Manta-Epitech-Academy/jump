<script lang="ts">
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import { fly } from 'svelte/transition';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import User from '@lucide/svelte/icons/user';
  import Mail from '@lucide/svelte/icons/mail';
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import { track, daysBetween } from '$lib/analytics';
  import { toast } from 'svelte-sonner';
  import { formatDateFr } from '$lib/utils';

  let { data }: { data: PageData } = $props();

  let student = $derived(data.talent);
  let deletion = $derived(data.deletion);
  let deleteDialogOpen = $state(false);
  let requesting = $state(false);
  let cancelling = $state(false);
  let acknowledging = $state(false);
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
          href={resolve('/')}
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
      {#if deletion?.status === 'pending'}
        <div
          class="rounded-3xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/40 dark:bg-amber-950/20"
        >
          <h2 class="mb-1 text-sm font-bold text-amber-700 dark:text-amber-400">
            Demande de suppression en cours
          </h2>
          <p
            class="text-xs leading-relaxed text-amber-700/80 dark:text-amber-400/70"
          >
            Ta demande du {formatDateFr(deletion.at)} a été transmise à l'équipe.
            Ton compte reste actif tant qu'elle n'a pas été traitée. Tu peux l'annuler
            tant que ce n'est pas fait.
          </p>
          <form
            action="?/cancelDeletion"
            method="POST"
            use:enhance={() => {
              cancelling = true;
              return async ({ result, update }) => {
                await update();
                cancelling = false;
                if (result.type === 'success') {
                  toast.success('Demande de suppression annulée.');
                }
              };
            }}
          >
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={cancelling}
              class="mt-3 h-9 rounded-xl border-amber-300 bg-transparent text-xs font-bold text-amber-700 hover:bg-amber-100 dark:border-amber-900/50 dark:text-amber-400 dark:hover:bg-amber-950/40"
            >
              {cancelling ? 'Annulation…' : 'Annuler ma demande'}
            </Button>
          </form>
        </div>
      {:else if deletion?.status === 'rejected'}
        <div
          class="rounded-3xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900/40"
        >
          <h2 class="mb-1 text-sm font-bold text-slate-700 dark:text-slate-300">
            Demande de suppression refusée
          </h2>
          <p class="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Ta demande du {formatDateFr(deletion.at)} n'a pas été acceptée par l'équipe.
          </p>
          {#if deletion.note}
            <blockquote
              class="mt-2 border-l-2 border-slate-300 pl-3 text-xs leading-relaxed text-slate-700 dark:border-slate-700 dark:text-slate-300"
            >
              {deletion.note}
            </blockquote>
          {/if}
          <p
            class="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
          >
            Tu peux refaire une demande ou contacter l'équipe pour en savoir
            plus.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <form
              action="?/requestDeletion"
              method="POST"
              use:enhance={() => {
                requesting = true;
                return async ({ result, update }) => {
                  await update();
                  requesting = false;
                  if (result.type === 'success') {
                    toast.success('Nouvelle demande transmise à l’équipe.');
                  }
                };
              }}
            >
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={requesting}
                class="h-9 rounded-xl text-xs font-bold"
              >
                {requesting ? 'Envoi…' : 'Faire une nouvelle demande'}
              </Button>
            </form>
            <form
              action="?/acknowledgeRejection"
              method="POST"
              use:enhance={() => {
                acknowledging = true;
                return async ({ update }) => {
                  await update();
                  acknowledging = false;
                };
              }}
            >
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                disabled={acknowledging}
                class="h-9 rounded-xl text-xs font-bold text-slate-500"
              >
                {acknowledging ? '…' : 'J’ai compris'}
              </Button>
            </form>
          </div>
        </div>
      {:else}
        <div class="pt-2 text-center">
          <Button
            variant="link"
            size="sm"
            onclick={() => (deleteDialogOpen = true)}
            class="h-auto p-0 text-[11px] font-normal text-slate-400 decoration-dotted underline-offset-4 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400"
          >
            Supprimer mon compte
          </Button>
        </div>
      {/if}
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
        Ta demande sera transmise à l'équipe. Ton compte
        <strong class="text-slate-700 dark:text-slate-300">reste actif</strong>
        jusqu'à son traitement, puis ton profil, tes participations, ta progression
        et ton portfolio seront
        <strong class="text-slate-700 dark:text-slate-300"
          >définitivement anonymisés</strong
        >. Tu pourras annuler tant que la demande n'a pas été traitée.
      </AlertDialog.Description>
    </div>
    <div class="mt-6 flex flex-col gap-3">
      <form
        action="?/requestDeletion"
        method="POST"
        use:enhance={() => {
          requesting = true;
          track('account_deletion_requested', {
            accountAgeDays: daysBetween(student?.createdAt),
            lastActiveDaysAgo: daysBetween(student?.lastActiveAt),
            participationsCount: data.participationsCount ?? null,
          });
          return async ({ result, update }) => {
            await update();
            requesting = false;
            deleteDialogOpen = false;
            if (result.type === 'success') {
              toast.success('Demande de suppression transmise à l’équipe.');
            }
          };
        }}
      >
        <Button
          type="submit"
          disabled={requesting}
          class="h-12 w-full rounded-2xl bg-red-500 tracking-normal text-white normal-case shadow-lg shadow-red-500/20 transition-all hover:scale-[1.02] hover:bg-red-600 active:scale-[0.98]"
        >
          {#if requesting}
            Envoi en cours…
          {:else}
            Demander la suppression
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
