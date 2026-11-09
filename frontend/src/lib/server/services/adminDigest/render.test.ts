import { describe, it, expect } from 'vitest';
import {
  renderDigestHtml,
  renderDigestText,
  type DigestDocument,
} from './render';

const doc: DigestDocument = {
  subject: 'Jump - sujet',
  title: 'Point hebdomadaire',
  intro: 'Intro.',
  sections: [
    {
      title: 'Synchronisation',
      blocks: [
        {
          kind: 'paragraph',
          segments: [
            { strong: '4' },
            " erreurs de l'équipe <Lille> sur ",
            {
              link: {
                href: '/staff/admin/sync-errors',
                label: 'la page dédiée',
              },
            },
            '.',
          ],
        },
        { kind: 'item', segments: ['premier'] },
        { kind: 'item', segments: ['second'] },
      ],
    },
  ],
  footer: 'Pied.',
};

describe('digest rendering', () => {
  // The two parts were once written apart and drifted; one description
  // rendered twice is what keeps them saying the same thing.
  it('says the same facts in both parts, with absolute links', () => {
    const html = renderDigestHtml(doc, 'https://jump.example');
    const text = renderDigestText(doc, 'https://jump.example');

    expect(html).toContain('<strong>4</strong> erreurs');
    expect(html).toContain(
      'href="https://jump.example/staff/admin/sync-errors"',
    );
    expect(text).toContain(
      "4 erreurs de l'équipe <Lille> sur la page dédiée (https://jump.example/staff/admin/sync-errors).",
    );
    expect(text).toContain('- premier\n- second');
  });

  // Copy is written plain and escaped once, here: escaping it upstream as well
  // would print "&amp;lt;" to the recipient.
  it('escapes copy exactly once, and only in the HTML part', () => {
    const html = renderDigestHtml(doc, '');

    expect(html).toContain('l&#39;équipe &lt;Lille&gt;');
    expect(html).not.toContain('&amp;lt;');
    expect(html).not.toContain('<Lille>');
  });

  it('groups consecutive items into one list', () => {
    const html = renderDigestHtml(doc, '');

    expect(html.match(/<ul /g)).toHaveLength(1);
    expect(html).toContain('<li>premier</li><li>second</li>');
  });
});
