<script lang="ts">
  import * as Popover from '$lib/components/ui/popover';
  import { Button } from '$lib/components/ui/button';
  import BracesIcon from '@lucide/svelte/icons/braces';

  /**
   * Unified variable insertion toolbar for any content editor.
   * Shows a dropdown of available template variables that can be inserted
   * at the cursor position via the provided `onInsert` callback.
   *
   * Usage:
   *   <VariableInserter
   *     variables={NEWS_POST_VARIABLES}
   *     onInsert={(token) => editorRef.insertText(token)}
   *   />
   */

  type Variable = {
    token: string;
    label: string;
    description: string;
  };

  let {
    variables,
    onInsert,
  }: {
    variables: readonly Variable[];
    onInsert: (token: string) => void;
  } = $props();

  let open = $state(false);

  function insert(token: string) {
    onInsert(token);
    open = false;
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <Button variant="outline" size="sm" {...props}>
        <BracesIcon class="mr-2 h-4 w-4" />
        Variables
      </Button>
    {/snippet}
  </Popover.Trigger>
  <Popover.Content class="w-72 p-0" align="start">
    <div class="border-b border-border px-3 py-2">
      <p class="text-xs font-medium text-muted-foreground">
        Cliquez pour insérer une variable
      </p>
    </div>
    <div class="max-h-60 overflow-y-auto py-1">
      {#each variables as variable}
        <button
          type="button"
          class="flex w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
          onclick={() => insert(variable.token)}
        >
          <code
            class="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
          >
            {variable.token}
          </code>
          <div class="min-w-0">
            <p class="text-sm font-medium">{variable.label}</p>
            <p class="text-xs text-muted-foreground">{variable.description}</p>
          </div>
        </button>
      {/each}
    </div>
  </Popover.Content>
</Popover.Root>
