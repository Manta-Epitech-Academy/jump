<script lang="ts">
  import { cn } from '$lib/utils';
  import { statusTone, type CellStatus } from '$lib/domain/eventPresence';

  let {
    status,
    disabled = false,
    block = false,
    onset,
  }: {
    status: CellStatus;
    disabled?: boolean;
    /**
     * Stretch to fill the container with four equal, taller segments instead of the
     * compact inline switch. Used in the émargement mobile card, where the switch is
     * the row's primary control and needs thumb-sized targets.
     */
    block?: boolean;
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
  class={cn(
    'items-center gap-1 rounded-md bg-muted/50 p-1',
    block ? 'flex w-full' : 'inline-flex',
  )}
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
        'rounded border epi-chip transition-ui',
        block ? 'flex-1 px-2 py-1.5 text-center' : 'px-2.5 py-1',
        // Selected = a raised colour chip. Inactive recedes, but the resting look
        // splits by density: the compact desktop switch keeps them as flat muted
        // text (close together, the muted track already reads as one control),
        // while the full-width `block` switch gives each a solid cell (border +
        // bg) so four spread-out segments still read as tappable buttons, not a
        // row of labels.
        active
          ? cn('shadow-raised', statusTone(opt.value))
          : block
            ? 'border-border bg-background text-muted-foreground hover:text-foreground'
            : 'border-transparent text-muted-foreground hover:bg-background hover:text-foreground',
        disabled ? 'cursor-default opacity-60' : 'cursor-pointer',
      )}
    >
      {opt.label}
    </button>
  {/each}
</div>
