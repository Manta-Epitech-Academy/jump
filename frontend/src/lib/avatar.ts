/**
 * Compound-aware initial extraction.
 * "Marie Dupont" → "MD"
 * "Jean-Pierre Lefebvre" → "JL" (first letter of compound first name + last name)
 * "Cher" → "CH"
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return '??';
  const parts = name.trim().split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

/**
 * Role-tinted Avatar.Fallback class for staff. Returns a generic primary tint
 * when role is unknown or outside peda/manta — used as a graceful default in
 * mixed-role surfaces.
 */
export function staffRoleAvatarFallbackClass(
  role: string | null | undefined,
): string {
  if (role === 'peda') return 'bg-epi-teal/15 text-epi-teal-solid';
  if (role === 'manta') return 'bg-epi-blue/15 text-epi-blue';
  return 'bg-primary/10 text-primary';
}
