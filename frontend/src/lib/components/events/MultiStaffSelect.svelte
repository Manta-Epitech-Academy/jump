<script lang="ts">
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Check, Users, X } from '@lucide/svelte';
  import * as Avatar from '$lib/components/ui/avatar';
  import { getInitials, staffRoleAvatarFallbackClass } from '$lib/avatar';
  import { cn } from '$lib/utils';

  type Person = {
    id: string;
    staffRole?: string | null;
    user: { name: string | null; image?: string | null } | null;
  };

  let {
    staff = [],
    value = $bindable([]),
    name = 'mantas',
  }: {
    staff: Person[];
    value: string[];
    name?: string;
  } = $props();

  let open = $state(false);

  let selectedStaff = $derived(staff.filter((s) => value.includes(s.id)));
  let pedaList = $derived(staff.filter((s) => s.staffRole === 'peda'));
  let mantaList = $derived(staff.filter((s) => s.staffRole === 'manta'));
  let hasGroups = $derived(pedaList.length > 0 && mantaList.length > 0);

  function toggleStaff(id: string) {
    if (value.includes(id)) {
      value = value.filter((v) => v !== id);
    } else {
      value = [...value, id];
    }
  }

  function removeStaff(id: string) {
    value = value.filter((v) => v !== id);
  }
</script>

{#snippet staffItem(person: Person)}
  <Command.Item
    value={person.user?.name ?? person.id}
    onSelect={() => toggleStaff(person.id)}
  >
    <div class="mr-2 flex items-center justify-center">
      <Check
        class="h-4 w-4 {value.includes(person.id)
          ? 'opacity-100'
          : 'opacity-0'}"
      />
    </div>
    <Avatar.Root class="mr-2 h-6 w-6">
      <Avatar.Image
        src={person.user?.image ?? undefined}
        alt={person.user?.name ?? ''}
        class="object-cover"
      />
      <Avatar.Fallback
        class={cn(
          'text-[10px] font-bold',
          staffRoleAvatarFallbackClass(person.staffRole),
        )}
      >
        {getInitials(person.user?.name)}
      </Avatar.Fallback>
    </Avatar.Root>
    <span>{person.user?.name ?? 'Inconnu'}</span>
  </Command.Item>
{/snippet}

<div class="grid gap-2">
  <Popover.Root bind:open>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          class="h-auto min-h-10 w-full justify-between px-3 py-2"
          {...props}
        >
          <div class="flex flex-wrap gap-2">
            {#if value.length === 0}
              <span
                class="flex items-center gap-2 font-normal text-muted-foreground"
              >
                <Users class="h-3.5 w-3.5" />
                Assigner des membres...
              </span>
            {:else}
              {#each selectedStaff as person (person.id)}
                <Badge
                  variant="secondary"
                  class="flex items-center gap-1.5 rounded-sm border bg-epi-blue/10 px-1.5 py-0.5 text-epi-blue hover:bg-epi-blue/20 dark:border-epi-blue/30 dark:bg-epi-blue/20 dark:text-blue-300"
                >
                  <Avatar.Root class="h-4 w-4">
                    <Avatar.Image
                      src={person.user?.image ?? undefined}
                      alt={person.user?.name ?? ''}
                      class="object-cover"
                    />
                    <Avatar.Fallback class="bg-background text-[8px]">
                      {getInitials(person.user?.name)}
                    </Avatar.Fallback>
                  </Avatar.Root>
                  {person.user?.name ?? 'Inconnu'}
                  <button
                    class="ml-1 cursor-pointer rounded-full ring-offset-background hover:bg-black/10 focus:ring-2 focus:ring-ring focus:outline-none dark:hover:bg-white/10"
                    onclick={(e) => {
                      e.stopPropagation();
                      removeStaff(person.id);
                    }}
                  >
                    <X class="h-3 w-3" />
                  </button>
                </Badge>
              {/each}
            {/if}
          </div>
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-[--bits-popover-anchor-width] p-0" align="start">
      <Command.Root>
        <Command.Input placeholder="Chercher un membre..." />
        <Command.List class="max-h-75 overflow-y-auto">
          <Command.Empty>
            <p class="py-6 text-center text-sm text-muted-foreground">
              Aucun staff trouvé.
            </p>
          </Command.Empty>

          {#if hasGroups}
            <Command.Group heading="Référents pédago">
              {#each pedaList as person (person.id)}
                {@render staffItem(person)}
              {/each}
            </Command.Group>
            <Command.Group heading="Mantas">
              {#each mantaList as person (person.id)}
                {@render staffItem(person)}
              {/each}
            </Command.Group>
          {:else}
            <Command.Group heading="Équipe du campus">
              {#each staff as person (person.id)}
                {@render staffItem(person)}
              {/each}
            </Command.Group>
          {/if}
        </Command.List>
      </Command.Root>
    </Popover.Content>
  </Popover.Root>

  <!-- Hidden inputs for Superforms array binding -->
  {#each value as v}
    <input type="hidden" {name} value={v} />
  {/each}
</div>
