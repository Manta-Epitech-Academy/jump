<script lang="ts">
  import type { PageData } from './$types';
  import { resolve } from '$app/paths';
  import { superForm } from 'sveltekit-superforms';
  import { zod4Client } from 'sveltekit-superforms/adapters';
  import { toast } from 'svelte-sonner';
  import { tick, untrack } from 'svelte';
  import { Switch } from '$lib/components/ui/switch';
  import { Label } from '$lib/components/ui/label';
  import PageBreadcrumb from '$lib/components/layout/PageBreadcrumb.svelte';
  import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
  import Trophy from '@lucide/svelte/icons/trophy';
  import { toggleEventSchema } from '$lib/validation/minigames';

  let { data }: { data: PageData } = $props();

  const { form, enhance, submitting } = superForm(
    untrack(() => data.form),
    {
      validators: zod4Client(toggleEventSchema),
      resetForm: false,
      onResult: ({ result }) => {
        if (result.type === 'success' && result.data?.form?.message) {
          toast.success(result.data.form.message);
        }
      },
    },
  );

  let formEl: HTMLFormElement | undefined = $state();

  async function handleToggle(next: boolean) {
    $form.enabled = next;
    await tick();
    formEl?.requestSubmit();
  }

  function formatChrono(ms: number | null): string {
    if (ms === null) return '—';
    return `${(ms / 1000).toFixed(1)}s`;
  }
</script>

<svelte:head>
  <title>{data.event.titre} — Mini-jeux</title>
</svelte:head>

<div class="flex flex-col space-y-6">
  <div class="border-b pb-4">
    <PageBreadcrumb
      items={[
        {
          label: data.event.titre,
          href: resolve(`/staff/pedago/events/${data.event.id}`),
        },
        { label: 'Mini-jeux' },
      ]}
    />
    <h1
      class="flex items-center gap-3 text-3xl font-bold text-epi-blue uppercase"
    >
      <Gamepad2 class="h-7 w-7" />
      Mini-jeux<span class="text-foreground">_</span>
    </h1>
    <p class="text-sm font-bold text-muted-foreground uppercase">
      {data.event.titre}
    </p>
  </div>

  <section class="rounded-xl border bg-card p-6">
    <h2 class="mb-3 text-lg font-bold">Activation</h2>
    <form method="POST" action="?/toggle" use:enhance bind:this={formEl}>
      <input type="hidden" name="enabled" value={$form.enabled} />
      <div class="flex items-center justify-between gap-4">
        <Label for="minigames-toggle" class="flex-1">
          <span class="font-bold">Mini-jeux activés pour cet event</span>
          <span class="block text-xs text-muted-foreground">
            Les talents présents pourront jouer le mini-jeu du jour.
          </span>
        </Label>
        <Switch
          id="minigames-toggle"
          checked={$form.enabled}
          disabled={$submitting}
          onCheckedChange={handleToggle}
        />
      </div>
    </form>
  </section>

  <section class="rounded-xl border bg-card p-6">
    <div class="mb-4 flex items-center gap-3">
      <Trophy class="h-5 w-5 text-epi-orange" />
      <h2 class="text-lg font-bold">Classement</h2>
    </div>
    {#if !data.publication}
      <p class="text-sm text-muted-foreground">
        Aucune publication active pour le moment.
      </p>
    {:else}
      <p class="mb-3 text-sm text-muted-foreground">
        Publication active : <span class="capitalize"
          >{data.publication.game}</span
        >
        · niveau {data.publication.level}
      </p>
      {#if data.leaderboard.rows.length === 0}
        <p class="text-sm text-muted-foreground">Personne n'a encore joué.</p>
      {:else}
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b">
              <th class="py-2 text-left font-bold uppercase">#</th>
              <th class="py-2 text-left font-bold uppercase">Joueur</th>
              {#if data.leaderboard.scoringType === 'score'}
                <th class="py-2 text-right font-bold uppercase">Score</th>
              {/if}
              <th class="py-2 text-right font-bold uppercase">Chrono</th>
            </tr>
          </thead>
          <tbody>
            {#each data.leaderboard.rows as row}
              <tr class="border-b border-muted">
                <td class="py-2 font-bold">{row.rank}</td>
                <td class="py-2">{row.talentName}</td>
                {#if data.leaderboard.scoringType === 'score'}
                  <td class="py-2 text-right tabular-nums">
                    {row.score ?? '—'}
                  </td>
                {/if}
                <td class="py-2 text-right tabular-nums">
                  {formatChrono(row.chrono)}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}
  </section>
</div>
