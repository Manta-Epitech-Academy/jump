<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { getStaffRoleRedirectPath } from '$lib/domain/staff';
  import ErrorTerminal from '$lib/components/errors/ErrorTerminal.svelte';

  // "Home" depends on who's looking: a staff member goes to their workspace,
  // everyone else (talents, logged-out visitors) to the app root — which routes
  // a talent to their dashboard and a guest to login. Detect staff by
  // staffProfile, NOT "has a user": talents carry a bauth user too, so the old
  // `talent && !user` check mislabelled students as staff and pointed them at
  // /staff/dev. Staff routes have their own boundary ((staff)/+error.svelte);
  // this one only ever runs for the talent/public side, but the staff branch
  // stays correct for the rare staff error outside that group.
  const staffRole = $derived(page.data.staffProfile?.staffRole);
  const homeHref = $derived(
    staffRole ? (getStaffRoleRedirectPath(staffRole) ?? '/staff/login') : '/',
  );
  const homeLabel = $derived(
    staffRole ? "Retour à l'espace" : "Retour à l'accueil",
  );
</script>

<ErrorTerminal homeHref={resolve(homeHref)} {homeLabel} />
