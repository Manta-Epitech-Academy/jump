<script lang="ts">
  import type { PageData } from './$types';
  import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
  import * as Card from '$lib/components/ui/card';
  import StudentAvatarItem from '$lib/components/students/StudentAvatarItem.svelte';

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  <title>Notes — Admin</title>
</svelte:head>

<div class="space-y-6">
  <AdminPageHeader
    title="Notes"
    accent="talents"
    subtitle="Notes libres saisies par le staff sur les talents"
  />

  {#if data.talents.length === 0}
    <p class="py-16 text-center text-sm text-muted-foreground">
      Aucune note pour le moment.
    </p>
  {:else}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each data.talents as talent (talent.id)}
        <Card.Root>
          <Card.Header class="pb-3">
            <StudentAvatarItem student={talent} subText={talent.campus} />
          </Card.Header>
          <Card.Content>
            <p class="text-sm whitespace-pre-wrap">{talent.note}</p>
          </Card.Content>
        </Card.Root>
      {/each}
    </div>
  {/if}
</div>
