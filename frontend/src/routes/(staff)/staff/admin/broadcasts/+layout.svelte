<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

  let { data, children } = $props();

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

  {#if data.devRedirectActive}
    <div
      class="flex items-start gap-3 rounded-md border-2 border-amber-500 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
      role="alert"
    >
      <TriangleAlert class="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div class="space-y-1">
        <p class="font-bold tracking-tight uppercase">
          Mode dev — emails redirigés
        </p>
        <p>
          La variable <code
            class="rounded bg-amber-200/60 px-1 font-mono text-xs dark:bg-amber-900/60"
            >EMAIL_DEV_RECIPIENTS</code
          >
          est définie :
          <strong>tous les envois iront vers ces adresses</strong>, jamais aux
          destinataires réels. Le sujet sera préfixé par
          <code
            class="rounded bg-amber-200/60 px-1 font-mono text-xs dark:bg-amber-900/60"
            >[→ original@…]</code
          >
          pour identifier le destinataire prévu.
        </p>
        <p class="text-xs">
          Adresses configurées :
          <span class="font-mono">
            {data.devRedirectRecipients.join(', ')}
          </span>
        </p>
      </div>
    </div>
  {/if}

  {@render children()}
</div>
