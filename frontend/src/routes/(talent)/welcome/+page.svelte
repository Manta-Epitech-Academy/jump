<script lang="ts">
  import type { PageData } from './$types';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { ArrowRight } from '@lucide/svelte';

  let { data }: { data: PageData } = $props();
</script>

<div class="mx-auto max-w-3xl px-4 py-12">
  <div class="prose max-w-none prose-slate dark:prose-invert">
    {@html data.cmsContent}
  </div>

  <div class="mt-8 flex justify-center">
    <form method="POST" action="?/markSeen" use:enhance>
      <Button type="submit">
        Accéder au tableau de bord
        <ArrowRight class="ml-2 h-4 w-4" />
      </Button>
    </form>
  </div>
</div>
