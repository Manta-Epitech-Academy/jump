/**
 * Salesforce Lightning deep-link helpers.
 *
 * `Talent.externalId` holds the Salesforce Lead 18-char id seeded at CSV
 * import time (talents enter the funnel as Leads before being converted to
 * Contacts). `Event.externalId` holds the Salesforce Campaign id linked at
 * import time. The Epitech tenant URL is hardcoded here for now: when a
 * second org needs a different host, lift this to a runtime env var.
 */
const SF_TENANT_BASE = 'https://epitech.lightning.force.com';

function salesforceContactUrl(externalId: string): string {
  return `${SF_TENANT_BASE}/lightning/r/Lead/${externalId}/view`;
}

function salesforceCampaignUrl(externalId: string): string {
  return `${SF_TENANT_BASE}/lightning/r/Campaign/${externalId}/view`;
}

/** Which Salesforce record an `externalId` points at. */
export type SalesforceRecordKind = 'lead' | 'campaign';

/** Deep-link to a record, dispatched by kind. Keeps the lead/campaign split in one place for the UI link components. */
export function salesforceUrl(
  kind: SalesforceRecordKind,
  externalId: string,
): string {
  return kind === 'campaign'
    ? salesforceCampaignUrl(externalId)
    : salesforceContactUrl(externalId);
}
