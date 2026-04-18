<script lang="ts">
  import type { PageData } from './$types';
  import { ArrowLeft, Award, Download, CircleCheck } from '@lucide/svelte';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import * as Table from '$lib/components/ui/table';
  import { toast } from 'svelte-sonner';
  import { triggerConfetti } from '$lib/actions/confetti';
  import { resolve } from '$app/paths';

  let { data }: { data: PageData } = $props();

  async function handleDiplomaDownload(participationId: string) {
    const toastId = toast.loading('Génération du diplôme en cours...');
    try {
      const res = await fetch(
        `${resolve('/api/diploma')}?participationId=${participationId}`,
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Erreur lors de la génération');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      const disposition = res.headers.get('Content-Disposition');
      let filename = 'Diplome.pdf';
      if (disposition && disposition.indexOf('filename=') !== -1) {
        filename = disposition.split('filename=')[1].replace(/"/g, '');
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.success('Diplôme téléchargé avec succès !', { id: toastId });
      triggerConfetti();
    } catch (e: any) {
      console.error(e);
      toast.error(`Erreur : ${e.message}`, { id: toastId });
    }
  }
</script>

<div class="space-y-6 pb-12">
  <div class="flex items-center gap-4 border-b pb-4">
    <a
      href={resolve('/staff/pedago')}
      class={buttonVariants({ variant: 'ghost', size: 'icon' })}
    >
      <ArrowLeft class="h-4 w-4" />
    </a>
    <div>
      <h1
        class="flex items-center gap-3 text-3xl font-bold text-epi-blue uppercase"
      >
        Clôture & Diplômes<span class="text-epi-blue">_</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        {data.event.titre}
      </p>
    </div>
  </div>

  <div
    class="flex flex-col items-center justify-between gap-4 rounded-xl border border-epi-blue/30 bg-epi-blue/5 p-6 md:flex-row"
  >
    <div>
      <h2
        class="flex items-center gap-2 text-lg font-bold text-blue-800 dark:text-blue-400"
      >
        <CircleCheck class="h-5 w-5" /> Session Terminée
      </h2>
      <p class="mt-1 text-sm text-muted-foreground">
        Il y a eu <strong
          >{data.participations.length} participants présents</strong
        > lors de cet événement. Vous pouvez télécharger leurs diplômes individuels
        ci-dessous.
      </p>
    </div>
  </div>

  <div class="mt-6 rounded-sm border bg-card shadow-sm">
    <Table.Root>
      <Table.Header class="bg-muted/50">
        <Table.Row>
          <Table.Head>Talent</Table.Head>
          <Table.Head>Niveau</Table.Head>
          <Table.Head class="text-right">Action</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each data.participations as p}
          <Table.Row class="hover:bg-muted/30">
            <Table.Cell class="font-bold uppercase">
              {p.talent.nom} <span class="capitalize">{p.talent.prenom}</span>
            </Table.Cell>
            <Table.Cell>
              <Badge variant="outline" class="text-[10px]"
                >{p.talent.niveau}</Badge
              >
            </Table.Cell>
            <Table.Cell class="text-right">
              <Button
                variant="outline"
                size="sm"
                class="gap-2 text-epi-blue transition-colors hover:bg-epi-blue hover:text-white"
                onclick={() => handleDiplomaDownload(p.id)}
              >
                <Award class="h-4 w-4" />
                <Download class="h-3 w-3 opacity-70" />
              </Button>
            </Table.Cell>
          </Table.Row>
        {:else}
          <Table.Row>
            <Table.Cell
              colspan={3}
              class="text-center py-12 text-muted-foreground"
            >
              Aucun participant présent n'a été enregistré pour cet événement.
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</div>
