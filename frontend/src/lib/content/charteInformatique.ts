import { DATA_RETENTION_MONTHS } from '$lib/domain/retention';
import { USAGE_RAW_RETENTION_MONTHS } from '$lib/domain/usage';
import charteMd from './charte-informatique.md?raw';

/**
 * The Charte Informatique et Éthique body, the RGPD document that conditions
 * any use of Jump.
 *
 * Extracted from the onboarding step it used to be inlined in, because it is
 * now read on two surfaces: the wizard's last step for a talent who walks the
 * ladder, and `/charte` for a collégien who does not. Two copies of a document
 * a minor consents to would drift on the first correction.
 *
 * `{{retentionMonths}}` is filled from `DATA_RETENTION_MONTHS`, the same
 * constant the anonymisation job reads, and `{{usageRetentionMonths}}` from
 * `USAGE_RAW_RETENTION_MONTHS`, the same constant the usage purge reads, so
 * neither promise made here can state a delay the platform does not keep. Same
 * placeholder convention as the droit-image content files.
 *
 * Unlike the règlement, this one is not versioned: no signed artifact embeds
 * it. `charterAcceptedAt` is a checkbox acceptance with no generated PDF, so
 * there is nothing a later edit could retroactively rewrite.
 */
export const CHARTE_INFORMATIQUE_BODY = charteMd
  .replace('{{retentionMonths}}', String(DATA_RETENTION_MONTHS))
  .replace('{{usageRetentionMonths}}', String(USAGE_RAW_RETENTION_MONTHS));
