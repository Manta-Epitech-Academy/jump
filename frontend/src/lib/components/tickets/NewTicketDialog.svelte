<script lang="ts">
  import LifeBuoy from '@lucide/svelte/icons/life-buoy';
  import Bug from '@lucide/svelte/icons/bug';
  import Lightbulb from '@lucide/svelte/icons/lightbulb';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import Send from '@lucide/svelte/icons/send';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';
  import { Textarea } from '$lib/components/ui/textarea';
  import { resolve } from '$app/paths';
  import { goto, invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import { track } from '$lib/analytics';

  let {
    open = $bindable(false),
    basePath,
  }: {
    open?: boolean;
    basePath: '/staff/dev' | '/staff/pedago';
  } = $props();

  let title = $state('');
  let category = $state<'bug' | 'suggestion'>('bug');
  let body = $state('');
  let submitting = $state(false);

  function reset() {
    title = '';
    category = 'bug';
    body = '';
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (submitting) return;
    submitting = true;
    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, category, body }),
      });
      if (!response.ok) {
        const message = await response.text();
        track('ticket_create_failed', { category });
        toast.error(message || 'Erreur lors de la création');
        return;
      }
      const { id } = await response.json();
      track('ticket_created', { category });
      toast.success('Ticket envoyé');
      open = false;
      reset();
      await invalidateAll();
      goto(resolve(`${basePath}/tickets/${id}` as any));
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <LifeBuoy class="h-5 w-5 text-epi-pink" />
        Nouveau ticket
      </Dialog.Title>
      <Dialog.Description>
        Remonte un bug ou une suggestion à l'équipe admin.
      </Dialog.Description>
    </Dialog.Header>

    <form onsubmit={submit} class="grid gap-4 py-2">
      <div class="grid gap-2">
        <Label>Type</Label>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            onclick={() => (category = 'bug')}
            class="flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-bold transition-colors {category ===
            'bug'
              ? 'border-destructive bg-destructive/10 text-destructive'
              : 'border-border text-muted-foreground hover:bg-muted'}"
          >
            <Bug class="h-4 w-4" />
            Bug
          </button>
          <button
            type="button"
            onclick={() => (category = 'suggestion')}
            class="flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-bold transition-colors {category ===
            'suggestion'
              ? 'border-epi-blue bg-epi-blue/10 text-epi-blue'
              : 'border-border text-muted-foreground hover:bg-muted'}"
          >
            <Lightbulb class="h-4 w-4" />
            Suggestion
          </button>
        </div>
      </div>

      <div class="grid gap-2">
        <Label for="ticket-title">Titre</Label>
        <Input
          id="ticket-title"
          bind:value={title}
          maxlength={120}
          minlength={3}
          placeholder="Court résumé"
          required
        />
      </div>

      <div class="grid gap-2">
        <Label for="ticket-body">Description</Label>
        <Textarea
          id="ticket-body"
          bind:value={body}
          rows={5}
          maxlength={4000}
          minlength={10}
          placeholder="Décris ce qui s'est passé ou ton idée..."
          required
        />
      </div>

      <Dialog.Footer>
        <Button type="button" variant="ghost" onclick={() => (open = false)}>
          Annuler
        </Button>
        <Button type="submit" disabled={submitting} class="gap-2">
          {#if submitting}
            <LoaderCircle class="h-4 w-4 animate-spin" />
          {:else}
            <Send class="h-4 w-4" />
          {/if}
          Envoyer
        </Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
