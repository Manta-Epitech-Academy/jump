<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { ScrollArea } from '$lib/components/ui/scroll-area';
  import { fade, fly } from 'svelte/transition';
  import {
    FolderOpen,
    X,
    ImagePlus,
    CircleCheck,
    Link as LinkIcon,
    LoaderCircle,
    Trash2,
  } from '@lucide/svelte';
  import { toast } from 'svelte-sonner';
  import { enhance } from '$app/forms';
  import { m } from '$lib/paraglide/messages.js';
  let { showPortfolio = $bindable(), portfolioItems, eventId } = $props();

  let isUploadingPortfolio = $state(false);
  let portfolioFile = $state<File | null>(null);
  let portfolioUrl = $state('');
  let portfolioCaption = $state('');
  let fileInputRef = $state<HTMLInputElement>(undefined!);

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      portfolioFile = target.files[0];
    }
  }
</script>

{#if showPortfolio}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="absolute inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
    transition:fade={{ duration: 200 }}
    onclick={() => (showPortfolio = false)}
  ></div>

  <div
    class="absolute inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl dark:bg-slate-900"
    transition:fly={{ x: 100, duration: 300 }}
  >
    <div
      class="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
        >
          <FolderOpen class="h-5 w-5" />
        </div>
        <h2 class="font-heading text-lg uppercase">{m.camper_portfolio_title()}</h2>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onclick={() => (showPortfolio = false)}><X class="h-5 w-5" /></Button
      >
    </div>

    <ScrollArea class="flex-1 p-6">
      <div
        class="mb-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/50"
      >
        <h3 class="mb-4 text-xs font-bold text-slate-500 uppercase">
          {m.camper_portfolio_add_section()}
        </h3>
        <form
          method="POST"
          action="?/addPortfolioItem"
          enctype="multipart/form-data"
          use:enhance={() => {
            isUploadingPortfolio = true;
            return async ({ result, update }) => {
              isUploadingPortfolio = false;
              if (result.type === 'success') {
                toast.success(m.camper_portfolio_add_success());
                portfolioFile = null;
                portfolioUrl = '';
                portfolioCaption = '';
                if (fileInputRef) fileInputRef.value = '';
              } else {
                toast.error(
                  (result as any).data?.message ?? m.camper_portfolio_add_error(),
                );
              }
              await update();
            };
          }}
          class="space-y-4"
        >
          <input type="hidden" name="eventId" value={eventId} />

          <div class="space-y-2">
            <div class="flex w-full items-center justify-center">
              <label
                for="dropzone-file"
                class="flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <div
                  class="flex flex-col items-center justify-center pt-5 pb-6"
                >
                  {#if portfolioFile}
                    <CircleCheck class="mb-2 h-6 w-6 text-epi-teal" />
                    <p
                      class="text-sm font-bold text-slate-700 dark:text-slate-300"
                    >
                      {portfolioFile.name}
                    </p>
                  {:else}
                    <ImagePlus class="mb-2 h-6 w-6 text-slate-400" />
                    <p class="text-xs text-slate-500">
                      {@html m.camper_portfolio_drop_zone()}
                    </p>
                  {/if}
                </div>
                <input
                  bind:this={fileInputRef}
                  id="dropzone-file"
                  name="file"
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  class="hidden"
                  onchange={handleFileChange}
                />
              </label>
            </div>
          </div>

          <div class="relative flex items-center py-2">
            <div
              class="grow border-t border-slate-200 dark:border-slate-800"
            ></div>
            <span
              class="shrink-0 px-3 text-[10px] font-bold text-slate-400 uppercase"
              >{m.common_or()}</span
            >
            <div
              class="grow border-t border-slate-200 dark:border-slate-800"
            ></div>
          </div>

          <div class="relative">
            <LinkIcon class="absolute top-3 left-3 h-4 w-4 text-slate-400" />
            <Input
              name="url"
              bind:value={portfolioUrl}
              placeholder={m.camper_portfolio_link_placeholder()}
              class="h-10 rounded-xl pl-9"
            />
          </div>

          <Input
            name="caption"
            bind:value={portfolioCaption}
            placeholder={m.camper_portfolio_caption_placeholder()}
            class="h-10 rounded-xl"
          />

          <Button
            type="submit"
            disabled={isUploadingPortfolio || (!portfolioFile && !portfolioUrl)}
            class="w-full rounded-xl bg-purple-600 font-bold text-white hover:bg-purple-700"
          >
            {#if isUploadingPortfolio}
              <LoaderCircle class="mr-2 h-4 w-4 animate-spin" /> {m.camper_portfolio_uploading()}
            {:else}
              {m.camper_portfolio_save()}
            {/if}
          </Button>
        </form>
      </div>

      <div class="space-y-4">
        <h3 class="text-xs font-bold text-slate-500 uppercase">
          {m.camper_portfolio_my_creations({ count: portfolioItems.length })}
        </h3>
        {#if portfolioItems.length === 0}
          <div
            class="flex flex-col items-center justify-center rounded-xl bg-slate-100 p-8 text-center dark:bg-slate-800/50"
          >
            <FolderOpen class="mb-2 h-8 w-8 text-slate-300" />
            <p class="text-sm text-slate-500">
              {m.camper_portfolio_empty()}
            </p>
          </div>
        {:else}
          <div class="grid gap-4 sm:grid-cols-2">
            {#each portfolioItems as item (item.id)}
              <div
                class="group relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <!-- TODO: implement S3 file storage -->
                {#if item.file}
                  <a
                    href={'#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="block aspect-video w-full overflow-hidden bg-slate-100 dark:bg-slate-800"
                  >
                    <img
                      src={''}
                      alt={item.caption || m.camper_portfolio_default_alt()}
                      loading="lazy"
                      class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </a>
                {:else if item.url}
                  <div
                    class="flex aspect-video w-full flex-col items-center justify-center bg-purple-50 p-4 dark:bg-purple-900/20"
                  >
                    <LinkIcon class="mb-2 h-8 w-8 text-purple-400" />
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="line-clamp-2 text-center text-xs font-bold break-all text-purple-600 hover:underline"
                      >{item.url}</a
                    >
                  </div>
                {/if}

                {#if item.caption}
                  <div class="p-3">
                    <p
                      class="line-clamp-2 text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      {item.caption}
                    </p>
                  </div>
                {/if}

                <div
                  class="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <form
                    action="?/deletePortfolioItem"
                    method="POST"
                    use:enhance={() =>
                      async ({ update }) => {
                        toast.success(m.camper_portfolio_item_deleted());
                        await update();
                      }}
                  >
                    <input type="hidden" name="itemId" value={item.id} />
                    <Button
                      type="submit"
                      variant="destructive"
                      size="icon"
                      class="h-8 w-8 rounded-full shadow-md"
                      ><Trash2 class="h-4 w-4" /></Button
                    >
                  </form>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </ScrollArea>
  </div>
{/if}
