<script lang="ts">
  import Users from '@lucide/svelte/icons/users';
  import ClipboardCheck from '@lucide/svelte/icons/clipboard-check';
  import ChartColumn from '@lucide/svelte/icons/chart-column';
  import MessagesSquare from '@lucide/svelte/icons/messages-square';
  import { EVENT_MODULES, type EventModuleKey } from '$lib/domain/eventModules';

  // One recognizable glyph per module, shared by the admin list cell and the
  // config dialog so a module reads the same wherever it appears.
  let {
    module,
    class: className,
  }: {
    module: EventModuleKey;
    class?: string;
  } = $props();

  const ICONS = {
    [EVENT_MODULES.INSCRITS]: Users,
    [EVENT_MODULES.EMARGEMENT]: ClipboardCheck,
    [EVENT_MODULES.BILAN]: ChartColumn,
    [EVENT_MODULES.ENTRETIENS]: MessagesSquare,
  } as const;

  const Icon = $derived(ICONS[module]);
</script>

<Icon class={className} />
