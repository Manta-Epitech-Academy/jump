<script lang="ts">
  import PageHeader from '$lib/components/layout/PageHeader.svelte';
  import { Construction, ArrowLeft } from '@lucide/svelte';
  import { resolve } from '$app/paths';
  import { buttonVariants } from '$lib/components/ui/button';

  let { data } = $props();
</script>

<div class="flex h-full flex-col space-y-6 pb-10">
  <div class="flex items-start justify-between gap-4">
    <div class="flex items-center gap-3">
      <a
        href={resolve(`/staff/dev/events/${data.event.id}/manage`)}
        class={buttonVariants({ variant: 'ghost', size: 'icon' })}
      >
        <ArrowLeft class="h-4 w-4" />
      </a>
      <PageHeader title="Suivi ADM" subtitle={data.event.titre} />
    </div>
  </div>

  <div class="flex flex-1 items-center justify-center">
    <div
      class="max-w-md rounded-lg border border-dashed bg-muted/30 p-12 text-center"
    >
      <Construction class="mx-auto h-12 w-12 text-muted-foreground" />
      <h2 class="mt-4 text-lg font-bold">Bientôt disponible</h2>
      <p class="mt-2 text-sm text-muted-foreground">
        Suivi administratif dédié — chartes, conventions, droits à l'image,
        relances et alertes par talent.
      </p>
    </div>
  </div>
</div>
