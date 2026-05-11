<script lang="ts">
  import { dndzone, type DndEvent } from 'svelte-dnd-action';
  import { applyAction, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import { toast } from 'svelte-sonner';
  import type { ActionResult } from '@sveltejs/kit';
  import * as Avatar from '$lib/components/ui/avatar';
  import RecommendationChip from './RecommendationChip.svelte';
  import { cn } from '$lib/utils';
  import type { StaffRole } from '@prisma/client';
  import type { InterviewWithRelations } from '../+page.server';
  import { getStaffRoleLabel } from '$lib/domain/staff';

  type Interviewer = {
    id: string;
    name: string;
    role: StaffRole;
    count: number;
  };

  type Props = {
    interviews: InterviewWithRelations[];
    interviewers: Interviewer[];
    timezone: string;
    canReassign: boolean;
    onClickCard: (iv: InterviewWithRelations) => void;
  };

  let { interviews, interviewers, timezone, canReassign, onClickCard }: Props =
    $props();

  type Card = {
    id: string;
    interview: InterviewWithRelations;
  };

  // Buckets: staffId -> Card[]. We hold a writable mirror of the input,
  // reset whenever the upstream `interviews` array identity changes.
  let buckets = $state<Record<string, Card[]>>({});
  let originColumn = $state<Map<string, string>>(new Map());

  $effect(() => {
    const next: Record<string, Card[]> = {};
    const origin = new Map<string, string>();
    for (const i of interviewers) next[i.id] = [];
    for (const iv of interviews) {
      if (!next[iv.staffId]) next[iv.staffId] = [];
      next[iv.staffId].push({ id: iv.id, interview: iv });
      origin.set(iv.id, iv.staffId);
    }
    // Sort each column chronologically.
    for (const list of Object.values(next)) {
      list.sort(
        (a, b) => a.interview.date.valueOf() - b.interview.date.valueOf(),
      );
    }
    buckets = next;
    originColumn = origin;
  });

  function fmtTime(d: Date): string {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
    }).format(d);
  }

  function initials(s: string): string {
    return s
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  const ROLE_TONE: Record<StaffRole, string> = {
    admin: 'bg-muted text-muted-foreground',
    superdev: 'bg-epi-blue/10 text-epi-blue',
    dev: 'bg-epi-blue/10 text-epi-blue',
    peda: 'bg-epi-pink/10 text-epi-pink',
    manta: 'bg-epi-orange/10 text-epi-orange',
  };

  function handleConsider(staffId: string, e: CustomEvent<DndEvent<Card>>) {
    buckets = { ...buckets, [staffId]: e.detail.items };
  }

  async function handleFinalize(
    staffId: string,
    e: CustomEvent<DndEvent<Card>>,
  ) {
    buckets = { ...buckets, [staffId]: e.detail.items };

    // Find any card whose origin column differs from this finalize column.
    const moved = e.detail.items.find(
      (c) => originColumn.get(c.id) !== staffId,
    );
    if (!moved) return;
    if (!canReassign) {
      toast.error('Action non autorisée');
      await invalidateAll();
      return;
    }

    const fd = new FormData();
    fd.append('interviewId', moved.id);
    fd.append('staffId', staffId);
    try {
      const res = await fetch('?/reassignInterview', {
        method: 'POST',
        body: fd,
      });
      // SvelteKit form actions return a stable serialized ActionResult
      // when hit at `?/<action>`; deserialize round-trips it through
      // devalue so failure-data shapes (form, message) survive intact.
      const result = deserialize(await res.text()) as ActionResult;
      if (result.type === 'success') {
        toast.success('Entretien réassigné');
      } else if (result.type === 'failure') {
        const message = (result.data as { message?: string } | undefined)
          ?.message;
        toast.error(
          message ??
            (result.status === 409
              ? 'Conflit de créneau'
              : 'Échec de la réassignation'),
        );
      } else if (result.type === 'error') {
        toast.error(result.error.message ?? 'Erreur serveur');
      }
      // applyAction triggers invalidate + updates `$page.form` so the
      // ongoing view picks up the new assignment without us calling
      // invalidateAll() ourselves.
      await applyAction(result);
    } catch (err) {
      console.error('reassign fetch failed', err);
      toast.error('Erreur réseau');
      await invalidateAll();
    }
  }
</script>

<div class="overflow-x-auto pb-2">
  <div
    class="grid auto-cols-[minmax(220px,1fr)] grid-flow-col gap-3"
    style="grid-auto-flow: column;"
  >
    {#each interviewers as person (person.id)}
      {@const items = buckets[person.id] ?? []}
      <div class="flex min-h-[300px] flex-col rounded-sm border bg-muted/20">
        <div class="flex items-center gap-2 border-b border-border bg-card p-2">
          <Avatar.Root class="h-7 w-7 rounded-full">
            <Avatar.Fallback class="bg-muted text-[10px] font-bold uppercase">
              {initials(person.name)}
            </Avatar.Fallback>
          </Avatar.Root>
          <div class="min-w-0 flex-1">
            <div class="truncate text-xs font-bold">{person.name}</div>
            <div
              class="font-mono text-[9px] tracking-widest text-muted-foreground uppercase"
            >
              {items.length} entretien{items.length > 1 ? 's' : ''}
            </div>
          </div>
          <span
            class={cn(
              'shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-bold tracking-widest uppercase',
              ROLE_TONE[person.role],
            )}
          >
            {getStaffRoleLabel(person.role)}
          </span>
        </div>
        <div
          class="flex-1 space-y-2 p-2"
          use:dndzone={{
            items,
            flipDurationMs: 150,
            dragDisabled: !canReassign,
            type: 'interview-cards',
            // Solid 2px outline + faint brand-blue tint. The charte rejects
            // dashed dividers as a default; a solid ring on the active drop
            // zone reads as deliberate UI rather than a sketch placeholder.
            dropTargetStyle: {
              outline: '2px solid var(--epi-blue, #013afb)',
              outlineOffset: '-2px',
              backgroundColor: 'rgba(1, 58, 251, 0.06)',
            },
          }}
          onconsider={(e) => handleConsider(person.id, e)}
          onfinalize={(e) => handleFinalize(person.id, e)}
        >
          {#each items as card (card.id)}
            {@const iv = card.interview}
            <button
              type="button"
              onclick={() => onClickCard(iv)}
              class={cn(
                'group block w-full cursor-pointer rounded-sm border bg-card p-2 text-left shadow-sm transition-shadow hover:shadow-md',
                iv.status === 'completed'
                  ? 'border-epi-teal-solid/40'
                  : iv.status === 'cancelled'
                    ? 'border-border opacity-60'
                    : 'border-epi-blue/20',
              )}
            >
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-xs font-bold uppercase">
                  {iv.talent.nom}
                  <span class="capitalize">{iv.talent.prenom}</span>
                </span>
                <RecommendationChip value={iv.recommendation} />
              </div>
              <div
                class="mt-1 inline-block rounded-sm bg-epi-blue/10 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-epi-blue uppercase"
              >
                {fmtTime(iv.date)}
              </div>
            </button>
          {/each}
          {#if items.length === 0}
            <p
              class="py-4 text-center text-[10px] tracking-widest text-muted-foreground uppercase"
            >
              Glissez pour assigner
            </p>
          {/if}
        </div>
      </div>
    {/each}
  </div>
</div>
