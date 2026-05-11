<script lang="ts">
  import * as Avatar from '$lib/components/ui/avatar';
  import { resolve } from '$app/paths';
  import RecommendationChip from './RecommendationChip.svelte';
  import InterviewActionMenu from './InterviewActionMenu.svelte';
  import TalentAvatar from '$lib/components/students/TalentAvatar.svelte';
  import { cn } from '$lib/utils';
  import type { StaffRole } from '@prisma/client';
  import type { InterviewWithRelations } from '../+page.server';
  import { getInterviewDisplayStatus } from '$lib/domain/interview';
  import { getStaffRoleLabel } from '$lib/domain/staff';

  type Props = {
    interviews: InterviewWithRelations[];
    timezone: string;
    bounds: { startOfDay: string };
    canMutate: boolean;
    canReassign: boolean;
    interviewerRoleById: Map<string, StaffRole>;
    onOpenGrid: (interview: InterviewWithRelations) => void;
    onOpenReassign: (interview: InterviewWithRelations) => void;
  };

  let {
    interviews,
    timezone,
    bounds,
    canMutate,
    canReassign,
    interviewerRoleById,
    onOpenGrid,
    onOpenReassign,
  }: Props = $props();

  function fmtSlot(d: Date): string {
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

  let startOfDay = $derived(new Date(bounds.startOfDay));
</script>

<div class="overflow-x-auto rounded-sm border bg-card shadow-sm">
  <table class="min-w-full divide-y divide-border text-sm">
    <thead class="bg-muted/40">
      <tr
        class="text-left text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
      >
        <th class="px-3 py-2">Inscrit</th>
        <th class="px-3 py-2">Créneau</th>
        <th class="px-3 py-2">Interviewer</th>
        <th class="px-3 py-2">Statut</th>
        <th class="px-3 py-2">Reco</th>
        <th class="px-3 py-2"></th>
      </tr>
    </thead>
    <tbody class="divide-y divide-border">
      {#each interviews as iv (iv.id)}
        {@const display = getInterviewDisplayStatus(
          { status: iv.status, date: iv.date },
          { startOfDay },
        )}
        {@const role = interviewerRoleById.get(iv.staffId)}
        <tr class="transition-colors hover:bg-muted/30">
          <td class="px-3 py-2">
            <div class="flex items-center gap-3">
              <TalentAvatar talent={iv.talent} size="sm" />
              <a
                href={resolve(`/staff/dev/students/${iv.talent.id}`)}
                class="block min-w-0"
              >
                <span class="block truncate text-sm font-bold uppercase">
                  {iv.talent.nom}
                  <span class="capitalize">{iv.talent.prenom}</span>
                </span>
                {#if iv.talent.email}
                  <span
                    class="block truncate text-[10px] text-muted-foreground"
                  >
                    {iv.talent.email}
                  </span>
                {/if}
              </a>
            </div>
          </td>
          <td class="px-3 py-2">
            <span
              class={cn(
                'inline-block rounded-sm px-2 py-0.5 font-mono text-[10px] tracking-widest uppercase',
                display === 'overdue'
                  ? 'bg-epi-orange/10 text-epi-orange'
                  : 'bg-epi-blue/10 text-epi-blue',
              )}
            >
              {fmtSlot(iv.date)}
            </span>
          </td>
          <td class="px-3 py-2">
            <div class="flex items-center gap-2">
              <Avatar.Root class="h-6 w-6 rounded-full">
                <Avatar.Fallback
                  class="bg-muted text-[9px] font-bold uppercase"
                >
                  {initials(iv.staff?.user?.name ?? '?')}
                </Avatar.Fallback>
              </Avatar.Root>
              <span class="text-xs font-medium">
                {iv.staff?.user?.name ?? 'Inconnu'}
              </span>
              {#if role}
                <span
                  class="rounded-sm bg-muted px-1 py-0.5 font-mono text-[9px] text-muted-foreground uppercase"
                >
                  {getStaffRoleLabel(role)}
                </span>
              {/if}
            </div>
          </td>
          <td class="px-3 py-2">
            <span
              class={cn(
                'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[9px] font-bold tracking-widest uppercase',
                display === 'done'
                  ? 'border-epi-teal-solid/30 bg-epi-teal-solid/10 text-epi-teal-solid'
                  : display === 'overdue'
                    ? 'border-epi-orange/30 bg-epi-orange/10 text-epi-orange'
                    : display === 'cancelled'
                      ? 'border-border bg-muted text-muted-foreground'
                      : 'border-epi-blue/30 bg-epi-blue/10 text-epi-blue',
              )}
            >
              {display === 'done'
                ? 'Mené'
                : display === 'overdue'
                  ? 'En retard'
                  : display === 'cancelled'
                    ? 'Annulé'
                    : 'Planifié'}
            </span>
          </td>
          <td class="px-3 py-2">
            <RecommendationChip value={iv.recommendation} />
          </td>
          <td class="px-3 py-2 text-right">
            <InterviewActionMenu
              interviewId={iv.id}
              canMutate={canMutate && iv.status !== 'cancelled'}
              canReassign={canReassign && iv.status === 'planned'}
              onOpenGrid={() => onOpenGrid(iv)}
              onOpenReassign={() => onOpenReassign(iv)}
            />
          </td>
        </tr>
      {:else}
        <tr>
          <td
            colspan="6"
            class="px-3 py-8 text-center text-sm text-muted-foreground"
          >
            Aucun entretien à afficher avec ce filtre.
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
