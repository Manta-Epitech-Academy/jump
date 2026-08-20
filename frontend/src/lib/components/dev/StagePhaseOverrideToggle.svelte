<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { toast } from 'svelte-sonner';
  import FlaskConical from '@lucide/svelte/icons/flask-conical';
  import type { EventLifecycleStatus } from '$lib/domain/eventLifecycle';

  type Props = {
    /** Active override, null when running on real phase. */
    current: EventLifecycleStatus | null;
    /**
     * Real phase derived from event dates (no override). Used to mark which
     * option is the actual current phase, so the user always sees where
     * "reality" sits relative to whatever they're previewing.
     */
    realPhase: EventLifecycleStatus | null;
  };

  let { current, realPhase }: Props = $props();

  type Option = {
    value: EventLifecycleStatus;
    label: string;
  };

  // Order mirrors the chronological flow of a stage so the control reads
  // left-to-right like a timeline.
  const options: Option[] = [
    { value: 'upcoming', label: 'Avant' },
    { value: 'ongoing', label: 'Pendant' },
    { value: 'past', label: 'Après' },
  ];

  let busy = $state(false);

  // Talk to the endpoint with `fetch` + `invalidateAll` instead of a native
  // form post: the endpoint lives outside any page route, so `use:enhance`
  // can't be used (it expects ActionResult JSON), and a native submit would
  // force a full reload.
  async function send(value: '' | EventLifecycleStatus) {
    if (busy) return;
    busy = true;
    try {
      const fd = new FormData();
      fd.set('value', value);
      const res = await fetch(resolve('/staff/dev/phase-override'), {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        toast.error("Impossible de modifier l'aperçu phase.");
        return;
      }
      await invalidateAll();
    } catch (err) {
      console.error(err);
      toast.error("Impossible de modifier l'aperçu phase.");
    } finally {
      busy = false;
    }
  }

  // Clicking the active override toggles it off (back to real). Clicking any
  // other option swaps the override to that phase. This collapses the picker
  // from 4 to 3 buttons while still letting the user reset.
  function onClick(value: EventLifecycleStatus) {
    if (current === value) {
      void send('');
    } else {
      void send(value);
    }
  }
</script>

<div
  class="flex w-full items-center gap-1 rounded-sm border border-warning/50 bg-warning/95 px-1 py-0.5 text-xs shadow-raised"
  title="Aperçu phase stage (impersonation uniquement). Clique sur l'option active pour revenir au réel."
>
  <span
    class="flex shrink-0 items-center gap-1 px-1.5 epi-overline text-warning"
  >
    <FlaskConical class="h-3 w-3" />
    Phase
  </span>
  {#each options as opt (opt.value)}
    {@const isOverride = current === opt.value}
    {@const isReal = realPhase === opt.value}
    <button
      type="button"
      onclick={() => onClick(opt.value)}
      disabled={busy}
      aria-pressed={isOverride}
      title={isOverride
        ? `Aperçu actif — recliquer pour revenir au réel${isReal ? ' (phase réelle)' : ''}`
        : isReal
          ? 'Phase réelle actuelle'
          : `Prévisualiser la phase « ${opt.label} »`}
      class="relative flex-1 cursor-pointer rounded-sm px-1 py-1 text-center font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 {isOverride
        ? 'bg-warning text-white shadow-raised'
        : 'text-warning hover:bg-warning/70'}"
    >
      {opt.label}
      {#if isReal}
        <span
          aria-hidden="true"
          class="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-2 {isOverride
            ? 'bg-card ring-warning'
            : 'bg-warning ring-warning'}"
        ></span>
        <span class="sr-only">(phase réelle)</span>
      {/if}
    </button>
  {/each}
</div>
