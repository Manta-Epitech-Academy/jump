<script lang="ts">
  /**
   * How to point an MCP client at this Jump.
   *
   * Rendered twice on the page, and that is the reason it is a component: once
   * inside the reveal panel with the freshly minted secret already in the
   * command, and once in the standing "connect a client" section with a
   * placeholder. One spelling of the command, two audiences.
   *
   * What is on screen without a click is the one command most people need. The
   * reinstall case and the non-Claude-Code case are text somebody has to be able
   * to read, re-read and copy, so they go in a `Collapsible` rather than behind
   * a tooltip: hover is not a reading surface.
   */
  import * as Collapsible from '$lib/components/ui/collapsible';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import CommandBlock from './CommandBlock.svelte';
  import {
    MCP_DESKTOP_CONFIG_PATHS,
    mcpAddCommand,
    mcpDesktopConfig,
    mcpEndpoint,
    mcpRemoveCommand,
  } from '$lib/domain/mcpConnect';

  type Props = {
    /** Where this Jump answers, taken from the request rather than hardcoded. */
    origin: string;
    /** The secret just minted, or null to show a placeholder instead. */
    token?: string | null;
  };

  let { origin, token = null }: Props = $props();

  let reinstallOpen = $state(false);
  let otherClientOpen = $state(false);
</script>

<div class="space-y-3">
  <CommandBlock
    label="À coller dans un terminal"
    value={mcpAddCommand(origin, token)}
    copyLabel="Copier la commande"
  />

  <Collapsible.Root
    open={reinstallOpen}
    onOpenChange={(o) => (reinstallOpen = o)}
  >
    <Collapsible.Trigger
      class="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronRight
        class="h-3 w-3 transition-transform {reinstallOpen ? 'rotate-90' : ''}"
      />
      Jump est déjà configuré sur ce poste
    </Collapsible.Trigger>
    <Collapsible.Content class="space-y-3 pt-2">
      <p class="text-xs text-muted-foreground">
        La commande ci-dessus refuse d'enregistrer un serveur qui existe déjà.
        Retirez-le d'abord, puis relancez-la.
      </p>
      <CommandBlock
        label="Retirer le serveur existant"
        value={mcpRemoveCommand()}
        copyLabel="Copier la commande de retrait"
      />
    </Collapsible.Content>
  </Collapsible.Root>

  <Collapsible.Root
    open={otherClientOpen}
    onOpenChange={(o) => (otherClientOpen = o)}
  >
    <Collapsible.Trigger
      class="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronRight
        class="h-3 w-3 transition-transform {otherClientOpen
          ? 'rotate-90'
          : ''}"
      />
      Un autre outil que Claude Code
    </Collapsible.Trigger>
    <Collapsible.Content class="space-y-3 pt-2">
      <CommandBlock label="Adresse du serveur" value={mcpEndpoint(origin)} />
      <CommandBlock
        label="En-tête d'autorisation"
        value={`Authorization: Bearer ${token ?? 'votre-token'}`}
      />
      <div class="space-y-1.5">
        <p class="text-xs text-muted-foreground">
          Claude Desktop n'a pas de commande : le bloc ci-dessous se colle dans
          son fichier de configuration, puis l'application se relance.
        </p>
        <ul class="space-y-0.5 text-xs text-muted-foreground">
          {#each MCP_DESKTOP_CONFIG_PATHS as location (location.os)}
            <li>
              {location.os} :
              <code class="font-mono">{location.path}</code>
            </li>
          {/each}
        </ul>
      </div>
      <CommandBlock
        label="Configuration Claude Desktop"
        value={mcpDesktopConfig(origin, token)}
        copyLabel="Copier la configuration"
        multiline
      />
    </Collapsible.Content>
  </Collapsible.Root>
</div>
