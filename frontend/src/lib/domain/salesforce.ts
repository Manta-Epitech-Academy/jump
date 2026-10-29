/**
 * Salesforce ids: the record one names, and the spelling Jump stores.
 *
 * `Talent.externalId` holds the Salesforce person a talent is: its Contact once
 * it has one, its Lead while it never became a Contact. `Event.externalId`
 * holds the Campaign. Which record an id names is read off the id itself, from
 * its three-character key prefix, which Salesforce fixes per object in every
 * org: a caller used to say "lead" for a talent, and the link broke on every
 * talent keyed on a Contact. The Epitech tenant URL is hardcoded here for now:
 * when a second org needs a different host, lift this to a runtime env var.
 */
const SF_TENANT_BASE = 'https://epitech.lightning.force.com';

/** Salesforce's own key prefixes for the records Jump links to. */
const OBJECT_BY_KEY_PREFIX: Record<string, string> = {
  '00Q': 'Lead',
  '003': 'Contact',
  '701': 'Campaign',
};

/**
 * Deep-link to the record a Salesforce id names. An id of an object not listed
 * above still opens, through the bare-id address Salesforce redirects to the
 * record's page.
 */
export function salesforceUrl(externalId: string): string {
  const object = OBJECT_BY_KEY_PREFIX[externalId.slice(0, 3)];
  return object
    ? `${SF_TENANT_BASE}/lightning/r/${object}/${externalId}/view`
    : `${SF_TENANT_BASE}/${externalId}`;
}

const CHECKSUM_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';

/**
 * The 18-character spelling of a Salesforce id, the one the API returns and
 * so the one `Talent.externalId` and `Sync_ErasedContact` hold. Salesforce
 * shows the case-sensitive 15-character one in its URLs and reports, which is
 * what an admin copies; the three characters it lacks encode, five letters at
 * a time, which of them are upper case. An 18-character id is returned as is.
 */
export function salesforceId18(id: string): string {
  if (id.length !== 15) return id;
  let suffix = '';
  for (let chunk = 0; chunk < 3; chunk++) {
    let bits = 0;
    for (let i = 0; i < 5; i++) {
      const c = id[chunk * 5 + i];
      if (c >= 'A' && c <= 'Z') bits |= 1 << i;
    }
    suffix += CHECKSUM_ALPHABET[bits];
  }
  return id + suffix;
}
