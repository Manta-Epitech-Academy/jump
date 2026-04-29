<script lang="ts">
  import * as Breadcrumb from '$lib/components/ui/breadcrumb';
  import { cn } from '$lib/utils';

  type Item = { label: string; href?: string };

  let {
    items,
    class: className,
  }: {
    items: Item[];
    class?: string;
  } = $props();
</script>

<Breadcrumb.Root class={cn('mb-4', className)}>
  <Breadcrumb.List>
    {#each items as item, i (i)}
      <Breadcrumb.Item>
        {#if i === items.length - 1}
          <Breadcrumb.Page>{item.label}</Breadcrumb.Page>
        {:else if item.href}
          <Breadcrumb.Link href={item.href}>{item.label}</Breadcrumb.Link>
        {:else}
          <span>{item.label}</span>
        {/if}
      </Breadcrumb.Item>
      {#if i < items.length - 1}
        <Breadcrumb.Separator />
      {/if}
    {/each}
  </Breadcrumb.List>
</Breadcrumb.Root>
