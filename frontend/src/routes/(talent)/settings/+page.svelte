<script lang="ts">
  import type { PageData } from './$types';
  import { Button } from '$lib/components/ui/button';
  import * as AlertDialog from '$lib/components/ui/alert-dialog';
  import { resolve } from '$app/paths';
  import { enhance } from '$app/forms';
  import { fly } from 'svelte/transition';
  import TalentPageHeader from '$lib/components/talent/TalentPageHeader.svelte';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import User from '@lucide/svelte/icons/user';
  import Mail from '@lucide/svelte/icons/mail';
  import Sun from '@lucide/svelte/icons/sun';
  import Moon from '@lucide/svelte/icons/moon';
  import FileText from '@lucide/svelte/icons/file-text';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import Loader from '@lucide/svelte/icons/loader';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import ModeToggle from '$lib/components/ModeToggle.svelte';
  import { track, daysBetween } from '$lib/analytics';
  import { toast } from 'svelte-sonner';
  import { formatDateFr } from '$lib/utils';

  let { data }: { data: PageData } = $props();

  let student = $derived(data.talent);
  let deletion = $derived(data.deletion);
  let documents = $derived(data.documents);
  let deleteDialogOpen = $state(false);
  let requesting = $state(false);
  let cancelling = $state(false);
  let acknowledging = $state(false);
</script>

<svelte:head>
  <title>Paramètres</title>
</svelte:head>

<TalentPageHeader title="Paramètres" />

<div
  class="mx-auto max-w-sm space-y-4 px-4 py-8 sm:py-12"
  in:fly={{ y: 20, duration: 400, delay: 200 }}
>
  <!-- Profile Info (read-only) -->
  <div class="rounded-xl border border-border bg-card p-5 shadow-raised">
    <h2
      class="mb-3 text-base font-bold tracking-widest text-muted-foreground uppercase"
    >
      Mon compte
    </h2>
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10"
        >
          <User class="h-4 w-4 text-epi-blue" />
        </div>
        <div class="min-w-0">
          <p class="epi-overline text-muted-foreground">Nom</p>
          <p class="truncate text-sm font-bold text-foreground">
            {student?.prenom}
            {student?.nom}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10"
        >
          <Mail class="h-4 w-4 text-epi-blue" />
        </div>
        <div class="min-w-0">
          <p class="epi-overline text-muted-foreground">Email</p>
          <p class="truncate text-sm font-bold text-foreground">
            {data.user?.email}
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Appearance -->
  <div class="rounded-xl border border-border bg-card p-5 shadow-raised">
    <h2
      class="mb-3 text-base font-bold tracking-widest text-muted-foreground uppercase"
    >
      Apparence
    </h2>
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-epi-together-ink/10"
        >
          <Sun class="h-4 w-4 text-epi-together dark:hidden" />
          <Moon class="hidden h-4 w-4 text-epi-together dark:block" />
        </div>
        <span class="text-sm font-bold text-foreground-secondary"
          >Thème sombre</span
        >
      </div>
      <ModeToggle />
    </div>
  </div>

  <!-- Signed documents -->
  {#if documents.length > 0}
    <div class="rounded-xl border border-border bg-card p-5 shadow-raised">
      <h2
        class="mb-3 text-base font-bold tracking-widest text-muted-foreground uppercase"
      >
        Mes documents
      </h2>
      <ul class="space-y-3">
        {#each documents as doc (doc.type)}
          <li class="flex items-center gap-3">
            <div
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success/10"
            >
              <FileText class="h-4 w-4 text-epi-tech-ink" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm leading-tight font-bold text-foreground">
                {doc.label}
              </p>
              <p class="epi-overline text-muted-foreground">
                {#if doc.signerName}
                  Signé par {doc.signerName} le {formatDateFr(doc.signedAt)}
                {:else}
                  Signé le {formatDateFr(doc.signedAt)}
                {/if}
              </p>
              {#if doc.coSigner}
                <p class="epi-overline text-muted-foreground">
                  Co-signé par {doc.coSigner.name} le {formatDateFr(
                    doc.coSigner.signedAt,
                  )}
                </p>
              {/if}
            </div>
            {#if doc.status === 'ready'}
              <Button
                variant="outline"
                size="sm"
                href={resolve(`/settings/documents/${doc.type}`)}
                target="_blank"
                rel="noopener"
                class="h-9 shrink-0 rounded-xl text-xs font-bold"
              >
                <ExternalLink class="mr-1 h-3.5 w-3.5" />
                Voir
              </Button>
            {:else if doc.status === 'generating'}
              <span
                class="flex shrink-0 items-center gap-1 epi-overline text-muted-foreground"
              >
                <Loader class="h-3.5 w-3.5 animate-spin" />
                Génération…
              </span>
            {:else}
              <span
                class="flex shrink-0 items-center gap-1 epi-overline text-warning"
                title="La génération de ce document a échoué. Notre équipe peut le relancer, réessaie plus tard ou contacte-la."
              >
                <AlertTriangle class="h-3.5 w-3.5" />
                Indisponible
              </span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  <!-- Danger Zone -->
  {#if deletion?.status === 'pending'}
    <div class="rounded-xl border border-warning/30 bg-warning/10 p-5">
      <h2 class="mb-1 text-sm font-bold text-warning">
        Demande de suppression en cours
      </h2>
      <p class="text-xs leading-relaxed text-warning/80">
        Ta demande du {formatDateFr(deletion.at)} a été transmise à l'équipe. Ton
        compte reste actif tant qu'elle n'a pas été traitée. Tu peux l'annuler tant
        que ce n'est pas fait.
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
          class="mt-3 h-9 rounded-xl border-warning/30 bg-transparent text-xs font-bold text-warning hover:bg-warning/10"
        >
          {cancelling ? 'Annulation…' : 'Annuler ma demande'}
        </Button>
      </form>
    </div>
  {:else if deletion?.status === 'rejected'}
    <div class="rounded-xl border border-border bg-background p-5">
      <h2 class="mb-1 text-sm font-bold text-foreground-secondary">
        Demande de suppression refusée
      </h2>
      <p class="text-xs leading-relaxed text-muted-foreground">
        Ta demande du {formatDateFr(deletion.at)} n'a pas été acceptée par l'équipe.
      </p>
      {#if deletion.note}
        <blockquote
          class="mt-2 border-l-2 border-border pl-3 text-xs leading-relaxed text-foreground-secondary"
        >
          {deletion.note}
        </blockquote>
      {/if}
      <p class="mt-2 text-xs leading-relaxed text-muted-foreground">
        Tu peux refaire une demande ou contacter l'équipe pour en savoir plus.
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
            class="h-9 rounded-xl text-xs font-bold text-muted-foreground"
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
        class="h-auto p-0 text-xs font-normal text-muted-foreground decoration-dotted underline-offset-4 hover:text-destructive"
      >
        Supprimer mon compte
      </Button>
    </div>
  {/if}
</div>

<AlertDialog.Root bind:open={deleteDialogOpen}>
  <AlertDialog.Content
    class="fixed top-[50%] left-[50%] z-50 w-[calc(100%-2rem)] max-w-sm translate-x-[-50%] translate-y-[-50%] rounded-xl border-0 bg-card p-8 shadow-raised duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
  >
    <div class="flex flex-col items-center text-center">
      <div
        class="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10"
      >
        <Trash2 class="h-7 w-7 text-destructive" />
      </div>
      <AlertDialog.Title class="text-foreground">
        Supprimer mon compte
      </AlertDialog.Title>
      <AlertDialog.Description
        class="mt-3 text-sm leading-relaxed text-muted-foreground"
      >
        Ta demande sera transmise à l'équipe. Ton compte
        <strong class="text-foreground-secondary">reste actif</strong>
        jusqu'à son traitement, puis ton profil, tes participations et ta progression
        seront
        <strong class="text-foreground-secondary"
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
          class="h-12 w-full rounded-xl bg-destructive tracking-normal text-status-foreground normal-case shadow-raised transition-ui hover:scale-[1.02] hover:bg-destructive/90 active:scale-[0.98]"
        >
          {#if requesting}
            Envoi en cours…
          {:else}
            Demander la suppression
          {/if}
        </Button>
      </form>
      <AlertDialog.Cancel
        class="h-12 w-full rounded-xl border border-border bg-transparent text-sm font-bold text-foreground-secondary transition-ui hover:bg-background active:scale-[0.98]"
      >
        Annuler
      </AlertDialog.Cancel>
    </div>
  </AlertDialog.Content>
</AlertDialog.Root>
