<script lang="ts">
  import AlarmClock from '@lucide/svelte/icons/alarm-clock';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import FileSignature from '@lucide/svelte/icons/file-signature';
  import GraduationCap from '@lucide/svelte/icons/graduation-cap';
  import Inbox from '@lucide/svelte/icons/inbox';
  import Laptop from '@lucide/svelte/icons/laptop';
  import Mail from '@lucide/svelte/icons/mail';
  import PhoneCall from '@lucide/svelte/icons/phone-call';
  import PowerOff from '@lucide/svelte/icons/power-off';
  import UserPlus from '@lucide/svelte/icons/user-plus';
  import UserX from '@lucide/svelte/icons/user-x';
  import IconType from '@lucide/svelte/icons/type';
  import TaskQueueItem from '$lib/components/staff/TaskQueueItem.svelte';
  import type {
    EventAlert,
    EventAlertKind,
  } from '$lib/server/services/eventTasks';

  type Props = {
    alerts: EventAlert[];
    /** When true, hide the empty state. Used inside cards that already convey context. */
    hideEmpty?: boolean;
    /** Empty state copy. Defaults to "Inbox Zero. Rien ne presse." */
    emptyLabel?: string;
    /** Layout — list (single column) or grid (2 cols on md+). Defaults to grid. */
    layout?: 'list' | 'grid';
  };

  let {
    alerts,
    hideEmpty = false,
    emptyLabel = 'Inbox Zero. Rien ne presse.',
    layout = 'grid',
  }: Props = $props();

  const iconByKind: Record<EventAlertKind, typeof IconType> = {
    'missing-mantas': UserPlus,
    'missing-planning': CalendarClock,
    'unassigned-slots': AlertTriangle,
    'interviews-today': PhoneCall,
    'interviews-overdue': AlarmClock,
    'chartes-to-chase': FileSignature,
    'image-rights-to-chase': Mail,
    'pc-missing': Laptop,
    'talents-never-logged': PowerOff,
    'talents-profile-incomplete': UserX,
  };
</script>

{#if alerts.length === 0}
  {#if !hideEmpty}
    <div
      class="flex flex-col items-center justify-center rounded-sm border border-dashed bg-muted/10 py-10 text-muted-foreground"
    >
      <Inbox class="mb-2 h-8 w-8 opacity-50" />
      <p class="text-sm font-medium">{emptyLabel}</p>
    </div>
  {/if}
{:else}
  <div
    class={layout === 'grid'
      ? 'grid gap-3 md:grid-cols-2'
      : 'flex flex-col gap-3'}
  >
    {#each alerts as alert (alert.key)}
      <TaskQueueItem
        icon={iconByKind[alert.kind] ?? AlertTriangle}
        title={alert.title}
        description={alert.description}
        count={alert.count}
        href={alert.href}
        severity={alert.severity}
      />
    {/each}
  </div>
{/if}
