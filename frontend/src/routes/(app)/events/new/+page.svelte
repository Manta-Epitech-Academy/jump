<script lang="ts">
  import type { PageData } from './$types';
  import { superForm } from 'sveltekit-superforms';
  import { Button, buttonVariants } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Label } from '$lib/components/ui/label';
  import * as Card from '$lib/components/ui/card';
  import * as Tabs from '$lib/components/ui/tabs';
  import { ChevronLeft, FileSpreadsheet, PenTool, Save } from '@lucide/svelte';
  import { untrack } from 'svelte';
  import { enhance as kitEnhance } from '$app/forms';
  import { toast } from 'svelte-sonner';
  import { resolve } from '$app/paths';
  import { i18nHref } from '$lib/utils';
  import { m } from '$lib/paraglide/messages.js';
  import MultiStaffSelect from '../components/MultiStaffSelect.svelte';

  import FakeProgressLoader from './components/FakeProgressLoader.svelte';
  import CsvDropzone from './components/CsvDropzone.svelte';
  import CampaignReviewTable from './components/CampaignReviewTable.svelte';
  import ManualEventForm from './components/ManualEventForm.svelte';

  let { data }: { data: PageData } = $props();

  const { form, errors, delayed, enhance } = superForm(
    untrack(() => data.form),
  );

  let isAnalyzing = $state(false);
  let isConfirming = $state(false);
  let analysisResult = $state<any>(null);
  let selectedFileName = $state<string>('');

  let importMantas = $state<string[]>([]);
  let importNotes = $state('');

  // Loading messaging state
  let loadingMessages = [
    m.event_new_loading_csv(),
    m.event_new_loading_compare(),
    m.event_new_loading_homonyms(),
    m.event_new_loading_levels(),
    m.event_new_loading_duplicates(),
    m.event_new_loading_prepare(),
    m.event_new_loading_sync(),
  ];
  let currentMessage = $state('');
  let progress = $state(0);
  let progressInterval: ReturnType<typeof setInterval>;

  function startFakeProgress() {
    progress = 0;
    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
      if (progress < 40) progress += 5;
      else if (progress < 70) progress += 2;
      else if (progress < 95) progress += 0.5;
    }, 200);
  }

  function completeProgress(callback: () => void) {
    clearInterval(progressInterval);
    progress = 100;
    setTimeout(() => {
      callback();
    }, 300);
  }

  $effect(() => {
    if (isAnalyzing || isConfirming) {
      currentMessage = loadingMessages[0];
      const interval = setInterval(() => {
        const idx = Math.floor(Math.random() * loadingMessages.length);
        currentMessage = loadingMessages[idx];
      }, 1200);
      return () => clearInterval(interval);
    }
  });
</script>

<div class="mx-auto max-w-5xl space-y-6">
  <div class="flex items-center gap-4">
    <a
      href={i18nHref('/')}
      class={buttonVariants({ variant: 'ghost', size: 'icon' })}
    >
      <ChevronLeft class="h-4 w-4" />
    </a>
    <h1 class="text-3xl font-bold text-epi-blue uppercase">
      {m.event_new_title()}<span class="text-epi-teal">_</span>
    </h1>
  </div>

  <Tabs.Root value="import" class="w-full">
    <Tabs.List class="grid w-full grid-cols-2">
      <Tabs.Trigger value="import"
        ><FileSpreadsheet class="mr-2 h-4 w-4" /> {m.event_new_tab_import()}</Tabs.Trigger
      >
      <Tabs.Trigger value="manual"
        ><PenTool class="mr-2 h-4 w-4" /> {m.event_new_tab_manual()}</Tabs.Trigger
      >
    </Tabs.List>

    <!-- IMPORT TAB -->
    <Tabs.Content value="import">
      <Card.Root class="mt-4 border-t-4 border-t-epi-teal shadow-md">
        <Card.Header>
          <Card.Title>{m.event_new_import_title()}</Card.Title>
          <Card.Description>
            {m.event_new_import_description()}
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <!-- STEP 1: UPLOAD & ANALYZE -->
          {#if !analysisResult}
            <form
              action="?/analyzeCampaign"
              method="POST"
              enctype="multipart/form-data"
              use:kitEnhance={() => {
                isAnalyzing = true;
                startFakeProgress();
                return async ({ result }) => {
                  completeProgress(() => {
                    isAnalyzing = false;
                    if (result.type === 'success' && result.data) {
                      if (result.data.analysisSuccess) {
                        analysisResult = result.data;
                      } else {
                        toast.error(
                          (result.data as Record<string, any>).error ||
                            m.event_new_import_error(),
                        );
                      }
                    } else if (result.type === 'failure') {
                      toast.error(
                        (result.data as Record<string, any> | undefined)
                          ?.error || m.event_new_import_error(),
                      );
                    } else {
                      toast.error(m.event_new_import_error());
                    }
                  });
                };
              }}
              class="space-y-6 py-6"
            >
              <CsvDropzone bind:selectedFileName />

              <div class="flex justify-end">
                <Button
                  type="submit"
                  class="bg-epi-blue hover:bg-epi-blue/90"
                  disabled={isAnalyzing || !selectedFileName}
                >
                  {isAnalyzing ? m.event_new_import_analyzing() : m.event_new_import_analyze()}
                </Button>
              </div>
            </form>
            <!-- STEP 2: REVIEW & DECIDE -->
          {:else}
            <div class="space-y-6">
              <div class="grid gap-4 sm:grid-cols-2">
                <div class="space-y-2">
                  <Label>{m.event_column_event()}</Label><Input
                    value={analysisResult.eventName}
                    readonly
                    class="bg-muted font-bold"
                  />
                </div>
                <div class="space-y-2">
                  <Label>{m.common_field_date()}</Label><Input
                    value={new Date(
                      analysisResult.eventDate,
                    ).toLocaleDateString()}
                    readonly
                    class="bg-muted font-bold"
                  />
                </div>
              </div>

              <CampaignReviewTable bind:analysisResult />

              <form
                action="?/confirmCampaignImport"
                method="POST"
                use:kitEnhance={() => {
                  isConfirming = true;
                  startFakeProgress();
                  return async ({ update }) => {
                    completeProgress(async () => {
                      await update();
                      isConfirming = false;
                    });
                  };
                }}
                class="space-y-6 pt-4"
              >
                <input
                  type="hidden"
                  name="importData"
                  value={JSON.stringify(analysisResult.analysisData)}
                />
                <input
                  type="hidden"
                  name="eventName"
                  value={analysisResult.eventName}
                />
                <input
                  type="hidden"
                  name="eventDate"
                  value={analysisResult.eventDate}
                />

                <div class="grid gap-4 md:grid-cols-2">
                  <div class="space-y-2 rounded-md border bg-muted/20 p-4">
                    <Label>{m.event_new_import_mantas_label()}</Label>
                    <MultiStaffSelect
                      staff={data.staff}
                      bind:value={importMantas}
                      name="mantas"
                    />
                    <p
                      class="text-[10px] font-bold text-muted-foreground uppercase"
                    >
                      {m.event_new_import_mantas_hint()}
                    </p>
                  </div>
                  <div class="space-y-2 rounded-md border bg-muted/20 p-4">
                    <Label for="notes">{m.event_new_import_notes_label()}</Label>
                    <Textarea
                      id="notes"
                      name="notes"
                      bind:value={importNotes}
                      placeholder={m.event_new_import_notes_placeholder()}
                      class="min-h-20"
                    />
                  </div>
                </div>

                <div class="flex justify-between border-t pt-4">
                  <Button
                    variant="ghost"
                    type="button"
                    onclick={() => (analysisResult = null)}>{m.common_cancel()}</Button
                  >
                  <Button
                    type="submit"
                    disabled={isConfirming}
                    class="bg-green-600 hover:bg-green-700"
                    >{isConfirming
                      ? m.event_new_import_confirming()
                      : m.event_new_import_confirm()}</Button
                  >
                </div>
              </form>
            </div>
          {/if}
        </Card.Content>
      </Card.Root>
    </Tabs.Content>

    <!-- MANUAL TAB -->
    <Tabs.Content value="manual">
      <Card.Root class="mt-4">
        <Card.Header
          ><Card.Title>{m.event_new_manual_title()}</Card.Title></Card.Header
        >
        <Card.Content>
          <form
            method="POST"
            action="?/createManual"
            use:enhance
            id="event-form"
          >
            <ManualEventForm
              {form}
              {errors}
              themes={data.themes}
              staff={data.staff}
            />
          </form>
        </Card.Content>
        <Card.Footer class="justify-end border-t bg-muted/50 px-6 py-4">
          <Button type="submit" form="event-form" disabled={$delayed}
            ><Save class="mr-2 h-4 w-4" />{$delayed
              ? m.common_creating()
              : m.event_new_manual_submit()}</Button
          >
        </Card.Footer>
      </Card.Root>
    </Tabs.Content>
  </Tabs.Root>
</div>

<FakeProgressLoader {isAnalyzing} {isConfirming} {currentMessage} {progress} />
