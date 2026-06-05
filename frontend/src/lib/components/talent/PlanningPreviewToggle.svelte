<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { toast } from 'svelte-sonner';
  import FlaskConical from '@lucide/svelte/icons/flask-conical';
  import type { PlanningPreview } from '$lib/server/talentPlanningPreview';

  type Props = {
    /** Active preview, null when the widget shows its real state. */
    current: PlanningPreview | null;
  };

  let { current }: Props = $props();

  type Option = {
    value: PlanningPreview;
    label: string;
    title: string;
  };

  // Order mirrors the widget's branch precedence (ongoing → upcoming → rest),
  // with the two "ongoing" label variants the PR screenshots distinguish first.
  const options: Option[] = [
    {
      value: 'active_stage',
      label: 'Stage',
      title: 'Event en cours : Stage de Seconde',
    },
    {
      value: 'active_club',
      label: 'Club',
      title: 'Event en cours : Coding Club',
    },
    {
      value: 'upcoming',
      label: 'Prochaine',
      title: 'Prochaine session à venir',
    },
    { value: 'none', label: 'Rien', title: 'Rien de prévu' },
  ];

  let busy = $state(false);

  // Mirrors the dev StagePhaseOverrideToggle: this endpoint lives outside any
  // page route, so we talk to it with `fetch` + `invalidateAll` rather than a
  // form action (`use:enhance` expects ActionResult JSON; a native submit would
  // force a full reload).
  async function send(value: '' | PlanningPreview) {
    if (busy) return;
    busy = true;
    try {
      const fd = new FormData();
      fd.set('value', value);
      const res = await fetch(resolve('/planning-preview'), {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        toast.error("Impossible de modifier l'aperçu planning.");
        return;
      }
      await invalidateAll();
    } catch (err) {
      console.error(err);
      toast.error("Impossible de modifier l'aperçu planning.");
    } finally {
      busy = false;
    }
  }

  // Clicking the active preview toggles it off (back to the real state);
  // clicking any other swaps to it.
  function onClick(value: PlanningPreview) {
    void send(current === value ? '' : value);
  }
</script>

<div
  class="flex w-full items-center gap-1 rounded-xl border border-amber-400/50 bg-amber-50/90 px-1 py-0.5 text-[11px] dark:border-amber-500/40 dark:bg-amber-950/60"
  title="Aperçu du widget « Planning à venir » (impersonation uniquement). Reclique l'option active pour revenir au réel."
>
  <span
    class="flex shrink-0 items-center gap-1 px-1 font-mono text-[9px] font-bold tracking-widest text-amber-900 uppercase dark:text-amber-100"
  >
    <FlaskConical class="h-3 w-3" />
    Aperçu
  </span>
  {#each options as opt (opt.value)}
    {@const isActive = current === opt.value}
    <button
      type="button"
      onclick={() => onClick(opt.value)}
      disabled={busy}
      aria-pressed={isActive}
      title={isActive
        ? `${opt.title} (reclique pour revenir au réel)`
        : opt.title}
      class="flex-1 cursor-pointer rounded-lg px-1 py-1 text-center font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 {isActive
        ? 'bg-amber-500 text-white shadow-sm'
        : 'text-amber-900 hover:bg-amber-200/70 dark:text-amber-100 dark:hover:bg-amber-900/50'}"
    >
      {opt.label}
    </button>
  {/each}
</div>
