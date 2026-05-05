<script lang="ts">
  import { enhance } from '$app/forms';
  import X from '@lucide/svelte/icons/x';
  import CalendarDays from '@lucide/svelte/icons/calendar-days';
  import Sprout from '@lucide/svelte/icons/sprout';
  import { toast } from 'svelte-sonner';
  import * as Avatar from '$lib/components/ui/avatar';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import Gated from '$lib/components/auth/Gated.svelte';
  import { getStaffRoleLabel } from '$lib/domain/staff';
  import { getInitials, staffRoleAvatarFallbackClass } from '$lib/avatar';
  import { cn } from '$lib/utils';

  type Member = {
    id: string;
    staffRole: string | null;
    user: {
      name: string | null;
      email: string | null;
      image: string | null;
    } | null;
    _count: { eventMantas: number };
  };

  let { member }: { member: Member } = $props();

  let isPeda = $derived(member.staffRole === 'peda');
  let displayName = $derived(member.user?.name ?? 'Inconnu');
</script>

<div
  class={cn(
    'group relative flex flex-col items-center gap-3 overflow-hidden rounded-sm border bg-gradient-to-br p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
    isPeda
      ? 'border-epi-teal/20 from-card to-epi-teal/5'
      : 'border-epi-blue/20 from-card to-epi-blue/5',
  )}
>
  <Gated group="devLead" mode="hide">
    <form
      method="POST"
      action="?/remove"
      use:enhance={() => {
        return async ({ result, update }) => {
          await update();
          if (result.type === 'success') {
            toast.success(`${displayName} retiré de l'équipe`);
          } else if (result.type === 'failure') {
            toast.error(
              (result.data as { message?: string } | undefined)?.message ??
                'Action impossible',
            );
          }
        };
      }}
      class="absolute top-2 right-2 opacity-40 transition-opacity group-hover:opacity-100 hover:opacity-100"
    >
      <input type="hidden" name="staffProfileId" value={member.id} />
      <Tooltip.Provider delayDuration={300}>
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                type="submit"
                variant="ghost"
                size="icon"
                class="h-7 w-7 cursor-pointer rounded-sm bg-background/80 text-muted-foreground backdrop-blur-sm hover:bg-destructive/10 hover:text-destructive"
              >
                <X class="h-3.5 w-3.5" />
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content class="rounded-sm">
            <p class="font-bold uppercase">Retirer de l'équipe</p>
          </Tooltip.Content>
        </Tooltip.Root>
      </Tooltip.Provider>
    </form>
  </Gated>

  <Avatar.Root
    class={cn(
      'h-16 w-16 ring-2',
      isPeda ? 'ring-epi-teal/40' : 'ring-epi-blue/40',
    )}
  >
    <Avatar.Image
      src={member.user?.image ?? undefined}
      alt={displayName}
      class="object-cover"
    />
    <Avatar.Fallback
      class={cn(
        'text-base font-bold',
        staffRoleAvatarFallbackClass(member.staffRole),
      )}
    >
      {getInitials(displayName)}
    </Avatar.Fallback>
  </Avatar.Root>

  <div class="flex w-full min-w-0 flex-col items-center gap-1.5">
    <span class="block w-full truncate text-center text-sm font-bold">
      {displayName}
    </span>
    <Badge
      variant="outline"
      class={cn(
        'px-1.5 py-0 text-[9px] tracking-widest uppercase',
        isPeda
          ? 'border-epi-teal/30 bg-epi-teal/10 text-epi-teal-solid'
          : 'border-epi-blue/30 bg-epi-blue/10 text-epi-blue',
      )}
    >
      {getStaffRoleLabel(member.staffRole)}
    </Badge>
    {#if member._count.eventMantas === 0}
      <Badge
        variant="outline"
        class="mt-1 gap-1 border-green-200 bg-green-50 px-1.5 py-0 text-[10px] tracking-widest text-green-700 uppercase dark:border-green-900 dark:bg-green-900/30 dark:text-green-400"
      >
        <Sprout class="h-3 w-3" />
        Nouveau
      </Badge>
    {:else}
      <span
        class="mt-1 flex items-center gap-1.5 text-[10px] leading-none font-bold tracking-widest text-muted-foreground uppercase"
        title="Événements assignés (cumul)"
      >
        <CalendarDays class="h-3.5 w-3.5" />
        <span class="font-mono text-sm leading-none text-foreground">
          {member._count.eventMantas}
        </span>
        événement{member._count.eventMantas > 1 ? 's' : ''}
      </span>
    {/if}
  </div>
</div>
