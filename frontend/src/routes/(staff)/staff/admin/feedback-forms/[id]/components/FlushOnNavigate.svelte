<script lang="ts">
  import { beforeNavigate } from '$app/navigation';

  // Commit a focused-but-unflushed field before leaving the page, by blurring
  // the active element: that fires the autosave handler's blur→commit
  // synchronously, so the PATCH is dispatched before we go. `beforeNavigate`
  // covers both in-app navigation and `willUnload` (tab close, refresh, external
  // link); the patch fetch is sent with `keepalive`, so the on-the-way-out save
  // still completes as the document tears down. Live autosave already covers
  // everything typed more than the debounce ago; this closes the last-keystroke
  // gap without a "you have unsaved changes" prompt (which only nagged, since the
  // edit was being saved anyway, and could wedge the browser during unload).
  beforeNavigate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  });
</script>
