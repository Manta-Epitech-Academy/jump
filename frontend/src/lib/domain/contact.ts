/**
 * A person's coordinates, and how to read a talent's legal guardians off the
 * columns that hold them.
 *
 * The shape is decoupled from any Prisma row so one renderer serves the admin
 * talents list, the dev student dossier and the émargement roster: each caller
 * maps its own row onto this. It lives in `domain/` rather than beside the
 * component because the mapping below runs server-side, and server code does not
 * import from `$lib/components`.
 */
export type ContactPerson = {
  civilite?: string | null;
  prenom?: string | null;
  nom?: string | null;
  email?: string | null;
  phone?: string | null;
};

/** The guardian columns as they sit on `Talent` today. */
export type GuardianColumns = {
  parentCivilite: string | null;
  parentPrenom: string | null;
  parentNom: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  parent2Civilite: string | null;
  parent2Prenom: string | null;
  parent2Nom: string | null;
  parent2Email: string | null;
  parent2Phone: string | null;
};

/**
 * Both guardians in priority order, dropping any with no identity and no
 * contact at all, so a caller only ever lists responsables somebody could
 * actually reach.
 *
 * One function rather than the two hand-written copies this replaces, which had
 * already parted ways: the émargement endpoint flattened the pair into a single
 * `name`, which lost the given-name / surname split the display treatment needs.
 * It is also the single place a future guardian table has to be plugged into,
 * instead of every screen that reads a `parent2*` column.
 */
export function guardiansOf(talent: GuardianColumns): ContactPerson[] {
  return [
    {
      civilite: talent.parentCivilite,
      prenom: talent.parentPrenom,
      nom: talent.parentNom,
      email: talent.parentEmail,
      phone: talent.parentPhone,
    },
    {
      civilite: talent.parent2Civilite,
      prenom: talent.parent2Prenom,
      nom: talent.parent2Nom,
      email: talent.parent2Email,
      phone: talent.parent2Phone,
    },
  ].filter((g) => g.prenom || g.nom || g.email || g.phone);
}
