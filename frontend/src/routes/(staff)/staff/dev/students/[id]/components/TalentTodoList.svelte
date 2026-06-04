<script lang="ts">
  import Mail from '@lucide/svelte/icons/mail';
  import Phone from '@lucide/svelte/icons/phone';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CopyButton from '$lib/components/ui/CopyButton.svelte';
  import { cn } from '$lib/utils';
  import type { TalentTodo, TalentTodoContact } from '$lib/domain/talentTodos';

  // Secondary, utilitarian panel: only what the dev must act on if the dossier
  // is incomplete. Each row names the gap and surfaces the person to reach
  // (parent or talent) as copyable email + phone — no canned-relance button,
  // the dev calls/writes themselves.
  type Contacts = {
    parentEmail: string | null;
    parentPhone: string | null;
    studentEmail: string | null;
    studentPhone: string | null;
  };

  let { todos, contacts }: { todos: TalentTodo[]; contacts: Contacts } =
    $props();

  function contactFor(c: TalentTodoContact): {
    email: string | null;
    phone: string | null;
  } {
    if (c === 'parent')
      return { email: contacts.parentEmail, phone: contacts.parentPhone };
    if (c === 'student')
      return { email: contacts.studentEmail, phone: contacts.studentPhone };
    return { email: null, phone: null };
  }
</script>

{#if todos.length === 0}
  <div
    class="flex items-center gap-2 rounded-sm border border-dashed border-epi-teal/30 bg-epi-teal/5 px-4 py-3 text-sm text-epi-teal-solid"
  >
    <CircleCheck class="h-4 w-4 shrink-0" />
    Dossier complet, rien à signaler.
  </div>
{:else}
  <ul class="space-y-2">
    {#each todos as todo (todo.id)}
      {@const info = contactFor(todo.contact)}
      <li
        class="flex items-stretch gap-3 overflow-hidden rounded-sm border bg-card"
      >
        <span
          class={cn(
            'w-1 shrink-0',
            todo.severity === 'urgent' ? 'bg-epi-orange' : 'bg-epi-blue',
          )}
          aria-hidden="true"
        ></span>
        <div
          class="flex flex-1 flex-col gap-x-6 gap-y-2 py-2.5 pr-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div class="min-w-0">
            <p class="text-sm font-bold">{todo.title}</p>
            {#if todo.detail}
              <p class="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {todo.detail}
              </p>
            {/if}
          </div>

          {#if todo.contact}
            <!-- The info the dev acts on, to the right of the task. -->
            <div
              class="flex shrink-0 flex-col gap-1 sm:items-end sm:text-right"
            >
              {#if info.email}
                <span class="inline-flex min-w-0 items-center gap-1.5 text-sm">
                  <Mail class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <a
                    href={`mailto:${info.email}`}
                    class="truncate transition-colors hover:text-epi-blue"
                  >
                    {info.email}
                  </a>
                  <CopyButton value={info.email} label="Copier l'email" />
                </span>
              {/if}
              {#if info.phone}
                <span class="inline-flex items-center gap-1.5 text-sm">
                  <Phone class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <a
                    href={`tel:${info.phone.replace(/\s+/g, '')}`}
                    class="transition-colors hover:text-epi-blue"
                  >
                    {info.phone}
                  </a>
                  <CopyButton value={info.phone} label="Copier le téléphone" />
                </span>
              {/if}
              {#if !info.email && !info.phone}
                <span
                  class="font-mono text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
                >
                  Aucun contact renseigné
                </span>
              {/if}
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}
