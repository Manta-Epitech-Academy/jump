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
 * for every staff role, kept as a helper so mixed-role surfaces share one
 * fallback style.
 */
export function staffRoleAvatarFallbackClass(
  _role: string | null | undefined,
): string {
  return 'bg-primary/10 text-primary';
}
