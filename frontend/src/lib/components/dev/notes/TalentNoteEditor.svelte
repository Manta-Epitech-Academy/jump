<script lang="ts">
  import { Textarea } from '$lib/components/ui/textarea';
  import { Button } from '$lib/components/ui/button';
  import { toast } from 'svelte-sonner';
  import { base } from '$app/paths';
  import LoaderCircle from '@lucide/svelte/icons/loader-circle';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';

  // Reusable staff-only note editor. Posts to the shared talent-note endpoint,
  // used both inline on the talent fiche and inside the émargement modal.
  // Optimistic concurrency: tracks the content it loaded (`baseContent`) and, on
  // a 409, surfaces the concurrent version instead of clobbering it.
  let {
    talentId,
    note = null,
    onSaved,
    onCancel,
  }: {
    talentId: string;
    note?: string | null;
    onSaved?: (note: string | null) => void;
    // When provided, renders an "Annuler" button next to Enregistrer. The inline
    // fiche passes this to drop back to its read view; the émargement modal omits
    // it and leans on the dialog's own close instead.
    onCancel?: () => void;
  } = $props();

  // Seed the edit buffer once from the loaded note: the editor owns `value` and
  // `baseContent` after mount (it remounts per talent and per dialog open), so
  // capturing only the initial prop value is intentional, not a missed reaction.
  // svelte-ignore state_referenced_locally
  let value = $state(note ?? '');
  // svelte-ignore state_referenced_locally
  let baseContent = $state(note ?? '');
  let saving = $state(false);
  let conflict = $state<{ current: string | null } | null>(null);

  const dirty = $derived(value.trim() !== baseContent);

  async function save(force = false) {
    if (saving) return;
    saving = true;
    try {
      const body = new FormData();
      body.set('content', value);
      body.set('baseContent', force ? (conflict?.current ?? '') : baseContent);
      const res = await fetch(`${base}/staff/dev/students/${talentId}/note`, {
        method: 'POST',
        body,
      });
      if (res.status === 409) {
        const data = await res.json();
        conflict = { current: data.current ?? null };
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const saved = (data.note ?? '') as string;
      value = saved;
      baseContent = saved;
      conflict = null;
      onSaved?.(data.note ?? null);
      toast.success('Note enregistrée.');
    } catch (e) {
      console.error('save talent note', e);
      toast.error("Échec de l'enregistrement de la note.");
    } finally {
      saving = false;
    }
  }

  function takeCurrent() {
    value = conflict?.current ?? '';
    baseContent = conflict?.current ?? '';
    conflict = null;
  }
</script>

<div class="space-y-2">
  <Textarea
    bind:value
    rows={6}
    disabled={saving}
    maxlength={5000}
    placeholder="Discipline, administratif, retard…"
    class="min-h-28 resize-y"
    aria-invalid={conflict ? true : undefined}
  />

  {#if conflict}
    <div
      class="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
    >
      <p class="flex items-center gap-1.5 font-medium text-amber-700">
        <TriangleAlert class="h-4 w-4" />
        Note modifiée par un autre membre du staff depuis l'ouverture.
      </p>
      <div class="rounded border bg-background p-2 text-muted-foreground">
        <p class="mb-1 text-xs font-semibold uppercase">Version actuelle</p>
        <p class="whitespace-pre-wrap">
          {conflict.current || '(note vidée)'}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onclick={takeCurrent}>
          Reprendre la version actuelle
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={saving}
          onclick={() => save(true)}
        >
          Écraser avec ma version
        </Button>
      </div>
    </div>
  {/if}

  <div class="flex items-center justify-between gap-2">
    <p class="text-xs text-muted-foreground">
      Visible uniquement par le staff.
    </p>
    <div class="flex items-center gap-2">
      {#if onCancel}
        <Button size="sm" variant="ghost" onclick={onCancel} disabled={saving}>
          Annuler
        </Button>
      {/if}
      <Button size="sm" onclick={() => save()} disabled={saving || !dirty}>
        {#if saving}
          <LoaderCircle class="mr-1.5 h-4 w-4 animate-spin" />
          Enregistrement…
        {:else}
          Enregistrer
        {/if}
      </Button>
    </div>
  </div>
</div>
