<script lang="ts">
  import * as Command from '$lib/components/ui/command';
  import * as Popover from '$lib/components/ui/popover';
  import { Badge } from '$lib/components/ui/badge';
  import { Button } from '$lib/components/ui/button';
  import { Check, Users, X } from '@lucide/svelte';
  import * as Avatar from '$lib/components/ui/avatar';
  let {
    staff = [],
    value = $bindable([]),
    name = 'mantas',
  }: {
    staff: any[];
    value: string[];
    name?: string;
  } = $props();

  let open = $state(false);

  let selectedStaff = $derived(staff.filter((s) => value.includes(s.id)));

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

  function getAvatarUrl(user: any) {
    // TODO: implement S3 file storage
    return undefined;
  }

  function getInitials(name: string) {
    return name ? name.substring(0, 2).toUpperCase() : 'ST';
  }
</script>

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
                Assigner des Mantas...
              </span>
            {:else}
              {#each selectedStaff as person}
                <Badge
                  variant="secondary"
                  class="flex items-center gap-1.5 rounded-sm border bg-epi-blue/10 px-1.5 py-0.5 text-epi-blue hover:bg-epi-blue/20 dark:border-epi-blue/30 dark:bg-epi-blue/20 dark:text-blue-300"
                >
                  <Avatar.Root class="h-4 w-4">
                    <Avatar.Image src={getAvatarUrl(person)} />
                    <Avatar.Fallback class="bg-background text-[8px]"
                      >{getInitials(person.user.name)}</Avatar.Fallback
                    >
                  </Avatar.Root>
                  {person.user.name}
                  <button
                    class="ml-1 rounded-full ring-offset-background hover:bg-black/10 focus:ring-2 focus:ring-ring focus:outline-none dark:hover:bg-white/10"
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
        <Command.Input placeholder="Chercher un manta..." />
        <Command.List class="max-h-75 overflow-y-auto">
          <Command.Empty>
            <p class="py-6 text-center text-sm text-muted-foreground">
              Aucun staff trouvé.
            </p>
          </Command.Empty>

          <Command.Group heading="Équipe du campus">
            {#each staff as person}
              <Command.Item
                value={person.user.name}
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
                  <Avatar.Image src={getAvatarUrl(person)} />
                  <Avatar.Fallback
                    class="bg-muted text-[10px] font-bold text-foreground"
                  >
                    {getInitials(person.user.name)}
                  </Avatar.Fallback>
                </Avatar.Root>
                <span>{person.user.name}</span>
              </Command.Item>
            {/each}
          </Command.Group>
        </Command.List>
      </Command.Root>
    </Popover.Content>
  </Popover.Root>

  <!-- Hidden inputs for Superforms array binding -->
  {#each value as v}
    <input type="hidden" {name} value={v} />
  {/each}
</div>
