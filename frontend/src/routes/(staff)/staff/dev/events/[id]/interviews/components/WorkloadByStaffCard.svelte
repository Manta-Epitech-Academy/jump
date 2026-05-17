<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import * as Avatar from '$lib/components/ui/avatar';
  import { cn } from '$lib/utils';
  import type { StaffRole } from '@prisma/client';
  import { getStaffRoleLabel } from '$lib/domain/staff';

  type Row = {
    id: string;
    name: string;
    image: string | null;
    role: StaffRole;
    count: number;
  };

  type Props = {
    rows: Row[];
    target?: number;
    title?: string;
    subtitle?: string;
  };

  let {
    rows,
    target,
    title = 'Charge par interviewer',
    subtitle = 'Entretiens assignés sur ce stage',
  }: Props = $props();

  let effectiveTarget = $derived(
    target ?? (Math.max(1, ...rows.map((r) => r.count)) || 1),
  );

  const ROLE_TONE: Record<StaffRole, string> = {
    admin: 'bg-muted text-muted-foreground',
    superdev: 'bg-epi-blue/10 text-epi-blue',
    dev: 'bg-epi-blue/10 text-epi-blue',
    peda: 'bg-epi-pink/10 text-epi-pink',
    manta: 'bg-epi-orange/10 text-epi-orange',
  };

  function widthPct(count: number): number {
    return Math.min(100, Math.round((count / effectiveTarget) * 100));
  }
</script>

<Card.Root class="rounded-sm">
  <Card.Header class="pb-3">
    <Card.Title class="font-heading text-base tracking-wide uppercase">
      {title}
    </Card.Title>
    <Card.Description class="text-xs">{subtitle}</Card.Description>
  </Card.Header>
  <Card.Content class="space-y-3">
    {#if rows.length === 0}
      <p class="py-4 text-center text-xs text-muted-foreground">
        Aucun interviewer disponible sur ce campus.
      </p>
    {:else}
      {#each rows as row (row.id)}
        <div class="flex items-center gap-3">
          <Avatar.Root class="h-8 w-8 rounded-full">
            <Avatar.Image
              src={row.image ?? undefined}
              alt={row.name}
              class="object-cover"
            />
            <Avatar.Fallback class="bg-muted text-[10px] font-bold uppercase">
              {row.name
                .split(' ')
                .map((p) => p[0])
                .filter(Boolean)
                .slice(0, 2)
                .join('')}
            </Avatar.Fallback>
          </Avatar.Root>
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-bold">{row.name}</span>
              <span
                class={cn(
                  'shrink-0 rounded-sm px-1.5 py-0.5 text-[9px] font-bold tracking-widest uppercase',
                  ROLE_TONE[row.role],
                )}
              >
                {getStaffRoleLabel(row.role)}
              </span>
            </div>
            <div class="mt-1 flex items-center gap-2">
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  class="h-full bg-epi-blue transition-[width] duration-700"
                  style="width: {widthPct(row.count)}%"
                ></div>
              </div>
              <span
                class="font-mono text-[10px] text-muted-foreground tabular-nums"
              >
                {row.count}{#if target}<span class="opacity-60">/{target}</span
                  >{/if}
              </span>
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </Card.Content>
</Card.Root>
