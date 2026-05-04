<script lang="ts">
  import { enhance } from '$app/forms';
  import { Search, Plus, Sprout } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import * as Avatar from '$lib/components/ui/avatar';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Input } from '$lib/components/ui/input';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
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

  let {
    open = $bindable(false),
    available,
  }: {
    open?: boolean;
    available: Member[];
  } = $props();

  type RoleFilter = 'all' | 'peda' | 'manta';
  let searchQuery = $state('');
  let roleFilter = $state<RoleFilter>('all');

  let filtered = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return available.filter((m) => {
      if (roleFilter !== 'all' && m.staffRole !== roleFilter) return false;
      if (!q) return true;
      const name = (m.user?.name ?? '').toLowerCase();
      const email = (m.user?.email ?? '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  });

  const filterOptions: { value: RoleFilter; label: string }[] = [
    { value: 'all', label: 'Tous' },
    { value: 'peda', label: 'Pédago' },
    { value: 'manta', label: 'Manta' },
  ];
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-lg gap-0 rounded-sm p-0 sm:max-w-xl">
    <Dialog.Header class="border-b px-5 py-4">
      <Dialog.Title
        class="text-xs font-bold tracking-widest text-muted-foreground uppercase"
      >
        Ajouter à l'équipe
      </Dialog.Title>
      <Dialog.Description class="text-xs text-muted-foreground">
        Recherchez parmi les pédagos et mantas du campus.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-3 border-b bg-muted/20 px-5 py-3">
      <div class="relative">
        <Search class="absolute top-2.5 left-2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Nom ou email..."
          class="rounded-sm bg-card pl-8"
          bind:value={searchQuery}
        />
      </div>
      <div class="flex gap-1">
        {#each filterOptions as opt}
          <button
            type="button"
            onclick={() => (roleFilter = opt.value)}
            class={cn(
              'cursor-pointer rounded-sm px-2 py-1 text-[10px] font-bold tracking-widest uppercase transition-colors',
              roleFilter === opt.value
                ? 'bg-epi-blue text-white'
                : 'bg-muted text-muted-foreground hover:bg-muted/70',
            )}
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="max-h-[420px] overflow-y-auto px-3 py-2">
      {#if filtered.length === 0}
        <p class="py-12 text-center text-xs font-medium text-muted-foreground">
          {available.length === 0
            ? 'Tous les membres pédago du campus sont déjà assignés.'
            : 'Aucun résultat.'}
        </p>
      {:else}
        <ul class="space-y-1">
          {#each filtered as m (m.id)}
            {@const isPeda = m.staffRole === 'peda'}
            {@const memberName = m.user?.name ?? 'Membre'}
            <li>
              <form
                method="POST"
                action="?/add"
                use:enhance={() => {
                  return async ({ result, update }) => {
                    await update();
                    if (result.type === 'success') {
                      toast.success(`${memberName} ajouté à l'équipe`);
                    } else if (result.type === 'failure') {
                      toast.error(
                        (result.data as { message?: string } | undefined)
                          ?.message ?? 'Action impossible',
                      );
                    }
                  };
                }}
                class="flex items-center justify-between gap-3 rounded-sm border border-transparent bg-card px-2 py-2 transition-all hover:border-epi-blue/40 hover:bg-muted/40"
              >
                <input type="hidden" name="staffProfileId" value={m.id} />
                <div class="flex min-w-0 items-center gap-2.5">
                  <Avatar.Root class="h-9 w-9 shrink-0">
                    <Avatar.Image
                      src={m.user?.image ?? undefined}
                      alt={m.user?.name ?? 'Inconnu'}
                      class="object-cover"
                    />
                    <Avatar.Fallback
                      class={cn(
                        'text-[10px] font-bold',
                        staffRoleAvatarFallbackClass(m.staffRole),
                      )}
                    >
                      {getInitials(m.user?.name)}
                    </Avatar.Fallback>
                  </Avatar.Root>
                  <div class="min-w-0">
                    <span class="block truncate text-sm font-bold">
                      {m.user?.name ?? 'Inconnu'}
                    </span>
                    <div class="mt-0.5 flex items-center gap-2">
                      <Badge
                        variant="outline"
                        class={cn(
                          'px-1.5 py-0 text-[9px] tracking-widest uppercase',
                          isPeda
                            ? 'border-epi-teal/30 bg-epi-teal/10 text-epi-teal-solid'
                            : 'border-epi-blue/30 bg-epi-blue/10 text-epi-blue',
                        )}
                      >
                        {getStaffRoleLabel(m.staffRole)}
                      </Badge>
                      {#if m._count.eventMantas === 0}
                        <Badge
                          variant="outline"
                          class="gap-1 border-green-200 bg-green-50 px-1 py-0 text-[9px] tracking-widest text-green-700 uppercase dark:border-green-900 dark:bg-green-900/30 dark:text-green-400"
                        >
                          <Sprout class="h-2.5 w-2.5" />
                          Nouveau
                        </Badge>
                      {:else}
                        <span
                          class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                        >
                          <span class="font-mono text-foreground">
                            {m._count.eventMantas}
                          </span>
                          évé.
                        </span>
                      {/if}
                    </div>
                  </div>
                </div>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  class="cursor-pointer rounded-sm"
                >
                  <Plus class="mr-1 h-3.5 w-3.5" />
                  Ajouter
                </Button>
              </form>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
