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
