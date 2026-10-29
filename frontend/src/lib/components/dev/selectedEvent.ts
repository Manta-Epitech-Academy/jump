import { getContext, setContext } from 'svelte';

/**
 * The event the dev space's menu names under « Événement sélectionné », for a
 * page that has no event of its own in view (the campus calendar highlights it).
 *
 * The layout owns it and part of it lives in client state (the last event
 * opened), so a page reads it from here rather than working it out again and
 * disagreeing with the menu beside it.
 */
const KEY = Symbol('dev-selected-event');

export type SelectedEvent = { readonly id: string | null };

export function provideSelectedEvent(read: () => string | null): void {
  setContext<SelectedEvent>(KEY, {
    get id() {
      return read();
    },
  });
}

export function selectedEvent(): SelectedEvent {
  return getContext<SelectedEvent | undefined>(KEY) ?? { id: null };
}
