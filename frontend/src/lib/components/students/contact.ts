/**
 * Normalized shape for rendering a person's coordinates (a talent or one of
 * their legal guardians). Decoupled from any Prisma row so the same contact
 * renderer serves the admin talents list, the dev student dossier, and any
 * other surface: each caller maps its own row onto this shape.
 */
export type ContactPerson = {
  civilite?: string | null;
  prenom?: string | null;
  nom?: string | null;
  email?: string | null;
  phone?: string | null;
};
