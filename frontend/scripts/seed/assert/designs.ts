/**
 * A certificate the generator planted must be one the API would have stored.
 *
 * The generator writes `Diploma_Template` rows directly, past the screening
 * `write_diploma_template` runs, so nothing else would notice a seeded design
 * carrying a tag the sanitiser removes or a placeholder that does not exist. Each
 * of those prints wrong on staging, where the PO is judging the feature, and only
 * there. Passing is not enough either: the bytes must be the ones the write would
 * have kept, or the dataset shows a design no author could have produced.
 *
 * The same functions the write calls, not a restatement of them. The sanitiser
 * lives under `server/` but imports nothing through `$lib`, which is what lets a
 * plain `bun` script reach it, as it reaches the domain.
 */

import type { PrismaClient } from '@prisma/client';
import { unknownCertificateTokens } from '../../../src/lib/domain/diplomas';
import { sanitizeCertificateDesign } from '../../../src/lib/server/diplomaSanitize';

export async function designFailures(prisma: PrismaClient): Promise<string[]> {
  const templates = await prisma.diploma_Template.findMany({
    where: { id: { startsWith: 'sd_' } },
    select: { code: true, styleCss: true, bodyHtml: true },
  });

  const failures: string[] = [];
  for (const template of templates) {
    const screened = sanitizeCertificateDesign(template);
    const problems = [
      ...screened.problems,
      ...(screened.design.bodyHtml === template.bodyHtml
        ? []
        : ["stocké autrement que l'API ne l'aurait stocké"]),
      ...[template.bodyHtml, template.styleCss]
        .flatMap(unknownCertificateTokens)
        .map((token) => `repère inconnu {${token}}`),
    ];
    for (const problem of problems) {
      failures.push(`certificat ${template.code} : ${problem}`);
    }
  }
  return failures;
}
