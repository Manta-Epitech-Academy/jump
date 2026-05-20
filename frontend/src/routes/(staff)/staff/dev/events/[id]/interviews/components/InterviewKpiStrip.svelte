<script lang="ts">
  import KpiTile from '$lib/components/staff/KpiTile.svelte';
  import Phone from '@lucide/svelte/icons/phone';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import type { InterviewFilter } from './InterviewFilterChips.svelte';

  type Props = {
    todo: number;
    planned: number;
    overdue: number;
    completed: number;
    /** Active filter — drives `pressed` on the matching tile. */
    activeFilter?: InterviewFilter;
    /** Click handler. When provided, tiles render as filter buttons. */
    onSelect?: (filter: InterviewFilter) => void;
  };

  let { todo, planned, overdue, completed, activeFilter, onSelect }: Props =
    $props();

  // Tiles are filter chips when `onSelect` is wired. Toggle off when the
  // active tile is clicked again — sends the user back to "all".
  function pick(next: Exclude<InterviewFilter, 'all'>) {
    if (!onSelect) return;
    onSelect(activeFilter === next ? 'all' : next);
  }
</script>

<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
  <KpiTile
    label="À contacter"
    value={todo}
    icon={Phone}
    tone={todo > 0 ? 'orange' : 'neutral'}
    sub={todo > 0 ? 'Inscrits sans entretien' : 'Tout le monde a un créneau'}
    onclick={onSelect ? () => pick('todo') : undefined}
    pressed={activeFilter === 'todo'}
  />
  <KpiTile
    label="Planifiés"
    value={planned}
    icon={CalendarClock}
    tone="blue"
    sub={overdue > 0 ? `${overdue} en retard` : 'Aujourd’hui ou plus tard'}
    onclick={onSelect ? () => pick('planned') : undefined}
    pressed={activeFilter === 'planned'}
  />
  <KpiTile
    label="En retard"
    value={overdue}
    icon={AlertTriangle}
    tone={overdue > 0 ? 'pink' : 'neutral'}
    sub={overdue > 0 ? 'Date passée, à clore' : 'Aucun retard'}
  />
  <KpiTile
    label="Terminés"
    value={completed}
    icon={CheckCircle2}
    tone="teal"
    sub="Grilles complétées"
    onclick={onSelect ? () => pick('done') : undefined}
    pressed={activeFilter === 'done'}
  />
</div>
