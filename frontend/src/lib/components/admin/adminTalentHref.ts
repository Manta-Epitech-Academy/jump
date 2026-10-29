import { resolve } from '$app/paths';

/**
 * Where an admin opens a talent: the admin talents list searched on the talent,
 * which is the admin's view of one (contact, guardians, impersonation). There
 * is no admin talent page, and the dev workspace fiche is scoped to a campus.
 *
 * The login address finds exactly one talent; a talent without an account is
 * found by name, the other words that search matches.
 */
export function adminTalentHref(t: {
  email: string | null;
  prenom: string;
  nom: string;
}): string {
  const q = t.email ?? `${t.prenom} ${t.nom}`.trim();
  return `${resolve('/staff/admin/talents')}?q=${encodeURIComponent(q)}`;
}
