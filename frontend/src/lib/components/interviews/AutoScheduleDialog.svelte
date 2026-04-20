<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Label } from '$lib/components/ui/label';
  import { Input } from '$lib/components/ui/input';
  import { enhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { Sparkles, Loader2, AlertTriangle } from '@lucide/svelte';

  type Dev = { id: string; name: string };
  type Candidate = {
    id: string;
    talent: { nom: string; prenom: string };
  };
  type PreviewSlot = { participationId: string; staffId: string; date: string };
  type Preview = {
    slots: PreviewSlot[];
    unscheduled: string[];
    capacity: number;
  };

  let {
    open = $bindable(false),
    devs,
    candidates,
    timezone,
  }: {
    open: boolean;
    devs: Dev[];
    candidates: Candidate[];
    timezone: string;
  } = $props();

  let selectedDevIds = $state<string[]>([]);
  let devsInitialized = $state(false);
  $effect(() => {
    if (!devsInitialized && devs.length > 0) {
      selectedDevIds = devs.map((d) => d.id);
      devsInitialized = true;
    }
  });
  let interviewsPerDevPerDay = $state(3);
  let slotDurationMinutes = $state(30);
  let dayStartHour = $state(9);
  let dayEndHour = $state(17);
  let lunchStartHour = $state(12);
  let lunchEndHour = $state(13);
  let participationOrder = $state<'name' | 'random'>('name');

  let mode = $state<'preview' | 'apply'>('preview');
  let loading = $state(false);
  let preview = $state<Preview | null>(null);

  const devById = $derived(new Map(devs.map((d) => [d.id, d])));
  const candidateById = $derived(new Map(candidates.map((c) => [c.id, c])));

  function toggleDev(id: string, checked: boolean) {
    if (checked) {
      if (!selectedDevIds.includes(id))
        selectedDevIds = [...selectedDevIds, id];
    } else {
      selectedDevIds = selectedDevIds.filter((d) => d !== id);
    }
  }

  function resetAndClose() {
    preview = null;
    mode = 'preview';
    open = false;
  }

  function formatSlotTime(iso: string) {
    return new Date(iso).toLocaleString('fr-FR', {
      timeZone: timezone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const groupedByDay = $derived.by(() => {
    if (!preview) return [] as { day: string; slots: PreviewSlot[] }[];
    const map = new Map<string, PreviewSlot[]>();
    for (const s of preview.slots) {
      const key = new Date(s.date).toLocaleDateString('fr-FR', {
        timeZone: timezone,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()].map(([day, slots]) => ({ day, slots }));
  });
</script>

<Dialog.Root bind:open onOpenChange={(v) => !v && resetAndClose()}>
  <Dialog.Content
    class="max-h-[90vh] overflow-y-auto border-t-4 border-t-epi-teal sm:max-w-3xl"
  >
    <Dialog.Header>
      <Dialog.Title class="font-heading text-xl tracking-wide uppercase">
        Planifier tous les entretiens
      </Dialog.Title>
      <Dialog.Description class="text-foreground">
        Génère une proposition de planning couvrant les {candidates.length} stagiaire{candidates.length >
        1
          ? 's'
          : ''} à entretenir.
      </Dialog.Description>
    </Dialog.Header>

    <form
      method="POST"
      action="?/autoSchedule"
      use:enhance={() => {
        loading = true;
        return async ({ result, update }) => {
          loading = false;
          if (result.type === 'success') {
            if (mode === 'preview') {
              preview =
                (result.data as { preview: Preview } | undefined)?.preview ??
                null;
            } else {
              const created =
                (result.data as { created?: number } | undefined)?.created ?? 0;
              toast.success(
                `${created} entretien${created > 1 ? 's' : ''} planifié${created > 1 ? 's' : ''}`,
              );
              resetAndClose();
              await update();
            }
          } else if (result.type === 'failure') {
            toast.error('Erreur lors de la génération du planning.');
          }
        };
      }}
      class="space-y-5 py-4"
    >
      <input type="hidden" name="mode" value={mode} />
      {#each selectedDevIds as devId}
        <input type="hidden" name="devIds" value={devId} />
      {/each}

      <section class="space-y-2 rounded-md border bg-muted/20 p-3">
        <Label class="text-xs font-bold text-epi-blue uppercase"
          >Devs participants</Label
        >
        <div class="grid grid-cols-2 gap-2">
          {#each devs as dev}
            <label class="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-input accent-epi-blue"
                checked={selectedDevIds.includes(dev.id)}
                onchange={(e) =>
                  toggleDev(
                    dev.id,
                    (e.currentTarget as HTMLInputElement).checked,
                  )}
              />
              <span>{dev.name}</span>
            </label>
          {/each}
        </div>
      </section>

      <section class="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div class="space-y-1">
          <Label class="text-xs uppercase">Entretiens / dev / jour</Label>
          <Input
            type="number"
            name="interviewsPerDevPerDay"
            bind:value={interviewsPerDevPerDay}
            min="1"
            max="10"
          />
        </div>
        <div class="space-y-1">
          <Label class="text-xs uppercase">Durée (min)</Label>
          <Input
            type="number"
            name="slotDurationMinutes"
            bind:value={slotDurationMinutes}
            min="15"
            max="120"
            step="15"
          />
        </div>
        <div class="space-y-1">
          <Label class="text-xs uppercase">Ordre</Label>
          <select
            name="participationOrder"
            bind:value={participationOrder}
            class="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="name">Par nom</option>
            <option value="random">Aléatoire</option>
          </select>
        </div>
        <div class="space-y-1">
          <Label class="text-xs uppercase">Début journée</Label>
          <Input
            type="number"
            name="dayStartHour"
            bind:value={dayStartHour}
            min="0"
            max="23"
          />
        </div>
        <div class="space-y-1">
          <Label class="text-xs uppercase">Fin journée</Label>
          <Input
            type="number"
            name="dayEndHour"
            bind:value={dayEndHour}
            min="1"
            max="23"
          />
        </div>
        <div class="space-y-1">
          <Label class="text-xs uppercase">Déjeuner (début → fin)</Label>
          <div class="flex gap-2">
            <Input
              type="number"
              name="lunchStartHour"
              bind:value={lunchStartHour}
              min="0"
              max="23"
            />
            <Input
              type="number"
              name="lunchEndHour"
              bind:value={lunchEndHour}
              min="1"
              max="24"
            />
          </div>
        </div>
      </section>

      {#if preview}
        <section
          class="space-y-3 rounded-md border bg-blue-50/30 p-4 dark:bg-blue-950/10"
        >
          <div class="flex items-center justify-between">
            <h4
              class="font-heading text-sm tracking-wider text-epi-blue uppercase"
            >
              Aperçu du planning
            </h4>
            <span class="text-xs text-muted-foreground">
              {preview.slots.length} / {candidates.length} stagiaires • capacité totale
              : {preview.capacity}
            </span>
          </div>

          {#if preview.unscheduled.length > 0}
            <div
              class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/30"
            >
              <AlertTriangle class="h-4 w-4 shrink-0 text-amber-600" />
              <span>
                <strong>{preview.unscheduled.length}</strong> stagiaire(s) non planifié(s)
                — capacité insuffisante. Ajustez le nombre de devs, le créneau, ou
                étendez la plage horaire.
              </span>
            </div>
          {/if}

          <div class="max-h-64 space-y-3 overflow-y-auto">
            {#each groupedByDay as group}
              <div class="rounded-md border bg-card p-2">
                <div
                  class="mb-2 text-xs font-bold tracking-wider text-muted-foreground uppercase"
                >
                  {group.day}
                </div>
                <ul class="space-y-1 text-sm">
                  {#each group.slots as slot}
                    {@const cand = candidateById.get(slot.participationId)}
                    {@const dev = devById.get(slot.staffId)}
                    <li class="flex items-center justify-between gap-2 text-xs">
                      <span class="font-bold uppercase">
                        {cand?.talent.nom ?? '?'}
                        <span class="capitalize"
                          >{cand?.talent.prenom ?? ''}</span
                        >
                      </span>
                      <span class="font-mono text-muted-foreground">
                        {formatSlotTime(slot.date)} • {dev?.name ?? '?'}
                      </span>
                    </li>
                  {/each}
                </ul>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      <Dialog.Footer class="flex gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onclick={() => resetAndClose()}
          disabled={loading}
        >
          Annuler
        </Button>
        <Button
          type="submit"
          variant={preview ? 'outline' : 'default'}
          onclick={() => (mode = 'preview')}
          disabled={loading || selectedDevIds.length === 0}
          class="gap-2"
        >
          {#if loading && mode === 'preview'}
            <Loader2 class="h-4 w-4 animate-spin" />
          {:else}
            <Sparkles class="h-4 w-4" />
          {/if}
          {preview ? 'Régénérer' : 'Prévisualiser'}
        </Button>
        {#if preview && preview.slots.length > 0}
          <Button
            type="submit"
            onclick={() => (mode = 'apply')}
            disabled={loading}
            class="gap-2 bg-epi-blue text-white shadow-md hover:bg-epi-blue/90"
          >
            {#if loading && mode === 'apply'}
              <Loader2 class="h-4 w-4 animate-spin" />
            {/if}
            Confirmer la planification
          </Button>
        {/if}
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
