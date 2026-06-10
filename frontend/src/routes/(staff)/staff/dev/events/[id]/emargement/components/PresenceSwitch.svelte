<script lang="ts">
  import { cn } from '$lib/utils';
  import { statusTone, type CellStatus } from '$lib/domain/eventPresence';

  let {
    status,
    disabled = false,
    onset,
  }: {
    status: CellStatus;
    disabled?: boolean;
    /** Called with the new target status; `pending` clears the cell. */
    onset: (status: CellStatus) => void;
  } = $props();

  // The four settable states, in the same order as the stats legend so colour
  // ↔ meaning stays consistent across the page.
  const OPTIONS: { value: Exclude<CellStatus, 'pending'>; label: string }[] = [
    { value: 'present', label: 'Présent' },
    { value: 'late', label: 'Retard' },
    { value: 'absent', label: 'Absent' },
    { value: 'excused', label: 'Justifié' },
  ];

  // Click another segment to switch to it; click the active one again to clear
  // back to "en attente" (pending). Keeps the reset inline, no extra control.
  function pick(value: Exclude<CellStatus, 'pending'>) {
    if (disabled) return;
    onset(status === value ? 'pending' : value);
  }
</script>

<div
  class="inline-flex items-center gap-1 rounded-md bg-muted/50 p-1"
  role="group"
  aria-label="Présence du créneau"
>
  {#each OPTIONS as opt (opt.value)}
    {@const active = status === opt.value}
    <button
      type="button"
      {disabled}
      onclick={() => pick(opt.value)}
      aria-pressed={active}
      class={cn(
        'rounded border px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase transition-all',
        // Selected = a raised colour chip; the rest recede to flat muted text so
        // only the chosen state carries weight (reads as a toggle, not 4 boxes).
        active
          ? cn('shadow-sm', statusTone(opt.value))
          : 'border-transparent text-muted-foreground/60 hover:bg-background hover:text-foreground',
        disabled ? 'cursor-default opacity-60' : 'cursor-pointer',
      )}
    >
      {opt.label}
    </button>
  {/each}
</div>
