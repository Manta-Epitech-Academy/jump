import { getContext, setContext } from 'svelte';

const KEY = Symbol('responsive-dialog');

/**
 * Shared state between a `ResponsiveDialog.Root` and its sub-components.
 * `isDesktop` is reactive (backed by a `MediaQuery`), so every sub-component
 * branches to the same primitive: bits-ui `Dialog` on desktop, vaul `Drawer`
 * on mobile. They must agree, because each primitive's children rely on the
 * matching root's context (e.g. `Drawer.Content` needs a `Drawer.Root`
 * ancestor); reading the one source keeps Root and children in lockstep.
 */
export type ResponsiveDialogContext = {
  readonly isDesktop: boolean;
};

export function setResponsiveDialogContext(ctx: ResponsiveDialogContext): void {
  setContext(KEY, ctx);
}

export function useResponsiveDialog(): ResponsiveDialogContext {
  const ctx = getContext<ResponsiveDialogContext | undefined>(KEY);
  if (!ctx) {
    throw new Error(
      'ResponsiveDialog sub-components must be used inside <ResponsiveDialog.Root>.',
    );
  }
  return ctx;
}
