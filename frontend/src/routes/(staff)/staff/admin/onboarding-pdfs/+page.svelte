<script lang="ts">
  import FileText from '@lucide/svelte/icons/file-text';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import { enhance } from '$app/forms';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Card from '$lib/components/ui/card';
  import * as Table from '$lib/components/ui/table';
  import { formatDateTimeFr } from '$lib/utils';
  import { toast } from 'svelte-sonner';

  let { data } = $props();

  const documentTypeLabels: Record<string, string> = {
    rules: 'Règlement intérieur',
    charter: 'Charte',
    'image-rights': "Droit à l'image",
  };

  const statusLabels: Record<string, string> = {
    pending: 'En attente',
    processing: 'En cours',
    success: 'Succès',
    error: 'Erreur',
  };

  function statusVariant(
    status: string,
  ): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (status === 'success') return 'secondary';
    if (status === 'error') return 'destructive';
    if (status === 'processing') return 'default';
    return 'outline';
  }

  const inFlight = $derived(
    data.countByStatus.pending + data.countByStatus.processing,
  );
</script>

<svelte:head>
  <title>Génération PDF onboarding</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 class="font-heading text-3xl tracking-wide uppercase">
        Génération PDF <span class="text-epi-pink">Onboarding</span>
      </h1>
      <p class="text-sm font-bold text-muted-foreground uppercase">
        Générés en arrière-plan dès la signature
      </p>
    </div>

    {#if data.errorCount > 0}
      <form
        method="POST"
        action="?/retryAll"
        use:enhance={() =>
          async ({ result, update }) => {
            if (result.type === 'success') {
              toast.success(
                `${data.errorCount} génération${data.errorCount > 1 ? 's' : ''} relancée${data.errorCount > 1 ? 's' : ''}`,
              );
              await update();
            } else {
              toast.error('Une erreur est survenue');
            }
          }}
      >
        <Button type="submit" variant="outline" class="gap-2">
          <RotateCcw class="h-4 w-4" />
          Tout relancer ({data.errorCount})
        </Button>
      </form>
    {/if}
  </div>

  <div class="grid gap-4 md:grid-cols-3">
    <Card.Root class="border-t-4 border-t-epi-pink shadow-sm">
      <Card.Header class="pb-2">
        <Card.Title class="text-sm font-bold uppercase">En cours</Card.Title>
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-black">{inFlight}</div>
        <p class="text-xs text-muted-foreground">Génération en arrière-plan</p>
      </Card.Content>
    </Card.Root>

    <Card.Root class="border-t-4 border-t-emerald-500 shadow-sm">
      <Card.Header class="pb-2">
        <Card.Title class="text-sm font-bold uppercase">Succès</Card.Title>
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-black">{data.countByStatus.success}</div>
        <p class="text-xs text-muted-foreground">PDF générés et uploadés</p>
      </Card.Content>
    </Card.Root>

    <Card.Root class="border-t-4 border-t-destructive shadow-sm">
      <Card.Header class="pb-2">
        <Card.Title class="text-sm font-bold uppercase">Erreurs</Card.Title>
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-black">{data.countByStatus.error}</div>
        <p class="text-xs text-muted-foreground">Échecs — relançables</p>
      </Card.Content>
    </Card.Root>
  </div>

  <Card.Root>
    <Card.Header>
      <Card.Title class="flex items-center gap-2 uppercase">
        <FileText class="h-4 w-4" />
        Dernières tâches
      </Card.Title>
    </Card.Header>
    <Card.Content>
      <Table.Root>
        <Table.Header>
          <Table.Row>
            <Table.Head>Statut</Table.Head>
            <Table.Head>Talent</Table.Head>
            <Table.Head>Document</Table.Head>
            <Table.Head>Créée</Table.Head>
            <Table.Head>Traitée</Table.Head>
            <Table.Head>Détails</Table.Head>
            <Table.Head class="text-right">Action</Table.Head>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {#each data.jobs as job (job.id)}
            <Table.Row>
              <Table.Cell>
                <Badge variant={statusVariant(job.status)}>
                  {statusLabels[job.status] ?? job.status}
                </Badge>
              </Table.Cell>
              <Table.Cell class="font-medium">
                {job.talent?.name ?? '—'}
              </Table.Cell>
              <Table.Cell>
                {documentTypeLabels[job.documentType] ?? job.documentType}
              </Table.Cell>
              <Table.Cell class="text-xs text-muted-foreground">
                {formatDateTimeFr(job.createdAt)}
              </Table.Cell>
              <Table.Cell class="text-xs text-muted-foreground">
                {job.processedAt ? formatDateTimeFr(job.processedAt) : '—'}
              </Table.Cell>
              <Table.Cell class="max-w-md">
                {#if job.status === 'error' && job.errorMessage}
                  <span class="text-xs text-destructive">
                    {job.errorMessage}
                  </span>
                {:else if job.status === 'success' && job.filePath}
                  <form
                    method="POST"
                    action="?/view"
                    class="inline"
                    use:enhance={() =>
                      async ({ result }) => {
                        if (result.type === 'success' && result.data?.url) {
                          window.open(
                            result.data.url as string,
                            '_blank',
                            'noopener',
                          );
                        } else {
                          toast.error("Impossible d'ouvrir le PDF");
                        }
                      }}
                  >
                    <input type="hidden" name="id" value={job.id} />
                    <Button
                      type="submit"
                      variant="link"
                      size="sm"
                      class="h-auto gap-1.5 p-0 text-xs"
                    >
                      <ExternalLink class="h-3.5 w-3.5" />
                      Voir le PDF
                    </Button>
                  </form>
                {:else}
                  <span class="text-xs text-muted-foreground">—</span>
                {/if}
              </Table.Cell>
              <Table.Cell class="text-right">
                {#if job.status !== 'success' && job.status !== 'processing'}
                  <form
                    method="POST"
                    action="?/retry"
                    use:enhance={() =>
                      async ({ result, update }) => {
                        if (result.type === 'success') {
                          toast.success('Génération relancée');
                          await update();
                        } else {
                          toast.error('Une erreur est survenue');
                        }
                      }}
                  >
                    <input type="hidden" name="id" value={job.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      class="gap-1.5"
                    >
                      <RotateCcw class="h-3.5 w-3.5" />
                      Relancer
                    </Button>
                  </form>
                {/if}
              </Table.Cell>
            </Table.Row>
          {:else}
            <Table.Row>
              <Table.Cell colspan={7} class="text-center text-muted-foreground">
                Aucune tâche enregistrée.
              </Table.Cell>
            </Table.Row>
          {/each}
        </Table.Body>
      </Table.Root>
    </Card.Content>
  </Card.Root>
</div>
