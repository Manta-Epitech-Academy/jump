import { describe, expect, it } from 'vitest';
import { renderBroadcastEmail } from './broadcastMarkdown';
import {
  EMPTY_VARIABLE_CONTEXT,
  substituteVariables,
  type VariableContext,
} from './broadcastVariables';

/**
 * A talent types their own first name and chooses the address the parent
 * welcome mail goes to, so a name is the one part of a mail sent under
 * Epitech's name that a stranger writes. What is under test is that a value
 * renders as the text it is, whatever Markdown it holds, while the link Jump
 * minted keeps working and a real name, punctuation included, reads unchanged.
 */
const PARENT_LINK = 'https://jump.example/parent/fastlogin?token=a_b_c';

const BODY = `{{child_prenom}} vient de finaliser son inscription.

:button[Finaliser le dossier de {{child_prenom}}]({{parent_fastlogin_link}})

Écrivez-nous à {{email_contact_campus}}.`;

function mailFor(childPrenom: string) {
  const ctx: VariableContext = {
    ...EMPTY_VARIABLE_CONTEXT,
    child_prenom: childPrenom,
    parent_fastlogin_link: PARENT_LINK,
    email_contact_campus: 'contact.lille@epitech.eu',
  };
  return renderBroadcastEmail(substituteVariables(BODY, ctx, 'markdown'));
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
}

describe('substituteVariables into a mail body', () => {
  it.each([
    ['a link', '[Cliquez ici](https://evil.example/pay)'],
    ['an autolink', '<https://evil.example/pay>'],
    ['a protocol URL', 'https://evil.example/pay'],
    ['a bare www. host', 'Payez sur www.evil.example/pay'],
    ['a www. host on a line of its own', 'Léa\n\nwww.evil.example'],
    // marked's autolink starts after any of these, where the escape table it
    // replaced only expected the start of a line, a space or an `_`.
    ['a www. host after a letter', 'Awww.evil.example/login'],
    ['a www. host after a bracket', '(www.evil.example'],
    ['a www. host after a hyphen', 'Jean-www.evil.example'],
    ['a www. host after a dot', 'hello.www.evil.example'],
    ['a www. host after a quote', '"www.evil.example'],
    [
      'a button on its own line',
      'Léa\n\n:button[Confirmer mon compte](https://evil.example/login)\n\nmerci',
    ],
  ])('renders %s typed as a name as text', (_case, name) => {
    const { html, text } = mailFor(name);

    expect(hrefs(html)).toEqual([
      PARENT_LINK,
      'mailto:contact.lille@epitech.eu',
    ]);
    expect(text.match(/ : \S+$/gm)).toEqual([` : ${PARENT_LINK}`]);
  });

  it('restyles nothing with underscores typed in a name', () => {
    const { html } = mailFor('_Léa_ __Lily__');

    expect(html).not.toMatch(/<(em|strong)\b/);
    expect(html).toContain('_Léa_ __Lily__ vient de finaliser');
  });

  it.each(['N’Diaye', 'Marie-Ève', "N'Golo", 'Léa (Lily)', 'Jean-Pierre Jr.'])(
    'shows the real name %s unchanged, in the text and on the button',
    (name) => {
      const { html, text } = mailFor(name);

      expect(text).toContain(`${name} vient de finaliser`);
      expect(text).toContain(
        `Finaliser le dossier de ${name} : ${PARENT_LINK}`,
      );
      expect(html).not.toContain('\\');
      expect(hrefs(html)[0]).toBe(PARENT_LINK);
    },
  );
});

/**
 * The refusal of an erasure request carries the reason an admin typed, which
 * can run over several paragraphs. Folded onto one line they ran together; kept,
 * a line must still not open a block of its own.
 */
describe('substituteVariables with a value over several lines', () => {
  const REASON = [
    'Votre compte est lié à un événement en cours.',
    '',
    '- il se termine le 12 novembre',
    '1. nous reviendrons vers vous',
    '    après la clôture',
    '---',
    '=== merci',
  ].join('\n');

  function refusal() {
    const ctx = { ...EMPTY_VARIABLE_CONTEXT, deletion_reason: REASON };
    return renderBroadcastEmail(
      substituteVariables('Motif :\n\n{{deletion_reason}}', ctx, 'markdown'),
    );
  }

  it('keeps its lines, a reason being the one value that does', () => {
    const { html, text } = refusal();

    expect(html).toContain('<br>');
    expect(text).toContain('Votre compte est lié à un événement en cours.\n');
    expect(text).toContain('- il se termine le 12 novembre');
    expect(text).toContain('1. nous reviendrons vers vous');
  });

  it('opens no list, rule, heading or code block', () => {
    const { html } = refusal();

    expect(html).not.toMatch(/<(ul|ol|li|hr|h\d|pre|code)\b/);
  });
});

describe('substituteVariables into an address', () => {
  it('leaves an address whose host starts with www. linked', () => {
    const ctx = {
      ...EMPTY_VARIABLE_CONTEXT,
      email_contact_campus: 'contact@www.epitech.example',
    };
    const { html } = renderBroadcastEmail(
      substituteVariables(
        'Écrivez à {{email_contact_campus}}.',
        ctx,
        'markdown',
      ),
    );

    expect(hrefs(html)).toEqual(['mailto:contact@www.epitech.example']);
  });
});

describe('substituteVariables into a subject or an SMS', () => {
  it('keeps the characters and folds the value onto one line', () => {
    const ctx = { ...EMPTY_VARIABLE_CONTEXT, prenom: 'Léa (Lily)\n\nDupont' };
    expect(substituteVariables('Bonjour {{prenom}} !', ctx, 'plain')).toBe(
      'Bonjour Léa (Lily) Dupont !',
    );
  });
});
