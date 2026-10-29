// ─── Key of an open catalogue ─────────────────────────────────────────────
//
// The open lists the team authors over the admin API rather than in code, an
// event category (`EventConfig_Category`) and a workshop domain
// (`Workshop_Domain`), are each identified by a key: the name every operation
// takes and every badge rule will, so it never changes once created. The label
// is what gets renamed.

/**
 * Lowercase words joined by single hyphens, e.g. `coding-club`. An underscore is
 * refused on purpose, so a screen can spell a sentinel no authored key will ever
 * collide with (the config wizard's `_none`).
 */
export const CATALOGUE_KEY_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
