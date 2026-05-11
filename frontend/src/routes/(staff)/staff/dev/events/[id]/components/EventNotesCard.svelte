<script lang="ts">
  import { untrack } from 'svelte';
  import StickyNote from '@lucide/svelte/icons/sticky-note';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Pencil from '@lucide/svelte/icons/pencil';
  import * as Card from '$lib/components/ui/card';
  import * as Collapsible from '$lib/components/ui/collapsible';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import Gated from '$lib/components/auth/Gated.svelte';
  import { renderMarkdown } from '$lib/markdown';
  import { cn } from '$lib/utils';

  type Props = {
    notes: string | null;
    onEdit?: () => void;
    /** Default open state. Closed by default to keep the dashboard above the fold. */
    defaultOpen?: boolean;
  };

  let { notes, onEdit, defaultOpen = false }: Props = $props();

  let open = $state(untrack(() => defaultOpen));

  const html = $derived(notes ? renderMarkdown(notes) : '');
</script>

<Collapsible.Root {open} onOpenChange={(v) => (open = v)}>
  <Card.Root class="rounded-sm shadow-sm dark:shadow-none">
    <div
      class="flex flex-row items-center justify-between gap-3 border-b bg-muted/30 px-6 pt-4 pb-3"
    >
      <Collapsible.Trigger class="flex flex-1 items-center gap-2 text-left">
        <StickyNote class="h-5 w-5 text-epi-blue" />
        <h3
          class="font-heading text-2xl tracking-wide text-foreground uppercase"
        >
          Notes de l’événement
        </h3>
        <ChevronDown
          class={cn(
            'ml-1 h-4 w-4 text-muted-foreground transition-transform',
            open ? 'rotate-180' : '',
          )}
        />
      </Collapsible.Trigger>
      {#if onEdit}
        <Gated group="devLead" mode="hide">
          <Tooltip.Provider delayDuration={300}>
            <Tooltip.Root>
              <Tooltip.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="ghost"
                    size="icon"
                    class="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onclick={() => onEdit?.()}
                  >
                    <Pencil class="h-3.5 w-3.5" />
                  </Button>
                {/snippet}
              </Tooltip.Trigger>
              <Tooltip.Content class="rounded-sm">
                <p>Modifier les notes</p>
              </Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        </Gated>
      {/if}
    </div>
    <Collapsible.Content>
      <Card.Content>
        {#if html}
          <div
            class="prose max-w-none text-sm leading-relaxed prose-slate dark:prose-invert"
          >
            {@html html}
          </div>
        {:else}
          <p class="text-sm text-muted-foreground italic">
            Aucune note. Ajoutez du contexte (objectifs, consignes, infos
            pratiques) via les paramètres de l’événement.
          </p>
        {/if}
      </Card.Content>
    </Collapsible.Content>
  </Card.Root>
</Collapsible.Root>
