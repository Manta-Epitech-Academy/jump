<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';

  let { children } = $props();

  function isOnTemplates(): boolean {
    return page.url.pathname.includes('/broadcasts/templates');
  }

  const tabClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? 'border-epi-pink text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    }`;
</script>

<div class="space-y-6">
  <header class="space-y-2">
    <h1 class="text-2xl font-bold tracking-tight">Envoi en masse</h1>
    <p class="text-sm text-muted-foreground">
      Crée des templates de mail / SMS et lance des envois ciblés aux talents,
      parents ou staff.
    </p>
  </header>

  <nav class="flex border-b">
    <a
      href={resolve('/staff/admin/broadcasts')}
      class={tabClass(!isOnTemplates())}
    >
      Envois
    </a>
    <a
      href={resolve('/staff/admin/broadcasts/templates')}
      class={tabClass(isOnTemplates())}
    >
      Templates
    </a>
  </nav>

  {@render children()}
</div>
