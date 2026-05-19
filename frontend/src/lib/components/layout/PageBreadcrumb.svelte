<script lang="ts">
  import * as Breadcrumb from '$lib/components/ui/breadcrumb';
  import { page } from '$app/state';
  import { cn } from '$lib/utils';
  import { getWorkspaceHomeCrumb } from '$lib/domain/workspaceHome';

  type Item = { label: string; href?: string };

  let {
    items,
    home = true,
    class: className,
  }: {
    items: Item[];
    home?: boolean;
    class?: string;
  } = $props();

  const resolved = $derived.by<Item[]>(() => {
    if (!home) return items;
    const homeCrumb = getWorkspaceHomeCrumb(page);
    if (!homeCrumb) return items;
    // Drop the home crumb when the next item links to the same place
    // (e.g. stage-only dev: "Vue d'ensemble" === event overview href).
    if (items[0]?.href && items[0].href === homeCrumb.href) return items;
    return [homeCrumb, ...items];
  });
</script>

<Breadcrumb.Root class={cn('mb-4', className)}>
  <Breadcrumb.List>
    {#each resolved as item, i (i)}
      <Breadcrumb.Item>
        {#if i === resolved.length - 1}
          <Breadcrumb.Page>{item.label}</Breadcrumb.Page>
        {:else if item.href}
          <Breadcrumb.Link href={item.href}>{item.label}</Breadcrumb.Link>
        {:else}
          <span>{item.label}</span>
        {/if}
      </Breadcrumb.Item>
      {#if i < resolved.length - 1}
        <Breadcrumb.Separator />
      {/if}
    {/each}
  </Breadcrumb.List>
</Breadcrumb.Root>
